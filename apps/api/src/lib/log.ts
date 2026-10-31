import type { Env } from '../env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY_PATTERN =
  /(api[-_]?key|apikey|authorization|token|secret|password|private[-_]?key|signature|merchant[-_]?code|client[-_]?email)/i;

/** Never let a credential reach stdout or the integration_logs table. */
export function redact<T>(input: T, depth = 0): T {
  if (depth > 6 || input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof input !== 'object') return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = typeof v === 'string' && v.length > 6 ? `${v.slice(0, 3)}***` : '***';
    } else if (typeof v === 'string' && v.length > 2000) {
      out[k] = `${v.slice(0, 2000)}…`;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out as unknown as T;
}

function threshold(c: Env): number {
  const configured = (c.LOG_LEVEL ?? 'info') as LogLevel;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function emit(level: LogLevel, message: string, extra?: unknown, ctx?: Env) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    env: ctx?.APP_ENV ?? 'development',
    ...(extra === undefined ? {} : { data: redact(extra) }),
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export function logger(ctx: Env) {
  const min = threshold(ctx);
  return {
    debug: (m: string, d?: unknown) => LEVEL_ORDER.debug >= min && emit('debug', m, d, ctx),
    info: (m: string, d?: unknown) => LEVEL_ORDER.info >= min && emit('info', m, d, ctx),
    warn: (m: string, d?: unknown) => LEVEL_ORDER.warn >= min && emit('warn', m, d, ctx),
    error: (m: string, d?: unknown) => emit('error', m, d, ctx),
  };
}

export type IntegrationProvider = 'duitku' | 'biteship' | 'firebase' | 'resend' | 'system';

/** Persisted provider call — powers the admin integration log screen. */
export async function logIntegration(
  db: D1Database,
  entry: {
    provider: IntegrationProvider;
    direction?: 'request' | 'callback';
    endpoint: string;
    reference?: string | null;
    statusCode?: number | null;
    success: boolean;
    message?: string | null;
    payload?: unknown;
    durationMs?: number | null;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO integration_logs
           (id, provider, direction, endpoint, reference, status_code, success, message, payload, duration_ms, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      )
      .bind(
        crypto.randomUUID(),
        entry.provider,
        entry.direction ?? 'request',
        entry.endpoint.slice(0, 200),
        entry.reference?.slice(0, 120) ?? null,
        entry.statusCode ?? null,
        entry.success ? 1 : 0,
        entry.message?.slice(0, 900) ?? null,
        JSON.stringify(redact(entry.payload ?? {})).slice(0, 20000),
        entry.durationMs ?? null,
        new Date().toISOString().replace('T', ' ').slice(0, 19),
      )
      .run();
  } catch {
    // logging must never break a business transaction
  }
}

export async function audit(
  db: D1Database,
  entry: {
    actorId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: unknown;
    ip?: string | null;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO admin_activity_logs (id, actor_id, action, entity, entity_id, metadata, ip, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
      )
      .bind(
        crypto.randomUUID(),
        entry.actorId,
        entry.action.slice(0, 80),
        entry.entity.slice(0, 60),
        entry.entityId ?? null,
        JSON.stringify(redact(entry.metadata ?? {})).slice(0, 8000),
        entry.ip ?? null,
        new Date().toISOString().replace('T', ' ').slice(0, 19),
      )
      .run();
  } catch {
    /* non fatal */
  }
}
