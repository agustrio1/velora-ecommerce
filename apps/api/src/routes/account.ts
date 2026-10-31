import { ORDER_STATUS, type OrderStatus, schemas } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { type Row, first, str } from '../lib/db';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { currentUser, limit, requireAuth } from '../mw/auth';
import { customerThread, markThreadRead, startCustomerChat } from '../services/chat';
import {
  type UserRecord,
  createAddress,
  deleteAddress,
  getAddress,
  getNotificationPrefs,
  getProfile,
  listAddresses,
  setNotificationPrefs,
  updateAddress,
  updateProfile,
} from '../services/identity';
import {
  inbox,
  listDeviceTokens,
  markInboxRead,
  notifyUser,
  revokeDeviceToken,
  saveDeviceToken,
  unreadInboxCount,
} from '../services/notify';
import { cancelOrder, findOrderRow, getOrderDetail, listOrders, orderCountByStatus } from '../services/order';
import { wishlistIds } from '../services/wishlist';
import type { AppEnv, Ctx } from '../types';
import { flagsOf, intField, optionalString, readBody } from './_shared';

/**
 * Signed-in customer area. Everything here is scoped by `user.id` taken from the
 * verified ID token — request bodies never carry an identity.
 */

const chatBodySchema = z.object({ body: z.string().trim().min(1).max(2000) });
const markReadSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(100).optional() });

export const accountRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /* ---------------------------------- profile ------------------------------- */
  .get('/me', async (c) => {
    const db = c.env.DB;
    const user = currentUser(c);
    const [profile, prefs, counts, unread, wishlistCount] = await Promise.all([
      getProfile(db, user.id),
      getNotificationPrefs(db, user.id),
      orderCountByStatus(db, user.id),
      unreadInboxCount(db, user.id),
      wishlistIds(db, user.id).then((ids) => ids.length),
    ]);
    return c.json({
      user: publicUser(user),
      profile,
      prefs,
      stats: {
        orders: Object.values(counts).reduce((s, n) => s + n, 0),
        byStatus: counts,
        unreadNotifications: unread,
        wishlist: wishlistCount,
      },
    });
  })

  .patch('/me', async (c) => {
    const user = currentUser(c);
    const input = await readBody(c, schemas.profileUpdateSchema);
    await updateProfile(c.env.DB, user.id, input);
    return c.json({ profile: await getProfile(c.env.DB, user.id) });
  })

  .put('/preferences', async (c) => {
    const user = currentUser(c);
    const prefs = await readBody(c, schemas.notificationPrefsSchema);
    return c.json({ prefs: await setNotificationPrefs(c.env.DB, user.id, prefs) });
  })

  /* --------------------------------- addresses ------------------------------ */
  .get('/addresses', async (c) => c.json({ items: await listAddresses(c.env.DB, currentUser(c).id) }))

  .post('/addresses', limit({ max: 10, scope: 'address-create' }), async (c) => {
    const user = currentUser(c);
    const input = await readBody(c, schemas.addressSchema);
    if (await tooManyAddresses(c, user.id)) throw badRequest('Maksimal 10 alamat tersimpan');
    return c.json({ address: await createAddress(c.env.DB, user.id, input) }, 201);
  })

  .patch('/addresses/:id', async (c) => {
    const user = currentUser(c);
    const id = c.req.param('id');
    if (!id) throw badRequest('Id alamat wajib diisi');
    if (!(await getAddress(c.env.DB, user.id, id))) throw notFound('Alamat tidak ditemukan');
    const input = await readBody(c, schemas.addressSchema);
    const address = await updateAddress(c.env.DB, user.id, id, input);
    if (!address) throw notFound('Alamat tidak ditemukan');
    return c.json({ address });
  })

  .delete('/addresses/:id', async (c) => {
    const user = currentUser(c);
    const id = c.req.param('id');
    if (!id) throw badRequest('Id alamat wajib diisi');
    if (!(await getAddress(c.env.DB, user.id, id))) throw notFound('Alamat tidak ditemukan');
    await deleteAddress(c.env.DB, user.id, id);
    return c.json({ items: await listAddresses(c.env.DB, user.id) });
  })

  /* ---------------------------------- orders ------------------------------- */
  .get('/orders', async (c) => {
    const user = currentUser(c);
    const { page, pageSize } = paging(c);
    const raw = optionalString(c.req.query('status'), 30) as OrderStatus | undefined;
    const status = raw && (Object.values(ORDER_STATUS) as string[]).includes(raw) ? raw : undefined;
    return c.json(await listOrders(c.env.DB, user.id, c.env, page, pageSize, status));
  })

  .get('/orders/:code', async (c) => {
    const user = currentUser(c);
    const code = c.req.param('code');
    if (!code) throw badRequest('Kode pesanan wajib diisi');
    const row = await findOrderRow(c.env.DB, code.trim().toUpperCase());
    if (!row) throw notFound('Pesanan tidak ditemukan');
    if (str(row.user_id) !== user.id) throw forbidden('Pesanan ini bukan milik Anda');
    return c.json(await getOrderDetail(c.env.DB, str(row.id), c.env));
  })

  .post('/orders/:code/cancel', limit({ max: 5, scope: 'order-cancel' }), async (c) => {
    const user = currentUser(c);
    const code = c.req.param('code');
    if (!code) throw badRequest('Kode pesanan wajib diisi');
    const row = await findOrderRow(c.env.DB, code.trim().toUpperCase());
    if (!row) throw notFound('Pesanan tidak ditemukan');
    if (str(row.user_id) !== user.id) throw forbidden('Pesanan ini bukan milik Anda');
    const input = await readBody(c, schemas.cancelOrderSchema);
    await cancelOrder(c.env.DB, str(row.id), { type: 'customer', id: user.id }, input.reason);
    const f = flagsOf(c);
    c.executionCtx.waitUntil(
      notifyUser(c.env, f, { userId: user.id, kind: 'order_cancelled', orderId: str(row.id) }).catch(() => undefined),
    );
    return c.json({ order: await getOrderDetail(c.env.DB, str(row.id), c.env) });
  })

  /* ------------------------------- notifications ---------------------------- */
  .get('/notifications', async (c) => {
    const user = currentUser(c);
    const items = await inbox(c.env.DB, user.id, 40);
    return c.json({ items, unread: await unreadInboxCount(c.env.DB, user.id) });
  })

  .post('/notifications/read', async (c) => {
    const user = currentUser(c);
    const { ids } = await readBody(c, markReadSchema);
    return c.json({ updated: await markInboxRead(c.env.DB, user.id, ids) });
  })

  /* --------------------------------- devices -------------------------------- */
  .get('/devices', async (c) => c.json({ items: await listDeviceTokens(c.env.DB, currentUser(c).id) }))

  .post('/devices', limit({ max: 20, scope: 'device-register' }), async (c) => {
    const user = currentUser(c);
    const input = await readBody(c, schemas.deviceTokenSchema);
    const saved = await saveDeviceToken(c.env.DB, user.id, input.token, input.platform);
    return c.json({ ok: true, id: saved.id }, 201);
  })

  .delete('/devices/:id', async (c) => {
    const user = currentUser(c);
    const id = c.req.param('id');
    if (!id) throw badRequest('Id perangkat wajib diisi');
    await revokeDeviceToken(c.env.DB, user.id, id);
    return c.json({ items: await listDeviceTokens(c.env.DB, user.id) });
  })

  /* ------------------------------------ chat -------------------------------- */
  .get('/chat', async (c) => c.json(await customerThread(c.env.DB, currentUser(c))))

  .post('/chat', limit({ max: 20, scope: 'chat-send' }), async (c) => {
    const { body } = await readBody(c, chatBodySchema);
    return c.json(await startCustomerChat(c.env.DB, currentUser(c), body), 201);
  })

  .post('/chat/read', async (c) => {
    const thread = await customerThread(c.env.DB, currentUser(c));
    await markThreadRead(c.env.DB, thread.chatId, 'customer');
    return c.json({ ok: true });
  });

/* --------------------------------- helpers -------------------------------- */

/** Customers never page beyond the storefront window; admins have their own helper. */
function paging(c: Ctx): { page: number; pageSize: number } {
  return { page: intField(c.req.query('page'), 1, 1, 500), pageSize: intField(c.req.query('pageSize'), 10, 1, 50) };
}

/** The Firebase uid is an internal identifier and is never echoed to the client. */
function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    roles: user.roles,
    createdAt: user.createdAt,
  };
}

async function tooManyAddresses(c: Ctx, userId: string): Promise<boolean> {
  const row = await first<Row>(c.env.DB, `SELECT COUNT(*) AS n FROM user_addresses WHERE user_id = ?1`, [userId]);
  return Number(row?.n ?? 0) >= 10;
}
