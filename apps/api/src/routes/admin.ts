import {
  ORDER_STATUS,
  type OrderStatus,
  PAYMENT_STATUS,
  ROLE_CODE,
  type RoleCode,
  STORE_SETTINGS_KEYS,
  schemas,
} from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { cacheDelete } from '../lib/cache';
import { type Row, first, num, str } from '../lib/db';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { logger } from '../lib/log';
import { announcementSettings, orderSettings, seoSettings, shippingSettings, taxSettings } from '../lib/settings';
import { currentUser, requireAdmin, requireSuperAdmin } from '../mw/auth';
import * as admin from '../services/admin';
import { adminThreadDetail, adminThreads, postMessage, setThreadStatus, unreadChatCount } from '../services/chat';
import {
  deleteBanner,
  deleteFaq,
  getMenus,
  listBanners,
  listFaqs,
  listPages,
  listSections,
  listSubscribers,
  upsertBanner,
  upsertFaq,
  upsertMenu,
  upsertPage,
  upsertSection,
} from '../services/content';
import { grantRole, revokeRole } from '../services/identity';
import {
  adjustStock,
  bulkSetStock,
  inventoryMovements,
  listInventory,
  lowStockCount,
  reservationSnapshot,
  restockOrder,
} from '../services/inventory';
import { adminNotifications, notifyUser } from '../services/notify';
import {
  addOrderNote,
  cancelOrder,
  findOrderRow,
  getOrderDetail,
  listOrdersAdmin,
  markOrderPaid,
  transitionOrder,
} from '../services/order';
import { afterPaymentConfirmed, paymentForOrder, recheckPayment } from '../services/payment';
import {
  REPORT_KINDS,
  type ReportKind,
  assertRange,
  reportFilename,
  reportRows,
  salesSummary,
  toCsv,
} from '../services/reports';
import { emptySearch, globalSearch } from '../services/search';
import { manualShipmentPush, syncTrackingFromProvider } from '../services/shipment';
import type { AppEnv, Ctx } from '../types';
import { adminPaging, dateBound, flagsOf, mediaFor, optionalString, readBody, truthy } from './_shared';

/**
 * Admin dashboard API. Mounted behind `requireAdmin`, which reads roles from D1 —
 * a tampered ID token never grants access, and a disabled account is rejected
 * before the handler runs.
 */

export const adminRoutes = new Hono<AppEnv>()
  .use('*', requireAdmin)

  /* -------------------------------- dashboard ------------------------------- */
  .get('/dashboard', async (c) => {
    const stats = await admin.dashboardStats(c.env.DB, c.env);
    return c.json({ ...stats, unreadChats: await unreadChatCount(c.env.DB) });
  })

  .get('/health', async (c) => {
    const f = flagsOf(c);
    const [counters, lowStock, chats] = await Promise.all([
      admin.healthCounters(c.env.DB),
      lowStockCount(c.env.DB),
      unreadChatCount(c.env.DB),
    ]);
    return c.json({
      ...counters,
      lowStock,
      unreadChats: chats,
      integrations: {
        payments: { configured: f.duitku.configured, environment: f.duitku.sandbox ? 'sandbox' : 'production' },
        shipping: { configured: f.biteship.configured, environment: f.biteship.sandbox ? 'sandbox' : 'production' },
        realtime: { configured: f.firebase.configured },
        email: { configured: f.email.configured, provider: f.email.provider },
      },
    });
  })

  /* --------------------------------- search -------------------------------- */
  .get('/search', async (c) => {
    const q = optionalString(c.req.query('q'), 80);
    // A single letter matches nearly every row, so the palette waits for a second keystroke.
    if (!q || q.length < 2) return c.json(emptySearch(q ?? ''));
    return c.json(await globalSearch(c.env.DB, q));
  })

  /* -------------------------------- products ------------------------------- */
  .get('/products', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(
      await admin.listAdminProducts(
        c.env.DB,
        { q: optionalString(c.req.query('q'), 80), status: optionalString(c.req.query('status'), 20), page, pageSize },
        mediaFor(c.env),
      ),
    );
  })

  .get('/products/:id', async (c) => c.json(await admin.getAdminProduct(c.env.DB, requireId(c, 'id'))))

  .post('/products', async (c) => {
    const input = await readBody(c, schemas.productUpsertSchema);
    const result = await admin.upsertProduct(c.env.DB, currentUser(c).id, input);
    return c.json(result, result.created ? 201 : 200);
  })

  .put('/products/:id', async (c) => {
    const id = requireId(c, 'id');
    const input = await readBody(c, schemas.productUpsertSchema);
    const result = await admin.upsertProduct(c.env.DB, currentUser(c).id, { ...input, id });
    return c.json(result);
  })

  .patch('/products/:id/status', async (c) => {
    const id = requireId(c, 'id');
    const { status } = await readBody(c, schemas.productStatusSchema);
    await admin.setProductStatus(c.env.DB, id, status);
    return c.json({ id, status });
  })

  .delete('/products/:id', async (c) => {
    const id = requireId(c, 'id');
    const result = await admin.deleteOrArchiveProduct(c.env.DB, id);
    return c.json({
      ...result,
      message: result.deleted ? 'Produk dihapus' : 'Produk masih punya riwayat pesanan, status diubah jadi archived',
    });
  })

  /* ------------------------------- taxonomies ------------------------------ */
  .get('/taxonomies', async (c) => c.json(await admin.listTaxonomies(c.env.DB, mediaFor(c.env))))

  .post('/categories', async (c) => {
    const input = await readBody(c, schemas.taxonomiesSchema.categoryUpsert);
    const id = await admin.upsertCategory(c.env.DB, currentUser(c).id, {
      ...input,
      id: optionalString(c.req.query('id'), 64),
    });
    return c.json({ id }, 201);
  })

  .delete('/categories/:id', async (c) => {
    await admin.deleteCategory(c.env.DB, currentUser(c).id, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  .post('/brands', async (c) => {
    const input = await readBody(c, schemas.taxonomiesSchema.brandUpsert);
    const id = await admin.upsertBrand(c.env.DB, currentUser(c).id, input);
    return c.json({ id }, 201);
  })

  .delete('/brands/:id', async (c) => {
    await admin.deleteBrand(c.env.DB, currentUser(c).id, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  .post('/colors', async (c) => {
    const input = await readBody(c, schemas.taxonomiesSchema.colorUpsert);
    const id = await admin.upsertColor(c.env.DB, currentUser(c).id, input);
    return c.json({ id }, 201);
  })

  .delete('/colors/:id', async (c) => {
    await admin.deleteColor(c.env.DB, currentUser(c).id, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  .post('/sizes', async (c) => {
    const input = await readBody(c, schemas.taxonomiesSchema.sizeUpsert);
    const id = await admin.upsertSize(c.env.DB, currentUser(c).id, input);
    return c.json({ id }, 201);
  })

  .delete('/sizes/:id', async (c) => {
    await admin.deleteSize(c.env.DB, currentUser(c).id, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  .get('/size-guides', async (c) => c.json({ items: await admin.listSizeGuides(c.env.DB) }))

  /* -------------------------------- inventory ------------------------------ */
  .get('/inventory', async (c) => {
    const { page, pageSize } = adminPaging(c);
    const result = await listInventory(c.env.DB, {
      q: optionalString(c.req.query('q'), 80),
      low: truthy(c.req.query('low')),
      page,
      pageSize,
    });
    return c.json({ ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) });
  })

  .get('/inventory/movements', async (c) => {
    const { page, pageSize } = adminPaging(c);
    const result = await inventoryMovements(c.env.DB, {
      variantId: optionalString(c.req.query('variantId'), 64),
      productId: optionalString(c.req.query('productId'), 64),
      type: optionalString(c.req.query('type'), 30),
      page,
      pageSize,
    });
    return c.json({ ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) });
  })

  .post('/inventory/adjust', async (c) => {
    const input = await readBody(c, schemas.stockAdjustSchema);
    return c.json(await adjustStock(c.env.DB, { ...input, actorId: currentUser(c).id, note: input.note ?? null }));
  })

  .post('/inventory/bulk', async (c) => {
    const input = await readBody(c, schemas.bulkStockSchema);
    return c.json(await bulkSetStock(c.env.DB, input.items, currentUser(c).id, input.note ?? null));
  })

  /* --------------------------------- orders -------------------------------- */
  .get('/orders', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(
      await listOrdersAdmin(c.env.DB, c.env, {
        q: optionalString(c.req.query('q'), 60),
        status: asOrderStatus(optionalString(c.req.query('status'), 20)),
        from: dateBound(c.req.query('from')),
        to: dateBound(c.req.query('to')),
        page,
        pageSize,
      }),
    );
  })

  .get('/orders/:code', async (c) => c.json(await getOrderDetail(c.env.DB, requireId(c, 'code'), c.env)))

  .patch('/orders/:code/status', async (c) => {
    const order = await mustOrder(c);
    const input = await readBody(c, schemas.adminOrderStatusSchema);
    const f = flagsOf(c);
    if (input.status === ORDER_STATUS.PAID) {
      // Same path the callback uses: reservations are consumed and the courier is booked.
      const changed = await markOrderPaid(
        c.env.DB,
        str(order.id),
        { type: 'admin', id: currentUser(c).id },
        input.note ?? 'Ditandai dibayar oleh admin',
      );
      if (changed) c.executionCtx.waitUntil(afterPaymentConfirmed(c.env, f, f.appUrl, str(order.id)));
    } else {
      await transitionOrder(
        c.env.DB,
        str(order.id),
        input.status,
        { type: 'admin', id: currentUser(c).id },
        input.note ?? null,
      );
    }
    const detail = await getOrderDetail(c.env.DB, str(order.id), c.env);
    c.executionCtx.waitUntil(
      notifyUser(c.env, f, {
        userId: detail.userId,
        kind: statusKind(input.status),
        orderId: str(order.id),
        note: input.note ?? null,
      }).catch(() => undefined),
    );
    return c.json({ order: detail });
  })

  .post('/orders/:code/notes', async (c) => {
    const order = await mustOrder(c);
    const input = await readBody(c, schemas.orderNoteSchema);
    return c.json(
      { note: await addOrderNote(c.env.DB, str(order.id), input.body, input.visibility, currentUser(c).id) },
      201,
    );
  })

  .post('/orders/:code/cancel', async (c) => {
    const order = await mustOrder(c);
    const input = await readBody(c, schemas.cancelOrderSchema);
    await cancelOrder(c.env.DB, str(order.id), { type: 'admin', id: currentUser(c).id }, input.reason);
    return c.json({ order: await getOrderDetail(c.env.DB, str(order.id), c.env) });
  })

  .post('/orders/:code/refund', async (c) => {
    const order = await mustOrder(c);
    const input = await readBody(c, schemas.refundSchema);
    const payment = await paymentForOrder(c.env.DB, str(order.id));
    if (!payment) throw notFound('Belum ada transaksi pembayaran pada pesanan ini');
    if (str(payment.status) !== PAYMENT_STATUS.PAID)
      throw conflict('Hanya pembayaran berstatus paid yang dapat di-refund');
    if (input.amount > num(payment.amount)) throw badRequest('Nilai refund melebihi nominal yang dibayar');
    await transitionOrder(
      c.env.DB,
      str(order.id),
      ORDER_STATUS.REFUNDED,
      { type: 'admin', id: currentUser(c).id },
      input.reason,
    );
    await c.env.DB.prepare(`UPDATE payments SET status = 'refunded', updated_at = datetime('now') WHERE id = ?1`)
      .bind(str(payment.id))
      .run();
    // Goods already left the warehouse: stock only returns when the parcel was never shipped.
    const shipped = ['shipped', 'delivered', 'completed'].includes(str(order.status));
    if (!shipped) {
      const active = await first<Row>(
        c.env.DB,
        `SELECT COUNT(*) AS n FROM stock_reservations WHERE order_id = ?1 AND status = 'active'`,
        [str(order.id)],
      );
      if (num(active?.n) > 0) await restockOrder(c.env.DB, str(order.id), `Refund: ${input.reason}`);
    }
    await addOrderNote(
      c.env.DB,
      str(order.id),
      `Refund ${input.amount} — ${input.reason}`,
      'internal',
      currentUser(c).id,
    );
    const f = flagsOf(c);
    c.executionCtx.waitUntil(
      notifyUser(c.env, f, {
        userId: str(order.user_id),
        kind: 'order_cancelled',
        orderId: str(order.id),
        note: `Refund ${input.amount} diproses`,
      }).catch(() => undefined),
    );
    return c.json({ order: await getOrderDetail(c.env.DB, str(order.id), c.env) });
  })

  .post('/orders/:code/shipment', async (c) => {
    const order = await mustOrder(c);
    const f = flagsOf(c);
    if (!f.biteship.configured) throw badRequest('Kredensial Biteship belum diisi administrator');
    return c.json(await manualShipmentPush(c.env, f, str(order.id)));
  })

  .post('/orders/:code/tracking', async (c) => {
    const order = await mustOrder(c);
    const f = flagsOf(c);
    const shipment = await first<Row>(c.env.DB, `SELECT id FROM shipments WHERE order_id = ?1`, [str(order.id)]);
    if (!shipment) throw notFound('Belum ada kiriman untuk pesanan ini');
    return c.json(await syncTrackingFromProvider(c.env, f, str(shipment.id), 'manual'));
  })

  .post('/orders/:code/payment/recheck', async (c) => {
    const order = await mustOrder(c);
    const f = flagsOf(c);
    if (!f.duitku.configured) throw badRequest('Gateway pembayaran belum dikonfigurasi');
    return c.json(await recheckPayment(c.env, f, str(order.id)));
  })

  .get('/orders/:code/reservations', async (c) => {
    const order = await mustOrder(c);
    return c.json({ items: await reservationSnapshot(c.env.DB, str(order.id)) });
  })

  /* ------------------------------- customers ------------------------------- */
  .get('/customers', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(await admin.listCustomers(c.env.DB, { q: optionalString(c.req.query('q'), 80), page, pageSize }));
  })

  .get('/customers/:id', async (c) => c.json(await admin.customerDetail(c.env.DB, requireId(c, 'id'))))

  .patch('/customers/:id', async (c) => {
    const id = requireId(c, 'id');
    const me = currentUser(c);
    const input = await readBody(c, schemas.adminUserUpdateSchema);
    // Role assignment is a super-admin power, and nobody may rewrite their own set:
    // an admin editing themselves could otherwise escalate or lock the owner out.
    if (input.roles) {
      if (!me.roles.includes(ROLE_CODE.SUPER_ADMIN)) throw forbidden('Hanya super admin yang dapat mengubah peran');
      if (id === me.id) throw forbidden('Peran akun sendiri tidak dapat diubah');
    }
    await admin.updateCustomer(c.env.DB, me.id, id, {
      status: input.status,
      roles: input.roles,
    });
    return c.json({ id, ...input });
  })

  .post('/customers/:id/roles', requireSuperAdmin, async (c) => {
    const id = requireId(c, 'id');
    const me = currentUser(c);
    if (id === me.id) throw forbidden('Peran akun sendiri tidak dapat diubah');
    const { role } = await readBody(c, schemas.roleAssignmentSchema);
    if (role === ROLE_CODE.CUSTOMER) throw badRequest('Peran customer diberikan otomatis saat akun dibuat');
    if (!(await grantRole(c.env.DB, id, role, me.id))) throw notFound('Peran tidak dikenal');
    return c.json({ id, role, granted: true }, 201);
  })

  .delete('/customers/:id/roles/:role', requireSuperAdmin, async (c) => {
    const id = requireId(c, 'id');
    const me = currentUser(c);
    const role = c.req.param('role') as RoleCode | undefined;
    if (!role) throw badRequest('Peran wajib diisi');
    if (role === ROLE_CODE.CUSTOMER) throw badRequest('Peran customer tidak dapat dicabut');
    if (id === me.id) throw forbidden('Peran akun sendiri tidak dapat diubah');
    await revokeRole(c.env.DB, id, role);
    return c.json({ id, role, granted: false });
  })

  /* -------------------------------- coupons -------------------------------- */
  .get('/coupons', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(await admin.listCoupons(c.env.DB, { page, pageSize }));
  })

  .post('/coupons', async (c) => {
    const input = await readBody(c, schemas.couponUpsertSchema);
    const id = optionalString(c.req.query('id'), 64);
    return c.json({ id: await admin.upsertCoupon(c.env.DB, currentUser(c).id, id ? { ...input, id } : input) }, 201);
  })

  .delete('/coupons/:id', async (c) => {
    await admin.deleteCoupon(c.env.DB, currentUser(c).id, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  /* -------------------------------- reviews -------------------------------- */
  .get('/reviews', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(
      await admin.listReviewsAdmin(c.env.DB, { status: optionalString(c.req.query('status'), 20), page, pageSize }),
    );
  })

  .patch('/reviews/:id', async (c) => {
    const input = await readBody(c, schemas.reviewModerationSchema);
    await admin.setReviewStatus(c.env.DB, currentUser(c).id, requireId(c, 'id'), input.status);
    return c.json({ ok: true });
  })

  /* -------------------------------- content -------------------------------- */
  .get('/banners', async (c) => c.json({ items: await listBanners(c.env.DB, mediaFor(c.env)) }))
  .post('/banners', async (c) => {
    const input = await readBody(c, schemas.bannerUpsertSchema);
    await upsertBanner(c.env.DB, input);
    return c.json({ ok: true }, 201);
  })
  .put('/banners/:id', async (c) => {
    const input = await readBody(c, schemas.bannerUpsertSchema);
    await upsertBanner(c.env.DB, { ...input, id: requireId(c, 'id') });
    return c.json({ id: requireId(c, 'id') });
  })
  .delete('/banners/:id', async (c) => {
    await deleteBanner(c.env.DB, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  .get('/homepage-sections', async (c) => c.json({ items: await listSections(c.env.DB) }))
  .post('/homepage-sections', async (c) => {
    const input = await readBody(c, schemas.homepageSectionUpsertSchema);
    await upsertSection(c.env.DB, input);
    return c.json({ ok: true }, 201);
  })
  .put('/homepage-sections/:id', async (c) => {
    const input = await readBody(c, schemas.homepageSectionUpsertSchema);
    await upsertSection(c.env.DB, { ...input, id: requireId(c, 'id') });
    return c.json({ ok: true });
  })

  .get('/pages', async (c) => c.json({ items: await listPages(c.env.DB, true) }))
  .post('/pages', async (c) => {
    const input = await readBody(c, schemas.pageUpsertSchema);
    const page = await upsertPage(c.env.DB, input);
    return c.json({ id: page.id }, 201);
  })
  .put('/pages/:id', async (c) => {
    const input = await readBody(c, schemas.pageUpsertSchema);
    const page = await upsertPage(c.env.DB, { ...input, id: requireId(c, 'id') });
    return c.json({ id: page.id });
  })

  .get('/faqs', async (c) => c.json({ items: await listFaqs(c.env.DB, true) }))
  .post('/faqs', async (c) => {
    const input = await readBody(c, schemas.faqUpsertSchema);
    await upsertFaq(c.env.DB, input);
    return c.json({ ok: true }, 201);
  })
  .put('/faqs/:id', async (c) => {
    const input = await readBody(c, schemas.faqUpsertSchema);
    await upsertFaq(c.env.DB, { ...input, id: requireId(c, 'id') });
    return c.json({ ok: true });
  })
  .delete('/faqs/:id', async (c) => {
    await deleteFaq(c.env.DB, requireId(c, 'id'));
    return c.json({ ok: true });
  })

  .get('/menus', async (c) => c.json(await getMenus(c.env.DB)))
  .post('/menus', async (c) => {
    const input = await readBody(c, schemas.menuUpsertSchema);
    await upsertMenu(c.env.DB, input.code, input.items, input.isActive);
    return c.json({ ok: true }, 201);
  })

  .get('/newsletter', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(await listSubscribers(c.env.DB, { page, pageSize }));
  })

  /* --------------------------------- reports ------------------------------- */
  .get('/reports', (c) =>
    c.json({
      kinds: REPORT_KINDS,
      hint: 'Tambahkan ?from=YYYY-MM-DD&to=YYYY-MM-DD serta &format=csv untuk mengunduh.',
    }),
  )

  .get('/reports/summary', async (c) => {
    const range = assertRange(dateBound(c.req.query('from')), dateBound(c.req.query('to')));
    return c.json(await salesSummary(c.env.DB, range));
  })

  .get('/reports/:kind', async (c) => {
    const kind = c.req.param('kind') as ReportKind | undefined;
    if (!kind || !REPORT_KINDS.includes(kind)) throw notFound('Laporan tidak dikenal');
    const range = assertRange(dateBound(c.req.query('from')), dateBound(c.req.query('to')));
    const rows = await reportRows(c.env.DB, kind, range);
    if (c.req.query('format') === 'csv') {
      const csv = toCsv(rows);
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${reportFilename(kind, range)}"`,
          'cache-control': 'no-store',
        },
      });
    }
    return c.json({ kind, range, total: rows.length, rows });
  })

  /* -------------------------------- settings ------------------------------- */
  .get('/settings', async (c) => {
    const db = c.env.DB;
    const [rows, shipping, tax, order, announcement, seo, origins] = await Promise.all([
      admin.publicSettings(db),
      shippingSettings(db),
      taxSettings(db),
      orderSettings(db),
      announcementSettings(db),
      seoSettings(db),
      admin.listShippingOrigins(db),
    ]);
    const f = flagsOf(c);
    return c.json({
      settings: rows,
      shipping,
      tax,
      order,
      announcement,
      seo,
      origins,
      gateway: {
        duitku: {
          configured: f.duitku.configured,
          environment: f.duitku.sandbox ? 'sandbox' : 'production',
          merchantCode: f.duitku.merchantCode || null,
        },
        biteship: { configured: f.biteship.configured, environment: f.biteship.sandbox ? 'sandbox' : 'production' },
      },
    });
  })

  .patch('/settings', async (c) => {
    const patch = await readBody(c, schemas.storeSettingsPatchSchema);
    const applied = await admin.patchSettings(
      c.env.DB,
      currentUser(c).id,
      patch as Record<string, unknown>,
      c.get('ip'),
    );
    // The storefront head is served from a short-lived cache; drop it now so
    // a freshly saved title/description shows up on the next page load.
    await cacheDelete(c.env, 'public:settings');
    return c.json({ applied });
  })

  .put('/settings/duitku', async (c) => {
    const input = await readBody(c, schemas.duitkuConfigSchema);
    await admin.patchSettings(c.env.DB, currentUser(c).id, { [STORE_SETTINGS_KEYS.DUITKU]: input }, c.get('ip'));
    return c.json({ ok: true, note: 'Kredensial API dimasukkan lewat wrangler secret, bukan lewat layar ini.' });
  })

  .put('/settings/biteship', async (c) => {
    const input = await readBody(c, schemas.biteshipConfigSchema);
    await admin.patchSettings(c.env.DB, currentUser(c).id, { [STORE_SETTINGS_KEYS.BITESHIP]: input }, c.get('ip'));
    return c.json({ ok: true, note: 'API key Biteship disimpan sebagai secret; layar ini hanya mengatur preferensi.' });
  })

  .post('/settings/shipping-origin', async (c) => {
    const input = await readBody(c, shippingOriginSchema);
    await admin.setShippingOrigin(c.env.DB, input);
    return c.json({ ok: true }, 201);
  })

  /* ---------------------------------- logs --------------------------------- */
  .get('/logs/integrations', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(
      await admin.listIntegrationLogs(c.env.DB, {
        provider: optionalString(c.req.query('provider'), 20),
        onlyFailed: truthy(c.req.query('failed')),
        page,
        pageSize,
      }),
    );
  })

  .get('/logs/activity', async (c) => {
    const { page, pageSize } = adminPaging(c);
    return c.json(await admin.listActivityLogs(c.env.DB, { page, pageSize }));
  })

  .get('/logs/notifications', async (c) => c.json({ items: await adminNotifications(c.env.DB, 60) }))

  /* ---------------------------------- chat --------------------------------- */
  .get('/chat', async (c) => {
    const { page, pageSize } = adminPaging(c);
    const status = optionalString(c.req.query('status'), 10);
    const result = await adminThreads(c.env.DB, {
      q: optionalString(c.req.query('q'), 80),
      status: status === 'open' || status === 'closed' ? status : undefined,
      page,
      pageSize,
    });
    return c.json({ ...result, realtimeConfigured: true });
  })

  .get('/chat/:id', async (c) => c.json(await adminThreadDetail(c.env.DB, requireId(c, 'id'))))

  .post('/chat/:id/messages', async (c) => {
    const threadId = requireId(c, 'id');
    const { body } = await readBody(c, adminChatBody);
    const me = currentUser(c);
    return c.json(
      {
        message: await postMessage(c.env.DB, {
          threadId,
          userId: null,
          sender: 'admin',
          senderName: me.displayName ?? me.email,
          body,
        }),
      },
      201,
    );
  })

  .patch('/chat/:id/status', async (c) => {
    const { status } = await readBody(c, threadStatusSchema);
    await setThreadStatus(c.env.DB, requireId(c, 'id'), status);
    return c.json({ ok: true, status });
  });

/* --------------------------------- helpers -------------------------------- */

const adminChatBody = z.object({ body: z.string().trim().min(1).max(2000) });
const threadStatusSchema = z.object({ status: z.enum(['open', 'closed']) });
/** The optional block becomes a required body again: an origin must be complete before Biteship can use it. */
const shippingOriginSchema = schemas.storeSettingsPatchSchema.shape.shipping_origin!.unwrap();

function requireId(c: Ctx, name: string): string {
  const raw = c.req.param(name);
  if (!raw || !/^[A-Za-z0-9_-]{1,64}$/.test(raw)) throw badRequest(`Param ${name} tidak valid`);
  return raw;
}

function asOrderStatus(raw: string | undefined): OrderStatus | undefined {
  return raw && (Object.values(ORDER_STATUS) as string[]).includes(raw) ? (raw as OrderStatus) : undefined;
}

/** Loads an order by code or id and keeps the log trail honest when it is missing. */
async function mustOrder(c: Ctx): Promise<Row> {
  const key = requireId(c, 'code');
  const row = await findOrderRow(c.env.DB, key);
  if (!row) {
    logger(c.env).warn('admin order not found', { key, path: c.req.path });
    throw notFound('Pesanan tidak ditemukan');
  }
  return row;
}

/** Maps an admin status change onto the notification template that fits it. */
function statusKind(status: OrderStatus): 'payment_success' | 'order_shipped' | 'order_delivered' | 'order_cancelled' {
  if (status === ORDER_STATUS.PAID || status === ORDER_STATUS.PROCESSING) return 'payment_success';
  if (status === ORDER_STATUS.SHIPPED) return 'order_shipped';
  if (status === ORDER_STATUS.DELIVERED || status === ORDER_STATUS.COMPLETED) return 'order_delivered';
  return 'order_cancelled';
}
