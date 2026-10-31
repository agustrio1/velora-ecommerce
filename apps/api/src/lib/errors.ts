import { ERROR_CODES, type ErrorCode } from '@velora/shared';

/** Application error carrying an HTTP status + a stable machine readable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.headers = headers;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400, details);

export const unauthorized = (message = 'Anda harus masuk untuk melanjutkan') =>
  new AppError(ERROR_CODES.UNAUTHENTICATED, message, 401);

export const invalidToken = (message = 'Token sesi tidak valid') =>
  new AppError(ERROR_CODES.INVALID_TOKEN, message, 401);

export const forbidden = (message = 'Anda tidak memiliki akses ke sumber daya ini') =>
  new AppError(ERROR_CODES.FORBIDDEN, message, 403);

export const notFound = (message = 'Data tidak ditemukan') => new AppError(ERROR_CODES.NOT_FOUND, message, 404);

export const conflict = (message: string, details?: unknown) =>
  new AppError(ERROR_CODES.CONFLICT, message, 409, details);

export const tooMany = (message = 'Terlalu banyak permintaan, coba lagi sebentar lagi') =>
  new AppError(ERROR_CODES.RATE_LIMITED, message, 429, undefined, {
    'Retry-After': '60',
  });

export const upstream = (message: string, details?: unknown) =>
  new AppError(ERROR_CODES.UPSTREAM_UNAVAILABLE, message, 502, details);

export const internal = (message = 'Terjadi kesalahan pada server') =>
  new AppError(ERROR_CODES.INTERNAL_ERROR, message, 500);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
