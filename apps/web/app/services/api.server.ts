import type { Env } from '../../../api/src/env';
import honoApp from '../../../api/src/index';

/**
 * Call the Hono API in-process from a loader.
 *
 * There is no network hop: the same isolate handles the synthetic request via
 * `honoApp.fetch`, so loaders reuse the exact service logic the browser hits,
 * including caching, media URL signing and error shaping.
 */
export interface InternalApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Forward the visitor cookie so optional-auth endpoints see the session. */
  cookie?: string | null;
}

const NOOP_CTX = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

export async function internalApi<T>(path: string, env: Env, opts: InternalApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;

  const response = await honoApp.fetch(
    new Request(`http://internal${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
    env,
    NOOP_CTX,
  );

  if (!response.ok) {
    throw new Error(`Internal API ${opts.method ?? 'GET'} ${path} → ${response.status}`);
  }
  return (await response.json()) as T;
}
