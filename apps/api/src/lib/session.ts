import type { Env } from '../env';

/**
 * HttpOnly session cookie for SSR.
 *
 * The cookie is `base64url(JSON payload) + "." + HMAC-SHA256(payload, SESSION_SECRET)`.
 * It carries only what a loader needs to know who is signed in (uid, email,
 * roles) — never a credential the client could reuse against Firebase. API
 * mutations keep using the `Authorization: Bearer` ID token, so this cookie is
 * read server-side by loaders and by the `/api/auth/session` bootstrap only.
 */
export interface SessionPayload {
  uid: string;
  email: string;
  roles: string[];
  displayName: string | null;
  exp: number;
}

export const SESSION_COOKIE = 'velora_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Create a signed session token, or null when SESSION_SECRET is not configured. */
export async function signSessionToken(user: Omit<SessionPayload, 'exp'>, env: Env): Promise<string | null> {
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  const payload: SessionPayload = { ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacHex(body, secret);
  return `${body}.${sig}`;
}

/** Verify a session token. Returns null when invalid, tampered or expired. */
export async function verifySessionToken(token: string, env: Env): Promise<SessionPayload | null> {
  const secret = env.SESSION_SECRET;
  if (!secret || !token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmacHex(body, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Extract the session token from a raw Cookie header. */
export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Build the Set-Cookie value that establishes the session. */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`;
}

/** Build the Set-Cookie value that clears the session. */
export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

/* ─── internal ─── */

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
