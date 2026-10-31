import { SORT_OPTIONS } from '@velora/shared';

/** Filter state the `/api/catalog` endpoint accepts. */
export type CatalogQuery = {
  q?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  onSale?: string;
  sort: string;
  page: number;
  pageSize: number;
  include: string;
};

/**
 * The URL is the single source of truth for catalog filters. The SSR loader and
 * the client component both derive their request from this one function.
 */
export function catalogQuery(params: URLSearchParams, categorySlug?: string): CatalogQuery {
  const colors = params
    .getAll('color')
    .flatMap((v) => v.split(','))
    .filter(Boolean);
  const sizes = params
    .getAll('size')
    .flatMap((v) => v.split(','))
    .filter(Boolean);
  return {
    q: params.get('q') ?? undefined,
    category: categorySlug ?? params.get('category') ?? undefined,
    brand: params.get('brand') ?? undefined,
    color: colors.join(',') || undefined,
    size: sizes.join(',') || undefined,
    minPrice: params.get('minPrice') || undefined,
    maxPrice: params.get('maxPrice') || undefined,
    inStock: params.get('inStock') === '1' ? 'true' : undefined,
    onSale: params.get('onSale') === '1' ? 'true' : undefined,
    sort: params.get('sort') ?? SORT_OPTIONS.LATEST,
    page: Number(params.get('page') ?? 1),
    pageSize: 12,
    include: 'facets',
  };
}
