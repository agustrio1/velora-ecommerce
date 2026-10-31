import { ERROR_CODES, type NotificationPrefs, ROLE_CODE } from '@velora/shared';
import type { Next } from 'hono';
import { extractBearer, verifyFirebaseIdToken } from '../auth/firebase';
import { flags } from '../env';
import { clientIp, rateLimit } from '../lib/cache';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { getNotificationPrefs } from '../services/identity';
import { type UserRecord, ensureUser } from '../services/identity';
import type { Ctx } from '../types';

/** Establishes request identity from a Firebase ID token. Never trusts the client role. */
export async function resolveSession(c: Ctx, next: Next) {
  const f = flags(c.env);
  c.set('flags', f);
  c.set('authenticated', false);
  c.set('user', null);
  c.set('prefs', null);

  const token = extractBearer(c.req.header('authorization'));
  if (token) {
    const identity = await verifyFirebaseIdToken(token, {
      projectId: f.firebase.projectId ?? '',
      // Offline development convenience: without a project id we can't reach
      // Google's JWKS, so decoding is allowed and clearly reported.
      allowUnverified: !f.firebase.projectId && !f.isProduction,
    });
    const user = await ensureUser(c.env.DB, identity);
    if (user.status === 'disabled') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Akun Anda dinonaktifkan', 403);
    }
    const prefs: NotificationPrefs = await getNotificationPrefs(c.env.DB, user.id);
    c.set('user', user);
    c.set('prefs', prefs);
    c.set('authenticated', true);
  }
  await next();
}

export function currentUser(c: Ctx): UserRecord {
  const user = c.get('user');
  if (!user) throw unauthorized();
  return user;
}

export function optionalUser(c: Ctx): UserRecord | null {
  return c.get('user') ?? null;
}

/** Route guard: requires a verified session. */
export async function requireAuth(c: Ctx, next: Next) {
  if (!c.get('authenticated')) throw unauthorized();
  await next();
}

/** Route guard: requires admin/super_admin — resolved from D1, not the token. */
export async function requireAdmin(c: Ctx, next: Next) {
  const user = c.get('user');
  if (!user) throw unauthorized();
  if (!user.roles.includes(ROLE_CODE.ADMIN) && !user.roles.includes(ROLE_CODE.SUPER_ADMIN)) {
    throw forbidden('Halaman ini khusus administrator');
  }
  await next();
}

/** Route guard: super admin only (settings, role management). */
export async function requireSuperAdmin(c: Ctx, next: Next) {
  const user = c.get('user');
  if (!user) throw unauthorized();
  if (!user.roles.includes(ROLE_CODE.SUPER_ADMIN)) {
    throw forbidden('Aksi ini membutuhkan hak super administrator');
  }
  await next();
}

/**
 * Guest carts are addressed by a bearer-less random token header. It is only a
 * cart key, never an identity, and is never used for authorization.
 */
export async function guestTokenBridge(c: Ctx, next: Next) {
  const header = c.req.header('x-guest-cart');
  c.set('guestToken', header && /^[a-zA-Z0-9_.-]{16,64}$/.test(header) ? header : null);
  await next();
}

export interface LimitOptions {
  max: number;
  windowSeconds?: number;
  scope?: string;
}

export function limit(opts: LimitOptions) {
  return async (c: Ctx, next: Next) => {
    const ip = clientIp(c.req.raw);
    const user = c.get('user');
    const identity = `${opts.scope ?? c.req.path}:${user?.id ?? ip}`;
    const result = await rateLimit(c.env, identity, opts.max, opts.windowSeconds);
    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    if (!result.ok) {
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        'Terlalu banyak permintaan, coba lagi dalam beberapa saat',
        429,
        { retryAfterSeconds: result.resetSeconds },
        { 'Retry-After': String(result.resetSeconds) },
      );
    }
    await next();
  };
}
