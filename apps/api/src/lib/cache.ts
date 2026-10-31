import { RATE_LIMIT } from '@velora/shared';
import type { Env } from '../env';

/**
 * Two tier cache: isolate-local Map (free, sub-millisecond) backed by Workers KV
 * for cross-instance reuse. Used for Firebase JWKS, Duitku payment methods and
 * Biteship rate responses so we never hammer third party APIs.
 */

interface Entry {
  value: string;
  expiresAt: number;
}

const local = new Map<string, Entry>();
const LOCAL_MAX = 500;

function localGet(key: string): string | null {
  const hit = local.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    local.delete(key);
    return null;
  }
  return hit.value;
}

function localSet(key: string, value: string, ttlSeconds: number): void {
  if (local.size >= LOCAL_MAX) {
    const firstKey = local.keys().next().value;
    if (firstKey) local.delete(firstKey);
  }
  local.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function cacheGet<T>(c: Env, key: string, parse = true): Promise<T | null> {
  const raw = localGet(key);
  if (raw !== null) return parse ? (JSON.parse(raw) as T) : (raw as unknown as T);
  try {
    const fromKv = await c.VELORA_CACHE.get(key, 'text');
    if (fromKv) {
      localSet(key, fromKv, 30);
      return parse ? (JSON.parse(fromKv) as T) : (fromKv as unknown as T);
    }
  } catch {
    /* KV unavailable -> miss */
  }
  return null;
}

export async function cacheSet(
  c: Env,
  key: string,
  value: unknown,
  ttlSeconds: number,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<void> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  localSet(key, serialized, Math.min(ttlSeconds, 300));
  const task = c.VELORA_CACHE.put(key, serialized, { expirationTtl: Math.max(60, ttlSeconds) }).catch(() => undefined);
  if (waitUntil) waitUntil(task);
  else await task;
}

export async function cached<T>(
  c: Env,
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<T> {
  const hit = await cacheGet<T>(c, key);
  if (hit !== null && hit !== undefined) return hit;
  const fresh = await producer();
  if (fresh !== undefined) await cacheSet(c, key, fresh, ttlSeconds, waitUntil);
  return fresh;
}

export async function cacheDelete(c: Env, key: string): Promise<void> {
  local.delete(key);
  try {
    await c.VELORA_CACHE.delete(key);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ rate limiting ------------------------------ */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Fixed-window limiter. The isolate window is authoritative for burst traffic;
 * KV mirrors it so a warm tenant cannot simply hop between isolates.
 */
export async function rateLimit(
  c: Env,
  identity: string,
  max: number,
  windowSeconds: number = RATE_LIMIT.windowSeconds as number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = `rl:${identity}`;
  const localHit = buckets.get(key);
  let bucket: Bucket =
    localHit && localHit.resetAt > now ? localHit : { count: 0, resetAt: now + windowSeconds * 1000 };

  if (localHit && localHit.resetAt > now) {
    localHit.count += 1;
    bucket = localHit;
  } else {
    const stored = await cacheGet<Bucket>(c, `kv:${key}`, true);
    if (stored && stored.resetAt > now) {
      stored.count += 1;
      bucket = stored;
    } else {
      bucket = { count: 1, resetAt: now + windowSeconds * 1000 };
    }
    buckets.set(key, bucket);
    void cacheSet(c, `kv:${key}`, bucket, windowSeconds + 5);
  }

  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    ok: bucket.count <= max,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    resetSeconds,
  };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
