import { type RouterContextProvider, createContext } from 'react-router';
import type { Env } from '../../../api/src/env';

/**
 * Bridges the Workers request context into React Router loaders.
 *
 * The Worker entry (`workers/app.ts`) sets this context once per request; every
 * loader/action reads it to reach the D1/R2/KV bindings and the execution ctx.
 */
export interface CloudflareLoadContext {
  env: Env;
  ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareLoadContext>();

/** Read the bindings from a loader/action `context` argument. */
export function cloudflareEnv(context: Readonly<RouterContextProvider>): Env {
  return context.get(cloudflareContext).env;
}
