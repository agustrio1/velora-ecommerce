/// <reference types="vite/client" />
import { RouterContextProvider, type ServerBuild, createRequestHandler } from 'react-router';
import type { Env } from '../../api/src/env';
import honoApp from '../../api/src/index';
import { cloudflareContext } from '../app/services/cloudflare.server';

/**
 * Single Cloudflare Worker entry.
 *
 *   /api/*, /webhooks/*, /media/*, /sitemap.xml, /robots.txt, /manifest.webmanifest
 *     → Hono (JSON API, provider callbacks, media gateway, SEO + PWA metadata)
 *   everything else
 *     → React Router (SSR + client hydration)
 *
 * Built assets (`/assets/*`, `/favicon.svg`, `/firebase-messaging-sw.js`) are served
 * by the asset CDN before this Worker runs, so they stay out of the lists below.
 *
 * The bindings are handed to loaders through the React Router context provider so
 * every loader can read `context.get(cloudflareContext)` without a global.
 */

const requestHandler = createRequestHandler(
  async () => {
    const mod = await import('virtual:react-router/server-build');
    return (mod as { default?: ServerBuild }).default ?? (mod as unknown as ServerBuild);
  },
  import.meta.env.MODE,
);

const API_PREFIXES = ['/api', '/webhooks', '/media'];
const API_EXACT = new Set(['/sitemap.xml', '/robots.txt', '/manifest.webmanifest']);

function isApiRequest(pathname: string): boolean {
  if (API_EXACT.has(pathname)) return true;
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (isApiRequest(new URL(request.url).pathname)) {
      return honoApp.fetch(request, env, ctx);
    }

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
