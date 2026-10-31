import { PAYMENT_STATUS } from '@velora/shared';
import { Hono } from 'hono';
import { type Row, first, str } from '../lib/db';
import { notifyUser } from '../services/notify';
import { type CallbackForm, handlePaymentCallback } from '../services/payment';
import { type BiteshipWebhookBody, handleBiteshipWebhook } from '../services/shipment';
import type { AppEnv, Ctx } from '../types';
import { flagsOf } from './_shared';

/**
 * Inbound provider callbacks.
 *
 * These routes are signature/authenticated, not session authenticated, so they are
 * mounted outside `/api` and excluded from the CSRF guard. Nothing here trusts the
 * payload: Duitku's callback is re-read through the transaction-status API and the
 * Biteship webhook is only a hint that triggers an authenticated `GET /v1/orders/:id`.
 * The Duitku *return* URL is never a payment signal — it is a plain SPA navigation.
 */

export const webhookRoutes = new Hono<AppEnv>()
  .post('/duitku/callback', async (c) => {
    const f = flagsOf(c);
    const form = await readCallbackForm(c);
    const result = await handlePaymentCallback(c.env, f, form, c.get('ip'));

    if (result.paymentStatus === PAYMENT_STATUS.PAID && result.orderId) {
      const userId = await orderOwner(c.env.DB, result.orderId);
      if (userId) {
        c.executionCtx.waitUntil(
          notifyUser(c.env, f, { userId, kind: 'payment_success', orderId: result.orderId }).catch(() => undefined),
        );
      }
    }

    // Duitku only needs an HTTP 2xx to stop retrying; the body is for our own logs.
    return c.json(
      {
        status_code: result.accepted ? '200' : '400',
        message: result.reason ?? (result.duplicate ? 'duplicate' : 'ok'),
      },
      result.accepted ? 200 : 400,
    );
  })

  .post('/biteship', async (c) => {
    const f = flagsOf(c);
    let body: BiteshipWebhookBody;
    try {
      body = (await c.req.json()) as BiteshipWebhookBody;
    } catch {
      body = {};
    }
    const outcome = await handleBiteshipWebhook(c.env, f, body, c.req.header('x-biteship-token'), c.get('ip'));
    if (!outcome.accepted && outcome.reason === 'INVALID_TOKEN') {
      return c.json({ message: 'invalid token' }, 401);
    }
    return c.json({ accepted: outcome.accepted, handled: outcome.handled, reason: outcome.reason });
  });

/* --------------------------------- helpers -------------------------------- */

/** Duitku posts `application/x-www-form-urlencoded`; JSON is accepted for sandbox tooling. */
async function readCallbackForm(c: Ctx): Promise<CallbackForm> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await c.req.json().catch(() => ({}))) as CallbackForm;
  }
  const form = await c.req.formData().catch(() => null);
  if (!form) return {};
  const pick = (key: string): string | undefined => {
    const v = form.get(key);
    return typeof v === 'string' ? v : undefined;
  };
  return {
    merchantCode: pick('merchant_code'),
    amount: pick('amount'),
    merchantOrderId: pick('merchant_order_id'),
    paymentCode: pick('payment_code'),
    resultCode: pick('result_code'),
    reference: pick('reference'),
    signature: pick('signature'),
    settlementDate: pick('settlement_date'),
    customerName: pick('customer_name'),
    publisherOrderId: pick('publisher_order_id'),
  };
}

async function orderOwner(db: D1Database, orderId: string): Promise<string | null> {
  const row = await first<Row>(db, `SELECT user_id FROM orders WHERE id = ?1`, [orderId]);
  return row ? str(row.user_id) : null;
}
