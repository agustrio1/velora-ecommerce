import type { NotificationPrefs } from '@velora/shared';
import type { Context } from 'hono';
import type { Env } from './env';
import type { UserRecord } from './services/identity';

export interface RuntimeContext {
  requestId: string;
  startedAt: number;
  ip: string;
  /** Resolved once per request: verified Firebase identity mirrored into D1. */
  user: UserRecord | null;
  prefs: NotificationPrefs | null;
  /** True when the caller passed a Bearer token (even if the user row is new). */
  authenticated: boolean;
  flags: import('./env').RuntimeFlags;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    startedAt: number;
    ip: string;
    user: UserRecord | null;
    prefs: NotificationPrefs | null;
    authenticated: boolean;
    flags: import('./env').RuntimeFlags;
    /** Guest cart token taken from the header, used when there is no session. */
    guestToken: string | null;
  };
};

export type Ctx = Context<AppEnv>;
