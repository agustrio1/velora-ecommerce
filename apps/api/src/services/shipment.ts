import type { ShippingStatus } from '@velora/shared';
import {
  BITESHIP_SHIPPING_STATUS_MAP,
  ORDER_STATUS,
  SHIPMENT_TO_ORDER_STATUS,
  type ShipmentInfo,
} from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import {
  type BiteshipOrderInput,
  createOrder,
  extractTracking,
  getOrder,
  verifyWebhookSecret,
} from '../integrations/biteship';
import { type Row, all, first, jsonParse, num, optStr, str, toIso } from '../lib/db';
import { iso, uuid } from '../lib/ids';
import { logIntegration, logger } from '../lib/log';
import { transitionOrder } from './order';
import { MANUAL_PREFIX, PICKUP_OPTION_ID, defaultOrigin, shipmentIds } from './shipping';

/**
 * Shipping fulfilment on Biteship.
 *
 * A `shipments` row is created at checkout in `pending` state (so the admin sees
 * what has to be shipped even before payment). The moment payment is verified we
 * push the parcel to `POST /v1/orders` exactly once — the presence of
 * `biteship_order_id` is the idempotency guard against a duplicate shipment.
 *
 * Webhooks never mutate state straight from the payload: Biteship documents no
 * signature header, so every event only triggers a re-read of `GET /v1/orders/:id`
 * and the authoritative response is what we store.
 */

export interface NewShipmentRow {
  orderId: string;
  courierCompany: string;
  courierService: string;
  courierType: string | null;
  serviceCode: string;
  deliveryType: string;
  price: number;
  weightGrams: number;
  itemWeightGrams: number;
  itemName: string;
  insuranceEnabled: boolean;
  insurancePrice: number;
  estimate: string | null;
  fromSnapshot: Record<string, unknown>;
  toSnapshot: Record<string, unknown>;
}

/** Checkout writes this row; nothing provider-side happens yet. */
export async function insertShipmentRow(db: D1Database, s: NewShipmentRow): Promise<string> {
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO shipments (id, order_id, provider, courier_company, courier_service, courier_type, delivery_type,
                              service_code, status, price, price_changed, insurance_enabled, insurance_price,
                              weight_grams, item_name, from_snapshot, to_snapshot, estimate, created_at, updated_at)
       VALUES (?1,?2,'biteship',?3,?4,?5,?6,?7,'pending',?8,0,?9,?10,?11,?12,?13,?14,?15,datetime('now'),datetime('now'))`,
    )
    .bind(
      id,
      s.orderId,
      s.courierCompany,
      s.courierService,
      s.courierType,
      s.deliveryType,
      s.serviceCode,
      s.price,
      s.insuranceEnabled ? 1 : 0,
      s.insurancePrice,
      s.weightGrams,
      s.itemName,
      JSON.stringify(s.fromSnapshot).slice(0, 4000),
      JSON.stringify(s.toSnapshot).slice(0, 4000),
      s.estimate,
    )
    .run();
  return id;
}

export async function shipmentForOrder(db: D1Database, orderId: string): Promise<Row | null> {
  return first<Row>(db, `SELECT * FROM shipments WHERE order_id = ?1`, [orderId]);
}

const SELF_HANDLED = (company: string) => company === 'pickup' || company === 'manual';

/**
 * Paid order -> real courier booking. Safe to call repeatedly: an order that already
 * has a `biteship_order_id` is never pushed a second time.
 */
export async function createShipmentForOrder(
  env: Env,
  f: RuntimeFlags,
  orderId: string,
): Promise<{
  status: 'created' | 'self_pickup' | 'already' | 'skipped' | 'failed';
  message: string | null;
  shipmentId: string | null;
}> {
  const db = env.DB;
  const shipment = await shipmentForOrder(db, orderId);
  if (!shipment)
    return { status: 'skipped', message: 'Belum ada catatan pengiriman untuk pesanan ini', shipmentId: null };
  const shipmentId = str(shipment.id);
  if (optStr(shipment.biteship_order_id)) return { status: 'already', message: 'Pengiriman sudah dibuat', shipmentId };

  const company = str(shipment.courier_company);
  const order = await first<Row>(
    db,
    `SELECT o.*, u.email AS customer_email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?1`,
    [orderId],
  );
  if (!order) return { status: 'skipped', message: 'Pesanan tidak ditemukan', shipmentId };

  // Store pickup / merchant configured rates are our own logistics, not a courier booking.
  if (SELF_HANDLED(company)) {
    await db
      .prepare(`UPDATE shipments SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?1`)
      .bind(shipmentId)
      .run();
    await markOrderProcessing(
      env,
      orderId,
      company === 'pickup' ? 'Pesanan siap diambil di toko' : 'Pengiriman manual diproses',
    );
    await recordEvent(db, shipmentId, {
      eventCode: 'self_handled',
      label: company === 'pickup' ? 'Siap diambil di toko' : 'Pengiriman manual toko',
      description: null,
      occurredAt: iso(new Date()),
      source: 'manual',
      payload: { company },
    });
    return { status: 'self_pickup', message: null, shipmentId };
  }

  if (!f.biteship.configured) {
    return { status: 'skipped', message: 'BITESHIP_API_KEY belum diisi — pengiriman menunggu aktivasi', shipmentId };
  }

  const origin = await defaultOrigin(db);
  if (!origin) return { status: 'failed', message: 'Alamat asal pengiriman belum diatur', shipmentId };

  const from = jsonParse<Record<string, string>>(shipment.from_snapshot, {});
  const to = jsonParse<Record<string, string>>(shipment.to_snapshot, {});
  const items = await all<Row>(
    db,
    `SELECT product_name, sku, unit_price, quantity, weight_grams FROM order_items WHERE order_id = ?1`,
    [orderId],
  );

  const { company: courierCompany, service } = shipmentIds(str(shipment.service_code));
  const input: BiteshipOrderInput = {
    referenceId: str(order.code),
    origin: {
      contactName: from.contactName || origin.contactName,
      contactPhone: from.phone || origin.phone,
      address: from.address || origin.address,
      postalCode: from.postcode || origin.postcode,
      areaId: from.areaId || origin.areaId,
      note: from.note ?? null,
    },
    destination: {
      contactName: to.contactName || str(order.ship_recipient_name),
      contactPhone: to.phone || str(order.ship_phone),
      contactEmail: optStr(order.customer_email),
      address: to.address || str(order.ship_detail),
      postalCode: to.postcode || str(order.ship_postcode),
      areaId: to.areaId || optStr(order.ship_area_id),
      note: optStr(order.customer_note),
    },
    courier: {
      company: courierCompany || company,
      service,
      type: optStr(shipment.courier_type) ?? service,
    },
    collectionMethod: optStr(shipment.courier_type) === 'instant' ? 'pickup' : 'drop_off',
    deliveryType: 'now',
    insuranceValue: num(shipment.insurance_enabled) === 1 ? num(order.subtotal) : undefined,
    orderNote: `Order ${str(order.code)}`,
    items: items.map((i) => ({
      name: str(i.product_name),
      description: 'Pakaian',
      value: num(i.unit_price),
      quantity: num(i.quantity),
      weight: num(i.weight_grams),
      sku: optStr(i.sku) ?? undefined,
    })),
  };

  const result = await createOrder(env, f, input);
  if (!result.ok || !result.orderId) {
    await db.prepare(`UPDATE shipments SET updated_at = datetime('now') WHERE id = ?1`).bind(shipmentId).run();
    return { status: 'failed', message: result.error ?? 'Gagal membuat pesanan pengiriman', shipmentId };
  }

  await db
    .prepare(
      `UPDATE shipments SET biteship_order_id = ?1, tracking_number = COALESCE(?2, tracking_number),
              waybill_id = COALESCE(?3, waybill_id), status = ?4, price = COALESCE(?5, price),
              label_url = COALESCE(?6, label_url), updated_at = datetime('now')
       WHERE id = ?7`,
    )
    .bind(
      result.orderId,
      result.trackingId,
      result.waybillId,
      mapBiteshipStatus(result.status) ?? 'confirmed',
      result.price,
      optStr((result.raw as Record<string, unknown>).label_url),
      shipmentId,
    )
    .run();
  await recordEvent(db, shipmentId, {
    eventCode: 'order_created',
    label: 'Pesanan pengiriman dibuat',
    description: `${str(shipment.courier_company)} · ${result.trackingId ?? result.orderId}`,
    occurredAt: iso(new Date()),
    source: 'polling',
    payload: { biteshipOrderId: result.orderId, price: result.price },
  });
  await markOrderProcessing(env, orderId, 'Label pengiriman diterbitkan');
  return { status: 'created', message: null, shipmentId };
}

async function markOrderProcessing(env: Env, orderId: string, note: string): Promise<void> {
  const row = await first<Row>(env.DB, `SELECT status FROM orders WHERE id = ?1`, [orderId]);
  if (!row) return;
  const status = str(row.status);
  if (status !== ORDER_STATUS.PAID) return; // already processing or beyond
  try {
    await transitionOrder(env.DB, orderId, ORDER_STATUS.PROCESSING, { type: 'system' }, note);
  } catch (e) {
    logger(env).warn('order tidak dipindahkan ke processing', {
      error: e instanceof Error ? e.message : String(e),
      orderId,
    });
  }
}

export function mapBiteshipStatus(raw: string | null | undefined): ShippingStatus | null {
  if (!raw) return null;
  return BITESHIP_SHIPPING_STATUS_MAP[raw] ?? null;
}

/** Idempotent tracking insert: `dedupe_key` is UNIQUE on purpose. */
export async function recordEvent(
  db: D1Database,
  shipmentId: string,
  e: {
    eventCode: string;
    label: string;
    description: string | null;
    occurredAt: string;
    source: 'webhook' | 'polling' | 'manual';
    payload?: unknown;
  },
): Promise<boolean> {
  const dedupe = `${shipmentId}:${e.eventCode}:${e.occurredAt}`;
  try {
    await db
      .prepare(
        `INSERT INTO shipment_tracking_events (id, shipment_id, event_code, label, description, occurred_at, source, dedupe_key, payload, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,datetime('now'))
         ON CONFLICT(dedupe_key) DO NOTHING`,
      )
      .bind(
        uuid(),
        shipmentId,
        e.eventCode.slice(0, 60),
        e.label.slice(0, 200),
        e.description?.slice(0, 900) ?? null,
        e.occurredAt,
        e.source,
        dedupe.slice(0, 240),
        JSON.stringify(e.payload ?? {}).slice(0, 8000),
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies an authoritative Biteship status to a shipment and walks the customer
 * order forward when the mapping allows it. Unknown statuses are stored raw in the
 * event label so nothing is invented.
 */
export async function applyShipmentStatus(
  db: D1Database,
  shipment: Row,
  rawStatus: string | null,
  source: 'webhook' | 'polling' | 'manual',
  note: string | null,
): Promise<{ shippingStatus: ShippingStatus; changed: boolean }> {
  const mapped = mapBiteshipStatus(rawStatus);
  const current = str(shipment.status) as ShippingStatus;
  const next = mapped ?? current;
  let changed = false;
  if (mapped && mapped !== current) {
    await db
      .prepare(
        `UPDATE shipments SET status = ?1,
                delivered_at = CASE WHEN ?1 = 'delivered' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END,
                updated_at = datetime('now') WHERE id = ?2`,
      )
      .bind(next, str(shipment.id))
      .run();
    changed = true;
    await syncOrderWithShipment(db, str(shipment.order_id), next);
  }
  await recordEvent(db, str(shipment.id), {
    eventCode: rawStatus ?? 'unknown',
    label: labelFor(rawStatus, note),
    description: note,
    occurredAt: iso(new Date()),
    source,
    payload: { rawStatus, mapped: next },
  });
  return { shippingStatus: next, changed };
}

function labelFor(rawStatus: string | null | undefined, note: string | null): string {
  if (note) return note.slice(0, 180);
  if (!rawStatus) return 'Status pembaruan diterima';
  const known: Record<string, string> = {
    pending: 'Menunggu penjadwalan kurir',
    confirmed: 'Pesanan pengiriman dikonfirmasi',
    allocated: 'Kurir menugaskan paket',
    picking_up: 'Kurir menuju lokasi pengambilan',
    picked_up: 'Paket telah diambil kurir',
    picked: 'Paket telah diambil kurir',
    dropping_off: 'Paket dalam perjalanan ke hub',
    in_transit: 'Paket dalam perjalanan',
    transit: 'Paket dalam perjalanan',
    delivered: 'Paket diterima pelanggan',
    returned: 'Paket dikembalikan',
    cancelled: 'Pengiriman dibatalkan',
  };
  return known[rawStatus] ?? `Status kurir: ${rawStatus}`;
}

async function syncOrderWithShipment(db: D1Database, orderId: string, shippingStatus: ShippingStatus): Promise<void> {
  const target = SHIPMENT_TO_ORDER_STATUS[shippingStatus];
  if (!target) return;
  const row = await first<Row>(db, `SELECT status FROM orders WHERE id = ?1`, [orderId]);
  if (!row) return;
  const current = str(row.status);
  // Only move forward: a webhook must never resurrect a cancelled or refunded order.
  if (current === ORDER_STATUS.CANCELLED || current === ORDER_STATUS.REFUNDED) return;
  if (target === ORDER_STATUS.DELIVERED && current !== ORDER_STATUS.SHIPPED) return;
  try {
    await transitionOrder(db, orderId, target, { type: 'webhook' }, labelFor(shippingStatus, null));
  } catch {
    // Illegal transition = someone already moved the order: not worth failing the webhook on.
  }
}

/* ------------------------------- tracking read ------------------------------ */

export async function syncTrackingFromProvider(
  env: Env,
  f: RuntimeFlags,
  shipmentId: string,
  source: 'webhook' | 'polling' | 'manual' = 'polling',
): Promise<{ ok: boolean; events: number; message: string | null }> {
  const db = env.DB;
  const shipment = await first<Row>(db, `SELECT * FROM shipments WHERE id = ?1`, [shipmentId]);
  if (!shipment) return { ok: false, events: 0, message: 'Pengiriman tidak ditemukan' };
  const biteshipOrderId = optStr(shipment.biteship_order_id);
  if (!biteshipOrderId) return { ok: false, events: 0, message: 'Pengiriman belum dibuat di Biteship' };
  const order = await getOrder(env, f, biteshipOrderId);
  if (!order) return { ok: false, events: 0, message: 'Status tidak dapat diambil dari Biteship' };

  const t = extractTracking(order);
  let events = 0;
  for (const e of t.events) {
    const inserted = await recordEvent(db, shipmentId, {
      eventCode: e.status,
      label: labelFor(e.status, e.note || null),
      description: e.note || null,
      occurredAt: e.occurredAt,
      source,
      payload: { serviceType: e.serviceType },
    });
    if (inserted) events += 1;
  }
  if (t.trackingId || t.waybillId) {
    await db
      .prepare(
        `UPDATE shipments SET tracking_number = COALESCE(?1, tracking_number), waybill_id = COALESCE(?2, waybill_id), updated_at = datetime('now') WHERE id = ?3`,
      )
      .bind(t.trackingId, t.waybillId, shipmentId)
      .run();
  }
  await applyShipmentStatus(db, shipment, t.status, source, null);

  // Biteship may correct the final price after pickup: keep the history, never the customer's bill.
  const price = t.price;
  if (price !== null && price !== num(shipment.price)) {
    await db
      .prepare(`UPDATE shipments SET price = ?1, price_changed = 1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(Math.round(price), shipmentId)
      .run();
    await recordEvent(db, shipmentId, {
      eventCode: 'price_update',
      label: `Ongkir disesuaikan kurir menjadi Rp ${Math.round(price).toLocaleString('id-ID')}`,
      description: `Dari Rp ${num(shipment.price).toLocaleString('id-ID')}`,
      occurredAt: iso(new Date()),
      source,
      payload: { previous: num(shipment.price), next: price },
    });
    await logIntegration(db, {
      provider: 'biteship',
      endpoint: 'webhook/order.price',
      reference: str(shipment.order_id),
      success: true,
      message: `Penyesuaian ongkir ${num(shipment.price)} -> ${price}`,
      payload: { shipmentId, previous: num(shipment.price), next: price },
    });
  }
  return { ok: true, events, message: null };
}

/**
 * Public tracking feed for the order page. Returns the stored timeline plus the
 * courier/waybill facts the customer is entitled to see.
 */
export async function trackingView(db: D1Database, orderId: string): Promise<ShipmentInfo | null> {
  const shipment = await shipmentForOrder(db, orderId);
  if (!shipment) return null;
  const events = await all<Row>(
    db,
    `SELECT id, event_code, label, occurred_at, source FROM shipment_tracking_events
     WHERE shipment_id = ?1 ORDER BY occurred_at DESC LIMIT 60`,
    [str(shipment.id)],
  );
  return {
    id: str(shipment.id),
    provider: 'biteship',
    biteshipOrderId: optStr(shipment.biteship_order_id),
    waybillId: optStr(shipment.waybill_id),
    trackingNumber: optStr(shipment.tracking_number),
    courierCompany: str(shipment.courier_company),
    courierService: str(shipment.courier_service),
    courierType: optStr(shipment.courier_type),
    status: str(shipment.status) as ShippingStatus,
    price: num(shipment.price),
    estimate: optStr(shipment.estimate),
    events: events.map((e) => ({
      id: str(e.id),
      eventCode: str(e.event_code),
      label: str(e.label),
      occurredAt: toIso(e.occurred_at) ?? '',
      source: str(e.source) as 'webhook' | 'polling' | 'manual',
    })),
    createdAt: toIso(shipment.created_at) ?? '',
    deliveredAt: optStr(shipment.delivered_at) ? (toIso(shipment.delivered_at) ?? '') : null,
  };
}

/* ---------------------------------- webhook --------------------------------- */

export interface BiteshipWebhookBody {
  event?: string;
  order_id?: string;
  reference_id?: string;
  courier_tracking_id?: string;
  courier_waybill_id?: string;
  courier_company?: string;
  courier_type?: string;
  status?: string;
  order_price?: number;
  price?: number;
  shipment_fee?: number;
}

export interface WebhookOutcome {
  accepted: boolean;
  handled: boolean;
  reason: string;
}

/**
 * Biteship webhook. The payload is treated as a hint only (Biteship documents no
 * signature header), so the state is always re-read through the authenticated API.
 */
export async function handleBiteshipWebhook(
  env: Env,
  f: RuntimeFlags,
  body: BiteshipWebhookBody,
  headerToken: string | undefined,
  ip: string,
): Promise<WebhookOutcome> {
  const db = env.DB;
  if (!verifyWebhookSecret(env.BITESHIP_WEBHOOK_SECRET, headerToken)) {
    await logIntegration(db, {
      provider: 'biteship',
      direction: 'callback',
      endpoint: '/webhooks/biteship',
      reference: body.order_id ?? null,
      success: false,
      message: 'Token webhook tidak cocok — ditolak',
      payload: body,
    });
    return { accepted: false, handled: false, reason: 'INVALID_TOKEN' };
  }

  const shipment = body.order_id
    ? await first<Row>(db, `SELECT * FROM shipments WHERE biteship_order_id = ?1`, [body.order_id])
    : body.reference_id
      ? await first<Row>(db, `SELECT * FROM shipments WHERE order_id = (SELECT id FROM orders WHERE code = ?1)`, [
          body.reference_id,
        ])
      : null;

  await logIntegration(db, {
    provider: 'biteship',
    direction: 'callback',
    endpoint: '/webhooks/biteship',
    reference: body.order_id ?? body.reference_id ?? null,
    success: Boolean(shipment),
    message: `Event ${body.event ?? 'unknown'}${shipment ? '' : ' — shipment tidak dikenali'}`,
    payload: { ...body, ip },
  });

  if (!shipment) return { accepted: true, handled: false, reason: 'UNKNOWN_SHIPMENT' };

  // Store the identifiers the webhook can legitimately supply, then re-read the truth.
  if (body.courier_tracking_id || body.courier_waybill_id) {
    await db
      .prepare(
        `UPDATE shipments SET tracking_number = COALESCE(?1, tracking_number), waybill_id = COALESCE(?2, waybill_id), updated_at = datetime('now') WHERE id = ?3`,
      )
      .bind(body.courier_tracking_id ?? null, body.courier_waybill_id ?? null, str(shipment.id))
      .run();
  }

  const sync = await syncTrackingFromProvider(env, f, str(shipment.id), 'webhook');
  if (!sync.ok) {
    // Without the API read we only keep the raw event: no status is invented.
    await recordEvent(db, str(shipment.id), {
      eventCode: body.status ?? String(body.event ?? 'unknown'),
      label: labelFor(body.status ?? null, null),
      description: 'Diterima dari webhook (verifikasi API gagal)',
      occurredAt: iso(new Date()),
      source: 'webhook',
      payload: body,
    });
  }
  return { accepted: true, handled: sync.ok, reason: sync.message ?? 'SYNCED' };
}

/** Admin helper: (re)push a paid order whose shipment was never booked. */
export async function manualShipmentPush(env: Env, f: RuntimeFlags, orderId: string) {
  return createShipmentForOrder(env, f, orderId);
}

/** True when the chosen option id refers to a store-side logistics choice. */
export function isSelfHandledOption(optionId: string): boolean {
  return optionId === PICKUP_OPTION_ID || optionId.startsWith(MANUAL_PREFIX);
}
