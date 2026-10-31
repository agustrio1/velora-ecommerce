import type { CartLine, CheckoutQuote, OrderSummary, PlaceOrderResult } from '@velora/shared';
import { CHECKOUT, ERROR_CODES, PAYMENT_STATUS, formatRupiah } from '@velora/shared';
import type { Env, RuntimeFlags } from '../env';
import { cacheGet, cacheSet } from '../lib/cache';
import { type Row, all, first, num, optStr, str } from '../lib/db';
import { AppError, badRequest, notFound } from '../lib/errors';
import { iso, orderCode as newOrderCode, sha256Hex, uuid } from '../lib/ids';
import { logger } from '../lib/log';
import { orderSettings, taxSettings } from '../lib/settings';
import { assertCartPurchasable, clearCart, loadCart } from './cart';
import { type CouponLine, commitCouponUsage, evaluateCoupon } from './coupon';
import { releaseReservations, reserveVariants } from './inventory';
import { mapOrderSummary } from './order';
import { availablePaymentMethods, createPayment, paymentFeeFor } from './payment';
import { insertShipmentRow } from './shipment';
import { PICKUP_OPTION_ID, type RateRequest, mustOrigin, resolveShipping } from './shipping';

/**
 * Checkout: every number is computed here, never taken from the browser.
 *
 * The client sends ids only (address id, shipping option id, coupon code, payment
 * channel code). Prices, shipping fees, discounts and the grand total are re-derived
 * from D1 + the live provider responses on every call.
 *
 * Double-submit protection: the order is keyed by a signature of the cart contents,
 * so pressing "place order" twice returns the first order instead of charging twice.
 */

export interface CheckoutActor {
  userId: string;
  cartId: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export interface CheckoutIntent {
  addressId: string;
  shippingOptionId: string;
  couponCode?: string | null;
  paymentChannelCode?: string | null;
  customerNote?: string | null;
}

export interface QuoteInput extends Omit<CheckoutIntent, 'addressId' | 'shippingOptionId'> {
  /** A quote may be built before the shopper has chosen an address or a courier. */
  addressId?: string | null;
  shippingOptionId?: string | null;
  /** When false (default) a missing option only yields an incomplete quote instead of throwing. */
  strict?: boolean;
}

/* --------------------------------- helpers -------------------------------- */

async function categoryIdsFor(db: D1Database, productIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!productIds.length) return map;
  const placeholders = productIds.map(() => '?').join(',');
  const rows = await all<Row>(
    db,
    `SELECT id, primary_category_id FROM products WHERE id IN (${placeholders})`,
    productIds,
  );
  for (const r of rows) map.set(str(r.id), optStr(r.primary_category_id));
  return map;
}

function couponLines(lines: CartLine[], categories: Map<string, string | null>): CouponLine[] {
  return lines.map((l) => ({
    productId: l.productId,
    categoryId: categories.get(l.productId) ?? null,
    lineTotal: l.unitPrice * l.quantity,
  }));
}

function rateRequestFor(address: AddressSnapshot, lines: CartLine[], value: number): RateRequest {
  const weightGrams = lines.reduce((s, l) => s + l.weightGrams * l.quantity, 0);
  const quantity = lines.reduce((s, l) => s + l.quantity, 0);
  return {
    destinationAreaId: address.areaId,
    destinationPostalCode: address.postcode,
    weightGrams: Math.max(1, weightGrams),
    value,
    quantity: Math.min(quantity, CHECKOUT.maxShippingItems),
    itemName:
      lines.length > 1
        ? `${lines[0].productName} +${lines.length - 1} item lain`
        : (lines[0]?.productName ?? 'Paket busana'),
  };
}

export interface AddressSnapshot {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  postcode: string;
  detail: string;
  areaId: string | null;
}

export async function loadAddress(db: D1Database, userId: string, addressId: string): Promise<AddressSnapshot> {
  const row = await first<Row>(db, `SELECT * FROM user_addresses WHERE id = ?1 AND user_id = ?2`, [addressId, userId]);
  if (!row) throw new AppError(ERROR_CODES.ADDRESS_REQUIRED, 'Alamat pengiriman tidak ditemukan untuk akun ini', 404);
  return {
    id: str(row.id),
    label: str(row.label),
    recipientName: str(row.recipient_name),
    phone: str(row.phone),
    province: str(row.province),
    city: str(row.city),
    district: str(row.district),
    postcode: str(row.postcode),
    detail: str(row.detail),
    areaId: optStr(row.area_id),
  };
}

async function defaultAddressId(db: D1Database, userId: string): Promise<string | null> {
  const row = await first<Row>(
    db,
    `SELECT id FROM user_addresses WHERE user_id = ?1 ORDER BY is_default_shipping DESC, created_at DESC LIMIT 1`,
    [userId],
  );
  return row ? str(row.id) : null;
}

/* ---------------------------------- quote ---------------------------------- */

export async function buildQuote(
  env: Env,
  f: RuntimeFlags,
  actor: CheckoutActor,
  intent: QuoteInput,
): Promise<CheckoutQuote> {
  const db = env.DB;
  const cart = await loadCart(db, actor.cartId, env);
  const purchasable = cart.lines.filter((l) => l.status === 'ok');
  const subtotal = purchasable.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const issues = [...cart.issues];

  const empty: CheckoutQuote = {
    lines: cart.lines,
    subtotal,
    discount: 0,
    shippingFee: 0,
    paymentFee: 0,
    taxAmount: 0,
    grandTotal: subtotal,
    totalWeightGrams: purchasable.reduce((s, l) => s + l.weightGrams * l.quantity, 0),
    appliedCoupon: null,
    shippingOption: null,
    freeShipping: false,
    issues,
  };
  if (!purchasable.length) return empty;

  const [categories, tax] = await Promise.all([
    categoryIdsFor(
      db,
      purchasable.map((l) => l.productId),
    ),
    taxSettings(db),
  ]);

  // 1. discount (needs only the lines)
  const couponPreview = intent.couponCode
    ? (
        await evaluateCoupon(db, {
          code: intent.couponCode,
          lines: couponLines(purchasable, categories),
          subtotal,
          shippingFee: 0,
          userId: actor.userId,
        })
      ).preview
    : null;
  if (couponPreview && couponPreview.reason) issues.push(couponPreview.reason);
  const discount = couponPreview && !couponPreview.reason ? couponPreview.discount : 0;
  const freeByCoupon = !!couponPreview?.freeShipping;
  const subtotalAfterDiscount = Math.max(0, subtotal - discount);

  // 2. shipping (server-side re-derivation of the chosen option)
  let shippingFee = 0;
  let shippingOption: CheckoutQuote['shippingOption'] = null;
  let freeShipping = freeByCoupon;
  const addressId = intent.addressId || (await defaultAddressId(db, actor.userId));
  if (!addressId) {
    issues.push('Pilih alamat pengiriman untuk menghitung ongkir');
  } else if (!intent.shippingOptionId) {
    issues.push('Pilih layanan pengiriman');
  } else {
    const address = await loadAddress(db, actor.userId, addressId);
    const rateReq = rateRequestFor(address, purchasable, subtotalAfterDiscount);
    try {
      const resolved = await resolveShipping(db, env, f, intent.shippingOptionId, rateReq, subtotalAfterDiscount);
      shippingOption = resolved.option;
      shippingFee = freeByCoupon ? 0 : resolved.fee;
      freeShipping = freeByCoupon || resolved.freeByThreshold;
    } catch (e) {
      if (intent.strict) throw e;
      issues.push(e instanceof AppError ? e.message : 'Ongkir tidak dapat dihitung saat ini');
    }
  }

  // 3. payment fee (live Duitku channel list, matched by code)
  const baseForPayment = subtotalAfterDiscount + shippingFee;
  let paymentFee = 0;
  if (intent.paymentChannelCode) {
    const methods = await availablePaymentMethods(env, f, baseForPayment);
    const method = methods.find((m) => m.code.toUpperCase() === intent.paymentChannelCode!.toUpperCase());
    if (!method) issues.push(`Metode pembayaran ${intent.paymentChannelCode} tidak tersedia untuk nominal ini`);
    paymentFee = paymentFeeFor(method, baseForPayment);
  }

  // 4. tax (only when the store explicitly taxes on top of the price)
  const taxAmount = tax.enabled && !tax.includeInPrice ? Math.round((subtotalAfterDiscount * tax.percent) / 100) : 0;

  const grandTotal = subtotalAfterDiscount + shippingFee + paymentFee + taxAmount;
  return {
    lines: cart.lines,
    subtotal,
    discount,
    shippingFee,
    paymentFee,
    taxAmount,
    grandTotal,
    totalWeightGrams: purchasable.reduce((s, l) => s + l.weightGrams * l.quantity, 0),
    appliedCoupon: couponPreview && !couponPreview.reason ? couponPreview : null,
    shippingOption,
    freeShipping,
    issues,
  };
}

/* -------------------------------- place order ------------------------------- */

async function cartSignature(db: D1Database, cartId: string): Promise<string> {
  const rows = await all<Row>(
    db,
    `SELECT ci.variant_id, ci.quantity FROM cart_items ci WHERE ci.cart_id = ?1 ORDER BY ci.variant_id`,
    [cartId],
  );
  return sha256Hex(rows.map((r) => `${str(r.variant_id)}:${num(r.quantity)}`).join('|') || 'empty');
}

/**
 * Creates the order, reserves stock, consumes the coupon, books the payment.
 * Anything that fails after the order row exists is compensated (reservations
 * released, coupon usage removed, order deleted) so stock can never leak.
 */
export async function placeOrder(
  env: Env,
  f: RuntimeFlags,
  actor: CheckoutActor,
  intent: CheckoutIntent,
  appUrl: string,
): Promise<PlaceOrderResult> {
  const db = env.DB;
  if (!intent.addressId) throw new AppError(ERROR_CODES.ADDRESS_REQUIRED, 'Alamat pengiriman wajib dipilih', 400);
  if (!intent.shippingOptionId) throw badRequest('Layanan pengiriman wajib dipilih');
  if (!intent.paymentChannelCode) throw badRequest('Metode pembayaran wajib dipilih');

  const signature = await cartSignature(db, actor.cartId);
  const key = `ck:${actor.userId}:${signature}`;

  // Replay protection: the same basket from the same account resolves to one order.
  const existingId = await cacheGet<string>(env, key);
  if (existingId) {
    const reusedRow = await first<Row>(db, `SELECT * FROM orders WHERE id = ?1`, [existingId]);
    if (reusedRow) {
      const quote = await buildQuote(env, f, actor, { ...intent, strict: false });
      const paymentRow = await first<Row>(db, `SELECT * FROM payments WHERE order_id = ?1`, [existingId]);
      const summary = await orderSummaryById(db, env, existingId);
      return {
        order: summary,
        quote: {
          ...quote,
          grandTotal: num(reusedRow.grand_total),
          shippingFee: num(reusedRow.shipping_fee),
          discount: num(reusedRow.discount_total),
        },
        payment: {
          provider: 'duitku',
          merchantOrderId: str(reusedRow.code),
          method: optStr(paymentRow?.method),
          methodName: optStr(paymentRow?.channel_code),
          amount: num(paymentRow?.amount ?? reusedRow.grand_total),
          fee: num(paymentRow?.fee ?? 0),
          status: (optStr(paymentRow?.status) ?? PAYMENT_STATUS.PENDING) as PlaceOrderResult['payment']['status'],
          paymentUrl: optStr(paymentRow?.payment_url),
          vaNumber: optStr(paymentRow?.va_number),
          qrString: optStr(paymentRow?.qr_string),
          reference: optStr(paymentRow?.reference),
          expiresAt: optStr(paymentRow?.expired_at),
          gatewayConfigured: f.duitku.configured,
          message: 'Pesanan sudah dibuat sebelumnya, selesaikan pembayaran yang tertunda.',
        },
        reused: true,
      };
    }
  }

  const cart = await assertCartPurchasable(db, actor.cartId, env);
  const address = await loadAddress(db, actor.userId, intent.addressId);
  const quote = await buildQuote(env, f, actor, { ...intent, strict: true });
  if (quote.shippingFee < 0 || quote.grandTotal <= 0) throw badRequest('Total pesanan tidak valid');
  if (quote.grandTotal > 1_000_000_000)
    throw badRequest(`Total ${formatRupiah(quote.grandTotal)} melebihi batas transaksi`);

  const settings = await orderSettings(db);
  const expiryMinutes = Math.max(10, settings.paymentExpiryMinutes);
  const orderId = uuid();
  const code = newOrderCode();
  const lines = cart.lines.filter((l) => l.status === 'ok');
  const origin = await mustOrigin(db).catch(() => null);
  const option = quote.shippingOption;
  if (!option)
    throw new AppError(ERROR_CODES.SHIPPING_RATE_FAILED, quote.issues[0] ?? 'Ongkir belum dapat dihitung', 409);

  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

  // 1. order + items + shipment + initial history in one atomic batch
  const statements: { sql: string; params: unknown[] }[] = [
    {
      sql: `INSERT INTO orders (id, code, user_id, status, subtotal, discount_total, shipping_fee, payment_fee, tax_amount,
                                 grand_total, total_weight_grams, coupon_code, ship_recipient_name, ship_phone, ship_province,
                                 ship_city, ship_district, ship_postcode, ship_detail, ship_area_id, address_id, payment_method,
                                 payment_channel, customer_note, expires_at, created_at, updated_at)
            VALUES (?1,?2,?3,'pending_payment',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,datetime('now'),datetime('now'))`,
      params: [
        orderId,
        code,
        actor.userId,
        quote.subtotal,
        quote.discount,
        quote.shippingFee,
        quote.paymentFee,
        quote.taxAmount,
        quote.grandTotal,
        quote.totalWeightGrams,
        quote.appliedCoupon?.code ?? null,
        address.recipientName,
        address.phone,
        address.province,
        address.city,
        address.district,
        address.postcode,
        address.detail,
        address.areaId,
        address.id,
        option.courierName,
        intent.paymentChannelCode,
        intent.customerNote ?? null,
        iso(expiresAt),
      ],
    },
    ...lines.map((l) => ({
      sql: `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, product_slug, variant_label, color_name,
                                      size_code, sku, unit_price, quantity, line_total, weight_grams, image_key, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,(
               SELECT COALESCE(v.image_key, (SELECT pi.image_key FROM product_images pi WHERE pi.product_id = ?3 ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1))
               FROM product_variants v WHERE v.id = ?4), datetime('now'))`,
      params: [
        uuid(),
        orderId,
        l.productId,
        l.variantId,
        l.productName,
        l.productSlug,
        l.variantLabel,
        l.variantLabel.split(' / ')[0] ?? null,
        l.variantLabel.split(' / ')[1] ?? null,
        l.sku,
        l.unitPrice,
        l.quantity,
        l.unitPrice * l.quantity,
        l.weightGrams * l.quantity,
      ],
    })),
    {
      sql: `INSERT INTO order_status_history (id, order_id, from_status, to_status, note, actor_type, actor_id, created_at)
            VALUES (?1,?2,NULL,'pending_payment','Pesanan dibuat dari checkout','customer',?3,datetime('now'))`,
      params: [uuid(), orderId, actor.userId],
    },
  ];
  await db.batch(statements.map((s) => db.prepare(s.sql).bind(...(s.params as never[]))));

  const rollback = async (reason: string) => {
    try {
      await releaseReservations(db, orderId, reason);
    } catch (e) {
      logger(env).warn('rollback release gagal', { orderId, error: String(e) });
    }
    await db.batch([
      db.prepare(`DELETE FROM order_items WHERE order_id = ?1`).bind(orderId),
      db.prepare(`DELETE FROM order_status_history WHERE order_id = ?1`).bind(orderId),
      db.prepare(`DELETE FROM shipments WHERE order_id = ?1`).bind(orderId),
      db.prepare(`DELETE FROM payments WHERE order_id = ?1`).bind(orderId),
      db.prepare(`DELETE FROM orders WHERE id = ?1 AND status = 'pending_payment'`).bind(orderId),
    ]);
  };

  // 2. reserve stock (conditional UPDATEs; a lost race throws and rolls back)
  try {
    await reserveVariants(
      db,
      orderId,
      lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      settings.reservationExpiryMinutes,
    );
  } catch (e) {
    await rollback('Reservasi stok gagal saat checkout');
    throw e;
  }

  // 3. commit the coupon with the real order id
  if (quote.appliedCoupon) {
    try {
      await commitCouponUsage(db, {
        code: quote.appliedCoupon.code,
        orderId,
        userId: actor.userId,
        discount: quote.appliedCoupon.discount,
        shippingDiscount: quote.appliedCoupon.freeShipping ? (quote.shippingOption?.price ?? 0) : 0,
      });
    } catch (e) {
      await rollback('Kupon gagal dipakai');
      throw e;
    }
  }

  // 4. shipment row (pending until payment is verified)
  await insertShipmentRow(db, {
    orderId,
    courierCompany: option.courier,
    courierService: option.service,
    courierType: option.type,
    serviceCode: option.id,
    deliveryType: option.id === PICKUP_OPTION_ID ? 'self_pickup' : 'regular',
    price: quote.shippingFee,
    weightGrams: quote.totalWeightGrams,
    itemWeightGrams: lines[0]?.weightGrams ?? 250,
    itemName: lines[0]?.productName ?? 'Paket busana',
    insuranceEnabled: false,
    insurancePrice: 0,
    estimate: option.estimate,
    fromSnapshot: origin
      ? {
          contactName: origin.contactName,
          phone: origin.phone,
          address: origin.address,
          postcode: origin.postcode,
          areaId: origin.areaId,
          province: origin.province,
          city: origin.city,
        }
      : { note: 'origin belum diatur' },
    toSnapshot: {
      contactName: address.recipientName,
      phone: address.phone,
      address: address.detail,
      postcode: address.postcode,
      areaId: address.areaId,
      province: address.province,
      city: address.city,
      district: address.district,
    },
  });

  // 5. ask Duitku for the payment (failure keeps the order, never a fake success)
  let payment: PlaceOrderResult['payment'];
  try {
    const methods = await availablePaymentMethods(env, f, quote.grandTotal);
    const method = methods.find((m) => m.code.toUpperCase() === intent.paymentChannelCode!.toUpperCase());
    const fee = paymentFeeFor(method, quote.grandTotal);
    if (fee !== quote.paymentFee && f.duitku.configured) {
      // The fee moved between quote and commit: bill the fresh number, honestly.
      await db
        .prepare(`UPDATE orders SET payment_fee = ?1, grand_total = ?2, updated_at = datetime('now') WHERE id = ?3`)
        .bind(fee, quote.subtotal - quote.discount + quote.shippingFee + fee + quote.taxAmount, orderId)
        .run();
      quote.paymentFee = fee;
      quote.grandTotal = quote.subtotal - quote.discount + quote.shippingFee + fee + quote.taxAmount;
    }
    const outcome = await createPayment(env, f, appUrl, {
      orderId,
      orderCode: code,
      amount: quote.grandTotal,
      channelCode: intent.paymentChannelCode,
      channelName: method?.name ?? intent.paymentChannelCode,
      fee,
      customer: { name: actor.name ?? address.recipientName, email: actor.email, phone: actor.phone ?? address.phone },
      productSummary: lines
        .map((l) => `${l.productName} (${l.variantLabel}) x${l.quantity}`)
        .join(', ')
        .slice(0, 250),
      items: lines.map((l) => ({ name: l.productName, price: l.unitPrice, quantity: l.quantity })),
      expiryMinutes,
    });
    payment = {
      provider: 'duitku',
      merchantOrderId: code,
      method: method?.name ?? intent.paymentChannelCode,
      methodName: method?.group ?? null,
      amount: outcome.amount,
      fee,
      status: PAYMENT_STATUS.PENDING,
      paymentUrl: outcome.paymentUrl,
      vaNumber: outcome.vaNumber,
      qrString: outcome.qrString,
      reference: outcome.reference,
      expiresAt: outcome.expiresAt,
      gatewayConfigured: outcome.gatewayConfigured,
      message: outcome.message,
    };
  } catch (e) {
    if (e instanceof AppError && e.code === ERROR_CODES.PAYMENT_FAILED) {
      payment = {
        provider: 'duitku',
        merchantOrderId: code,
        method: intent.paymentChannelCode,
        methodName: null,
        amount: quote.grandTotal,
        fee: quote.paymentFee,
        status: PAYMENT_STATUS.PENDING,
        paymentUrl: null,
        vaNumber: null,
        qrString: null,
        reference: null,
        expiresAt: iso(expiresAt),
        gatewayConfigured: f.duitku.configured,
        message: e.message,
      };
    } else {
      await rollback('Gerbang pembayaran tidak dapat dihubungi');
      throw e;
    }
  }

  // 6. cart consumed, order remembered
  await clearCart(db, actor.cartId);
  await cacheSet(env, key, orderId, 3600);

  const summary = await orderSummaryById(db, env, orderId);
  return { order: summary, quote, payment, reused: false };
}

async function orderSummaryById(db: D1Database, env: Env, orderId: string): Promise<OrderSummary> {
  const row = await first<Row>(
    db,
    `SELECT o.*, p.status AS payment_status, s.status AS shipping_status, s.courier_company, s.tracking_number,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
            (SELECT oi.image_key FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at LIMIT 1) AS primary_image
     FROM orders o LEFT JOIN payments p ON p.order_id = o.id LEFT JOIN shipments s ON s.order_id = o.id WHERE o.id = ?1`,
    [orderId],
  );
  if (!row) throw notFound('Pesanan gagal dibuat');
  return mapOrderSummary(row, env);
}

/** Retry the gateway call for an order that exists but has no usable payment. */
export async function retryPayment(
  env: Env,
  f: RuntimeFlags,
  actor: CheckoutActor,
  orderId: string,
  channelCode: string,
  appUrl: string,
): Promise<PlaceOrderResult['payment']> {
  const db = env.DB;
  const order = await first<Row>(db, `SELECT * FROM orders WHERE id = ?1 AND user_id = ?2`, [orderId, actor.userId]);
  if (!order) throw notFound('Pesanan tidak ditemukan');
  if (str(order.status) !== 'pending_payment') throw badRequest('Pesanan tidak lagi menunggu pembayaran');
  const amount = num(order.grand_total);
  const methods = await availablePaymentMethods(env, f, amount);
  const method = methods.find((m) => m.code.toUpperCase() === channelCode.toUpperCase());
  const fee = paymentFeeFor(method, amount);
  const settings = await orderSettings(db);
  const items = await all<Row>(
    db,
    `SELECT product_name, variant_label, unit_price, quantity FROM order_items WHERE order_id = ?1`,
    [orderId],
  );
  const outcome = await createPayment(env, f, appUrl, {
    orderId,
    orderCode: str(order.code),
    amount,
    channelCode,
    channelName: method?.name ?? channelCode,
    fee,
    customer: {
      name: actor.name ?? str(order.ship_recipient_name),
      email: actor.email,
      phone: actor.phone ?? str(order.ship_phone),
    },
    productSummary: items
      .map((i) => `${str(i.product_name)} (${str(i.variant_label)}) x${num(i.quantity)}`)
      .join(', ')
      .slice(0, 250),
    items: items.map((i) => ({ name: str(i.product_name), price: num(i.unit_price), quantity: num(i.quantity) })),
    expiryMinutes: Math.max(10, settings.paymentExpiryMinutes),
  });
  await db
    .prepare(`UPDATE orders SET payment_method = ?1, payment_channel = ?2, updated_at = datetime('now') WHERE id = ?3`)
    .bind(method?.name ?? channelCode, channelCode, orderId)
    .run();
  return {
    provider: 'duitku',
    merchantOrderId: str(order.code),
    method: method?.name ?? channelCode,
    methodName: method?.group ?? null,
    amount: outcome.amount,
    fee,
    status: PAYMENT_STATUS.PENDING,
    paymentUrl: outcome.paymentUrl,
    vaNumber: outcome.vaNumber,
    qrString: outcome.qrString,
    reference: outcome.reference,
    expiresAt: outcome.expiresAt,
    gatewayConfigured: outcome.gatewayConfigured,
    message: outcome.message,
  };
}
