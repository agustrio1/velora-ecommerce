import type { ShippingOption } from '@velora/shared';
import { ERROR_CODES } from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import { type RateQuery, fetchRates } from '../integrations/biteship';
import { type Row, all, first, iso, jsonParse, num, optStr, str } from '../lib/db';
import { AppError, notFound } from '../lib/errors';
import { type ShippingSettings, shippingSettings } from '../lib/settings';

/**
 * Shipping rates.
 *
 * Prices always come from Biteship (never from the browser, never hardcoded).
 * Successful lookups are replayed from `shipping_rate_logs` for 15 minutes so a
 * shopper tweaking their basket does not hammer the provider API.
 * A pickup-at-store choice is a real business option, priced at zero by the store.
 */

const RATE_CACHE_MINUTES = 15;
export const PICKUP_OPTION_ID = 'pickup';
export const MANUAL_PREFIX = 'manual:';

export interface ShippingOrigin {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  province: string;
  city: string;
  district: string;
  postcode: string;
  areaId: string;
}

export async function defaultOrigin(db: D1Database): Promise<ShippingOrigin | null> {
  const row = await first<Row>(db, `SELECT * FROM shipping_origins WHERE is_default = 1 AND is_active = 1 LIMIT 1`);
  if (!row) return null;
  return {
    id: str(row.id),
    name: str(row.name),
    contactName: str(row.contact_name),
    phone: str(row.phone),
    address: str(row.address),
    province: str(row.province),
    city: str(row.city),
    district: str(row.district),
    postcode: str(row.postcode),
    areaId: str(row.area_id),
  };
}

export async function mustOrigin(db: D1Database): Promise<ShippingOrigin> {
  const origin = await defaultOrigin(db);
  if (!origin) throw notFound('Alamat asal pengiriman belum diatur di dashboard admin');
  return origin;
}

export interface RateRequest {
  destinationAreaId?: string | null;
  destinationPostalCode?: string | null;
  weightGrams: number;
  value: number;
  quantity: number;
  itemName: string;
}

export interface RateOutcome {
  options: ShippingOption[];
  source: 'biteship' | 'cache' | 'none';
  error: string | null;
  settings: ShippingSettings;
}

function cacheKey(originId: string, req: RateRequest): string {
  return `${originId}|${req.destinationAreaId ?? ''}|${req.destinationPostalCode ?? ''}|${req.weightGrams}`;
}

function pickupOption(settings: ShippingSettings): ShippingOption | null {
  if (!settings.enablePickup) return null;
  return {
    id: PICKUP_OPTION_ID,
    courier: 'pickup',
    courierName: settings.pickupLabel || 'Ambil sendiri',
    service: 'pickup',
    type: 'self_pickup',
    price: 0,
    estimate: null,
    insuranceAvailable: false,
  };
}

function manualOptions(settings: ShippingSettings): ShippingOption[] {
  if (!settings.allowManualRates) return [];
  return settings.manualOptions.map((m) => ({
    id: `${MANUAL_PREFIX}${m.id}`,
    courier: 'manual',
    courierName: m.label,
    service: m.id,
    type: 'manual',
    price: Math.round(m.price),
    estimate: m.estimate,
    insuranceAvailable: false,
  }));
}

/** Live (or cached) courier options for one destination. */
export async function shippingOptions(
  db: D1Database,
  env: Env,
  f: RuntimeFlags,
  req: RateRequest,
): Promise<RateOutcome> {
  const settings = await shippingSettings(db);
  const origin = await defaultOrigin(db);
  const local = [pickupOption(settings), ...manualOptions(settings)].filter(Boolean) as ShippingOption[];

  if (!origin || !req.destinationAreaId) {
    return {
      options: local,
      source: 'none',
      error: req.destinationAreaId
        ? 'Alamat asal belum dikonfigurasi'
        : 'Pilih area tujuan dari daftar wilayah untuk melihat ongkir kurir',
      settings,
    };
  }

  const key = cacheKey(origin.areaId, req);
  const cached = await first<Row>(
    db,
    `SELECT response_body FROM shipping_rate_logs WHERE cache_key = ?1 AND success = 1 AND expires_at > datetime('now')`,
    [key],
  );
  if (cached) {
    const options = jsonParse<ShippingOption[]>(cached.response_body, []);
    if (options.length) return { options: [...local, ...options], source: 'cache', error: null, settings };
  }

  const query: RateQuery = {
    originAreaId: origin.areaId,
    originPostalCode: origin.postcode,
    destinationAreaId: req.destinationAreaId,
    destinationPostalCode: req.destinationPostalCode,
    couriers: settings.couriers,
    value: req.value,
    weightGrams: req.weightGrams,
    itemName: req.itemName,
    quantity: req.quantity,
  };
  const result = await fetchRates(env, f, query);
  const expiresAt = iso(new Date(Date.now() + RATE_CACHE_MINUTES * 60_000));
  const logStmt = db
    .prepare(
      `INSERT INTO shipping_rate_logs
         (id, cache_key, user_id, origin_area_id, dest_area_id, weight_grams, request_body, response_body, success, error, created_at, expires_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,datetime('now'),?11)
       ON CONFLICT(cache_key) DO UPDATE SET
         response_body = excluded.response_body, success = excluded.success, error = excluded.error,
         created_at = datetime('now'), expires_at = excluded.expires_at`,
    )
    .bind(
      crypto.randomUUID(),
      key,
      null,
      origin.areaId,
      req.destinationAreaId,
      req.weightGrams,
      JSON.stringify(query).slice(0, 8000),
      JSON.stringify(result.options).slice(0, 20000),
      result.options.length ? 1 : 0,
      result.error,
      expiresAt,
    );
  await logStmt.run();

  if (!result.options.length) {
    // Honest failure: the store shows the provider error instead of a made-up fee.
    return { options: local, source: 'none', error: result.error ?? 'Tarif kurir tidak tersedia', settings };
  }
  return { options: [...local, ...result.options], source: 'biteship', error: null, settings };
}

export interface ResolvedShipping {
  option: ShippingOption;
  fee: number;
  freeByThreshold: boolean;
}

/**
 * Checkout re-derives the shipping fee from the provider (or the store's own pickup /
 * manual rules). The client only ever sends an option id, never a price.
 */
export async function resolveShipping(
  db: D1Database,
  env: Env,
  f: RuntimeFlags,
  optionId: string,
  req: RateRequest,
  subtotalAfterDiscount: number,
): Promise<ResolvedShipping> {
  const settings = await shippingSettings(db);
  if (optionId === PICKUP_OPTION_ID) {
    if (!settings.enablePickup)
      throw new AppError(ERROR_CODES.SHIPPING_RATE_FAILED, 'Opsi ambil sendiri tidak tersedia', 409);
    return { option: pickupOption(settings)!, fee: 0, freeByThreshold: false };
  }
  if (optionId.startsWith(MANUAL_PREFIX)) {
    const id = optionId.slice(MANUAL_PREFIX.length);
    const match = settings.allowManualRates ? settings.manualOptions.find((m) => m.id === id) : undefined;
    if (!match) throw new AppError(ERROR_CODES.SHIPPING_RATE_FAILED, 'Ongkir manual tidak lagi tersedia', 409);
    const option = manualOptions(settings).find((o) => o.id === optionId)!;
    return { option, fee: option.price, freeByThreshold: false };
  }
  const outcome = await shippingOptions(db, env, f, req);
  const option = outcome.options.find((o) => o.id === optionId && o.courier !== 'pickup' && o.courier !== 'manual');
  if (!option) {
    throw new AppError(
      ERROR_CODES.SHIPPING_RATE_FAILED,
      outcome.error ?? 'Pilihan kurir tidak lagi tersedia, muat ulang ongkir',
      409,
    );
  }
  const free = settings.freeShippingThreshold > 0 && subtotalAfterDiscount >= settings.freeShippingThreshold;
  return { option, fee: free ? 0 : option.price, freeByThreshold: free };
}

/** Where a stored order's courier choice can be replayed from for a shipment. */
export function shipmentIds(serviceCode: string): { company: string; service: string } {
  const [company, service] = serviceCode.split('-');
  return { company: company ?? serviceCode, service: service ?? serviceCode };
}

export async function recentRateErrors(db: D1Database, limit = 20) {
  const rows = await all<Row>(
    db,
    `SELECT cache_key, dest_area_id, weight_grams, error, created_at FROM shipping_rate_logs
     WHERE success = 0 ORDER BY created_at DESC LIMIT ?1`,
    [limit],
  );
  return rows.map((r) => ({
    cacheKey: str(r.cache_key),
    destination: optStr(r.dest_area_id),
    weightGrams: num(r.weight_grams),
    error: optStr(r.error),
    createdAt: str(r.created_at),
  }));
}
