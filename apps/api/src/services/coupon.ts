import type { CouponPreview, CouponPublic } from '@velora/shared';
import { COUPON_TYPE, ERROR_CODES, formatRupiah } from '@velora/shared';
import { type Row, all, first, jsonParse, num, optNum, optStr, str, toIso, value } from '../lib/db';
import { AppError } from '../lib/errors';

/**
 * Coupon evaluation happens entirely server side. A client can only ever submit a
 * code; the discount is recomputed from the database every time and re-validated
 * again at order creation (a quote can never be replayed with a stale discount).
 */

export interface CouponLine {
  productId: string;
  categoryId: string | null;
  lineTotal: number;
}

export interface CouponRow {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  minPurchase: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  categoryIds: string[];
  productIds: string[];
  freeShippingMax: number | null;
}

const SELECT_COUPON = `
  SELECT id, code, name, type, value, min_purchase, max_discount, usage_limit, per_user_limit,
         used_count, starts_at, ends_at, is_active, category_ids, product_ids, free_shipping_max
  FROM coupons WHERE UPPER(code) = UPPER(?1)`;

function mapCoupon(row: Row): CouponRow {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    type: str(row.type),
    value: num(row.value),
    minPurchase: optNum(row.min_purchase),
    maxDiscount: optNum(row.max_discount),
    usageLimit: optNum(row.usage_limit),
    perUserLimit: optNum(row.per_user_limit),
    usedCount: num(row.used_count),
    startsAt: optStr(row.starts_at),
    endsAt: optStr(row.ends_at),
    isActive: num(row.is_active, 0) === 1,
    categoryIds: jsonParse<string[]>(row.category_ids, []),
    productIds: jsonParse<string[]>(row.product_ids, []),
    freeShippingMax: optNum(row.free_shipping_max),
  };
}

export async function findCoupon(db: D1Database, code: string): Promise<CouponRow | null> {
  const row = await first<Row>(db, SELECT_COUPON, [code]);
  return row ? mapCoupon(row) : null;
}

export async function publicCoupons(db: D1Database): Promise<CouponPublic[]> {
  const rows = await all<Row>(
    db,
    `SELECT code, name, type, starts_at, ends_at, min_purchase, max_discount
     FROM coupons
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= datetime('now'))
       AND (ends_at IS NULL OR ends_at >= datetime('now'))
     ORDER BY ends_at ASC LIMIT 20`,
  );
  return rows.map((r) => ({
    code: str(r.code),
    name: str(r.name),
    type: str(r.type) as CouponPublic['type'],
    startsAt: toIso(r.starts_at) ?? toIso(new Date().toISOString()) ?? '',
    endsAt: toIso(r.ends_at) ?? '',
    minPurchase: optNum(r.min_purchase),
    maxDiscount: optNum(r.max_discount),
  }));
}

export interface EvaluateInput {
  code: string;
  lines: CouponLine[];
  subtotal: number;
  shippingFee: number;
  userId: string | null;
}

export interface EvaluateResult {
  preview: CouponPreview;
  couponId: string | null;
}

const rejected = (code: string, name: string, type: CouponPreview['type'], reason: string): CouponPreview => ({
  code,
  name,
  type,
  discount: 0,
  freeShipping: false,
  reason,
});

/**
 * Validates a coupon against live data. Returns a preview plus (when accepted) the
 * usage-recording statements so the caller can commit them atomically with the order.
 */
export async function evaluateCoupon(db: D1Database, input: EvaluateInput): Promise<EvaluateResult> {
  const empty: EvaluateResult = {
    preview: rejected(input.code, '', 'percent', 'Kode promo tidak dikenali'),
    couponId: null,
  };
  const code = input.code.trim().toUpperCase();
  if (!code) return empty;

  const row = await findCoupon(db, code);
  if (!row) return empty;

  const fail = (reason: string): EvaluateResult => ({
    preview: rejected(row.code, row.name, row.type as CouponPreview['type'], reason),
    couponId: null,
  });

  if (!row.isActive) return fail('Kode promo sedang tidak aktif');
  const now = Date.now();
  if (row.startsAt && Date.parse(`${row.startsAt.replace(' ', 'T')}Z`) > now) return fail('Kode promo belum berlaku');
  if (row.endsAt && Date.parse(`${row.endsAt.replace(' ', 'T')}Z`) < now) return fail('Kode promo sudah kedaluwarsa');
  if (row.usageLimit !== null && row.usageLimit > 0 && row.usedCount >= row.usageLimit)
    return fail('Kuota kode promo sudah habis');

  if (input.userId && row.perUserLimit !== null && row.perUserLimit > 0) {
    const usedByUser = num(
      await value<number>(db, `SELECT COUNT(*) AS n FROM coupon_usages WHERE coupon_id = ?1 AND user_id = ?2`, [
        row.id,
        input.userId,
      ]),
    );
    if (usedByUser >= row.perUserLimit) return fail('Anda sudah mencapai batas pemakaian kode ini');
  }

  // Scope: restrict to specific categories / products when configured.
  const scoped = row.categoryIds.length > 0 || row.productIds.length > 0;
  const eligibleLines = scoped
    ? input.lines.filter(
        (l) =>
          (row.productIds.length ? row.productIds.includes(l.productId) : true) &&
          (row.categoryIds.length ? !!l.categoryId && row.categoryIds.includes(l.categoryId) : true),
      )
    : input.lines;
  const eligibleTotal = eligibleLines.reduce((s, l) => s + l.lineTotal, 0);
  if (scoped && eligibleTotal <= 0) return fail('Kode promo tidak berlaku untuk produk di keranjang ini');

  const base = eligibleTotal;
  if (row.minPurchase !== null && row.minPurchase > 0 && input.subtotal < row.minPurchase) {
    return fail(`Belanja minimal ${formatRupiah(row.minPurchase)} diperlukan untuk kode ini`);
  }

  if (row.type === COUPON_TYPE.FREE_SHIPPING) {
    if (input.shippingFee <= 0) return fail('Belum ada ongkos kirim untuk dikurangi');
    return {
      preview: {
        code: row.code,
        name: row.name,
        type: COUPON_TYPE.FREE_SHIPPING,
        discount: 0,
        freeShipping: true,
        reason: null,
      },
      couponId: row.id,
    };
  }

  let discount = 0;
  if (row.type === COUPON_TYPE.PERCENT) {
    discount = Math.round((base * Math.min(row.value, 100)) / 100);
    if (row.maxDiscount !== null) discount = Math.min(discount, row.maxDiscount);
  } else if (row.type === COUPON_TYPE.FIXED) {
    discount = row.value;
    if (row.maxDiscount !== null) discount = Math.min(discount, row.maxDiscount);
  }
  discount = Math.max(0, Math.min(discount, base));
  if (discount <= 0) return fail('Nilai kode promo tidak dapat diterapkan');

  return {
    preview: {
      code: row.code,
      name: row.name,
      type: row.type as CouponPreview['type'],
      discount,
      freeShipping: false,
      reason: null,
    },
    couponId: row.id,
  };
}

/**
 * Called from checkout with the real order id: re-validates then commits usage.
 * The re-validation is what stops a replayed quote from spending a coupon twice.
 */
export async function commitCouponUsage(
  db: D1Database,
  args: { code: string; orderId: string; userId: string | null; discount: number; shippingDiscount: number },
): Promise<boolean> {
  const row = await findCoupon(db, args.code);
  if (!row) return false;
  const statements = [
    {
      sql: `INSERT INTO coupon_usages (id, coupon_id, order_id, user_id, discount_amount, shipping_discount, created_at)
            VALUES (?1,?2,?3,?4,?5,?6,datetime('now'))`,
      params: [crypto.randomUUID(), row.id, args.orderId, args.userId, args.discount, args.shippingDiscount],
    },
    {
      sql: `UPDATE coupons SET used_count = used_count + 1, updated_at = datetime('now') WHERE id = ?1 AND (usage_limit IS NULL OR usage_limit = 0 OR used_count < usage_limit)`,
      params: [row.id],
    },
  ];
  const results = await db.batch(statements.map((s) => db.prepare(s.sql).bind(...(s.params ?? []))));
  const bumped = results[1];
  if (num(bumped.meta?.changes ?? bumped.changes ?? 0) === 0) {
    // quota exhausted between quote and commit: undo the usage row and refuse
    await db
      .prepare(`DELETE FROM coupon_usages WHERE coupon_id = ?1 AND order_id = ?2`)
      .bind(row.id, args.orderId)
      .run();
    throw new AppError(ERROR_CODES.COUPON_INVALID, 'Kuota kode promo baru saja habis', 409);
  }
  return true;
}

export async function releaseCouponUsage(db: D1Database, orderId: string): Promise<void> {
  const usage = await all<Row>(
    db,
    `SELECT coupon_id, COUNT(*) AS n FROM coupon_usages WHERE order_id = ?1 GROUP BY coupon_id`,
    [orderId],
  );
  if (!usage.length) return;
  const statements = usage.flatMap((u) => [
    { sql: `DELETE FROM coupon_usages WHERE order_id = ?1 AND coupon_id = ?2`, params: [orderId, str(u.coupon_id)] },
    { sql: `UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE id = ?1`, params: [str(u.coupon_id)] },
  ]);
  await db.batch(statements.map((s) => db.prepare(s.sql).bind(...(s.params ?? []))));
}

export async function couponUsages(db: D1Database, couponId: string) {
  const rows = await all<Row>(
    db,
    `SELECT cu.order_id, cu.discount_amount, cu.shipping_discount, cu.created_at, o.code AS order_code, u.email
     FROM coupon_usages cu LEFT JOIN orders o ON o.id = cu.order_id LEFT JOIN users u ON u.id = cu.user_id
     WHERE cu.coupon_id = ?1 ORDER BY cu.created_at DESC LIMIT 200`,
    [couponId],
  );
  return rows.map((r) => ({
    orderId: str(r.order_id),
    orderCode: optStr(r.order_code),
    customerEmail: optStr(r.email),
    discountAmount: num(r.discount_amount),
    shippingDiscount: num(r.shipping_discount),
    createdAt: toIso(r.created_at) ?? '',
  }));
}
