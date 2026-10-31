import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ProductDetail, type ProductVariant, ROUTES } from '@velora/shared';
import { clsx } from 'clsx';
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Truck,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, type LoaderFunctionArgs, data as httpData, useLoaderData, useParams } from 'react-router';
import { Media } from '../components/Media';
import { ProductCard } from '../components/ProductCard';
import { Button, EmptyState, Field, Spinner, Textarea } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCartActions } from '../hooks/useCart';
import { useWishlist } from '../hooks/useWishlist';
import { api } from '../lib/api';
import type { ProductResponse, ReviewPage } from '../lib/api-types';
import { dateTime, rupiah } from '../lib/format';
import { type HeadMatch, pageMeta, siteHead } from '../lib/seo';
import { internalApi } from '../services/api.server';
import { cloudflareEnv } from '../services/cloudflare.server';

const SITE_NAME = 'VELORA';
const RATING_LABELS = ['Buruk', 'Kurang', 'Cukup', 'Bagus', 'Sangat bagus'];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function cleanText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value: string | null | undefined, origin: string) {
  if (!value) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return null;
  }
}

function toIso(value: string | number | Date | null | undefined) {
  if (value == null) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Ambil status HTTP dari error apa pun yang dilempar internalApi / fetch. */
function getStatus(err: unknown): number | undefined {
  if (err instanceof Response) return err.status;
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: unknown; statusCode?: unknown };
    if (typeof e.status === 'number') return e.status;
    if (typeof e.statusCode === 'number') return e.statusCode;
  }
  return undefined;
}

/** "syal-rajut-musim-hujan" → "Syal Rajut Musim Hujan" (judul cadangan bila SSR gagal). */
function titleFromSlug(slug: string | undefined) {
  if (!slug) return SITE_NAME;
  const words = slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length ? `${words.join(' ')} | ${SITE_NAME}` : SITE_NAME;
}

/** Title ≤ ~60 karakter bila memungkinkan: nama produk - kategori | brand. */
function buildTitle(name: string, category: string | null | undefined) {
  const full = category ? `${name} - ${category} | ${SITE_NAME}` : `${name} | ${SITE_NAME}`;
  return full.length <= 60 ? full : `${name} | ${SITE_NAME}`;
}

/** Meta description ≤ 155 karakter: nama, ringkasan deskripsi, lalu harga. */
function buildDescription(name: string, description: string | null | undefined, price: number) {
  const tail = ` Harga ${rupiah(price)}. Belanja di ${SITE_NAME}.`;
  const budget = 155 - name.length - tail.length - 3;
  let body = cleanText(description);
  if (budget <= 20) return `${name}.${tail}`.slice(0, 155);
  if (body.length > budget) {
    body = `${body.slice(0, budget - 1).replace(/\s+\S*$/, '')}…`;
  }
  return body ? `${name} - ${body}${tail}` : `${name}.${tail}`;
}

/* -------------------------------------------------------------------------- */
/* Loader + SEO                                                               */
/* -------------------------------------------------------------------------- */

/** Produk dan ulasan di-render di server supaya terbaca crawler (SEO/GEO). */
export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const slug = params.slug ?? '';
  if (!slug) return httpData({ product: null, reviews: null, origin, failed: false }, { status: 404 });

  const env = cloudflareEnv(context);
  const encoded = encodeURIComponent(slug);
  try {
    const [product, reviews] = await Promise.all([
      internalApi<ProductResponse>(`/api/products/${encoded}`, env),
      internalApi<ReviewPage>(`/api/products/${encoded}/reviews`, env).catch(() => null),
    ]);
    return { product, reviews, origin, failed: false };
  } catch (err) {
    // Produk memang tidak ada / belum dipublikasikan: 404 supaya tidak diindeks.
    if (getStatus(err) === 404) {
      return httpData({ product: null, reviews: null, origin, failed: false }, { status: 404 });
    }
    // Error lain (API belum siap, env/binding salah, dll) BUKAN berarti produk hilang.
    // Jangan dilabeli "tidak ditemukan"; biarkan klien mengambil data sendiri dan catat penyebabnya.
    console.error(`[product loader] gagal memuat produk "${slug}":`, err);
    return { product: null, reviews: null, origin, failed: true };
  }
}

type Unwrap<T> = T extends { data: infer D } ? D : T;
type LoaderData = Unwrap<Awaited<ReturnType<typeof loader>>>;

export function meta(args: {
  /** React Router terbaru memberi data loader lewat `loaderData`. */
  loaderData?: LoaderData;
  /** Versi lama memakai `data` (sudah deprecated). */
  data?: LoaderData;
  params: Record<string, string | undefined>;
  /** Root loader (SEO settings) lewat `matches`. */
  matches?: readonly HeadMatch[];
}) {
  const data = args.loaderData ?? args.data;
  const params = args.params;
  // Route `meta` replaces the root head, so the product page builds the whole
  // set itself: site defaults plus the product-specific tags below.
  const head = siteHead(args.matches);
  const product = data?.product?.product;
  const canonical = ROUTES.product(params.slug ?? '');
  if (!data || !product) {
    // SSR gagal mengambil data (bukan 404): judul cadangan dari slug, jangan klaim "tidak ditemukan".
    if (data?.failed) {
      return pageMeta({
        head,
        title: titleFromSlug(params.slug),
        description: `${titleFromSlug(params.slug)} — informasi produk sedang tidak dapat dimuat.`,
        path: canonical,
        robots: 'noindex, follow',
      });
    }
    return pageMeta({
      head,
      title: titleFromSlug(params.slug),
      description: `Produk yang Anda cari tidak tersedia atau sudah tidak dijual di ${SITE_NAME}.`,
      path: canonical,
      robots: 'noindex, nofollow',
    });
  }

  const origin = data.origin;
  const url = `${origin}${ROUTES.product(product.slug)}`;
  const price = product.salePrice ?? product.price;
  const inStock = product.variants.some((v) => v.status === 'active' && v.available > 0);
  const images = (product.images.length ? product.images.map((i) => i.url) : [product.primaryImage])
    .map((u) => absoluteUrl(u, origin))
    .filter((u): u is string => Boolean(u));
  const colors = product.colors.map((c) => c.name);
  const title = buildTitle(product.name, product.categoryName);
  const description = buildDescription(product.name, product.description, price);

  const reviews = (data.reviews?.items ?? []).slice(0, 5).map((r) => {
    const published = toIso(r.createdAt);
    return {
      '@type': 'Review',
      author: { '@type': 'Person', name: r.authorName },
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      reviewBody: r.body,
      ...(r.title ? { name: r.title } : {}),
      ...(published ? { datePublished: published } : {}),
    };
  });

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: cleanText(product.description) || product.name,
    url,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(images.length ? { image: images.slice(0, 6) } : {}),
    ...(product.brandName ? { brand: { '@type': 'Brand', name: product.brandName } } : {}),
    ...(product.categoryName ? { category: product.categoryName } : {}),
    ...(product.material ? { material: product.material } : {}),
    ...(colors.length ? { color: colors.join(', ') } : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'IDR',
      price,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
    },
    ...(product.ratingCount > 0 && product.ratingAvg != null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(product.ratingAvg.toFixed(1)),
            reviewCount: product.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(reviews.length ? { review: reviews } : {}),
  };

  const crumbs = [
    { name: 'Beranda', url: `${origin}/` },
    { name: 'Katalog', url: `${origin}${ROUTES.catalog}` },
    ...(product.categoryName && product.categorySlug
      ? [{ name: product.categoryName, url: `${origin}${ROUTES.category(product.categorySlug)}` }]
      : []),
    { name: product.name, url },
  ];
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };

  return pageMeta({
    head,
    title,
    description,
    path: canonical,
    type: 'product',
    image: images[0] ?? null,
    robots: 'index, follow, max-image-preview:large',
    extra: [
      ...(images[0] ? [{ property: 'og:image:alt', content: product.name }] : []),
      { property: 'product:price:amount', content: String(price) },
      { property: 'product:price:currency', content: 'IDR' },
      { property: 'product:availability', content: inStock ? 'in stock' : 'out of stock' },
      { 'script:ld+json': productLd },
      { 'script:ld+json': breadcrumbLd },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export function ProductPage() {
  const { slug = '' } = useParams();
  // key = slug → state pilihan warna/ukuran/jumlah ter-reset saat pindah produk.
  return <ProductView key={slug} slug={slug} />;
}

function ProductView({ slug }: { slug: string }) {
  const { product: initial, reviews: initialReviews } = useLoaderData<typeof loader>();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<ProductResponse>({
    queryKey: ['product', slug],
    queryFn: () => api.get<ProductResponse>(`/products/${slug}`, undefined, { anonymous: true }),
    initialData: initial ?? undefined,
    staleTime: 30_000,
    retry: 0,
  });

  // Record a view without blocking the page.
  useEffect(() => {
    if (slug) void api.post(`/products/${slug}/view`).catch(() => undefined);
  }, [slug]);

  const product = data?.product;
  const [colorId, setColorId] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const variantByColorSize = useMemo(() => {
    const map = new Map<string, ProductVariant>();
    for (const v of product?.variants ?? []) map.set(`${v.colorId}|${v.sizeId}`, v);
    return map;
  }, [product]);

  // Default to the first colour/size that actually has stock.
  useEffect(() => {
    if (!product) return;
    const firstColor = product.colors.find((c) =>
      product.variants.some((v) => v.colorId === c.id && v.status === 'active' && v.available > 0),
    );
    setColorId((prev) => prev ?? firstColor?.id ?? product.colors[0]?.id ?? null);
  }, [product]);

  const availableSizes = useMemo(() => {
    if (!product || !colorId) return [];
    return product.sizes.filter((s) => {
      const v = variantByColorSize.get(`${colorId}|${s.id}`);
      return v && v.status === 'active' && v.available > 0;
    });
  }, [product, colorId, variantByColorSize]);

  useEffect(() => {
    if (!product) return;
    setSizeId((prev) => {
      if (prev && availableSizes.some((s) => s.id === prev)) return prev;
      return availableSizes[0]?.id ?? product.sizes[0]?.id ?? null;
    });
  }, [product, availableSizes]);

  const selected = product && colorId && sizeId ? (variantByColorSize.get(`${colorId}|${sizeId}`) ?? null) : null;
  const maxQty = Math.min(selected?.available ?? 0, 20);

  // Jumlah tidak boleh melebihi stok varian yang sedang dipilih.
  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, maxQty || 1)));
  }, [maxQty]);

  if (isLoading)
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Spinner />
      </div>
    );
  if (error || !product) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <EmptyState
          title="Produk tidak ditemukan"
          body="Produk mungkin sudah tidak tersedia."
          action={
            <Link to={ROUTES.catalog}>
              <Button variant="secondary">Kembali ke katalog</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const price = selected?.salePrice ?? selected?.price ?? product.salePrice ?? product.price;
  const compareAt = selected?.price ?? product.price;
  const discount = compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;
  const gallery = product.images.length
    ? product.images
    : [{ id: 'x', url: product.primaryImage ?? '', alt: product.name, imageKey: '', sortOrder: 0, isPrimary: true }];

  const selectedColor = product.colors.find((c) => c.id === colorId);
  const selectedSize = product.sizes.find((s) => s.id === sizeId);
  const colorHasStock = (id: string) =>
    product.variants.some((v) => v.colorId === id && v.status === 'active' && v.available > 0);
  const lowStock = Boolean(selected && selected.available > 0 && selected.available <= 5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <li>
            <Link to="/" className="hover:text-accent">
              Beranda
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to={ROUTES.catalog} className="hover:text-accent">
              Katalog
            </Link>
          </li>
          {product.categoryName ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link to={ROUTES.category(product.categorySlug ?? '')} className="hover:text-accent">
                  {product.categoryName}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="max-w-[12rem] truncate text-ink sm:max-w-xs">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <Gallery images={gallery} name={product.name} />
        </div>

        <div className="lg:col-span-5">
          {product.brandName ? <p className="text-sm text-muted">{product.brandName}</p> : null}
          <h1 className="mt-1 text-2xl leading-tight tracking-tight sm:text-3xl">{product.name}</h1>

          {product.ratingCount > 0 ? (
            <a
              href="#ulasan"
              className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-muted hover:text-accent"
            >
              <Stars value={product.ratingAvg ?? 0} />
              <span className="font-medium text-ink">{product.ratingAvg?.toFixed(1)}</span>
              <span>({product.ratingCount} ulasan)</span>
              {product.soldCount > 0 ? <span>· {product.soldCount} terjual</span> : null}
            </a>
          ) : null}

          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold">{rupiah(price)}</span>
            {compareAt > price ? <span className="text-base text-muted line-through">{rupiah(compareAt)}</span> : null}
            {discount > 0 ? (
              <span className="bg-accent px-2 py-0.5 text-xs font-semibold text-white">-{discount}%</span>
            ) : null}
          </div>

          {/* Colour */}
          {product.colors.length ? (
            <div className="mt-7">
              <p className="mb-2.5 text-sm">
                <span className="text-muted">Warna:</span> <span className="font-medium">{selectedColor?.name}</span>
              </p>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Pilih warna">
                {product.colors.map((c) => {
                  const active = colorId === c.id;
                  const inStock = colorHasStock(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={inStock ? c.name : `${c.name} (stok habis)`}
                      title={c.name}
                      onClick={() => setColorId(c.id)}
                      className={clsx(
                        'relative h-10 w-10 rounded-full border p-0.5 transition-colors',
                        active ? 'border-ink' : 'border-line hover:border-accent',
                      )}
                    >
                      <span
                        className="block h-full w-full rounded-full border border-line"
                        style={{ backgroundColor: c.hexCode }}
                      />
                      {inStock ? null : (
                        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px rotate-45 bg-muted" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Size */}
          {product.sizes.length ? (
            <div className="mt-6">
              <p className="mb-2.5 text-sm">
                <span className="text-muted">Ukuran:</span> <span className="font-medium">{selectedSize?.code}</span>
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Pilih ukuran">
                {product.sizes.map((s) => {
                  const v = colorId ? variantByColorSize.get(`${colorId}|${s.id}`) : undefined;
                  const inStock = Boolean(v && v.status === 'active' && v.available > 0);
                  const exists = Boolean(v && v.status === 'active');
                  const active = sizeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!exists}
                      onClick={() => setSizeId(s.id)}
                      title={exists ? (inStock ? 'Tersedia' : 'Stok habis') : 'Tidak tersedia untuk warna ini'}
                      className={clsx(
                        'h-11 rounded-(--radius-card) border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                        active ? 'border-ink bg-ink text-canvas' : 'border-line hover:border-ink',
                        !inStock && 'line-through',
                        !inStock && !active && 'text-muted',
                      )}
                    >
                      {s.code}
                    </button>
                  );
                })}
              </div>
              {product.sizeGuide ? (
                <div className="mt-4 border-y border-line">
                  <Disclosure title="Panduan ukuran">
                    <SizeGuideTable product={product} />
                  </Disclosure>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Quantity */}
          <div className="mt-6">
            <p className="mb-2.5 text-sm text-muted">Jumlah</p>
            <div className="inline-flex items-center rounded-(--radius-card) border border-line">
              <button
                type="button"
                className="px-3 py-2.5 disabled:opacity-40"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Kurangi jumlah"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                className="px-3 py-2.5 disabled:opacity-40"
                onClick={() => setQty((q) => Math.min(maxQty || 1, q + 1))}
                disabled={maxQty <= 0 || qty >= maxQty}
                aria-label="Tambah jumlah"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-stretch gap-3">
            <div className="min-w-0 flex-1">
              <BuyActions selected={selected} qty={qty} onAdded={() => qc.invalidateQueries({ queryKey: ['cart'] })} />
            </div>
            <WishButton productId={product.id} />
          </div>

          <p className={clsx('mt-3 text-sm', lowStock ? 'font-medium text-accent' : 'text-muted')} aria-live="polite">
            {selected
              ? selected.available > 0
                ? lowStock
                  ? `Tersisa ${selected.available} item, segera habis`
                  : 'Stok tersedia'
                : 'Stok warna & ukuran ini sedang habis.'
              : 'Pilih warna dan ukuran.'}
          </p>

          <ul className="mt-6 space-y-3 border-y border-line py-5 text-sm">
            <li className="flex items-start gap-3">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span>Ongkos kirim dihitung otomatis sesuai alamat saat checkout.</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span>Pembayaran aman dengan berbagai metode pilihan.</span>
            </li>
          </ul>

          <div className="divide-y divide-line border-b border-line">
            <Disclosure title="Deskripsi" defaultOpen>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{product.description}</p>
            </Disclosure>
            <Disclosure title="Detail produk">
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
                {product.brandName ? (
                  <>
                    <dt className="text-muted">Brand</dt>
                    <dd>{product.brandName}</dd>
                  </>
                ) : null}
                {product.categoryName ? (
                  <>
                    <dt className="text-muted">Kategori</dt>
                    <dd>{product.categoryName}</dd>
                  </>
                ) : null}
                {product.material ? (
                  <>
                    <dt className="text-muted">Material</dt>
                    <dd>{product.material}</dd>
                  </>
                ) : null}
                <dt className="text-muted">SKU</dt>
                <dd>{selected?.sku ?? product.sku}</dd>
              </dl>
            </Disclosure>
          </div>
        </div>
      </div>

      <ReviewsSection
        slug={slug}
        ratingAvg={product.ratingAvg ?? null}
        ratingCount={product.ratingCount}
        initial={initialReviews}
      />

      {data?.related.length ? (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl tracking-tight sm:text-3xl">Produk serupa</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {data.related.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gallery                                                                    */
/* -------------------------------------------------------------------------- */

type GalleryImage = { id: string; url: string; alt?: string | null };

function Gallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [active, setActive] = useState(0);
  const count = images.length;
  const current = images[active] ?? images[0];
  const go = (step: number) => setActive((i) => (i + step + count) % count);

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:gap-4">
      <div className="relative min-w-0 flex-1">
        <MainImage key={current?.url} url={current?.url} alt={current?.alt || name} label={name} />
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Foto sebelumnya"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-canvas/90 hover:border-ink"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Foto berikutnya"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-canvas/90 hover:border-ink"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 right-3 bg-canvas/90 px-2 py-1 text-xs">
              {active + 1} / {count}
            </span>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="no-scrollbar flex gap-2 overflow-x-auto lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {images.map((img, i) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setActive(i)}
              aria-label={`Lihat foto ${i + 1}`}
              aria-current={i === active}
              className={clsx(
                'w-16 shrink-0 border transition-colors lg:w-full',
                i === active ? 'border-ink' : 'border-line hover:border-accent',
              )}
            >
              <Media url={img.url} alt="" label={name} aspect="tall" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Foto utama dimuat eager + prioritas tinggi (LCP); fallback tetap memakai Media. */
function MainImage({ url, alt, label }: { url: string | null | undefined; alt: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <Media url={null} label={label} aspect="portrait" />;
  return (
    <div className="relative aspect-4/5 w-full overflow-hidden rounded-(--radius-card) bg-soft">
      <img
        src={url}
        alt={alt}
        fetchPriority="high"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small building blocks                                                      */
/* -------------------------------------------------------------------------- */

function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} dari 5 bintang`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={clsx(className, i < Math.round(value) ? 'fill-accent text-accent' : 'text-line')}
        />
      ))}
    </span>
  );
}

function Disclosure({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group py-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function BuyActions({
  selected,
  qty,
  onAdded,
}: {
  selected: ProductVariant | null;
  qty: number;
  onAdded: () => void;
}) {
  const { add } = useCartActions();
  const disabled = !selected || selected.available <= 0;
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={disabled}
      loading={add.isPending}
      onClick={() => {
        if (!selected) return;
        add.mutate({ variantId: selected.id, quantity: qty }, { onSuccess: onAdded });
      }}
    >
      {disabled ? 'Tidak tersedia' : 'Tambah ke keranjang'}
    </Button>
  );
}

function WishButton({ productId }: { productId: string }) {
  const wish = useWishlist();
  const active = wish.has(productId);
  const label = active ? 'Hapus dari wishlist' : 'Simpan ke wishlist';
  return (
    <button
      type="button"
      onClick={() => wish.toggle(productId)}
      className={clsx(
        'flex w-12 shrink-0 items-center justify-center rounded-(--radius-card) border transition-colors',
        active ? 'border-accent text-accent' : 'border-line hover:border-accent',
      )}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      <Heart className={clsx('h-5 w-5', active && 'fill-accent text-accent')} />
    </button>
  );
}

function SizeGuideTable({ product }: { product: ProductDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {product.sizeGuide?.columns.map((c) => (
              <th key={c} className="border-b border-line px-2 py-1.5 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {product.sizeGuide?.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border-b border-line px-2 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

function ReviewsSection({
  slug,
  ratingAvg,
  ratingCount,
  initial,
}: {
  slug: string;
  ratingAvg: number | null;
  ratingCount: number;
  initial: ReviewPage | null;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<ReviewPage>({
    queryKey: ['reviews', slug],
    queryFn: () => api.get<ReviewPage>(`/products/${slug}/reviews`, undefined, { anonymous: true }),
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });

  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<number | null>(null);

  const submit = useMutation({
    mutationFn: () => api.post(`/products/${slug}/reviews`, { rating, title: title || null, body }),
    onSuccess: () => {
      toast.push('Terima kasih, ulasan Anda menunggu moderasi.', 'success');
      setTitle('');
      setBody('');
      setRating(5);
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ['reviews', slug] });
    },
    onError: (err) => toast.push(err instanceof Error ? err.message : 'Ulasan gagal dikirim', 'error'),
  });

  const items = data?.items ?? [];
  const counts = useMemo(
    () => [5, 4, 3, 2, 1].map((star) => ({ star, n: items.filter((r) => r.rating === star).length })),
    [items],
  );
  const shown = filter ? items.filter((r) => r.rating === filter) : items;
  const total = ratingCount || items.length;
  const avg = ratingAvg ?? (items.length ? items.reduce((sum, r) => sum + r.rating, 0) / items.length : 0);
  const pickRating = hoverRating || rating;

  return (
    <section id="ulasan" className="mt-16 scroll-mt-24 border-t border-line pt-10">
      <h2 className="mb-8 text-2xl tracking-tight sm:text-3xl">Ulasan pembeli</h2>

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Ringkasan + form */}
        <div className="lg:col-span-4">
          {total > 0 ? (
            <div>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-semibold leading-none">{avg.toFixed(1)}</span>
                <span className="pb-1 text-sm text-muted">dari 5</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Stars value={avg} />
                <span className="text-sm text-muted">{total} ulasan</span>
              </div>

              {items.length ? (
                <ul className="mt-6 space-y-1.5">
                  {counts.map(({ star, n }) => (
                    <li key={star}>
                      <button
                        type="button"
                        onClick={() => setFilter((f) => (f === star ? null : star))}
                        aria-pressed={filter === star}
                        aria-label={`Tampilkan ulasan ${star} bintang (${n})`}
                        className={clsx(
                          'flex w-full items-center gap-3 py-0.5 text-sm transition-colors hover:text-accent',
                          filter === star && 'text-accent',
                        )}
                      >
                        <span className="w-3 text-right">{star}</span>
                        <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden="true" />
                        <span className="h-1.5 flex-1 bg-line">
                          <span className="block h-full bg-accent" style={{ width: `${(n / items.length) * 100}%` }} />
                        </span>
                        <span className="w-6 text-right text-muted">{n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Belum ada ulasan untuk produk ini. Ulasan dapat ditulis setelah pesanan Anda diterima.
            </p>
          )}

          <div className="mt-8">
            {user ? (
              <details
                className="border border-line bg-surface"
                open={formOpen}
                onToggle={(e) => setFormOpen(e.currentTarget.open)}
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Tulis ulasan
                </summary>
                <form
                  className="border-t border-line p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit.mutate();
                  }}
                >
                  <div className="mb-4">
                    <div
                      className="flex items-center gap-1"
                      role="radiogroup"
                      aria-label="Beri penilaian"
                      onMouseLeave={() => setHoverRating(0)}
                    >
                      {Array.from({ length: 5 }, (_, i) => (
                        <button
                          type="button"
                          key={i}
                          role="radio"
                          aria-checked={rating === i + 1}
                          aria-label={`${i + 1} bintang`}
                          onClick={() => setRating(i + 1)}
                          onMouseEnter={() => setHoverRating(i + 1)}
                          className="p-0.5"
                        >
                          <Star className={clsx('h-7 w-7', i < pickRating ? 'fill-accent text-accent' : 'text-line')} />
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted">{RATING_LABELS[pickRating - 1]}</p>
                  </div>

                  <Field label="Judul (opsional)">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={120}
                      className="h-10 w-full rounded-(--radius-card) border border-line px-3 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  </Field>
                  <div className="mt-3">
                    <Field label="Ulasan" required>
                      <Textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={4} />
                    </Field>
                  </div>
                  <Button className="mt-4" type="submit" loading={submit.isPending}>
                    Kirim ulasan
                  </Button>
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Ulasan hanya dapat dikirim untuk produk yang sudah Anda beli dan terima.
                  </p>
                </form>
              </details>
            ) : (
              <p className="text-sm text-muted">
                <Link to={ROUTES.login} className="text-accent hover:underline">
                  Masuk
                </Link>{' '}
                untuk menulis ulasan.
              </p>
            )}
          </div>
        </div>

        {/* Daftar ulasan */}
        <div className="lg:col-span-8">
          {filter ? (
            <p className="mb-4 flex items-center gap-3 text-sm text-muted">
              Menampilkan ulasan {filter} bintang
              <button type="button" onClick={() => setFilter(null)} className="text-accent hover:underline">
                Tampilkan semua
              </button>
            </p>
          ) : null}

          {shown.length === 0 ? (
            <p className="text-sm text-muted">
              {filter ? `Belum ada ulasan ${filter} bintang.` : 'Belum ada ulasan untuk produk ini.'}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((r) => {
                const initialLetter =
                  String(r.authorName ?? '')
                    .trim()
                    .charAt(0)
                    .toUpperCase() || '?';
                return (
                  <li key={r.id} className="py-6 first:pt-0">
                    <article className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-medium"
                      >
                        {initialLetter}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium">{r.authorName}</span>
                          {r.verifiedPurchase ? (
                            <span className="inline-flex items-center gap-1 text-xs text-accent">
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Pembeli terverifikasi
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Stars value={r.rating} className="h-3.5 w-3.5" />
                          <time dateTime={toIso(r.createdAt)} className="text-xs text-muted">
                            {dateTime(r.createdAt)}
                          </time>
                        </div>
                        {r.title ? <h3 className="mt-3 text-sm font-medium">{r.title}</h3> : null}
                        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/80">{r.body}</p>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default ProductPage;
