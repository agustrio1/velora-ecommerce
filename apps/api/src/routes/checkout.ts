import { ERROR_CODES, PAYMENT_STATUS, type PlaceOrderResult, schemas } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { type Row, num, optStr, str } from '../lib/db';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { currentUser, limit, requireAuth } from '../mw/auth';
import { mergeGuestCart, resolveCartId } from '../services/cart';
import { type CheckoutActor, buildQuote, placeOrder, retryPayment } from '../services/checkout';
import { notifyUser } from '../services/notify';
import { findOrderRow } from '../services/order';
import { paymentForOrder, recheckPayment } from '../services/payment';
import { trackingView } from '../services/shipment';
import type { AppEnv, Ctx } from '../types';
import { flagsOf, readBody } from './_shared';

/**
 * Checkout. Every amount is recomputed here from D1 + live provider quotes:
 * the client only ever sends an address id, a shipping option id and a coupon code.
 * Payment confirmation only ever comes from the verified Duitku callback or a
 * server-side transaction-status call — never from the return URL.
 */

export const checkoutRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /* ---------------------------------- quote --------------------------------- */
  .post('/quote', limit({ max: 30, scope: 'checkout-quote' }), async (c) => {
    const actor = await mustActor(c);
    const input = await readBody(c, schemas.quoteSchema);
    const f = flagsOf(c);
    const quote = await buildQuote(c.env, f, actor, {
      addressId: input.addressId,
      shippingOptionId: input.shippingOptionId,
      couponCode: input.couponCode ?? null,
      customerNote: input.customerNote ?? null,
      strict: false,
    });
    return c.json({
      quote,
      ready: Boolean(input.addressId && input.shippingOptionId) && quote.issues.length === 0,
      paymentAvailable: f.duitku.configured,
    });
  })

  /* ------------------------------- place order ------------------------------ */
  .post('/', limit({ max: 8, windowSeconds: 60, scope: 'checkout-place' }), async (c) => {
    const actor = await mustActor(c);
    const input = await readBody(c, schemas.checkoutSchema);
    const f = flagsOf(c);
    // A guest basket carried over from before sign-in is folded in first.
    if (input.guestToken) {
      await mergeGuestCart(c.env.DB, actor.userId, input.guestToken);
      const merged = await resolveCartId(c.env.DB, actor.userId, null);
      if (merged) actor.cartId = merged;
    }
    const result = await placeOrder(c.env, f, actor, input, f.appUrl);
    c.executionCtx.waitUntil(
      notifyUser(c.env, f, { userId: actor.userId, kind: 'order_created', orderId: result.order.id }).catch(
        () => undefined,
      ),
    );
    return c.json(result, result.reused ? 200 : 201);
  })

  /* ---------------------------- result / status view ------------------------ */
  .get('/status/:code', async (c) => {
    const { order } = await ownedOrder(c);
    const orderId = str(order.id);
    const payment = await paymentForOrder(c.env.DB, orderId);
    const shipment = await trackingView(c.env.DB, orderId);
    return c.json({
      code: str(order.code),
      status: str(order.status),
      paymentStatus: optStr(order.payment_status),
      shippingStatus: optStr(order.shipping_status),
      grandTotal: num(order.grand_total),
      expiresAt: optStr(order.expires_at),
      paymentUrl: optStr(payment?.payment_url),
      vaNumber: optStr(payment?.va_number),
      qrString: optStr(payment?.qr_string),
      paymentMethod: optStr(payment?.channel_code),
      // Human-readable channel name ("BCA Virtual Account") as returned by Duitku.
      paymentMethodName: optStr(payment?.method),
      paymentReference: optStr(payment?.reference),
      // Why the gateway refused the payment (only meaningful while no VA / link exists).
      paymentMessage: optStr(payment?.result_message),
      gatewayConfigured: flagsOf(c).duitku.configured,
      shipment,
      paidAt: optStr(payment?.paid_at),
    });
  })

  /* ----------------------- explicit server-side re-check -------------------- */
  .post('/status/:code/recheck', limit({ max: 10, scope: 'payment-recheck' }), async (c) => {
    const { order } = await ownedOrder(c);
    const f = flagsOf(c);
    if (!f.duitku.configured) {
      return c.json({
        status: optStr(order.payment_status) ?? PAYMENT_STATUS.PENDING,
        changed: false,
        message: 'Gateway pembayaran belum dikonfigurasi administrator.',
      });
    }
    const outcome = await recheckPayment(c.env, f, str(order.id));
    c.executionCtx.waitUntil(
      outcome.changed && outcome.status === PAYMENT_STATUS.PAID
        ? notifyUser(c.env, f, { userId: str(order.user_id), kind: 'payment_success', orderId: str(order.id) }).catch(
            () => undefined,
          )
        : Promise.resolve(),
    );
    return c.json(outcome);
  })

  /* ------------------------------ payment retry ----------------------------- */
  .post('/payment/retry', limit({ max: 5, scope: 'payment-retry' }), async (c) => {
    const user = currentUser(c);
    const f = flagsOf(c);
    const input = await readBody(c, paymentRetrySchema);
    const order = await findOrderRow(c.env.DB, input.code);
    if (!order) throw notFound('Pesanan tidak ditemukan');
    if (str(order.user_id) !== user.id) throw forbidden('Pesanan ini bukan milik Anda');
    // retryPayment re-checks the status and never lowers the stored grand total.
    if (str(order.status) !== 'pending_payment') throw badRequest('Pesanan tidak lagi menunggu pembayaran');
    if (num(order.grand_total) <= 0) throw badRequest('Pesanan tidak dapat dibayar ulang');
    const actor: CheckoutActor = {
      userId: user.id,
      cartId: '',
      email: user.email,
      name: user.displayName,
      phone: user.phone,
    };
    const payment = await retryPayment(c.env, f, actor, str(order.id), input.channelCode, f.appUrl);
    return c.json({ payment } satisfies { payment: PlaceOrderResult['payment'] }, 201);
  });

/* --------------------------------- helpers -------------------------------- */

/** Retrying a payment only needs the order code plus a channel the shopper picked. */
const paymentRetrySchema = z.object({
  code: z.string().trim().min(4).max(24),
  channelCode: z.string().trim().min(1).max(40),
});

type OwnedOrder = { order: Row };

async function ownedOrder(c: Ctx): Promise<OwnedOrder> {
  const user = currentUser(c);
  const code = c.req.param('code');
  if (!code) throw badRequest('Kode pesanan wajib diisi');
  const order = await findOrderRow(c.env.DB, code.trim().toUpperCase());
  if (!order) throw notFound('Pesanan tidak ditemukan');
  if (str(order.user_id) !== user.id) throw new AppError(ERROR_CODES.FORBIDDEN, 'Pesanan ini bukan milik Anda', 403);
  return { order };
}

/** Cart + identity for the current shopper. Checkout requires a signed-in account. */
async function mustActor(c: Ctx): Promise<CheckoutActor> {
  const user = currentUser(c);
  const cartId = await resolveCartId(c.env.DB, user.id, null);
  if (!cartId) throw badRequest('Keranjang belum tersedia');
  return { userId: user.id, cartId, email: user.email, name: user.displayName, phone: user.phone };
}
