/**
 * Minimal, hand-written typings for the Cloudflare service bindings VELORA
 * actually uses. Keeping them local (instead of pulling @cloudflare/workers-types
 * globally) avoids clashing with the DOM lib that the React app needs in the
 * same TypeScript program.
 *
 * Shapes follow the official Cloudflare Workers runtime docs; if a binding
 * surface changes, this file is the single place to update.
 */

declare interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
  changes?: number;
  lastRowId?: number;
}

declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: { stripNulls?: boolean }): Promise<T[]>;
}

declare interface D1ExecResult {
  count: number;
  duration: number;
  results: { sql: string; changes: number; error?: string }[];
  success: boolean;
  meta?: Record<string, unknown>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  query<T = Record<string, unknown>>(query: string): Promise<D1Result<T>>;
  /** Only available in the local (miniflare) runtime; used for pragmas. */
  dump(): Promise<ArrayBuffer>;
}

declare interface R2Range {
  offset?: number;
  length?: number;
}

declare interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpires?: string;
  pragma?: string;
}

declare interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

declare interface R2UploadParams {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  sha512?: ArrayBuffer | string;
  contentType?: string;
  cacheControl?: string;
}

declare interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
}

declare interface R2ObjectBody extends R2Object {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
}

declare interface R2CreateOptions extends R2UploadParams {
  onlyIf?: Record<string, unknown>;
  addChecksumsToETag?: boolean;
}

declare interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

declare interface R2SortedPrefix {
  prefix: string;
}

declare interface R2SuccessResult {
  upload: () => WritableStream<Uint8Array>;
  write: (value: string | ArrayBufferView | ArrayBuffer) => Promise<boolean>;
  httpMetadata: R2HTTPMetadata;
  customMetadata: Record<string, string>;
}

declare interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(
    key: string,
    options?: R2Range | { onlyIf?: Record<string, unknown>; range?: R2Range },
  ): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBufferView | ArrayBuffer | ReadableStream | Blob | null,
    options?: R2CreateOptions,
  ): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<{
    objects: R2Object[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes: string[];
  }>;
  createMultipartUpload(
    key: string,
    options?: R2CreateOptions,
  ): Promise<{
    key: string;
    uploadId: string;
  }>;
}

declare interface KVNamespace {
  get<T = string>(
    key: string,
    options?: 'text' | 'json' | 'arrayBuffer' | { type?: string; cacheTtl?: number },
  ): Promise<T | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: { expiration?: number; expirationTtl?: number; metadata?: unknown },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string; expiration?: number; metadata?: Record<string, unknown> }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

/** A Worker service binding (used for Workers Static Assets). */
declare interface Fetcher {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
  /** Legacy alias kept for convenience in this project. */
  get?(key: string): Promise<Response | null>;
}

/** Per-request lifecycle hooks passed to a Worker `fetch` handler. */
declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: unknown;
}

/** The shape of a Worker module's default export. */
declare interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
  scheduled?(controller: unknown, env: Env, ctx: ExecutionContext): void | Promise<void>;
  queue?(batch: unknown, env: Env, ctx: ExecutionContext): void | Promise<void>;
}
