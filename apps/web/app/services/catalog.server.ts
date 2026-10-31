import type { RouterContextProvider } from 'react-router';
import type { CatalogResponse } from '../lib/api-types';
import { catalogQuery } from '../lib/catalog-query';
import { internalApi } from './api.server';
import { cloudflareEnv } from './cloudflare.server';

/**
 * Server-render the first page of a catalog listing.
 *
 * Shared by the `/katalog` and `/kategori/:slug` routes: the filter state comes
 * from the request URL, so the HTML already contains the products the visitor
 * asked for.
 */
export async function loadCatalog(
  request: Request,
  categorySlug: string | undefined,
  context: Readonly<RouterContextProvider>,
) {
  const env = cloudflareEnv(context);
  const query = catalogQuery(new URL(request.url).searchParams, categorySlug);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const data = await internalApi<CatalogResponse>(`/api/catalog?${params.toString()}`, env);
  return { data };
}
