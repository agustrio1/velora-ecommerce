import { type CatalogQueryInput, PAGINATION, ValidationDetailError } from '@velora/shared';
import type { z } from 'zod';
import type { Env, RuntimeFlags } from '../env';
import { mediaUrl } from '../lib/media';
import type { CatalogFilters } from '../services/catalog';
import type { Ctx } from '../types';

/** Request helpers shared by every route module. */

export function mediaFor(env: Env): (key: string | null) => string | null {
  return (key) => mediaUrl(env, key);
}

/** Body parsing is always schema-validated; unknown fields are dropped, not trusted. */
export async function readBody<S extends z.ZodTypeAny>(c: Ctx, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => null);
  return parseWith(schema, raw ?? {});
}

export function readQuery<S extends z.ZodTypeAny>(c: Ctx, schema: S): z.infer<S> {
  return parseWith(schema, c.req.query());
}

/** `z.infer` keeps schema defaults, so the output type is fully populated. */
function parseWith<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flat = result.error.flatten();
    throw new ValidationDetailError(flat.fieldErrors, flat.formErrors);
  }
  return result.data as z.infer<S>;
}

/** Admin list endpoints may ask for more rows than the storefront. */
export function adminPaging(c: Ctx): { page: number; pageSize: number } {
  const page = intField(c.req.query('page'), 1, 1, 1000);
  const pageSize = intField(c.req.query('pageSize'), PAGINATION.adminPageSize, 1, PAGINATION.maxAdminPageSize);
  return { page, pageSize };
}

export function intField(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Comma separated id list; empty entries are dropped. */
export function idList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => /^[A-Za-z0-9_-]{1,64}$/.test(v));
  return values.length ? Array.from(new Set(values)).slice(0, 40) : undefined;
}

export function toFilters(q: CatalogQueryInput, requestedSort?: string): CatalogFilters {
  return {
    q: q.q || undefined,
    categorySlug: q.category || undefined,
    brandSlug: q.brand || undefined,
    colorIds: idList(q.color),
    sizeIds: idList(q.size),
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    inStock: q.inStock,
    onSale: q.onSale,
    featured: q.featured,
    sort: requestedSort ?? q.sort,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** `true`/`1`/`yes` query flags. */
export function truthy(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function optionalString(raw: string | undefined, max = 200): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** `yyyy-mm-dd` bounds used by reports and admin order filters. */
export function dateBound(raw: string | undefined): string | undefined {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

export function flagsOf(c: Ctx): RuntimeFlags {
  const f = c.get('flags');
  if (!f) throw new Error('flags middleware belum jalan');
  return f;
}
