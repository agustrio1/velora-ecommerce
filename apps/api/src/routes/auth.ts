import { ERROR_CODES } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { verifyFirebaseIdToken } from '../auth/firebase';
import { flags } from '../env';
import { AppError } from '../lib/errors';
import {
  clearSessionCookie,
  readSessionCookie,
  sessionCookie,
  signSessionToken,
  verifySessionToken,
} from '../lib/session';
import { type UserRecord, ensureUser, findUserByFirebaseUid } from '../services/identity';
import type { AppEnv } from '../types';
import { readBody } from './_shared';

/**
 * Session bootstrap for SSR.
 *
 * The client signs in with the Firebase SDK (which yields an ID token), then
 * exchanges that token here for an HttpOnly cookie. SSR loaders read the cookie
 * to resolve the visitor server-side; the SDK token is still used for API
 * mutations. The cookie is never a Firebase credential.
 */

const idTokenSchema = z.object({ idToken: z.string().min(20).max(8192) });

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    roles: user.roles,
    createdAt: user.createdAt,
  };
}

export const authRoutes = new Hono<AppEnv>()
  /* Exchange a verified Firebase ID token for an HttpOnly session cookie. */
  .post('/session', async (c) => {
    const { idToken } = await readBody(c, idTokenSchema);
    const f = flags(c.env);
    const identity = await verifyFirebaseIdToken(idToken, {
      projectId: f.firebase.projectId ?? '',
      allowUnverified: !f.firebase.projectId && !f.isProduction,
    });
    const user = await ensureUser(c.env.DB, identity);
    if (user.status === 'disabled') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Akun Anda dinonaktifkan', 403);
    }
    // Keep the Firebase UID and the D1 mirror in sync before signing.
    const token = await signSessionToken(
      { uid: user.firebaseUid, email: user.email, roles: user.roles, displayName: user.displayName },
      c.env,
    );
    if (!token) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'SESSION_SECRET belum diatur di server', 500);
    }
    c.header('Set-Cookie', sessionCookie(token, f.isProduction));
    return c.json({ user: publicUser(user) });
  })

  /* Read the current session from the cookie — used to hydrate the client. */
  .get('/session', async (c) => {
    const token = readSessionCookie(c.req.header('cookie'));
    if (!token) return c.json({ user: null });
    const payload = await verifySessionToken(token, c.env);
    if (!payload) return c.json({ user: null });
    const user = await findUserByFirebaseUid(c.env.DB, payload.uid);
    if (!user || user.status === 'disabled') return c.json({ user: null });
    return c.json({ user: publicUser(user) });
  })

  /* Logout: clear the cookie. */
  .delete('/session', async (c) => {
    c.header('Set-Cookie', clearSessionCookie(flags(c.env).isProduction));
    return c.json({ ok: true });
  });
