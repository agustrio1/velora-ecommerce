import type { PaymentMethod } from '@velora/shared';
import { ERROR_CODES } from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import {
  type DuitkuTransactionInput,
  checkTransactionStatus,
  createTransaction,
  duitkuCallbackUrl,
  duitkuReturnUrl,
  getPaymentMethods,
  verifyCallback,
} from '../integrations/duitku';
import { cached } from '../lib/cache';
import { type Row, all, first, num, optStr, str } from '../lib/db';
import { AppError, badRequest, notFound } from '../lib/errors';
import { idempotencyKey, iso, minutesFromNow, uuid } from '../lib/ids';
import { logIntegration, logger } from '../lib/log';
import { markOrderPaid } from './order';
import { createShipmentForOrder } from './shipment';

/**
 * Payment lifecycle with Duitku.
 *
 * Two golden rules enforced here:
 *  1. `paid` is only ever set after a backend verification (signature + the
 *     transactionStatus API). A return URL is decoration, never proof.
 *  2. Every callback is stored with a unique idempotency key, so replays change
 *     nothing a second time.
 */

/** Payment channels for the checkout screen — the merchant's live Duitku list. */
export async function availablePaymentMethods(
  env: Env,
  f: RuntimeFlags,
  amount: number,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<PaymentMethod[]> {
  if (!f.duitku.configured) return [];
  const bucket = Math.max(0, Math.round(amount / 50_000) * 50_000);
  try {
    return await cached(env, `dk:methods:${bucket}`, 900, () => getPaymentMethods(env, f, bucket || 10_000), waitUntil);
  } catch (e) {
    logger(env).warn('Gagal memuat metode pembayaran Duitku', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

export function paymentFeeFor(method: PaymentMethod | undefined, amount: number): number {
  if (!method) return 0;
  if (method.feeType === 'percent') return Math.round((amount * method.fee) / 100);
  return Math.round(method.fee);
}

export interface CreatePaymentArgs {
  orderId: string;
  orderCode: string;
  amount: number;
  channelCode: string;
  channelName: string;
  fee: number;
  customer: { name: string; email: string; phone: string | null };
  productSummary: string;
  items: { name: string; price: number; quantity: number }[];
  expiryMinutes: number;
}

export interface PaymentOutcome {
  ok: boolean;
  paymentId: string;
  reference: string | null;
  paymentUrl: string | null;
  vaNumber: string | null;
  qrString: string | null;
  amount: number;
  expiresAt: string | null;
  gatewayConfigured: boolean;
  message: string | null;
}

/** Stores the payment row, then asks Duitku for a hosted transaction. */
export async function createPayment(
  env: Env,
  f: RuntimeFlags,
  appUrl: string,
  args: CreatePaymentArgs,
): Promise<PaymentOutcome> {
  const db = env.DB;
  const existing = await first<Row>(db, `SELECT * FROM payments WHERE order_id = ?1`, [args.orderId]);
  const paymentId = existing ? str(existing.id) : uuid();
  const total = args.amount;
  if (total <= 0) throw badRequest('Nilai transaksi tidak valid');
  if (total > 1_000_000_000) throw badRequest('Nilai transaksi melebihi batas Duitku');

  const expiresAt = minutesFromNow(args.expiryMinutes);
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO payments (id, order_id, provider, merchant_order_id, method, channel_code, amount, fee,
                               status, expired_at, created_at, updated_at)
         VALUES (?1,?2,'duitku',?3,?4,?5,?6,?7,'pending',?8,datetime('now'),datetime('now'))`,
      )
      .bind(paymentId, args.orderId, args.orderCode, args.channelName, args.channelCode, total, args.fee, expiresAt)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE payments SET method = ?1, channel_code = ?2, amount = ?3, fee = ?4, expired_at = ?5, updated_at = datetime('now')
         WHERE id = ?6`,
      )
      .bind(args.channelName, args.channelCode, total, args.fee, expiresAt, paymentId)
      .run();
  }

  if (!f.duitku.configured) {
    await logIntegration(env.DB, {
      provider: 'duitku',
      endpoint: 'v2/inquiry',
      reference: args.orderCode,
      success: false,
      message: 'Kredensial Duitku belum diisi — transaksi tidak dikirim ke gateway',
      payload: { orderCode: args.orderCode, amount: total },
    });
    return {
      ok: false,
      paymentId,
      reference: null,
      paymentUrl: null,
      vaNumber: null,
      qrString: null,
      amount: total,
      expiresAt: iso(new Date(Date.now() + args.expiryMinutes * 60_000)),
      gatewayConfigured: false,
      message: 'Gerbang pembayaran Duitku belum dikonfigurasi. Pesanan tersimpan dan menunggu pembayaran manual.',
    };
  }

  const input: DuitkuTransactionInput = {
    merchantOrderId: args.orderCode,
    paymentAmount: total,
    paymentMethod: args.channelCode,
    productDetails: args.productSummary,
    customerName: args.customer.name,
    email: args.customer.email,
    phoneNumber: args.customer.phone,
    items: args.items,
    returnUrl: duitkuReturnUrl(appUrl, args.orderCode),
    callbackUrl: duitkuCallbackUrl(appUrl),
    expiryMinutes: args.expiryMinutes,
  };

  const result = await createTransaction(env, f, input);
  await db
    .prepare(
      `UPDATE payments SET reference = ?1, payment_url = ?2, qr_string = ?3, va_number = ?4, result_code = ?5,
              result_message = ?6, raw_request = ?7, raw_response = ?8, signed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?9`,
    )
    .bind(
      result.reference,
      result.paymentUrl,
      result.qrString,
      result.vaNumber,
      result.statusCode,
      result.statusMessage,
      JSON.stringify({ merchantOrderId: args.orderCode, amount: total, channel: args.channelCode }).slice(0, 8000),
      JSON.stringify(result.raw).slice(0, 20000),
      paymentId,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO payment_transactions (id, payment_id, event_type, amount, status, payload, created_at)
       VALUES (?1,?2,'created',?3,?4,?5,datetime('now'))`,
    )
    .bind(uuid(), paymentId, total, result.ok ? 'pending' : 'failed', JSON.stringify(result.raw).slice(0, 8000))
    .run();

  if (!result.ok) {
    throw new AppError(
      ERROR_CODES.PAYMENT_FAILED,
      result.statusMessage ? `Duitku menolak transaksi: ${result.statusMessage}` : 'Duitku menolak transaksi',
      502,
      { orderCode: args.orderCode },
    );
  }

  return {
    ok: true,
    paymentId,
    reference: result.reference,
    paymentUrl: result.paymentUrl,
    vaNumber: result.vaNumber,
    qrString: result.qrString,
    amount: total,
    expiresAt: iso(new Date(Date.now() + args.expiryMinutes * 60_000)),
    gatewayConfigured: true,
    message: result.statusMessage,
  };
}

/* ------------------------------- verification ------------------------------ */

export interface CallbackForm {
  merchantCode?: string;
  amount?: string;
  merchantOrderId?: string;
  paymentCode?: string;
  resultCode?: string;
  reference?: string;
  signature?: string;
  settlementDate?: string;
  customerName?: string;
  publisherOrderId?: string;
}

export interface CallbackResult {
  accepted: boolean;
  duplicate: boolean;
  orderCode: string | null;
  paymentStatus: string | null;
  reason: string | null;
  orderId: string | null;
}

/**
 * Duitku server-to-server callback. Order of operations is deliberately strict:
 * signature -> merchant -> amount -> idempotency -> transactionStatus re-check -> mutate.
 */
export async function handlePaymentCallback(
  env: Env,
  f: RuntimeFlags,
  form: CallbackForm,
  ip: string,
): Promise<CallbackResult> {
  const db = env.DB;
  const orderCode = form.merchantOrderId ?? null;
  const signatureValid = await verifyCallback(f, form);

  if (!signatureValid) {
    await logIntegration(env.DB, {
      provider: 'duitku',
      direction: 'callback',
      endpoint: '/webhooks/duitku/callback',
      reference: orderCode,
      success: false,
      message: 'Signature callback tidak valid — ditolak',
      payload: form,
    });
    return {
      accepted: false,
      duplicate: false,
      orderCode,
      paymentStatus: null,
      reason: 'INVALID_SIGNATURE',
      orderId: null,
    };
  }

  const key = idempotencyKey('duitku', form.merchantCode, orderCode, form.reference, form.resultCode, form.amount);
  const callbackId = uuid();
  try {
    await db
      .prepare(
        `INSERT INTO payment_callbacks
           (id, provider, idempotency_key, merchant_code, merchant_order_id, reference, amount, payment_status,
            result_code, result_message, signature, signature_valid, processed, payload, ip, received_at)
         VALUES (?1,'duitku',?2,?3,?4,?5,?6,?7,?8,?9,?10,1,0,?11,?12,datetime('now'))`,
      )
      .bind(
        callbackId,
        key,
        form.merchantCode ?? null,
        orderCode,
        form.reference ?? null,
        form.amount ? num(form.amount) : null,
        form.resultCode === '00' ? 'success' : 'failed',
        form.resultCode ?? null,
        null,
        form.signature ?? null,
        JSON.stringify(form).slice(0, 8000),
        ip,
      )
      .run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(message)) {
      return { accepted: true, duplicate: true, orderCode, paymentStatus: null, reason: 'DUPLICATE', orderId: null };
    }
    throw e;
  }

  const payment = orderCode
    ? await first<Row>(db, `SELECT * FROM payments WHERE merchant_order_id = ?1`, [orderCode])
    : null;
  if (!payment) {
    await markCallback(db, callbackId, 0, 'Pesanan tidak dikenal');
    return {
      accepted: false,
      duplicate: false,
      orderCode,
      paymentStatus: null,
      reason: 'UNKNOWN_ORDER',
      orderId: null,
    };
  }
  const orderId = str(payment.order_id);

  if (form.merchantCode && form.merchantCode !== f.duitku.merchantCode) {
    await markCallback(db, callbackId, 0, 'Merchant code tidak cocok');
    return { accepted: false, duplicate: false, orderCode, paymentStatus: null, reason: 'MERCHANT_MISMATCH', orderId };
  }
  const claimedAmount = num(form.amount, -1);
  if (claimedAmount !== num(payment.amount)) {
    await markCallback(db, callbackId, 0, `Nominal tidak cocok (${claimedAmount} vs ${num(payment.amount)})`);
    return { accepted: false, duplicate: false, orderCode, paymentStatus: null, reason: 'AMOUNT_MISMATCH', orderId };
  }

  // Never take the callback's word alone: re-read the transaction from Duitku.
  let verified = false;
  let pendingRemote = false;
  let cancelledRemote = false;
  let statusMessage: string | null = null;
  if (f.duitku.configured) {
    try {
      const status = await checkTransactionStatus(env, f, orderCode!);
      verified = status.ok;
      pendingRemote = status.pending;
      cancelledRemote = status.cancelled;
      statusMessage = status.statusMessage;
      await db
        .prepare(
          `INSERT INTO payment_transactions (id, payment_id, event_type, amount, status, payload, created_at)
           VALUES (?1,?2,'status_check',?3,?4,?5,datetime('now'))`,
        )
        .bind(
          uuid(),
          str(payment.id),
          status.amount ?? num(payment.amount),
          verified ? 'success' : 'verify',
          JSON.stringify(status.raw).slice(0, 8000),
        )
        .run();
    } catch (e) {
      statusMessage = e instanceof Error ? e.message : 'Gagal memverifikasi ke Duitku';
    }
  } else {
    // Signature already validated with our own key; no status API available.
    verified = form.resultCode === '00';
  }

  if (verified) {
    const changed = await markOrderPaid(
      db,
      orderId,
      { type: 'webhook' },
      `Callback Duitku tervalidasi (${form.paymentCode ?? form.resultCode ?? ''})`,
    );
    await db
      .prepare(
        `UPDATE payments SET status='paid', paid_at = datetime('now'), result_code = ?1, result_message = ?2,
                reference = COALESCE(reference, ?3), updated_at = datetime('now') WHERE id = ?4`,
      )
      .bind(form.resultCode ?? null, statusMessage, form.reference ?? null, str(payment.id))
      .run();
    await db
      .prepare(
        `INSERT INTO payment_transactions (id, payment_id, event_type, amount, status, payload, created_at)
         VALUES (?1,?2,'callback',?3,'paid',?4,datetime('now'))`,
      )
      .bind(
        uuid(),
        str(payment.id),
        num(payment.amount),
        JSON.stringify({ settlementDate: form.settlementDate ?? null }).slice(0, 4000),
      )
      .run();
    await markCallback(db, callbackId, 1, changed ? 'Pesanan dibayar' : 'Sudah dibayar sebelumnya');
    if (changed) {
      await afterPaymentConfirmed(env, f, appUrlFromEnv(env), orderId);
    }
    return { accepted: true, duplicate: false, orderCode, paymentStatus: 'paid', reason: null, orderId };
  }

  if (pendingRemote) {
    await markCallback(db, callbackId, 0, 'Masih pending di Duitku');
    return { accepted: true, duplicate: false, orderCode, paymentStatus: 'pending', reason: 'STILL_PENDING', orderId };
  }

  if (cancelledRemote || form.resultCode === '01') {
    await db
      .prepare(
        `UPDATE payments SET status='failed', result_code = ?1, result_message = ?2, updated_at = datetime('now') WHERE id = ?3`,
      )
      .bind(form.resultCode ?? null, statusMessage ?? 'Gagal', str(payment.id))
      .run();
    await markCallback(db, callbackId, 1, 'Pembayaran gagal');
    return { accepted: true, duplicate: false, orderCode, paymentStatus: 'failed', reason: null, orderId };
  }

  await markCallback(db, callbackId, 0, statusMessage ?? 'Verifikasi Duitku belum berhasil');
  return { accepted: true, duplicate: false, orderCode, paymentStatus: 'pending', reason: 'NOT_VERIFIED', orderId };
}

async function markCallback(db: D1Database, id: string, processed: 0 | 1, message: string) {
  await db
    .prepare(`UPDATE payment_callbacks SET processed = ?1, processed_at = datetime('now') WHERE id = ?2`)
    .bind(processed, id)
    .run();
  await logIntegration(db, {
    provider: 'duitku',
    direction: 'callback',
    endpoint: '/webhooks/duitku/callback',
    success: processed === 1,
    message,
    payload: { id, message },
  });
}

function appUrlFromEnv(env: Env): string {
  return (env.APP_URL || '').replace(/\/$/, '');
}

/**
 * Paid -> processing + shipment. Kept separate so the callback path, the manual
 * re-check path and admin tooling all behave identically.
 */
export async function afterPaymentConfirmed(env: Env, f: RuntimeFlags, appUrl: string, orderId: string): Promise<void> {
  try {
    await createShipmentForOrder(env, f, orderId);
  } catch (e) {
    await logIntegration(env.DB, {
      provider: 'biteship',
      endpoint: 'createShipmentForOrder',
      reference: orderId,
      success: false,
      message: e instanceof Error ? e.message : String(e),
      payload: {},
    });
  }
  void appUrl;
}

/** Manual / scheduled re-check of a pending payment straight from Duitku. */
export async function recheckPayment(
  env: Env,
  f: RuntimeFlags,
  orderId: string,
): Promise<{ status: string; changed: boolean; message: string }> {
  const db = env.DB;
  const payment = await first<Row>(db, `SELECT * FROM payments WHERE order_id = ?1`, [orderId]);
  if (!payment) throw notFound('Transaksi pembayaran tidak ditemukan');
  if (str(payment.status) !== 'pending') {
    return { status: str(payment.status), changed: false, message: 'Status pembayaran sudah final' };
  }
  if (!f.duitku.configured) {
    const expired =
      optStr(payment.expired_at) !== null && Date.parse(`${str(payment.expired_at).replace(' ', 'T')}Z`) < Date.now();
    return { status: expired ? 'expired' : 'pending', changed: false, message: 'Duitku belum dikonfigurasi' };
  }
  const status = await checkTransactionStatus(env, f, str(payment.merchant_order_id));
  await db
    .prepare(
      `INSERT INTO payment_transactions (id, payment_id, event_type, amount, status, payload, created_at)
       VALUES (?1,?2,'status_check',?3,?4,?5,datetime('now'))`,
    )
    .bind(
      uuid(),
      str(payment.id),
      status.amount ?? num(payment.amount),
      status.ok ? 'paid' : 'pending',
      JSON.stringify(status.raw).slice(0, 8000),
    )
    .run();

  if (status.ok) {
    const changed = await markOrderPaid(db, orderId, { type: 'system' }, 'Verifikasi status pembayaran di server');
    await db
      .prepare(
        `UPDATE payments SET status='paid', paid_at = datetime('now'), result_message = ?1, updated_at = datetime('now') WHERE id = ?2`,
      )
      .bind(status.statusMessage, str(payment.id))
      .run();
    if (changed) await afterPaymentConfirmed(env, f, appUrlFromEnv(env), orderId);
    return { status: 'paid', changed, message: status.statusMessage ?? 'Pembayaran terverifikasi' };
  }
  if (status.cancelled) {
    await db
      .prepare(`UPDATE payments SET status='expired', result_message = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(status.statusMessage, str(payment.id))
      .run();
    return { status: 'expired', changed: false, message: status.statusMessage ?? 'Kedaluwarsa' };
  }
  return { status: 'pending', changed: false, message: status.statusMessage ?? 'Masih menunggu pembayaran' };
}

export async function paymentForOrder(db: D1Database, orderId: string): Promise<Row | null> {
  return first<Row>(db, `SELECT * FROM payments WHERE order_id = ?1`, [orderId]);
}

export async function paymentHistory(db: D1Database, orderId: string) {
  const rows = await all<Row>(
    db,
    `SELECT pt.id, pt.event_type, pt.amount, pt.status, pt.created_at
     FROM payment_transactions pt JOIN payments p ON p.id = pt.payment_id
     WHERE p.order_id = ?1 ORDER BY pt.created_at ASC`,
    [orderId],
  );
  return rows.map((r) => ({
    id: str(r.id),
    eventType: str(r.event_type),
    amount: optStr(r.amount) ? num(r.amount) : null,
    status: optStr(r.status),
    createdAt: str(r.created_at),
  }));
}

export const paymentRowFor = (db: D1Database, orderId: string) => paymentForOrder(db, orderId);
