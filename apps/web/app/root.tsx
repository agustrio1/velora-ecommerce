import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import stylesheet from './index.css?url';
import type { PublicSettings } from './lib/api-types';
import { createQueryClient } from './lib/query';
import { brandTitle, buildStoreJsonLd, headFrom, pageMeta, privatePageLabel } from './lib/seo';
import { internalApi } from './services/api.server';
import { cloudflareEnv } from './services/cloudflare.server';

const FALLBACK_TITLE = 'VELORA — Busana Modern';
const FALLBACK_DESCRIPTION = 'Katalog busana modern dengan harga jujur dan pengiriman ke seluruh Indonesia.';

/**
 * Store-level SEO settings for every document request. Read through the
 * in-process API (cached in KV for two minutes), and never fatal: if settings
 * cannot be read the static defaults still render a valid head.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const env = cloudflareEnv(context);
  let settings: PublicSettings | null = null;
  try {
    settings = await internalApi<PublicSettings>('/api/settings/public', env);
  } catch {
    // A settings hiccup must not take the storefront down.
  }
  const origin = new URL(request.url).origin;
  return {
    settings,
    origin,
    jsonLd: buildStoreJsonLd(settings, origin),
  };
}

/** Settings change rarely; document requests are the only place they can be stale. */
export function shouldRevalidate() {
  return false;
}

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
];

export const meta: MetaFunction<typeof loader> = ({ loaderData, location }) => {
  const head = headFrom(loaderData);
  // A gated page gets its own label instead of the storefront default, so the
  // tab never reads like the homepage it is not.
  const privateLabel = privatePageLabel(location.pathname);
  const title = privateLabel
    ? brandTitle(privateLabel, head.site)
    : loaderData?.settings?.seo?.defaultTitle?.trim() || FALLBACK_TITLE;
  const description = loaderData?.settings?.seo?.defaultDescription?.trim() || FALLBACK_DESCRIPTION;
  // Routes that export their own `meta` replace this array entirely, which is why
  // they all build through `pageMeta` too.
  return pageMeta({ head, title, description, path: location.pathname });
};

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-[#F7F6F2] text-[#191919] antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // Per-render client: a module singleton would leak cached data between
  // requests on the Worker and desync hydration.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
