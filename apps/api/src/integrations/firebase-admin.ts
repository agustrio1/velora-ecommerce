/**
 * Firebase server-side integration WITHOUT the Admin SDK.
 *
 * The Admin SDK pulls in Node-only modules (fs, http2, grpc) which do not belong in
 * a Cloudflare Worker, so we speak the documented REST/OAuth protocols directly with
 * Web APIs: a service-account JWT (RS256) exchanged for an OAuth2 access token.
 *
 *   - Cloud Messaging HTTP v1  : POST https://fcm.googleapis.com/v1/projects/{p}/messages:send
 *   - Realtime Database REST   : https://{p}.firebaseio.com/{path}.json?access_token=...
 *
 * Everything degrades to "skipped" when the service account is absent so local
 * development never fakes a successful send.
 */
import { SignJWT, importPKCS8 } from 'jose';
import { type Env, type RuntimeFlags, flags } from '../env';
import { logIntegration, logger } from '../lib/log';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const RTDB_SCOPE = 'https://www.googleapis.com/auth/firebase.database';

interface CachedToken {
  access_token: string;
  expires_at: number;
}

/** One token per scope, cached in-process (Workers isolates are long lived enough). */
const tokenCache = new Map<string, CachedToken>();

async function serviceAccountToken(env: Env, f: RuntimeFlags, scope: string): Promise<string | null> {
  const { clientEmail, privateKey } = f.firebase;
  if (!clientEmail || !privateKey) return null;
  const key = `${clientEmail}|${scope}`;
  const hit = tokenCache.get(key);
  if (hit && hit.expires_at > Date.now() + 60_000) return hit.access_token;

  const now = Math.floor(Date.now() / 1000);
  let assertion: string;
  try {
    const pkcs8 = await importPKCS8(privateKey, 'RS256');
    assertion = await new SignJWT({ scope, iss: clientEmail, sub: clientEmail, aud: GOOGLE_TOKEN_URL })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(pkcs8);
  } catch (e) {
    // A malformed key (wrong PEM, truncated secret) must degrade to "skipped",
    // never bubble out of the request as an unhandled 500.
    const message = e instanceof Error ? e.message : String(e);
    logger(env).warn('Firebase service account key unusable', { error: message });
    await logIntegration(env.DB, {
      provider: 'firebase',
      endpoint: 'oauth2/token',
      success: false,
      statusCode: 0,
      message: `Kunci service account tidak valid: ${message}`,
      payload: { scope },
    });
    return null;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.access_token) {
    await logIntegration(env.DB, {
      provider: 'firebase',
      endpoint: 'oauth2/token',
      success: false,
      statusCode: res.status,
      message: String(json.error_description ?? json.error ?? 'Token gagal'),
      payload: { scope },
    });
    return null;
  }
  const token = String(json.access_token);
  tokenCache.set(key, { access_token: token, expires_at: Date.now() + Number(json.expires_in ?? 3600) * 1000 });
  return token;
}

/* --------------------------------- FCM v1 --------------------------------- */

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Deep link opened when the notification is clicked. */
  link?: string | null;
  image?: string | null;
  tag?: string | null;
}

export interface PushResult {
  attempted: number;
  sent: number;
  failed: number;
  invalidTokens: string[];
  skipped: boolean;
}

/**
 * Sends one message per registration token (FCM HTTP v1 has no multicast endpoint).
 * Tokens that answer UNREGISTERED are returned so the caller can prune them.
 */
export async function sendPush(env: Env, tokens: string[], payload: PushPayload): Promise<PushResult> {
  const f = flags(env);
  const projectId = f.firebase.projectId;
  if (!projectId || !tokens.length) {
    return { attempted: tokens.length, sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }
  const token = await serviceAccountToken(env, f, FCM_SCOPE);
  if (!token) return { attempted: tokens.length, sent: 0, failed: 0, invalidTokens: [], skipped: true };

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];
  for (const registrationToken of tokens) {
    const body = {
      message: {
        token: registrationToken,
        notification: { title: payload.title, body: payload.body, image: payload.image ?? undefined },
        data: payload.data ?? {},
        webpush: {
          headers: { Urgency: 'normal', TTL: '3600' },
          notification: {
            title: payload.title,
            body: payload.body,
            tag: payload.tag ?? undefined,
            click_action: payload.link ?? undefined,
          },
          fcm_options: { link: payload.link ?? '/' },
        },
      },
    };
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        sent += 1;
      } else {
        failed += 1;
        const text = await res.text().catch(() => '');
        if (/UNREGISTERED|NOT_REGISTERED/i.test(text)) invalidTokens.push(registrationToken);
        await logIntegration(env.DB, {
          provider: 'firebase',
          endpoint: 'fcm/messages:send',
          reference: registrationToken.slice(0, 24),
          statusCode: res.status,
          success: false,
          message: text.slice(0, 400),
          payload: { title: payload.title },
        });
      }
    } catch (e) {
      failed += 1;
      logger(env).warn('FCM send error', { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { attempted: tokens.length, sent, failed, invalidTokens, skipped: false };
}

/* ---------------------------- Realtime Database ---------------------------- */

export type RtdbVerb = 'GET' | 'PUT' | 'PATCH' | 'DELETE';

export async function rtdbRequest<T = unknown>(
  env: Env,
  verb: RtdbVerb,
  path: string,
  value?: unknown,
): Promise<{ ok: boolean; data: T | null; status: number; error: string | null }> {
  const f = flags(env);
  if (!f.firebase.projectId || !f.firebase.databaseUrl) {
    return { ok: false, data: null, status: 0, error: 'Firebase project belum dikonfigurasi' };
  }
  const token = await serviceAccountToken(env, f, RTDB_SCOPE);
  if (!token) return { ok: false, data: null, status: 0, error: 'Service account token tidak tersedia' };
  const url = `${f.firebase.databaseUrl}/${path.replace(/^\/+/, '')}.json?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      method: verb,
      headers: { 'Content-Type': 'application/json' },
      body: verb === 'PUT' || verb === 'PATCH' ? JSON.stringify(value ?? null) : undefined,
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : null;
    return { ok: res.ok, data, status: res.status, error: res.ok ? null : text.slice(0, 300) };
  } catch (e) {
    return { ok: false, data: null, status: 0, error: e instanceof Error ? e.message : 'RTDB request gagal' };
  }
}
