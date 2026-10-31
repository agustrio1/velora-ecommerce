/** Id generation + Web Crypto helpers usable inside the Workers runtime. */

export const uuid = (): string => crypto.randomUUID();

const ALPHABET_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(n: number, alphabet = ALPHABET_UPPER): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** VLRA-YYMM-NNNNNN — human readable, unique, sortable by month. */
export function orderCode(date = new Date()): string {
  const yymm = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const serial = `${randomChars(2)}${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')}`;
  return `VLRA-${yymm}-${serial}`;
}

export function guestToken(): string {
  return `gc_${randomChars(6).toLowerCase()}${uuid().replace(/-/g, '').slice(0, 26)}`;
}

export function productSku(name: string, seed = Date.now()): string {
  const base = (name || 'product')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6);
  return `VLR-${base || 'GEN'}-${String(seed).slice(-6)}`;
}

export function variantSku(productSku: string, colorSlug: string, sizeCode: string): string {
  const c = colorSlug.toUpperCase().slice(0, 3).padEnd(3, 'X');
  const s = sizeCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
    .padEnd(3, '0');
  return `${productSku}-${c}-${s}`;
}

export function couponRedemptionRef(orderId: string, couponId: string): string {
  return `${couponId}:${orderId}`;
}

/** Opaque-ish key used for idempotent webhook handling. */
export function idempotencyKey(...parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) => (p === null || p === undefined ? '-' : String(p)))
    .join('|')
    .slice(0, 240);
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

export async function hmacSha256(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return toHex(sig);
}

/**
 * Length-safe, constant-time string comparison.
 * Both sides are normalised to lowercase hex before comparing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function iso(dt: Date): string {
  return dt.toISOString().replace('T', ' ').slice(0, 19);
}

export function minutesFromNow(minutes: number): string {
  return iso(new Date(Date.now() + minutes * 60_000));
}

export function isPast(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}
