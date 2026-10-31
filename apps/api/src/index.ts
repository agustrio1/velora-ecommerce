import { ERROR_CODES, ValidationDetailError } from '@velora/shared';
import { Hono } from 'hono';
import { flags } from './env';
import { isAppError } from './lib/errors';
import { logger } from './lib/log';
import { resolveSession } from './mw/auth';
import { buildCors, csrfGuard, requestId, securityHeaders } from './mw/security';
import { accountRoutes } from './routes/account';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { cartRoutes, wishlistRoutes } from './routes/cart';
import { checkoutRoutes } from './routes/checkout';
import { mediaAdminRoutes, mediaRoutes } from './routes/media';
import { seoDataRoutes, seoRoutes } from './routes/seo';
import { storefront } from './routes/storefront';
import { webhookRoutes } from './routes/webhooks';
import type { AppEnv } from './types';

/**
 * One Worker serves the JSON API, the media gateway and the SEO endpoints; React
 * Router renders the storefront. Middleware order matters:
 *   request id → runtime flags → CORS → hardening headers → session → CSRF → routes.
 * `flags` is resolved before CORS so the allow list and HSTS/CSP decisions never
 * depend on anything the browser sent.
 */
const app = new Hono<AppEnv>();

app.use('*', requestId);

app.use('*', async (c, next) => {
  c.set('flags', flags(c.env));
  await next();
});

app.use('*', async (c, next) => {
  const f = c.get('flags');
  return buildCors(f.env, c.env.CORS_ALLOWED_ORIGINS)(c, next);
});

app.use('*', securityHeaders);

/** Identity is only resolved for the API: static assets and provider callbacks never need it. */
app.use('/api/*', resolveSession);
app.use('/api/*', csrfGuard);

/* --------------------------------- routes -------------------------------- */

app.route('/api/auth', authRoutes);
app.route('/api', storefront);
app.route('/api/cart', cartRoutes);
app.route('/api/wishlist', wishlistRoutes);
app.route('/api/checkout', checkoutRoutes);
app.route('/api/account', accountRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/media', mediaAdminRoutes);
app.route('/api/schema', seoDataRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/media', mediaRoutes);
app.route('/', seoRoutes);

/* ------------------------------ error surface ----------------------------- */

app.notFound((c) =>
  c.json(
    { error: { code: ERROR_CODES.NOT_FOUND, message: 'Endpoint tidak ditemukan', requestId: c.get('requestId') } },
    404,
  ),
);

app.onError((err, c) => {
  const requestId = c.get('requestId');
  const log = logger(c.env);

  if (err instanceof ValidationDetailError) {
    return c.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Data yang dikirim tidak valid',
          details: { fieldErrors: err.fieldErrors, formErrors: err.formErrors },
          requestId,
        },
      },
      422,
    );
  }

  if (isAppError(err)) {
    if (err.status >= 500) log.error(err.message, { code: err.code, requestId, path: c.req.path });
    // Built as a raw Response because the status comes from the AppError at runtime,
    // not from a literal the framework can narrow.
    return new Response(
      JSON.stringify({ error: { code: err.code, message: err.message, details: err.details ?? null, requestId } }),
      {
        status: err.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          ...(err.headers ?? {}),
        },
      },
    );
  }

  log.error('unhandled error', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    requestId,
    path: c.req.path,
  });
  return c.json(
    { error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Terjadi kesalahan pada server', requestId } },
    500,
  );
});

/* ------------------------------- page routes ------------------------------- */

/**
 * React Router owns every non-API path (see `apps/web/workers/app.ts`), so a
 * request that reaches Hono without matching a route above is a bad URL — answer
 * it as data instead of serving HTML that a browser would try to parse as JSON.
 */
app.get('*', (c) =>
  c.json(
    { error: { code: ERROR_CODES.NOT_FOUND, message: 'Endpoint tidak ditemukan', requestId: c.get('requestId') } },
    404,
  ),
);

export default app;
