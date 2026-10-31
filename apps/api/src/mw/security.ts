import { ERROR_CODES } from '@velora/shared';
import type { Next } from 'hono';
import { cors } from 'hono/cors';
import { clientIp } from '../lib/cache';
import { AppError } from '../lib/errors';
import type { Ctx } from '../types';

/** Allowed browser origins. Production must list the real domain explicitly. */
export function buildCors(appEnv: string, allowed?: string) {
  const list = (allowed ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults =
    appEnv === 'production' ? [] : ['http://localhost:5173', 'http://localhost:8787', 'http://127.0.0.1:5173'];
  const allowList = [...new Set([...list, ...defaults])];
  const wildcard = appEnv !== 'production' && allowList.length === 0;

  return cors({
    origin: (origin) => {
      if (!origin) return null;
      if (wildcard) return origin;
      return allowList.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Guest-Cart', 'X-Requested-With', 'Accept'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Remaining', 'Retry-After', 'Link'],
    maxAge: 600,
    credentials: true,
  });
}

/** Baseline hardening headers for every response. */
export async function securityHeaders(c: Ctx, next: Next) {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  c.header('X-DNS-Prefetch-Control', 'off');
  const f = c.get('flags');
  if (f?.isProduction) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://identitytoolkit.googleapis.com wss://*.firebaseio.com; frame-src https://sandbox.duitku.com https://merchant.duitku.com https://www.google.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
  }
  await next();
}

export async function requestId(c: Ctx, next: Next) {
  const id = crypto.randomUUID();
  c.set('requestId', id);
  c.set('startedAt', Date.now());
  c.set('ip', clientIp(c.req.raw));
  c.header('X-Request-Id', id);
  await next();
}

/**
 * CSRF posture: this API authenticates with an `Authorization: Bearer`
 * header only (no ambient cookies), so a cross-site request can never carry
 * credentials. As defence in depth we also reject unsafe content types on
 * mutations: `application/x-www-form-urlencoded`, `text/plain` and missing
 * content types are exactly what a forged simple form/post can produce, and
 * they are forced through a CORS pre-flight by the allowed types (JSON,
 * multipart, presence of an Authorization header).
 * Provider callbacks under /webhooks/* are authenticated by signature instead.
 */
export async function csrfGuard(c: Ctx, next: Next) {
  const method = c.req.method;
  const unsafe = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  // The session bootstrap lives before a cookie exists, so it is exempt: the
  // POST already requires an explicit JSON body and the DELETE only clears a
  // cookie (a forced logout, never an account action).
  const exempt = c.req.path.startsWith('/webhooks/') || c.req.path.startsWith('/api/auth/session');
  if (unsafe && !exempt) {
    const contentType = (c.req.header('content-type') ?? '').toLowerCase();
    const bearer = Boolean(c.req.header('authorization'));
    const explicitBody = contentType.includes('application/json') || contentType.includes('multipart/form-data');
    if (!bearer && !explicitBody) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Permintaan ditolak: gunakan body JSON atau header otorisasi', 403);
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.startsWith('text/')) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Tipe konten tidak diizinkan', 403);
    }
  }
  await next();
}
