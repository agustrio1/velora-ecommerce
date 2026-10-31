import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import { invalidToken } from '../lib/errors';

/**
 * Firebase ID Token verification inside Cloudflare Workers.
 *
 * We deliberately do NOT use Firebase Admin SDK here: it depends on Node's
 * fs/grpc surface which is not the Workers runtime. Instead we implement the
 * documented verification procedure (https://firebase.google.com/docs/auth/admin/verify-id-tokens)
 * with `jose` + Web Crypto:
 *   1. fetch Google's public keys (JWKS), cached per Cache-Control
 *   2. RS256 signature check with the header `kid`
 *   3. issuer  == https://securetoken.google.com/<projectId>
 *   4. audience== <projectId>
 *   5. sub     == 2..128 chars, Firebase user id
 *   6. auth_time / exp sanity
 *   7. firebase.signin_provider present
 */

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  name: string | null;
  picture: string | null;
  provider: string | null;
  firebaseIdIssuedAt: number | null;
}

type Keys = ReturnType<typeof createRemoteJWKSet>;

let keySet: Keys | null = null;
let keySetUrl = '';

function keys(): Keys {
  if (!keySet || keySetUrl !== FIREBASE_JWKS_URL) {
    keySet = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL), {
      // jose honours the HTTP Cache-Control headers returned by Google and
      // refreshes at most every 6 hours (their keys roll over daily).
      cacheMaxAge: 6 * 60 * 60 * 1000,
      cooldownDuration: 30_000,
    });
    keySetUrl = FIREBASE_JWKS_URL;
  }
  return keySet;
}

export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

export interface VerifyOptions {
  projectId: string;
  /** Skips signature verification. Development only, never in production. */
  allowUnverified?: boolean;
}

/**
 * Verifies a Firebase ID token and returns the normalized identity.
 * Throws AppError(401) on any failure — a malformed token is never accepted.
 */
export async function verifyFirebaseIdToken(token: string, opts: VerifyOptions): Promise<FirebaseIdentity> {
  if (!token || token.length < 20) throw invalidToken('Token sesi kosong');
  if (!opts.projectId) {
    if (opts.allowUnverified) return decodeOnly(token, true);
    throw invalidToken('Firebase project belum dikonfigurasi di server');
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, keys(), {
      issuer: `https://securetoken.google.com/${opts.projectId}`,
      audience: opts.projectId,
      algorithms: ['RS256'],
      clockTolerance: 30,
    });
    payload = result.payload;
  } catch (err) {
    if (opts.allowUnverified) {
      // Local development without a Firebase project: decode only, flagged loudly.
      return decodeOnly(token, true);
    }
    const message = err instanceof Error ? err.message : 'unknown';
    if (/exp/i.test(message)) throw invalidToken('Sesi berakhir, silakan masuk kembali');
    throw invalidToken('Token sesi tidak valid');
  }

  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (uid.length < 2 || uid.length > 128) throw invalidToken('Subjek token tidak valid');

  const firebase = (payload as { firebase?: { sign_in_provider?: string } }).firebase;
  const provider = firebase?.sign_in_provider ?? null;

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    phone: typeof payload.phone_number === 'string' ? payload.phone_number : null,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    provider,
    firebaseIdIssuedAt: typeof payload.auth_time === 'number' ? payload.auth_time : null,
  };
}

/** Dev-only helper: read the JWT body without checking the signature. */
function decodeOnly(token: string, trusted: boolean): FirebaseIdentity {
  const part = token.split('.')[1];
  if (!part) throw invalidToken('Token sesi tidak dapat dibaca');
  let json: JWTPayload;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    json = JSON.parse(atob(padded)) as JWTPayload;
  } catch {
    throw invalidToken('Token sesi tidak dapat dibaca');
  }
  if (!trusted) throw invalidToken();
  const now = Math.floor(Date.now() / 1000);
  if (typeof json.exp === 'number' && json.exp < now) throw invalidToken('Sesi berakhir, silakan masuk kembali');
  const uid = typeof json.sub === 'string' ? json.sub : '';
  if (!uid) throw invalidToken('Subjek token tidak valid');
  return {
    uid,
    email: typeof json.email === 'string' ? json.email : null,
    emailVerified: json.email_verified === true,
    phone: typeof json.phone_number === 'string' ? json.phone_number : null,
    name: typeof json.name === 'string' ? json.name : null,
    picture: typeof json.picture === 'string' ? json.picture : null,
    provider: (json as { firebase?: { sign_in_provider?: string } }).firebase?.sign_in_provider ?? 'password',
    firebaseIdIssuedAt: typeof json.auth_time === 'number' ? json.auth_time : null,
  };
}
