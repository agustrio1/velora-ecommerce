import { internal, notFound } from './errors';

/**
 * Thin, typed helpers over the D1 driver.
 * Every query in this project goes through prepared statements + bind() so raw
 * string interpolation never reaches SQLite (SQL injection safe by design).
 */

export type Row = Record<string, unknown>;
type Nullable<T> = T | null;

export async function all<T = Row>(db: D1Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const res = await stmt.all<T>();
  return (res.results ?? []) as T[];
}

export async function rows<T = Row>(db: D1Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return all<T>(db, sql, params);
}

export async function first<T = Row>(db: D1Database, sql: string, params: unknown[] = []): Promise<Nullable<T>> {
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const res = await stmt.all<T>();
  const r = res.results?.[0];
  return (r ?? null) as Nullable<T>;
}

export async function value<T = unknown>(db: D1Database, sql: string, params: unknown[] = []): Promise<Nullable<T>> {
  const row = await first<Record<string, unknown>>(db, sql, params);
  if (!row) return null;
  const key = Object.keys(row)[0];
  return (row[key] ?? null) as Nullable<T>;
}

export async function count(db: D1Database, sql: string, params: unknown[] = []): Promise<number> {
  const v = await value<number>(db, sql, params);
  return Number(v ?? 0);
}

export async function run(db: D1Database, sql: string, params: unknown[] = []) {
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  return stmt.run();
}

/** Atomic multi-statement transaction (D1 `batch`). */
export async function tx(db: D1Database, statements: { sql: string; params?: unknown[] }[]) {
  if (!statements.length) return [];
  const prepared = statements.map((s) =>
    s.params && s.params.length ? db.prepare(s.sql).bind(...s.params) : db.prepare(s.sql),
  );
  const results = await db.batch(prepared as never);
  const failed = results.find((r) => r.success === false);
  if (failed) throw internal(String(failed.error ?? 'Transaksi database gagal'));
  return results;
}

export async function mustFind<T = Row>(
  db: D1Database,
  sql: string,
  params: unknown[],
  message = 'Data tidak ditemukan',
): Promise<T> {
  const found = await first<T>(db, sql, params);
  if (!found) throw notFound(message);
  return found;
}

/* ------------------------------- converters ------------------------------- */

export const bool = (v: unknown): boolean => Number(v ?? 0) === 1 || v === true;

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function optNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

export function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === '' ? null : s;
}

/** SQLite stores "YYYY-MM-DD HH:MM:SS" (UTC). Emit ISO-8601 to the client. */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  if (s.includes('T')) return s.endsWith('Z') ? s : `${s}${s.endsWith('Z') ? '' : 'Z'}`;
  const parsed = Date.parse(`${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed)) return s;
  return new Date(parsed).toISOString();
}

export function iso(v: unknown): string | null {
  return toIso(v);
}

export function jsonParse<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object') return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
}

export const jsonString = (v: unknown): string => JSON.stringify(v ?? null);

/** SQLite LIMIT/OFFSET guard. */
export function limitOffset(limit: number, offset: number): string {
  return `LIMIT ${Math.max(1, Math.trunc(limit))} OFFSET ${Math.max(0, Math.trunc(offset))}`;
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

/* ------------------------------ dynamic where ----------------------------- */

export interface WhereFragment {
  sql: string;
  params: unknown[];
}

export function where(
  clauses: (string | [string, unknown] | false | null | undefined)[],
  joiner = ' AND ',
): WhereFragment {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const c of clauses) {
    if (!c) continue;
    if (typeof c === 'string') parts.push(c);
    else {
      parts.push(c[0]);
      params.push(c[1]);
    }
  }
  return { sql: parts.length ? `${joiner}${parts.join(joiner)}` : '', params };
}

/**
 * Builds " AND (a = ? OR b = ?)" safely from a whitelist of column names.
 * Values are always bound, never interpolated.
 */
export function orEqual(column: string, values: unknown[]): WhereFragment {
  if (!values.length) return { sql: '', params: [] };
  return {
    sql: ` AND ${column} IN (${values.map(() => '?').join(',')})`,
    params: values,
  };
}
