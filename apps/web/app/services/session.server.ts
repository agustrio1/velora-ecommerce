/**
 * SSR session helpers. Re-exports the single cookie implementation from the API
 * so loaders and the `/api/auth/session` route always agree on the format.
 */
import { redirect } from 'react-router';
import type { Env } from '../../../api/src/env';
import { type SessionPayload, readSessionCookie, verifySessionToken } from '../../../api/src/lib/session';

export type SessionUser = SessionPayload;

/** Read and verify the signed session cookie. Returns null when signed out. */
export async function getSession(request: Request, env: Env): Promise<SessionUser | null> {
  const token = readSessionCookie(request.headers.get('cookie'));
  if (!token) return null;
  return verifySessionToken(token, env);
}

/**
 * Guard a customer-only loader. Signed-out visitors are bounced to `/masuk` and
 * sent back to where they were headed after signing in.
 */
export async function requireSession(request: Request, env: Env): Promise<SessionUser> {
  const session = await getSession(request, env);
  if (!session) {
    const url = new URL(request.url);
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    throw redirect(`/masuk?next=${next}`);
  }
  return session;
}
