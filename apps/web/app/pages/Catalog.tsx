import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ProductSummary, ROUTES, SORT_OPTIONS } from '@velora/shared';
import { SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, type LoaderFunctionArgs, type MetaFunction, useLoaderData, useSearchParams } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { Button, EmptyState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import type { CatalogResponse } from '../lib/api-types';
import { catalogQuery } from '../lib/catalog-query';
import { catalogHeadData, catalogMeta, isFilteredCatalog, siteHead } from '../lib/seo';
import { loadCatalog } from '../services/catalog.server';

const SORTS: { value: string; label: string }[] = [
  { value: SORT_OPTIONS.LATEST, label: 'Terbaru' },
  { value: SORT_OPTIONS.POPULAR, label: 'Populer' },
  { value: SORT_OPTIONS.BEST_SELLER, label: 'Terlaris' },
  { value: SORT_OPTIONS.PRICE_ASC, label: 'Harga terendah' },
  { value: SORT_OPTIONS.PRICE_DESC, label: 'Harga tertinggi' },
  { value: SORT_OPTIONS.NAME_ASC, label: 'Nama A-Z' },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  return loadCatalog(request, undefined, context);
}

/** Filters live in the query string, so the head reads the URL, not the body. */
export const meta: MetaFunction<typeof loader> = ({ loaderData, matches, location }) => {
  const head = siteHead(matches);
  const search = new URLSearchParams(location.search);
  return catalogMeta({
    head,
    ...catalogHeadData(loaderData?.data),
    path: ROUTES.catalog,
    category: null,
    q: search.get('q'),
    filtered: isFilteredCatalog(search),
  });
};

export function CatalogPage({ categorySlug }: { categorySlug?: string }) {
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState(false);
  const { data: initial } = useLoaderData<typeof loader>();

  const query = useMemo(() => catalogQuery(params, categorySlug), [params, categorySlug]);

  const { data, isFetching } = useQuery<CatalogResponse>({
    queryKey: ['catalog', query],
    queryFn: () => api.get<CatalogResponse>('/catalog', query, { anonymous: true }),
    initialData: initial,
    placeholderData: keepPreviousData,
  });

  const facets = data?.facets ?? null;
  const items: ProductSummary[] = data?.items ?? [];
  const activeCategory = categorySlug ? decodeURIComponent(categorySlug) : params.get('category');

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  }

  function toggleList(key: 'color' | 'size', id: string) {
    const current = params
      .getAll(key)
      .flatMap((v) => v.split(','))
      .filter(Boolean);
    const set = new Set(current);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ [key]: Array.from(set).join(',') || null });
  }

  const selectedColors = new Set(params.getAll('color').flatMap((v) => v.split(',')));
  const selectedSizes = new Set(params.getAll('size').flatMap((v) => v.split(',')));

  const FilterPanel = (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-2">Urutkan</div>
        <select
          value={query.sort}
          onChange={(e) => update({ sort: e.target.value })}
          className="h-10 w-full rounded-(--radius-card) border border-line bg-surface px-3 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="eyebrow mb-2">Harga</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={params.get('minPrice') ?? ''}
            onChange={(e) => update({ minPrice: e.target.value || null })}
            className="h-10 w-full rounded-(--radius-card) border border-line bg-surface px-3 text-sm"
          />
          <span className="text-muted">–</span>
          <input
            type="number"
            placeholder="Max"
            value={params.get('maxPrice') ?? ''}
            onChange={(e) => update({ maxPrice: e.target.value || null })}
            className="h-10 w-full rounded-(--radius-card) border border-line bg-surface px-3 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={params.get('inStock') === '1'}
            onChange={(e) => update({ inStock: e.target.checked ? '1' : null })}
          />
          Hanya stok tersedia
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={params.get('onSale') === '1'}
            onChange={(e) => update({ onSale: e.target.checked ? '1' : null })}
          />
          Sedang diskon
        </label>
      </div>

      {facets?.colors.length ? (
        <div>
          <div className="eyebrow mb-2">Warna</div>
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleList('color', c.id)}
                title={c.name}
                className={'h-7 w-7 rounded-full border-2 ' + (selectedColors.has(c.id) ? 'border-ink' : 'border-line')}
                style={{ backgroundColor: c.hexCode }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {facets?.sizes.length ? (
        <div>
          <div className="eyebrow mb-2">Ukuran</div>
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <button
                key={s.id}
                onClick={() => toggleList('size', s.id)}
                className={
                  'min-w-10 rounded-(--radius-card) border px-2.5 py-1 text-sm ' +
                  (selectedSizes.has(s.id) ? 'border-ink bg-soft' : 'border-line hover:border-accent')
                }
              >
                {s.code}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {facets?.brands.length ? (
        <div>
          <div className="eyebrow mb-2">Merek</div>
          <div className="space-y-1">
            {facets.brands.map((b) => (
              <button
                key={b.id}
                onClick={() => update({ brand: params.get('brand') === b.slug ? null : b.slug })}
                className={
                  'block w-full truncate text-left text-sm ' +
                  (params.get('brand') === b.slug ? 'text-accent' : 'text-muted hover:text-ink')
                }
              >
                {b.name} <span className="text-xs">({b.count})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
        Reset filter
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Katalog</div>
          <h1 className="text-2xl capitalize sm:text-3xl">
            {activeCategory ? activeCategory.replace(/-/g, ' ') : query.q ? `Hasil untuk “${query.q}”` : 'Semua Produk'}
          </h1>
        </div>
        <button
          onClick={() => setDrawer(true)}
          className="flex items-center gap-2 border border-line bg-surface px-3 py-2 text-sm lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filter
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">{FilterPanel}</aside>

        <div>
          {isFetching && !data ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState
              title="Belum ada produk"
              body="Coba ubah kata kunci atau hapus beberapa filter."
              action={
                <Link to={ROUTES.catalog}>
                  <Button variant="secondary">Lihat semua produk</Button>
                </Link>
              }
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">{data?.total ?? 0} produk ditemukan</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>

              {data && data.totalPages > 1 ? (
                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  onChange={(p) => update({ page: String(p) })}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[85vw] overflow-y-auto bg-canvas p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-medium">Filter</span>
              <button onClick={() => setDrawer(false)} aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            {FilterPanel}
            <Button className="mt-6 w-full" onClick={() => setDrawer(false)}>
              Terapkan
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    if (totalPages <= 7) return i + 1;
    if (page <= 4) return i + 1;
    if (page >= totalPages - 3) return totalPages - 6 + i;
    return page - 3 + i;
  });
  return (
    <div className="mt-10 flex items-center justify-center gap-1.5">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Sebelumnya
      </Button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={
            'h-9 w-9 rounded-(--radius-card) text-sm ' +
            (p === page ? 'bg-ink text-canvas' : 'border border-line hover:border-accent')
          }
        >
          {p}
        </button>
      ))}
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Berikutnya
      </Button>
    </div>
  );
}

export default CatalogPage;
