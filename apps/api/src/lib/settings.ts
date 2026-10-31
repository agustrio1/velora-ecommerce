import { SEO_ORG_TYPES, STORE_SETTINGS_KEYS, type SeoOrgType } from '@velora/shared';
import { type Row, all, first, jsonParse, str, toIso } from './db';

/**
 * store_settings holds one JSON document per key. The bootstrap migration writes the
 * simple `{"value": ...}` envelope while richer settings are plain objects, so every
 * reader below normalises both shapes instead of assuming one.
 */

async function raw(db: D1Database, key: string): Promise<unknown> {
  const row = await first<Row>(db, `SELECT value FROM store_settings WHERE key = ?1`, [key]);
  if (!row) return null;
  return jsonParse<unknown>(row.value, null);
}

/** Returns the inner `value` of the `{"value": x}` envelope, or the document itself. */
function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

async function scalar<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const v = unwrap(await raw(db, key));
  if (v === null || v === undefined || v === '') return fallback;
  return v as T;
}

async function doc<T extends object>(db: D1Database, key: string, fallback: T): Promise<T> {
  const v = await raw(db, key);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fallback;
  return { ...fallback, ...(v as T) };
}

export interface ShippingSettings {
  couriers: string;
  enablePickup: boolean;
  pickupLabel: string;
  pickupAddress: string;
  freeShippingThreshold: number;
  allowManualRates: boolean;
  manualOptions: { id: string; label: string; price: number; estimate: string | null }[];
}

export interface TaxSettings {
  enabled: boolean;
  percent: number;
  includeInPrice: boolean;
}

export interface OrderSettings {
  paymentExpiryMinutes: number;
  reservationExpiryMinutes: number;
  autoCreateShipment: boolean;
  autoCancelUnpaid: boolean;
}

export interface AnnouncementSettings {
  enabled: boolean;
  text: string;
  link: string | null;
}

export const DEFAULT_SHIPPING: ShippingSettings = {
  couriers: 'jne,sicepat,paxel',
  enablePickup: true,
  pickupLabel: 'Ambil sendiri di gudang',
  pickupAddress: '',
  freeShippingThreshold: 0,
  allowManualRates: false,
  manualOptions: [],
};

export const DEFAULT_TAX: TaxSettings = { enabled: false, percent: 11, includeInPrice: true };

export const DEFAULT_ORDER: OrderSettings = {
  paymentExpiryMinutes: 60,
  reservationExpiryMinutes: 60,
  autoCreateShipment: true,
  autoCancelUnpaid: true,
};

export async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const v = await raw(db, key);
  return v === null ? fallback : (v as T);
}

export async function setSetting(db: D1Database, key: string, value: unknown, isPublic = false): Promise<void> {
  await db
    .prepare(
      `INSERT INTO store_settings (key, value, is_public, updated_at)
       VALUES (?1,?2,?3,datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_public = excluded.is_public, updated_at = datetime('now')`,
    )
    .bind(key, JSON.stringify(value), isPublic ? 1 : 0)
    .run();
}

export async function allSettings(db: D1Database) {
  const rows = await all<Row>(db, `SELECT key, value, is_public, updated_at FROM store_settings ORDER BY key`);
  return rows.map((r) => ({
    key: str(r.key),
    value: jsonParse<unknown>(r.value, null),
    isPublic: true,
    updatedAt: toIso(r.updated_at) ?? '',
  }));
}

/* --------------------------------- readers -------------------------------- */

export async function shippingSettings(db: D1Database): Promise<ShippingSettings> {
  const base = await doc(db, 'shipping_settings', DEFAULT_SHIPPING);
  // biteship_config (bootstrap) can pin the courier list too — last writer wins.
  const biteship = await doc(db, STORE_SETTINGS_KEYS.BITESHIP, { allowedCouriers: [] as string[] });
  const couriers =
    base.couriers ||
    (Array.isArray(biteship.allowedCouriers) && biteship.allowedCouriers.length
      ? biteship.allowedCouriers.join(',')
      : '');
  return { ...base, couriers: couriers || DEFAULT_SHIPPING.couriers };
}

export async function taxSettings(db: D1Database): Promise<TaxSettings> {
  const v = await doc<Record<string, unknown>>(db, STORE_SETTINGS_KEYS.TAX, {});
  return {
    enabled: Boolean(v.enabled),
    percent: Number(v.percent ?? v.ratePercent ?? DEFAULT_TAX.percent),
    includeInPrice: v.includeInPrice !== false,
  };
}

export async function orderSettings(db: D1Database): Promise<OrderSettings> {
  const v = await doc<Record<string, unknown>>(db, STORE_SETTINGS_KEYS.ORDER, {});
  return {
    paymentExpiryMinutes: Number(
      v.paymentExpiryMinutes ?? v.pendingExpiryMinutes ?? DEFAULT_ORDER.paymentExpiryMinutes,
    ),
    reservationExpiryMinutes: Number(
      v.reservationExpiryMinutes ?? v.pendingExpiryMinutes ?? DEFAULT_ORDER.reservationExpiryMinutes,
    ),
    autoCreateShipment: v.autoCreateShipment !== false,
    autoCancelUnpaid: v.autoCancelUnpaid !== false,
  };
}

export async function announcementSettings(db: D1Database): Promise<AnnouncementSettings> {
  const v = unwrap(await raw(db, STORE_SETTINGS_KEYS.ANNOUNCEMENT));
  if (typeof v === 'string') return { enabled: v.trim().length > 0, text: v, link: null };
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return {
      enabled: o.enabled !== false,
      text: String(o.text ?? o.value ?? ''),
      link: o.link ? String(o.link) : null,
    };
  }
  return { enabled: false, text: '', link: null };
}

export interface SeoSettings {
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
  /** Homepage-only title; empty means "compose one from the storefront content". */
  homeTitle: string;
  homeDescription: string;
  defaultOgImage: string | null;
  canonicalBaseUrl: string | null;
  keywords: string;
  twitterHandle: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  jsonLdEnabled: boolean;
  organizationType: SeoOrgType;
  /** Raw JSON pasted by the admin, merged into the storefront @graph. */
  jsonLdExtra: string | null;
}

export const DEFAULT_SEO: SeoSettings = {
  siteName: '',
  defaultTitle: 'VELORA — Busana Modern',
  defaultDescription: 'Katalog busana modern dengan harga jujur dan pengiriman ke seluruh Indonesia.',
  homeTitle: '',
  homeDescription: '',
  defaultOgImage: null,
  canonicalBaseUrl: null,
  keywords: '',
  twitterHandle: null,
  robotsIndex: true,
  robotsFollow: true,
  jsonLdEnabled: true,
  organizationType: 'OnlineStore',
  jsonLdExtra: null,
};

/** SEO document; booleans default to the permissive value so a half-filled row still indexes. */
export async function seoSettings(db: D1Database): Promise<SeoSettings> {
  const v = await doc<Record<string, unknown>>(db, STORE_SETTINGS_KEYS.SEO, {});
  const text = (input: unknown): string => (typeof input === 'string' ? input.trim() : '');
  const optional = (input: unknown): string | null => text(input) || null;
  const orgType = SEO_ORG_TYPES.includes(text(v.organizationType) as SeoOrgType)
    ? (text(v.organizationType) as SeoOrgType)
    : DEFAULT_SEO.organizationType;
  return {
    siteName: text(v.siteName),
    defaultTitle: text(v.defaultTitle) || DEFAULT_SEO.defaultTitle,
    defaultDescription: text(v.defaultDescription) || DEFAULT_SEO.defaultDescription,
    // Deliberately no fallback: an empty home field is what tells the storefront
    // head to build the title from the live homepage content.
    homeTitle: text(v.homeTitle),
    homeDescription: text(v.homeDescription),
    defaultOgImage: optional(v.defaultOgImage),
    canonicalBaseUrl: optional(v.canonicalBaseUrl),
    keywords: text(v.keywords),
    twitterHandle: optional(v.twitterHandle),
    robotsIndex: v.robotsIndex !== false,
    robotsFollow: v.robotsFollow !== false,
    jsonLdEnabled: v.jsonLdEnabled !== false,
    organizationType: orgType,
    jsonLdExtra: optional(v.jsonLdExtra),
  };
}

export interface StorefrontSettings {
  storeName: string;
  logoUrl: string | null;
  address: string;
  whatsapp: string | null;
  email: string | null;
  social: Record<string, string>;
  announcement: AnnouncementSettings;
}

export async function storefrontSettings(db: D1Database): Promise<StorefrontSettings> {
  const [name, logo, addressDoc, whatsapp, email, social, announcement] = await Promise.all([
    scalar<string>(db, STORE_SETTINGS_KEYS.STORE_NAME, 'VELORA'),
    scalar<string>(db, STORE_SETTINGS_KEYS.LOGO, ''),
    doc<Record<string, string>>(db, STORE_SETTINGS_KEYS.STORE_ADDRESS, {}),
    scalar<string>(db, STORE_SETTINGS_KEYS.WHATSAPP, ''),
    scalar<string>(db, STORE_SETTINGS_KEYS.EMAIL, ''),
    (async () => unwrap(await raw(db, STORE_SETTINGS_KEYS.SOCIAL_MEDIA)) as Record<string, string> | null)(),
    announcementSettings(db),
  ]);
  const address = [addressDoc.detail, addressDoc.district, addressDoc.city, addressDoc.province]
    .filter(Boolean)
    .join(', ');
  return {
    storeName: name,
    logoUrl: logo || null,
    address,
    whatsapp: whatsapp || null,
    email: email || null,
    social: social && typeof social === 'object' ? social : {},
    announcement,
  };
}
