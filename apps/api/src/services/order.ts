import type {
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderSummary,
  OrderTimelineEntry,
  PaymentInfo,
  ShipmentInfo,
  TrackingEvent,
} from '@velora/shared';
import { ORDER_STATUS, ORDER_TRANSITIONS, type Paginated } from '@velora/shared';
import type { Env } from '../env';
import { type Row, all, first, iso, limitOffset, num, optNum, optStr, paginate, str, toIso, value } from '../lib/db';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { uuid } from '../lib/ids';
import { mediaUrl } from '../lib/media';
import { releaseCouponUsage } from './coupon';
import { consumeReservations, releaseReservations, restockOrder } from './inventory';

/**
 * Order reads + the single authoritative status machine.
 * Nothing may jump to `paid` except through a verified payment (see services/payment.ts).
 */

const SUMMARY_SELECT = `
  SELECT o.id, o.code, o.status, o.grand_total, o.subtotal, o.discount_total, o.shipping_fee,
         o.payment_fee, o.total_weight_grams, o.coupon_code, o.payment_method, o.created_at, o.updated_at,
         o.expires_at, o.paid_at, o.shipped_at, o.delivered_at, o.cancelled_at, o.cancel_reason,
         o.customer_note, o.ship_recipient_name, o.ship_phone, o.ship_province, o.ship_city,
         o.ship_district, o.ship_postcode, o.ship_detail, o.ship_area_id, o.user_id,
         p.id AS payment_id, p.status AS payment_status, p.method AS payment_method_name, p.channel_code, p.payment_url,
         p.reference, p.amount AS payment_amount, p.fee AS payment_fee, p.paid_at AS payment_paid_at,
         p.qr_string AS payment_qr_string,
         p.expired_at AS payment_expired_at,
         s.status AS shipping_status, s.courier_company, s.courier_service, s.courier_type,
         s.tracking_number, s.waybill_id, s.biteship_order_id, s.price AS shipping_price, s.estimate,
         s.delivered_at AS shipment_delivered_at, s.id AS shipment_id,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT oi.image_key FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at LIMIT 1) AS primary_image,
         u.email AS customer_email, u.display_name AS customer_name
  FROM orders o
  LEFT JOIN payments p ON p.order_id = o.id
  LEFT JOIN shipments s ON s.order_id = o.id
  LEFT JOIN users u ON u.id = o.user_id`;

export function mapOrderSummary(row: Row, c: Env): OrderSummary {
  return {
    id: str(row.id),
    code: str(row.code),
    status: str(row.status) as OrderStatus,
    paymentStatus: optStr(row.payment_status) as OrderSummary['paymentStatus'],
    shippingStatus: optStr(row.shipping_status) as OrderSummary['shippingStatus'],
    grandTotal: num(row.grand_total),
    itemCount: num(row.item_count),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
    expiresAt: optStr(row.expires_at) ? toIso(row.expires_at) : null,
    primaryImage: row.primary_image ? mediaUrl(c, str(row.primary_image)) : null,
    courier: optStr(row.courier_company),
    trackingNumber: optStr(row.tracking_number),
  };
}

export async function listOrders(
  db: D1Database,
  userId: string,
  c: Env,
  page: number,
  pageSize: number,
  status?: OrderStatus,
): Promise<Paginated<OrderSummary>> {
  const clauses = ['o.user_id = ?1'];
  const params: unknown[] = [userId];
  if (status) {
    clauses.push('o.status = ?2');
    params.push(status);
  }
  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const total = num(await value<number>(db, `SELECT COUNT(*) AS n FROM orders o ${whereSql}`, params));
  const rowsFound = await all<Row>(
    db,
    `${SUMMARY_SELECT} ${whereSql} ORDER BY o.created_at DESC ${limitOffset(pageSize, (page - 1) * pageSize)}`,
    params,
  );
  return paginate(
    rowsFound.map((r) => mapOrderSummary(r, c)),
    total,
    page,
    pageSize,
  );
}

/** Admin list: joins customer + filters on code / email / status / date range. */
export async function listOrdersAdmin(
  db: D1Database,
  c: Env,
  opts: { q?: string; status?: OrderStatus; from?: string; to?: string; page: number; pageSize: number },
): Promise<Paginated<OrderSummary>> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    clauses.push(
      `(o.code LIKE ?${params.length + 1} OR u.email LIKE ?${params.length + 2} OR o.ship_recipient_name LIKE ?${params.length + 3})`,
    );
    const like = `%${opts.q.replace(/[^\w\s.@\-]/g, '')}%`;
    params.push(like, like, like);
  }
  if (opts.status) {
    clauses.push(`o.status = ?${params.length + 1}`);
    params.push(opts.status);
  }
  if (opts.from) {
    clauses.push(`o.created_at >= ?${params.length + 1}`);
    params.push(`${opts.from} 00:00:00`);
  }
  if (opts.to) {
    clauses.push(`o.created_at <= ?${params.length + 1}`);
    params.push(`${opts.to} 23:59:59`);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS n FROM orders o LEFT JOIN users u ON u.id = o.user_id ${whereSql}`,
      params,
    ),
  );
  const rowsFound = await all<Row>(
    db,
    `${SUMMARY_SELECT} ${whereSql} ORDER BY o.created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return paginate(
    rowsFound.map((r) => mapOrderSummary(r, c)),
    total,
    opts.page,
    opts.pageSize,
  );
}

function mapItems(rows: Row[], c: Env): OrderItem[] {
  return rows.map((r) => ({
    id: str(r.id),
    productId: str(r.product_id),
    variantId: str(r.variant_id),
    productName: str(r.product_name),
    variantLabel: str(r.variant_label),
    sku: str(r.sku),
    unitPrice: num(r.unit_price),
    quantity: num(r.quantity),
    lineTotal: num(r.line_total),
    weightGrams: num(r.weight_grams),
    imageUrl: r.image_key ? mediaUrl(c, str(r.image_key)) : null,
  }));
}

function mapTimeline(rows: Row[]): OrderTimelineEntry[] {
  return rows.map((r) => ({
    id: str(r.id),
    fromStatus: optStr(r.from_status) as OrderStatus | null,
    toStatus: str(r.to_status) as OrderStatus,
    note: optStr(r.note),
    actorType: str(r.actor_type) as OrderTimelineEntry['actorType'],
    createdAt: toIso(r.created_at) ?? '',
  }));
}

function mapPayment(row: Row): PaymentInfo | null {
  if (!row.payment_status) return null;
  return {
    id: str(row.payment_id),
    provider: 'duitku',
    merchantOrderId: str(row.code),
    reference: optStr(row.reference),
    method: optStr(row.payment_method_name),
    channelCode: optStr(row.channel_code),
    amount: optNum(row.payment_amount) ?? num(row.grand_total),
    status: str(row.payment_status) as PaymentInfo['status'],
    paymentUrl: optStr(row.payment_url),
    qrString: optStr(row.payment_qr_string),
    paidAt: optStr(row.payment_paid_at) ? (toIso(row.payment_paid_at) ?? '') : '',
    expiresAt: optStr(row.payment_expired_at) ? toIso(row.payment_expired_at) : null,
    fee: optNum(row.payment_fee) ?? 0,
  };
}

async function mapShipment(db: D1Database, row: Row, c: Env): Promise<ShipmentInfo | null> {
  if (!row.shipment_id) return null;
  const events = await all<Row>(
    db,
    `SELECT id, event_code, label, occurred_at, source FROM shipment_tracking_events
     WHERE shipment_id = ?1 ORDER BY occurred_at DESC LIMIT 60`,
    [str(row.shipment_id)],
  );
  return {
    id: str(row.shipment_id),
    provider: 'biteship',
    biteshipOrderId: optStr(row.biteship_order_id),
    waybillId: optStr(row.waybill_id),
    trackingNumber: optStr(row.tracking_number),
    courierCompany: str(row.courier_company),
    courierService: str(row.courier_service),
    courierType: optStr(row.courier_type),
    status: str(row.shipping_status) as ShipmentInfo['status'],
    price: optNum(row.shipping_price) ?? 0,
    estimate: optStr(row.estimate),
    events: events.map(
      (e): TrackingEvent => ({
        id: str(e.id),
        eventCode: str(e.event_code),
        label: str(e.label),
        occurredAt: toIso(e.occurred_at) ?? '',
        source: str(e.source) as TrackingEvent['source'],
      }),
    ),
    createdAt: toIso(row.created_at) ?? '',
    deliveredAt: optStr(row.shipment_delivered_at) ? (toIso(row.shipment_delivered_at) ?? '') : null,
  };
}

export async function findOrderRow(db: D1Database, idOrCode: string): Promise<Row | null> {
  return first<Row>(db, `${SUMMARY_SELECT} WHERE o.id = ?1 OR o.code = ?1`, [idOrCode]);
}

export async function getOrderDetail(db: D1Database, idOrCode: string, c: Env): Promise<OrderDetail> {
  const row = await findOrderRow(db, idOrCode);
  if (!row) throw notFound('Pesanan tidak ditemukan');
  const items = await all<Row>(db, `SELECT * FROM order_items WHERE order_id = ?1 ORDER BY created_at ASC`, [
    str(row.id),
  ]);
  const timeline = await all<Row>(
    db,
    `SELECT * FROM order_status_history WHERE order_id = ?1 ORDER BY created_at ASC`,
    [str(row.id)],
  );
  const notes = await all<Row>(
    db,
    `SELECT id, body, visibility, created_at FROM order_notes WHERE order_id = ?1 AND visibility = 'customer' ORDER BY created_at ASC`,
    [str(row.id)],
  );
  return {
    ...mapOrderSummary(row, c),
    userId: str(row.user_id),
    customerName: optStr(row.customer_name),
    customerEmail: optStr(row.customer_email),
    subtotal: num(row.subtotal),
    discountTotal: num(row.discount_total),
    shippingFee: num(row.shipping_fee),
    paymentFee: num(row.payment_fee),
    couponCode: optStr(row.coupon_code),
    shipping: {
      recipientName: str(row.ship_recipient_name),
      phone: str(row.ship_phone),
      province: str(row.ship_province),
      city: str(row.ship_city),
      district: str(row.ship_district),
      postcode: str(row.ship_postcode),
      detail: str(row.ship_detail),
      areaId: optStr(row.ship_area_id),
    },
    items: mapItems(items, c),
    timeline: mapTimeline(timeline),
    notes: notes.map((n) => ({
      id: str(n.id),
      body: str(n.body),
      visibility: 'customer' as const,
      createdAt: toIso(n.created_at) ?? '',
    })),
    payment: mapPayment(row),
    shipment: await mapShipment(db, row, c),
    customerNote: optStr(row.customer_note),
    cancelReason: optStr(row.cancel_reason),
  };
}

/** Every status change goes through here: transition table + history + timestamps. */
export async function transitionOrder(
  db: D1Database,
  orderId: string,
  to: OrderStatus,
  actor: { type: 'customer' | 'admin' | 'system' | 'webhook'; id?: string | null },
  note?: string | null,
): Promise<OrderStatus> {
  const current = await first<Row>(db, `SELECT status FROM orders WHERE id = ?1`, [orderId]);
  if (!current) throw notFound('Pesanan tidak ditemukan');
  const from = str(current.status) as OrderStatus;
  if (from === to) return to;
  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw conflict(`Tidak dapat mengubah pesanan dari ${from} ke ${to}`);
  }
  const timestampColumn = timestampFor(to);
  const statements = [
    {
      sql: `UPDATE orders SET status = ?1, ${timestampColumn ? `${timestampColumn} = datetime('now'),` : ''} updated_at = datetime('now')
            WHERE id = ?2 AND status = ?3`,
      params: [to, orderId, from],
    },
    {
      sql: `INSERT INTO order_status_history (id, order_id, from_status, to_status, note, actor_type, actor_id, created_at)
            VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'))`,
      params: [uuid(), orderId, from, to, note ?? null, actor.type, actor.id ?? null],
    },
  ];
  const results = (await db.batch(
    statements.map((s) => db.prepare(s.sql).bind(...(s.params as never[]))),
  )) as never as {
    meta?: { changes?: number };
  }[];
  if (num(results[0]?.meta?.changes ?? 0) === 0) {
    throw conflict('Status pesanan baru saja berubah, muat ulang halaman');
  }
  return from;
}

function timestampFor(status: OrderStatus): string | null {
  switch (status) {
    case ORDER_STATUS.PAID:
      return 'paid_at';
    case ORDER_STATUS.SHIPPED:
      return 'shipped_at';
    case ORDER_STATUS.DELIVERED:
      return 'delivered_at';
    case ORDER_STATUS.COMPLETED:
      return 'completed_at';
    case ORDER_STATUS.CANCELLED:
      return 'cancelled_at';
    default:
      return null;
  }
}

/** Verified payment: mark paid exactly once and convert reservations into sales. */
export async function markOrderPaid(
  db: D1Database,
  orderId: string,
  actor: { type: 'webhook' | 'admin' | 'system'; id?: string | null },
  note = 'Pembayaran terverifikasi Duitku',
): Promise<boolean> {
  const row = await first<Row>(db, `SELECT status FROM orders WHERE id = ?1`, [orderId]);
  if (!row) throw notFound('Pesanan tidak ditemukan');
  const status = str(row.status) as OrderStatus;
  if (status === ORDER_STATUS.PAID || status === ORDER_STATUS.PROCESSING || status === ORDER_STATUS.SHIPPED) {
    return false; // already handled: idempotent
  }
  if (status === ORDER_STATUS.CANCELLED) {
    throw new AppError('CONFLICT', 'Pesanan sudah dibatalkan', 409);
  }
  await transitionOrder(db, orderId, ORDER_STATUS.PAID, actor, note);
  await db
    .prepare(
      `UPDATE payments SET status='paid', paid_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?1`,
    )
    .bind(orderId)
    .run();
  await consumeReservations(db, orderId);
  return true;
}

export async function cancelOrder(
  db: D1Database,
  orderId: string,
  actor: { type: 'customer' | 'admin' | 'system' | 'webhook'; id?: string | null },
  reason: string,
): Promise<void> {
  const row = await first<Row>(db, `SELECT status FROM orders WHERE id = ?1`, [orderId]);
  if (!row) throw notFound('Pesanan tidak ditemukan');
  const status = str(row.status) as OrderStatus;
  if (status === ORDER_STATUS.CANCELLED) return;
  if (!(ORDER_TRANSITIONS[status] ?? []).includes(ORDER_STATUS.CANCELLED)) {
    throw conflict('Pesanan yang sudah dikirim tidak dapat dibatalkan. Gunakan proses refund.');
  }
  await transitionOrder(db, orderId, ORDER_STATUS.CANCELLED, actor, reason);
  await db.prepare(`UPDATE orders SET cancel_reason = ?1 WHERE id = ?2`).bind(reason, orderId).run();
  const reservations = await first<Row>(
    db,
    `SELECT COUNT(*) AS n FROM stock_reservations WHERE order_id = ?1 AND status = 'active'`,
    [orderId],
  );
  if (num(reservations?.n) > 0) {
    await releaseReservations(db, orderId, `Pesanan dibatalkan: ${reason}`);
  } else if (status !== ORDER_STATUS.PENDING_PAYMENT) {
    await restockOrder(db, orderId, `Retur pembatalan: ${reason}`);
  }
  await releaseCouponUsage(db, orderId);
  await db
    .prepare(
      `UPDATE payments SET status = CASE WHEN status='pending' THEN 'failed' ELSE status END, updated_at = datetime('now') WHERE order_id = ?1`,
    )
    .bind(orderId)
    .run();
}

export async function addOrderNote(
  db: D1Database,
  orderId: string,
  body: string,
  visibility: 'internal' | 'customer',
  authorId: string | null,
): Promise<{ id: string; body: string; visibility: 'internal' | 'customer'; createdAt: string }> {
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO order_notes (id, order_id, author_id, body, visibility, created_at)
       VALUES (?1,?2,?3,?4,?5,datetime('now'))`,
    )
    .bind(id, orderId, authorId, body, visibility)
    .run();
  const row = await first<Row>(db, `SELECT created_at FROM order_notes WHERE id = ?1`, [id]);
  return { id, body, visibility, createdAt: toIso(row?.created_at) ?? iso(new Date()) ?? '' };
}

export async function orderCountByStatus(db: D1Database, userId: string): Promise<Record<string, number>> {
  const rows = await all<Row>(db, `SELECT status, COUNT(*) AS n FROM orders WHERE user_id = ?1 GROUP BY status`, [
    userId,
  ]);
  const out: Record<string, number> = {};
  for (const r of rows) out[str(r.status)] = num(r.n);
  return out;
}
