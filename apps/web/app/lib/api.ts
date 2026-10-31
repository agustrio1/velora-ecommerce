import { type ApiErrorBody, ERROR_CODES } from '@velora/shared';
import { config, firebaseConfigured } from './config';
import { readGuestToken } from './guestCart';

/**
 * Thin typed fetch wrapper for the VELORA Worker.
 *
 * Identity is supplied out-of-band: the auth layer registers an ID-token
 * provider here so every request carries `Authorization: Bearer <firebase id
 * token>` when signed in, plus the guest basket key. The server re-verifies all
 * of it; the client never asserts its own role.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field-level messages produced by the API's Zod validation. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;

export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

/**
 * On first load the Firebase session is restored asynchronously, so a request
 * fired during hydration can go out without a token and get a 401. When that
 * happens we wait (briefly) for the token and retry once.
 */
const TOKEN_WAIT_MS = 2500;
const TOKEN_POLL_MS = 150;

async function waitForToken(): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < TOKEN_WAIT_MS) {
    const token = await tokenProvider();
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
  }
  return null;
}

/**
 * Endpoints that only ever answer signed-in customers. For these we wait for the
 * Firebase session to be restored *before* the first request, instead of sending
 * a request that is guaranteed to 401 and retrying it (the browser prints every
 * 401 as a red console error even when the retry succeeds).
 */
const AUTH_ONLY_PREFIXES = ['/account'];

function requiresAuth(path: string): boolean {
  return AUTH_ONLY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export type Query = Record<string, string | number | boolean | null | undefined | string[]>;

function buildUrl(path: string, query?: Query): string {
  const base = config.apiBase || '';
  const url = new URL(
    `${base}/api${path}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length) url.searchParams.set(key, value.join(','));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Skip attaching the guest basket header (e.g. admin calls). */
  anonymous?: boolean;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const STATUS_FALLBACK: Record<number, { code: string; message: string }> = {
  401: { code: ERROR_CODES.UNAUTHENTICATED, message: 'Sesi Anda sudah berakhir. Silakan masuk kembali.' },
  403: { code: ERROR_CODES.FORBIDDEN, message: 'Anda tidak punya akses ke tindakan ini.' },
  404: { code: ERROR_CODES.NOT_FOUND, message: 'Data yang diminta tidak ditemukan.' },
  429: { code: ERROR_CODES.RATE_LIMITED, message: 'Terlalu banyak permintaan, coba lagi beberapa saat.' },
};

/**
 * The Worker always answers with `{ error: { code, message, details } }`, but a
 * crashed isolate or an edge proxy can return plain text or a bare
 * `{ error: "404 Not Found" }`. Without this fallback the raw body would be shown
 * verbatim in a toast, so pick something readable that matches the status code.
 */
function failure(
  status: number,
  data: unknown,
): { code: string; message: string; details?: Record<string, unknown>; requestId?: string } {
  const envelope = (data as Partial<ApiErrorBody> | null)?.error;
  if (envelope && typeof envelope === 'object' && typeof envelope.message === 'string') {
    return {
      code: envelope.code ?? ERROR_CODES.INTERNAL_ERROR,
      message: envelope.message,
      details: envelope.details as Record<string, unknown> | undefined,
      requestId: envelope.requestId,
    };
  }
  const known = STATUS_FALLBACK[status];
  if (known) return known;
  return status >= 500
    ? { code: ERROR_CODES.UPSTREAM_UNAVAILABLE, message: 'Server sedang bermasalah. Coba lagi sebentar.' }
    : { code: ERROR_CODES.INTERNAL_ERROR, message: 'Permintaan gagal. Coba lagi.' };
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);

  // Bodyless mutations still send `{}`: the API's CSRF guard accepts a mutation
  // only with a JSON content type or an Authorization header, and an anonymous
  // visitor (e.g. POST /cart/session) has neither.
  const requestBody = options.body === undefined && MUTATION_METHODS.has(method) ? {} : options.body;
  const payload: string | undefined = requestBody !== undefined ? JSON.stringify(requestBody) : undefined;

  async function send(token: string | null): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (!options.anonymous) {
      const guest = readGuestToken();
      if (guest) headers['x-guest-cart'] = guest;
    }
    if (payload !== undefined) headers['content-type'] = 'application/json';

    try {
      return await fetch(url, { method, headers, body: payload });
    } catch {
      throw new ApiError(ERROR_CODES.UPSTREAM_UNAVAILABLE, 'Koneksi ke server terputus. Coba lagi.', 0);
    }
  }

  const canWaitForToken = firebaseConfigured && typeof window !== 'undefined';

  let token = await tokenProvider();
  let waited = false;

  // Signed-in-only endpoints: hold the first request until the Firebase session
  // has been restored, so we never send a request that is certain to 401.
  if (!token && canWaitForToken && requiresAuth(path)) {
    token = await waitForToken();
    waited = true;
  }

  let res = await send(token);

  // Any other endpoint that still 401s because the token wasn't ready yet →
  // wait for it and retry once.
  if (res.status === 401 && !token && !waited && canWaitForToken) {
    const lateToken = await waitForToken();
    if (lateToken) res = await send(lateToken);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = failure(res.status, data);
    throw new ApiError(err.code, err.message, res.status, err.details, err.requestId);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, query?: Query, opts?: Partial<RequestOptions>) => request<T>('GET', path, { query, ...opts }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body, query }),
  put: <T>(path: string, body?: unknown, query?: Query) => request<T>('PUT', path, { body, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) => request<T>('PATCH', path, { body, query }),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, { query }),
  /** Multipart upload; the Worker validates the file and stores it in R2. */
  upload: <T>(path: string, form: FormData) => {
    const url = buildUrl(path);
    return tokenProvider().then(async (token) => {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(url, { method: 'POST', headers, body: form });
      const text = await res.text();
      const data = text ? safeJson(text) : null;
      if (!res.ok) {
        const err = failure(res.status, data);
        throw new ApiError(err.code, err.message, res.status, err.details, err.requestId);
      }
      return data as T;
    });
  },
};
