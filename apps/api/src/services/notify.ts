import type { NotificationPrefs, OrderStatus } from '@velora/shared';
import { ROUTES, formatRupiah } from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import { mailTemplate, sendEmail } from '../integrations/email';
import { sendPush } from '../integrations/firebase-admin';
import { type Row, all, count, first, num, optStr, str, toIso } from '../lib/db';
import { uuid } from '../lib/ids';
import { logger } from '../lib/log';
import { storefrontSettings } from '../lib/settings';
import { getNotificationPrefs } from './identity';

/**
 * Outbound notifications. Every attempt is written to `notification_logs` first so
 * the admin screen shows what happened even when Firebase or the mail provider is
 * unconfigured — a skipped send is recorded as `skipped`, never as `sent`.
 */

export type NotificationKind =
  | 'order_created'
  | 'payment_success'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'stock_low'
  | 'welcome';

interface Template {
  title: (o: OrderContext) => string;
  body: (o: OrderContext) => string;
  /** Which preference switch gates this message (null = always allowed). */
  pref: keyof NotificationPrefs | null;
  email: boolean;
}

const TEMPLATES: Record<NotificationKind, Template> = {
  order_created: {
    title: () => 'Pesanan sedang menunggu pembayaran',
    body: (o) =>
      `Pesanan ${o.code} senilai ${formatRupiah(o.grandTotal)} menunggu pembayaran sebelum batas waktu berakhir.`,
    pref: 'payments',
    email: true,
  },
  payment_success: {
    title: () => 'Pembayaran diterima',
    body: (o) =>
      `Terima kasih! Pembayaran pesanan ${o.code} (${formatRupiah(o.grandTotal)}) sudah terverifikasi dan sedang kami proses.`,
    pref: 'orderUpdates',
    email: true,
  },
  order_shipped: {
    title: (o) => (o.trackingNumber ? `Paket dikirim · ${o.trackingNumber}` : 'Paket sudah dikirim'),
    body: (o) =>
      `Pesanan ${o.code} telah diserahkan ke kurir ${o.courier ?? 'kami'}. Nomor lacak akan muncul di halaman pesanan.`,
    pref: 'shipping',
    email: true,
  },
  order_delivered: {
    title: () => 'Pesanan telah diterima',
    body: (o) => `Pesanan ${o.code} sudah sampai. Jangan lupa beri ulasan agar pelanggan lain terbantu.`,
    pref: 'shipping',
    email: true,
  },
  order_cancelled: {
    title: () => 'Pesanan dibatalkan',
    body: (o) => `Pesanan ${o.code} dibatalkan. Stok sudah dikembalikan dan dapat dipesan kembali.`,
    pref: 'orderUpdates',
    email: true,
  },
  stock_low: {
    title: () => 'Stok menipis',
    body: (o) => `${o.note ?? 'Beberapa varian'} tinggal sedikit. Segera lakukan restock.`,
    pref: null,
    email: false,
  },
  welcome: {
    title: () => 'Selamat datang di VELORA',
    body: () => 'Akun Anda sudah aktif. Jelajahi koleksi terbaru dan temukan ukuran yang paling pas.',
    pref: 'promotions',
    email: true,
  },
};

interface OrderContext {
  code: string;
  grandTotal: number;
  status: OrderStatus | string;
  courier: string | null;
  trackingNumber: string | null;
  note: string | null;
}

async function orderContext(db: D1Database, orderId: string): Promise<OrderContext | null> {
  const row = await first<Row>(
    db,
    `SELECT o.code, o.status, o.grand_total, s.courier_company, s.tracking_number
     FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE o.id = ?1`,
    [orderId],
  );
  if (!row) return null;
  return {
    code: str(row.code),
    grandTotal: num(row.grand_total),
    status: str(row.status),
    courier: optStr(row.courier_company),
    trackingNumber: optStr(row.tracking_number),
    note: null,
  };
}

/* ------------------------------ device tokens ------------------------------ */

export async function saveDeviceToken(
  db: D1Database,
  userId: string,
  token: string,
  platform: string,
): Promise<{ id: string }> {
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO device_tokens (id, user_id, token, platform, is_active, failure_count, created_at, last_used_at)
       VALUES (?1,?2,?3,?4,1,0,datetime('now'),datetime('now'))
       ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform,
         is_active = 1, failure_count = 0, last_used_at = datetime('now')`,
    )
    .bind(id, userId, token, platform)
    .run();
  return { id };
}

export async function activeDeviceTokens(db: D1Database, userId: string): Promise<string[]> {
  const rows = await all<Row>(db, `SELECT token FROM device_tokens WHERE user_id = ?1 AND is_active = 1`, [userId]);
  return rows.map((r) => str(r.token));
}

export async function removeDeviceToken(db: D1Database, token: string): Promise<void> {
  await db
    .prepare(`UPDATE device_tokens SET is_active = 0, last_used_at = datetime('now') WHERE token = ?1`)
    .bind(token)
    .run();
}

export async function listDeviceTokens(db: D1Database, userId: string) {
  const rows = await all<Row>(
    db,
    `SELECT id, platform, is_active, created_at, last_used_at, substr(token, 1, 12) AS token_hint FROM device_tokens WHERE user_id = ?1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: str(r.id),
    platform: str(r.platform),
    isActive: num(r.is_active) === 1,
    tokenHint: `${str(r.token_hint)}…`,
    createdAt: toIso(r.created_at) ?? '',
    lastUsedAt: optStr(r.last_used_at) ? toIso(r.last_used_at) : null,
  }));
}

export async function revokeDeviceToken(db: D1Database, userId: string, id: string): Promise<void> {
  await db.prepare(`UPDATE device_tokens SET is_active = 0 WHERE id = ?1 AND user_id = ?2`).bind(id, userId).run();
}

/* --------------------------------- dispatch -------------------------------- */

export interface NotifyArgs {
  userId: string;
  kind: NotificationKind;
  orderId?: string | null;
  /** Overrides the template body (used for admin/stock messages). */
  note?: string | null;
}

export interface NotifyOutcome {
  push: { attempted: number; sent: number; skipped: boolean };
  email: { sent: boolean; skipped: boolean; message: string | null };
  logged: number;
}

/** Sends one kind of message to one user, honouring their stored preferences. */
export async function notifyUser(env: Env, f: RuntimeFlags, args: NotifyArgs): Promise<NotifyOutcome> {
  const db = env.DB;
  const template = TEMPLATES[args.kind];
  const prefs = await getNotificationPrefs(db, args.userId);
  const identity = await first<Row>(db, `SELECT display_name, email FROM users WHERE id = ?1`, [args.userId]);
  if (!identity)
    return {
      push: { attempted: 0, sent: 0, skipped: true },
      email: { sent: false, skipped: true, message: 'User tidak ditemukan' },
      logged: 0,
    };

  const context: OrderContext = args.orderId
    ? ((await orderContext(db, args.orderId)) ?? {
        code: '-',
        grandTotal: 0,
        status: '-',
        courier: null,
        trackingNumber: null,
        note: args.note ?? null,
      })
    : { code: '-', grandTotal: 0, status: '-', courier: null, trackingNumber: null, note: args.note ?? null };
  if (args.note) context.note = args.note;

  const title = template.title(context);
  const body = template.body(context);
  const settings = await storefrontSettings(db);
  const link = args.orderId
    ? `${f.appUrl}${context.code === '-' ? ROUTES.orders : ROUTES.orderDetail(context.code)}`
    : `${f.appUrl}${ROUTES.orders}`;
  let logged = 0;

  // 1. in-app bell (always stored, it is the record of the event)
  await logNotification(db, {
    userId: args.userId,
    channel: 'in_app',
    template: args.kind,
    title,
    body,
    data: { orderId: args.orderId ?? null, code: context.code, link },
    target: null,
    status: 'sent',
    error: null,
  });
  logged += 1;

  const allowed = template.pref === null || prefs[template.pref];

  // 2. push
  let push: NotifyOutcome['push'] = { attempted: 0, sent: 0, skipped: true };
  if (allowed && f.firebase.projectId) {
    const tokens = await activeDeviceTokens(db, args.userId);
    if (tokens.length) {
      const result = await sendPush(env, tokens, {
        title,
        body,
        data: { orderId: args.orderId ?? '', code: context.code, link },
        link,
        tag: args.kind,
      });
      push = { attempted: result.attempted, sent: result.sent, skipped: result.skipped };
      for (const dead of result.invalidTokens) await removeDeviceToken(db, dead);
      await logNotification(db, {
        userId: args.userId,
        channel: 'push',
        template: args.kind,
        title,
        body,
        data: { attempted: result.attempted, sent: result.sent, invalid: result.invalidTokens.length },
        target: `${result.attempted} perangkat`,
        status: result.sent > 0 ? 'sent' : result.skipped ? 'skipped' : 'failed',
        error: result.skipped ? 'Firebase service account belum dikonfigurasi' : null,
      });
      logged += 1;
    }
  }

  // 3. email
  let email: NotifyOutcome['email'] = { sent: false, skipped: true, message: 'Dilewati (preferensi atau provider)' };
  const address = optStr(identity.email);
  if (template.email && allowed && prefs.email && address && f.email.configured) {
    const result = await sendEmail(env, f, {
      to: address,
      subject: `${title} — ${settings.storeName}`,
      html: mailTemplate({
        storeName: settings.storeName,
        title,
        body,
        ctaLabel: args.orderId ? 'Lihat pesanan' : undefined,
        ctaHref: args.orderId ? link : undefined,
      }),
    });
    email = { sent: result.ok, skipped: result.skipped, message: result.message };
    await logNotification(db, {
      userId: args.userId,
      channel: 'email',
      template: args.kind,
      title,
      body,
      data: { provider: result.provider },
      target: address,
      status: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
      error: result.message,
    });
    logged += 1;
  }

  logger(env).info('Notifikasi diproses', { kind: args.kind, userId: args.userId, push, email: email.sent });
  return { push, email, logged };
}

async function logNotification(
  db: D1Database,
  entry: {
    userId: string;
    channel: 'push' | 'email' | 'in_app';
    template: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    target: string | null;
    status: 'queued' | 'sent' | 'failed' | 'skipped';
    error: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notification_logs (id, user_id, channel, template, title, body, data, target, status, error, order_id, sent_at, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,
               (SELECT id FROM orders WHERE code = ?11),
               CASE WHEN ?9 = 'sent' THEN datetime('now') ELSE NULL END, datetime('now'))`,
    )
    .bind(
      uuid(),
      entry.userId,
      entry.channel,
      entry.template.slice(0, 60),
      entry.title.slice(0, 200),
      entry.body.slice(0, 1000),
      JSON.stringify(entry.data).slice(0, 4000),
      entry.target,
      entry.status,
      entry.error?.slice(0, 500) ?? null,
      String(entry.data.code ?? '-'),
    )
    .run();
}

/* --------------------------------- in-app --------------------------------- */

export async function inbox(db: D1Database, userId: string, limit = 20) {
  const rows = await all<Row>(
    db,
    `SELECT id, template, title, body, data, status, read_at, created_at FROM notification_logs
     WHERE user_id = ?1 AND channel = 'in_app' ORDER BY created_at DESC LIMIT ?2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: str(r.id),
    template: str(r.template),
    title: str(r.title),
    body: str(r.body),
    link: optStr((safeJson(r.data) as Record<string, unknown> | null)?.link as string | undefined),
    read: r.read_at !== null && r.read_at !== undefined,
    createdAt: toIso(r.created_at) ?? '',
  }));
}

export async function unreadInboxCount(db: D1Database, userId: string): Promise<number> {
  return count(
    db,
    `SELECT COUNT(*) AS n FROM notification_logs WHERE user_id = ?1 AND channel = 'in_app' AND read_at IS NULL`,
    [userId],
  );
}

/** Marks messages as read; always scoped to the owner so ids from another account are ignored. */
export async function markInboxRead(db: D1Database, userId: string, ids?: string[]): Promise<number> {
  if (ids && ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const result = await db
      .prepare(
        `UPDATE notification_logs SET read_at = datetime('now')
         WHERE user_id = ?1 AND channel = 'in_app' AND read_at IS NULL AND id IN (${placeholders})`,
      )
      .bind(userId, ...ids)
      .run();
    return num(result.meta?.changes ?? result.changes ?? 0);
  }
  const result = await db
    .prepare(
      `UPDATE notification_logs SET read_at = datetime('now') WHERE user_id = ?1 AND channel = 'in_app' AND read_at IS NULL`,
    )
    .bind(userId)
    .run();
  return num(result.meta?.changes ?? result.changes ?? 0);
}

function safeJson(v: unknown): unknown {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

export async function adminNotifications(db: D1Database, limit = 40) {
  const rows = await all<Row>(
    db,
    `SELECT n.id, n.channel, n.template, n.title, n.status, n.error, n.created_at, u.email
     FROM notification_logs n LEFT JOIN users u ON u.id = n.user_id
     ORDER BY n.created_at DESC LIMIT ?1`,
    [limit],
  );
  return rows.map((r) => ({
    id: str(r.id),
    channel: str(r.channel),
    template: str(r.template),
    title: str(r.title),
    status: str(r.status),
    error: optStr(r.error),
    email: optStr(r.email),
    createdAt: toIso(r.created_at) ?? '',
  }));
}
