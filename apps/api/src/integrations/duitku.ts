/**
 * Duitku adapter — official REST contract (docs.duitku.com/api/id).
 *
 * Endpoints actually documented by Duitku (v2 "webapi" family):
 *   POST {base}/paymentmethod/getpaymentmethod   SHA256(merchantcode + amount + datetime + apiKey)
 *   POST {base}/v2/inquiry                       MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
 *   POST {base}/transactionStatus                MD5(merchantCode + merchantOrderId + apiKey)
 *   callback: HTTP POST x-www-form-urlencoded    MD5(merchantCode + amount + merchantOrderId + apiKey)
 *
 * NOTE: HMAC-SHA256 belongs to Duitku's separate POP API (createInvoice) and is NOT
 * used by these endpoints. The API key is appended to the signed text, not used as
 * an HMAC key.
 *
 * Duitku rule: the sum of every itemDetails line (price x quantity) must equal
 * paymentAmount, otherwise the inquiry is rejected with "Payment amount must be
 * equal to all item price". See `itemDetailsFor` below.
 *
 * Nothing here is invented: unknown response shapes are logged and surfaced as an
 * upstream error instead of being guessed at.
 */
import type { PaymentMethod } from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import { DUITKU_ENDPOINTS } from '../env';
import { upstream } from '../lib/errors';
import { timingSafeEqual } from '../lib/ids';
import { logIntegration } from '../lib/log';

const WIB_OFFSET_MS = 7 * 60 * 60_000;

/**
 * Duitku expects "yyyy-MM-dd HH:mm:ss" in merchant local time (WIB for ID).
 * Computed from UTC so it is correct regardless of the runtime's own timezone
 * (Cloudflare Workers always run in UTC).
 */
export function duitkuDatetime(now = new Date()): string {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${wib.getUTCFullYear()}-${p(wib.getUTCMonth() + 1)}-${p(wib.getUTCDate())} ${p(wib.getUTCHours())}:${p(wib.getUTCMinutes())}:${p(wib.getUTCSeconds())}`;
}

/* -------------------------------- signatures -------------------------------- */

const encoder = new TextEncoder();

/** Lower-case hex digest. Cloudflare Workers' Web Crypto supports MD5 as a non-standard extension. */
async function digestHex(algorithm: 'MD5' | 'SHA-256', input: string): Promise<string> {
  const buffer = await crypto.subtle.digest(algorithm, encoder.encode(input));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** v2/inquiry */
export const requestSignature = (
  merchantCode: string,
  merchantOrderId: string,
  paymentAmount: number,
  apiKey: string,
) => digestHex('MD5', `${merchantCode}${merchantOrderId}${paymentAmount}${apiKey}`);

/** Callback sent by Duitku to our webhook. */
export const callbackSignature = (
  merchantCode: string,
  amount: number | string,
  merchantOrderId: string,
  apiKey: string,
) => digestHex('MD5', `${merchantCode}${amount}${merchantOrderId}${apiKey}`);

/** paymentmethod/getpaymentmethod */
export const paymentMethodListSignature = (merchantCode: string, amount: number, datetime: string, apiKey: string) =>
  digestHex('SHA-256', `${merchantCode}${amount}${datetime}${apiKey}`);

/** transactionStatus */
export const transactionStatusSignature = (merchantCode: string, merchantOrderId: string, apiKey: string) =>
  digestHex('MD5', `${merchantCode}${merchantOrderId}${apiKey}`);

type Json = Record<string, unknown>;

async function postJson(
  env: Env,
  f: RuntimeFlags,
  url: string,
  body: Json,
  reference: string,
): Promise<{ status: number; json: Json }> {
  const started = Date.now();
  let status = 0;
  let json: Json = {};
  let message: string | null = null;
  let ok = false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      message = `Respon Duitku bukan JSON (HTTP ${status})`;
    }
    ok = status >= 200 && status < 300 && message === null;
    return { status, json };
  } catch (e) {
    message = e instanceof Error ? e.message : 'Request Duitku gagal';
    throw upstream('Tidak dapat menghubungi Duitku', { url, error: message });
  } finally {
    await logIntegration(env.DB, {
      provider: 'duitku',
      direction: 'request',
      endpoint: url.replace(f.duitku.baseUrl, ''),
      reference,
      statusCode: status || null,
      success: ok && String(json.statusCode ?? json.responseCode ?? '') === '00',
      message,
      payload: { request: redactKeys(body), response: json },
      durationMs: Date.now() - started,
    });
  }
}

function redactKeys(body: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = /api|key|signature|secret/i.test(k) ? '***' : v;
  }
  return out;
}

const isSuccess = (json: Json) => {
  const code = String(json.statusCode ?? json.responseCode ?? '');
  return code === '00' || code === '200';
};

/** Best human-readable reason Duitku gave for a rejected call (note the capital-M `Message`). */
const reasonOf = (json: Json): string =>
  String(json.responseMessage ?? json.statusMessage ?? json.Message ?? json.message ?? 'respon Duitku tidak dikenali');

/* ------------------------------ payment methods ---------------------------- */

/**
 * Get Payment Method — the live channel list of this merchant account.
 * We never hardcode which channels exist; the UI renders exactly what Duitku returns.
 */
export async function getPaymentMethods(env: Env, f: RuntimeFlags, amount: number): Promise<PaymentMethod[]> {
  if (!f.duitku.configured) return [];
  const datetime = duitkuDatetime();
  const signature = await paymentMethodListSignature(f.duitku.merchantCode, amount, datetime, f.duitku.apiKey);
  const { json } = await postJson(
    env,
    f,
    `${f.duitku.baseUrl}${DUITKU_ENDPOINTS.paymentMethodPath}`,
    { merchantcode: f.duitku.merchantCode, amount, datetime, signature },
    `methods:${amount}`,
  );
  // A rejected call (wrong signature, unknown merchant, ...) must fail loudly:
  // returning [] here would be cached as if the merchant had no channels.
  if (!Array.isArray(json.paymentFee) && !isSuccess(json)) {
    throw upstream(`Duitku menolak permintaan metode pembayaran: ${reasonOf(json)}`, { response: json });
  }
  const list = Array.isArray(json.paymentFee) ? (json.paymentFee as Json[]) : [];
  return list.map((m) => {
    const feeRaw = String(m.totalFee ?? '0').replace(/[^0-9.]/g, '');
    const numeric = Number(feeRaw || 0);
    return {
      code: String(m.paymentMethod ?? ''),
      name: String(m.paymentName ?? m.paymentMethod ?? ''),
      group: String(m.paymentGroup ?? 'Lainnya'),
      icon: m.paymentImage ? String(m.paymentImage) : null,
      // Duitku reports totalFee in Rupiah; a value >= 100 is treated as flat,
      // anything below that is a percentage (their docs show both styles).
      fee: numeric >= 100 ? Math.round(numeric) : 0,
      feeType: numeric > 0 && numeric < 100 ? 'percent' : 'flat',
      enabled: true,
    } satisfies PaymentMethod;
  });
}

/* -------------------------------- transaction ------------------------------- */

export interface DuitkuTransactionInput {
  merchantOrderId: string;
  paymentAmount: number;
  paymentMethod: string;
  productDetails: string;
  customerName: string;
  email: string;
  phoneNumber?: string | null;
  items: { name: string; price: number; quantity: number }[];
  returnUrl: string;
  callbackUrl: string;
  expiryMinutes: number;
}

export interface DuitkuTransactionResult {
  ok: boolean;
  reference: string | null;
  paymentUrl: string | null;
  vaNumber: string | null;
  qrString: string | null;
  amount: number | null;
  statusCode: string | null;
  statusMessage: string | null;
  raw: Json;
}

const MAX_ITEM_LINES = 20;
const MAX_ITEM_NAME = 50;

/**
 * Duitku requires: sum(price x quantity) of itemDetails === paymentAmount.
 * The cart lines only cover goods, while paymentAmount also carries shipping,
 * payment fee and tax (and may have a coupon discount taken off). So:
 *   - exact match           -> send the lines as they are
 *   - goods < amount        -> add one balancing line (shipping / fees)
 *   - anything else         -> one summary line equal to the amount
 *     (discount, too many lines) so the rule always holds without negative prices.
 */
function itemDetailsFor(
  items: { name: string; price: number; quantity: number }[],
  paymentAmount: number,
): { name: string; price: number; quantity: number }[] {
  const lines = items.map((i) => ({
    name: i.name.slice(0, MAX_ITEM_NAME),
    price: Math.round(i.price),
    quantity: Math.max(1, Math.round(i.quantity)),
  }));
  const goods = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  if (goods === paymentAmount && lines.length <= MAX_ITEM_LINES) return lines;

  const extra = paymentAmount - goods;
  if (extra > 0 && lines.length < MAX_ITEM_LINES) {
    return [...lines, { name: 'Ongkos kirim & biaya layanan', price: extra, quantity: 1 }];
  }
  return [{ name: 'Pesanan VELORA', price: paymentAmount, quantity: 1 }];
}

export async function createTransaction(
  env: Env,
  f: RuntimeFlags,
  input: DuitkuTransactionInput,
): Promise<DuitkuTransactionResult> {
  const signature = await requestSignature(
    f.duitku.merchantCode,
    input.merchantOrderId,
    input.paymentAmount,
    f.duitku.apiKey,
  );
  const body: Json = {
    merchantCode: f.duitku.merchantCode,
    paymentAmount: input.paymentAmount,
    paymentMethod: input.paymentMethod,
    merchantOrderId: input.merchantOrderId,
    productDetails: input.productDetails.slice(0, 255),
    customerVaName: input.customerName.slice(0, 20) || 'Pelanggan',
    email: input.email,
    phoneNumber: input.phoneNumber ?? undefined,
    itemDetails: itemDetailsFor(input.items, input.paymentAmount),
    returnUrl: input.returnUrl,
    callbackUrl: input.callbackUrl,
    signature,
    expiryPeriod: input.expiryMinutes,
  };
  const { json } = await postJson(
    env,
    f,
    `${f.duitku.baseUrl}${DUITKU_ENDPOINTS.createTransactionPath}`,
    body,
    input.merchantOrderId,
  );
  const ok = isSuccess(json);
  return {
    ok,
    reference: json.reference ? String(json.reference) : null,
    paymentUrl: json.paymentUrl ? String(json.paymentUrl) : null,
    vaNumber: json.vaNumber ? String(json.vaNumber) : null,
    qrString: json.qrString ? String(json.qrString) : null,
    amount: json.amount !== undefined ? Number(json.amount) : null,
    statusCode: json.statusCode !== undefined ? String(json.statusCode) : null,
    statusMessage: json.statusMessage || json.Message || json.message ? reasonOf(json) : null,
    raw: json,
  };
}

/* ----------------------------- status verification -------------------------- */

export interface DuitkuStatusResult {
  ok: boolean;
  pending: boolean;
  cancelled: boolean;
  merchantOrderId: string | null;
  reference: string | null;
  amount: number | null;
  fee: number | null;
  statusCode: string | null;
  statusMessage: string | null;
  raw: Json;
}

export async function checkTransactionStatus(
  env: Env,
  f: RuntimeFlags,
  merchantOrderId: string,
): Promise<DuitkuStatusResult> {
  const signature = await transactionStatusSignature(f.duitku.merchantCode, merchantOrderId, f.duitku.apiKey);
  const { json } = await postJson(
    env,
    f,
    `${f.duitku.baseUrl}${DUITKU_ENDPOINTS.transactionStatusPath}`,
    { merchantCode: f.duitku.merchantCode, merchantOrderId, signature },
    merchantOrderId,
  );
  const code = json.statusCode !== undefined ? String(json.statusCode) : null;
  return {
    ok: code === '00',
    pending: code === '01',
    cancelled: code === '02',
    merchantOrderId: json.merchantOrderId ? String(json.merchantOrderId) : null,
    reference: json.reference ? String(json.reference) : null,
    amount: json.amount !== undefined ? Number(json.amount) : null,
    fee: json.fee !== undefined ? Number(json.fee) : null,
    statusCode: code,
    statusMessage: json.statusMessage ? String(json.statusMessage) : null,
    raw: json,
  };
}

/**
 * Callback verification. Constant-time compare, never falls back to "assume ok".
 */
export async function verifyCallback(
  f: RuntimeFlags,
  form: { merchantCode?: string; amount?: string; merchantOrderId?: string; signature?: string },
): Promise<boolean> {
  if (!f.duitku.configured) return false;
  const { merchantCode, amount, merchantOrderId, signature } = form;
  if (!merchantCode || !amount || !merchantOrderId || !signature) return false;
  if (merchantCode !== f.duitku.merchantCode) return false;
  const expected = await callbackSignature(merchantCode, amount, merchantOrderId, f.duitku.apiKey);
  return timingSafeEqual(expected, signature.toLowerCase());
}

export function duitkuCallbackUrl(appUrl: string): string {
  return `${appUrl}/webhooks/duitku/callback`;
}

export function duitkuReturnUrl(appUrl: string, orderCode: string): string {
  return `${appUrl}/pembayaran/${encodeURIComponent(orderCode)}?source=return`;
}
