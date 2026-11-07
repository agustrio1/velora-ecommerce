
/// <reference types="vite/client" />

import {
  RouterContextProvider,
  type ServerBuild,
  createRequestHandler,
} from 'react-router';

import type { Env } from '../../api/src/env';
import honoApp from '../../api/src/index';
import { cloudflareContext } from '../app/services/cloudflare.server';

/**
 * Single Cloudflare Worker entry.
 *
 * /api/runtime-config
 *   → Public Firebase Web SDK runtime configuration
 *
 * /api/*, /webhooks/*, /media/*,
 * /sitemap.xml, /robots.txt, /manifest.webmanifest
 *   → Hono (JSON API, provider callbacks, media gateway, SEO + PWA metadata)
 *
 * Everything else
 *   → React Router (SSR + client hydration)
 *
 * Firebase service-account credentials are never exposed to the browser.
 */

const requestHandler = createRequestHandler(
  async () => {
    const mod = await import('virtual:react-router/server-build');

    return (
      (mod as { default?: ServerBuild }).default ??
      (mod as unknown as ServerBuild)
    );
  },
  import.meta.env.MODE,
);

const API_PREFIXES = ['/api', '/webhooks', '/media'];

const API_EXACT = new Set([
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
]);

function isApiRequest(pathname: string): boolean {
  if (API_EXACT.has(pathname)) {
    return true;
  }

  return API_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Returns Firebase Web SDK configuration.
 *
 * These values are intentionally public because the browser Firebase SDK
 * needs them. Never include service-account credentials or private keys.
 */
function runtimeConfigResponse(env: Env): Response {
  return Response.json(
    {
      firebase: {
        apiKey: env.VITE_FIREBASE_API_KEY ?? '',
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
        messagingSenderId:
          env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
        appId: env.VITE_FIREBASE_APP_ID ?? '',
        measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
        databaseURL:
          env.VITE_FIREBASE_DATABASE_URL ??
          env.FIREBASE_DATABASE_URL ??
          '',
        vapidKey: env.VITE_FIREBASE_VAPID_KEY ?? '',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Firebase public runtime configuration endpoint.
    if (url.pathname === '/api/runtime-config') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            Allow: 'GET',
            'Cache-Control': 'no-store',
          },
        });
      }

      return runtimeConfigResponse(env);
    }

    // Existing Hono API and webhook routing.
    if (isApiRequest(url.pathname)) {
      return honoApp.fetch(request, env, ctx);
    }

    // Existing React Router SSR routing.
    const context = new RouterContextProvider();

    context.set(cloudflareContext, {
      env,
      ctx,
    });

    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
