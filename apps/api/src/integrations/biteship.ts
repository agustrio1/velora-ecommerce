/**
 * Biteship adapter — official REST contract (biteship.com/id/docs/api).
 *
 * Documented surface used here:
 *   GET  /v1/maps/areas?countries=ID&input=..&type=single   -> { success, areas[] }
 *   POST /v1/rates/couriers  {origin_*, destination_*, couriers, items[]} -> { success, pricing[] }
 *   POST /v1/orders          -> { success, id, courier:{tracking_id,waybill_id}, price, status }
 *   GET  /v1/orders/:id      -> order incl. courier.history[] (tracking events)
 * Auth: the API key is sent as-is in the `authorization` header, exactly like the
 * curl examples in /docs/api/authentication. (A Base64 "Basic" wrapper is NOT used:
 * a wrapped key made every call fail with 401 while the failure was swallowed.)
 *
 * Biteship does not document a webhook signature header, so an inbound webhook is
 * never trusted on its own: the payload only names an order id and we re-read the
 * authoritative state from GET /v1/orders/:id. An optional shared secret can be
 * required on top via BITESHIP_WEBHOOK_SECRET (header x-biteship-token).
 */
import type { ShippingOption } from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import { upstream } from '../lib/errors';
import { timingSafeEqual } from '../lib/ids';
import { logIntegration } from '../lib/log';

type Json = Record<string, unknown>;

/** The key goes in the header untouched; trim guards against stray spaces / CR from .dev.vars. */
const authHeader = (token: string) => token.trim();

export interface BiteshipCall {
  ok: boolean;
  status: number;
  json: Json;
  error?: string;
}

async function call(
  env: Env,
  f: RuntimeFlags,
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: Json; query?: Record<string, string | number | undefined>; reference?: string } = {},
): Promise<BiteshipCall> {
  const started = Date.now();
  const url = new URL(`https://api.biteship.com${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  let status = 0;
  let json: Json = {};
  let error: string | undefined;
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: authHeader(f.biteship.apiKey),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      error = `Respon Biteship bukan JSON (HTTP ${status})`;
    }
    if (status >= 400) {
      error = String(json.message ?? json.error ?? `Biteship HTTP ${status}`);
    }
    return { ok: status >= 200 && status < 300 && !error, status, json, error };
  } catch (e) {
    error = e instanceof Error ? e.message : 'Request Biteship gagal';
    throw upstream('Tidak dapat menghubungi Biteship', { path, error });
  } finally {
    await logIntegration(env.DB, {
      provider: 'biteship',
      direction: 'request',
      endpoint: `${method} ${path}`,
      reference: opts.reference ?? null,
      statusCode: status || null,
      success: status >= 200 && status < 300 && !error,
      message: error ?? null,
      payload: { body: opts.body ?? null, response: json },
      durationMs: Date.now() - started,
    });
  }
}

/* ---------------------------------- areas ---------------------------------- */

export interface BiteshipArea {
  id: string;
  name: string;
  province: string;
  city: string;
  district: string;
  postcode: string;
  country: string;
}

export async function searchAreas(env: Env, f: RuntimeFlags, input: string, limit = 12): Promise<BiteshipArea[]> {
  if (!f.biteship.configured || input.trim().length < 3) return [];
  const res = await call(env, f, 'GET', '/v1/maps/areas', {
    query: { countries: 'ID', input: input.trim(), type: 'single' },
    reference: `area:${input.trim()}`,
  });
  // A rejected call must be visible to the shopper, not disguised as "no results".
  if (!res.ok) {
    throw upstream(`Pencarian wilayah gagal: ${res.error ?? 'respon Biteship tidak valid'}`, {
      status: res.status,
    });
  }
  const areas = Array.isArray(res.json.areas) ? (res.json.areas as Json[]) : [];
  return areas.slice(0, limit).map((a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    province: String(a.administrative_division_level_1_name ?? ''),
    city: String(a.administrative_division_level_2_name ?? ''),
    district: String(a.administrative_division_level_3_name ?? ''),
    postcode: String(a.postal_code ?? ''),
    country: String(a.country_code ?? 'ID'),
  }));
}

/* ---------------------------------- rates ---------------------------------- */

export interface RateQuery {
  originAreaId?: string | null;
  originPostalCode?: string | null;
  destinationAreaId?: string | null;
  destinationPostalCode?: string | null;
  couriers: string;
  value: number;
  weightGrams: number;
  itemName: string;
  quantity: number;
  insurance?: boolean;
  collectionMethod?: 'pickup' | 'drop_off';
}

/** One documented Biteship pricing entry mapped into our ShippingOption shape. */
function mapPricing(p: Json): ShippingOption | null {
  const company = String(p.company ?? p.courier_code ?? '');
  const type = String(p.type ?? p.courier_service_code ?? '');
  const price = Number(p.price ?? p.shipping_fee ?? 0);
  if (!company || !type || !Number.isFinite(price) || price <= 0) return null;
  const service = String(p.courier_service_code ?? type);
  return {
    // Stable, re-derivable id: company + service code (unique inside one rate response).
    id: `${company}-${service}`,
    courier: company,
    courierName: String(p.courier_name ?? company),
    service,
    type,
    price: Math.round(price),
    estimate: p.duration
      ? String(p.duration)
      : p.shipment_duration_range
        ? `${String(p.shipment_duration_range)} ${String(p.shipment_duration_unit ?? 'hari')}`
        : null,
    insuranceAvailable: p.available_for_insurance === true,
  };
}

export interface RatesResult {
  options: ShippingOption[];
  error: string | null;
  raw: Json | null;
}

export async function fetchRates(env: Env, f: RuntimeFlags, q: RateQuery): Promise<RatesResult> {
  if (!f.biteship.configured) {
    return { options: [], error: 'Kurir otomatis belum dikonfigurasi (BITESHIP_API_KEY kosong)', raw: null };
  }
  const body: Json = {
    couriers: q.couriers,
    items: [
      {
        name: q.itemName.slice(0, 120),
        description: 'Pakaian',
        category: 'fashion',
        value: q.value,
        quantity: q.quantity,
        weight: q.weightGrams,
      },
    ],
  };
  if (q.originAreaId) body.origin_area_id = q.originAreaId;
  else if (q.originPostalCode) body.origin_postal_code = Number(q.originPostalCode);
  if (q.destinationAreaId) body.destination_area_id = q.destinationAreaId;
  else if (q.destinationPostalCode) body.destination_postal_code = Number(q.destinationPostalCode);
  if (q.insurance) body.courier_insurance = q.value;

  const res = await call(env, f, 'POST', '/v1/rates/couriers', {
    body,
    reference: `${q.originAreaId ?? q.originPostalCode}->${q.destinationAreaId ?? q.destinationPostalCode}`,
  });
  const pricing = Array.isArray(res.json.pricing) ? (res.json.pricing as Json[]) : [];
  const options = pricing.map(mapPricing).filter((o): o is ShippingOption => o !== null);
  if (!res.ok || !options.length) {
    // Never synthesise a price: report the provider failure to the shopper.
    return {
      options: [],
      error: res.error ?? String(res.json.message ?? 'Tarif pengiriman tidak tersedia untuk alamat ini'),
      raw: res.json,
    };
  }
  return { options, error: null, raw: res.json };
}

/* --------------------------------- ordering -------------------------------- */

export interface BiteshipOrderParty {
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  address: string;
  note?: string | null;
  postalCode?: string | null;
  areaId?: string | null;
}

export interface BiteshipOrderInput {
  referenceId: string;
  origin: BiteshipOrderParty;
  destination: BiteshipOrderParty;
  courier: { company: string; service: string; type: string };
  collectionMethod?: 'pickup' | 'drop_off';
  deliveryType?: 'now' | 'scheduled';
  insuranceValue?: number;
  orderNote?: string | null;
  items: { name: string; description?: string; value: number; quantity: number; weight: number; sku?: string }[];
}

export interface BiteshipOrderResult {
  ok: boolean;
  orderId: string | null;
  trackingId: string | null;
  waybillId: string | null;
  status: string | null;
  price: number | null;
  error: string | null;
  raw: Json;
}

export async function createOrder(env: Env, f: RuntimeFlags, input: BiteshipOrderInput): Promise<BiteshipOrderResult> {
  const body: Json = {
    reference_id: input.referenceId,
    origin_contact_name: input.origin.contactName,
    origin_contact_phone: input.origin.contactPhone,
    origin_address: input.origin.address,
    origin_note: input.origin.note ?? undefined,
    origin_postal_code: input.origin.postalCode ? Number(input.origin.postalCode) : undefined,
    origin_area_id: input.origin.areaId ?? undefined,
    origin_collection_method: input.collectionMethod ?? 'pickup',
    destination_contact_name: input.destination.contactName,
    destination_contact_phone: input.destination.contactPhone,
    destination_contact_email: input.destination.contactEmail ?? undefined,
    destination_address: input.destination.address,
    destination_note: input.destination.note ?? undefined,
    destination_postal_code: input.destination.postalCode ? Number(input.destination.postalCode) : undefined,
    destination_area_id: input.destination.areaId ?? undefined,
    courier_company: input.courier.company,
    courier_type: input.courier.type,
    courier_insurance: input.insuranceValue && input.insuranceValue > 0 ? input.insuranceValue : undefined,
    delivery_type: input.deliveryType ?? 'now',
    order_note: input.orderNote ?? undefined,
    items: input.items.map((i) => ({
      name: i.name,
      description: i.description ?? 'Pakaian',
      category: 'fashion',
      sku: i.sku ?? undefined,
      value: i.value,
      quantity: i.quantity,
      weight: i.weight,
    })),
  };
  const res = await call(env, f, 'POST', '/v1/orders', { body, reference: input.referenceId });
  const courier = (res.json.courier ?? {}) as Json;
  return {
    ok: res.ok,
    orderId: res.json.id ? String(res.json.id) : null,
    trackingId: courier.tracking_id ? String(courier.tracking_id) : null,
    waybillId: courier.waybill_id ? String(courier.waybill_id) : null,
    status: res.json.status ? String(res.json.status) : null,
    price: res.json.price !== undefined ? Number(res.json.price) : null,
    error: res.ok ? null : (res.error ?? String(res.json.message ?? 'Gagal membuat pesanan pengiriman')),
    raw: res.json,
  };
}

export async function getOrder(env: Env, f: RuntimeFlags, orderId: string): Promise<Json | null> {
  if (!f.biteship.configured) return null;
  const res = await call(env, f, 'GET', `/v1/orders/${encodeURIComponent(orderId)}`, { reference: orderId });
  return res.ok ? res.json : null;
}

export interface BiteshipTrackingEvent {
  status: string;
  note: string;
  occurredAt: string;
  serviceType: string;
}

export function extractTracking(order: Json): {
  events: BiteshipTrackingEvent[];
  waybillId: string | null;
  trackingId: string | null;
  status: string | null;
  price: number | null;
} {
  const courier = (order.courier ?? {}) as Json;
  const history = Array.isArray(courier.history) ? (courier.history as Json[]) : [];
  return {
    events: history.map((h) => ({
      status: String(h.status ?? 'unknown'),
      note: String(h.note ?? ''),
      occurredAt: String(h.updated_at ?? new Date().toISOString()),
      serviceType: String(h.service_type ?? '-'),
    })),
    waybillId: courier.waybill_id ? String(courier.waybill_id) : null,
    trackingId: courier.tracking_id ? String(courier.tracking_id) : null,
    status: order.status ? String(order.status) : null,
    price: order.price !== undefined ? Number(order.price) : null,
  };
}

/** Shared-secret check for the webhook, when the merchant has configured one. */
export function verifyWebhookSecret(secret: string | undefined | null, header: string | undefined): boolean {
  if (!secret) return true; // no secret configured -> rely on API re-verification
  if (!header) return false;
  return timingSafeEqual(secret, header);
}
