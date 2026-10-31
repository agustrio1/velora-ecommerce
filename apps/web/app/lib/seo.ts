import type { HomePagePayload } from '@velora/shared';
import type { MetaDescriptor } from 'react-router';
import type { CatalogResponse, PublicSettings, SeoDoc } from './api-types';

/**
 * SEO helpers shared by the SSR <head> (root.tsx) and the admin preview.
 * Everything here is pure so the exact same JSON-LD the admin previews is the
 * one the Worker serialises into the document.
 */

/** Routes that must never be indexed, whatever the settings say. */
const PRIVATE_PREFIXES = ['/admin', '/akun', '/checkout', '/pembayaran', '/keranjang', '/masuk', '/daftar'];

/** Tab title for the gated pages, so a private route never shows the store default. */
const PRIVATE_LABELS: Record<string, string> = {
  '/admin': 'Panel admin',
  '/akun': 'Akun saya',
  '/checkout': 'Checkout',
  '/pembayaran': 'Status pembayaran',
  '/keranjang': 'Keranjang',
  '/wishlist': 'Wishlist',
  '/masuk': 'Masuk',
  '/daftar': 'Daftar akun baru',
  '/lupa-sandi': 'Reset kata sandi',
};

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** `Akun saya` for `/akun/bantuan`, `null` for anything public. */
export function privatePageLabel(pathname: string): string | null {
  const hit = Object.keys(PRIVATE_LABELS)
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? PRIVATE_LABELS[hit] : null;
}

/** Canonical origin: the configured base URL wins, otherwise the request origin. */
export function seoBase(seo: { canonicalBaseUrl?: string | null } | null | undefined, origin: string): string {
  return (seo?.canonicalBaseUrl?.trim() || origin).replace(/\/$/, '');
}

/** Absolute URL for a possibly relative asset (logo, OG image). */
export function absoluteUrl(url: string | null | undefined, base: string): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

export type ParsedJsonLd = { ok: true; value: unknown } | { ok: false; error: string };

/* ------------------------------- head pieces ------------------------------ */

/** Brand name as configured for the store (never empty). */
export function siteBrand(seo: SeoDoc | null | undefined, storeName?: string | null): string {
  return seo?.siteName?.trim() || storeName?.trim() || 'VELORA';
}

/** `Katalog — VELORA`, without ever doubling the brand when the page carries it. */
export function brandTitle(page: string, site: string): string {
  const clean = page.trim().replace(/[\s|—–-]+$/, '');
  if (!clean) return site;
  const lower = clean.toLowerCase();
  const brand = site.toLowerCase();
  // The brand may sit at either end of a hand-written title (`FAQ VELORA`).
  if (lower.startsWith(brand) || lower.endsWith(brand)) return clean;
  return `${clean} — ${site}`;
}

/** Plain, single-line text for description tags: no markup, clamped to `max`. */
export function metaText(value: string | null | undefined, max: number): string {
  const text = (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(0, cut.lastIndexOf(' ')))}…`;
}

/** Root loader data — the single source for every page head. */
type RootData = { settings?: PublicSettings | null; origin?: string; jsonLd?: JsonLdGraph | null } | undefined;

export interface SiteHead {
  seo: SeoDoc | null;
  store: PublicSettings['store'] | null;
  /** Canonical origin, without a trailing slash. */
  base: string;
  /** Brand name as configured (never empty). */
  site: string;
  /** Site-level OG image. */
  image: string | null;
  /** Store JSON-LD composed by the root loader. */
  jsonLd: JsonLdGraph | null;
}

export function headFrom(loaderData: RootData): SiteHead {
  const seo = loaderData?.settings?.seo ?? null;
  const store = loaderData?.settings?.store ?? null;
  const base = seoBase(seo, loaderData?.origin ?? '');
  return {
    seo,
    store,
    base,
    site: siteBrand(seo, store?.storeName),
    image: absoluteUrl(seo?.defaultOgImage ?? store?.logoUrl ?? null, base),
    jsonLd: loaderData?.jsonLd ?? null,
  };
}

/** A child route's `meta()` reaches parent data through `matches` (v8 says `loaderData`). */
export type HeadMatch = { id?: string; loaderData?: unknown; data?: unknown };

export function siteHead(matches?: readonly HeadMatch[]): SiteHead {
  const root = matches?.find((m) => m.id === 'root');
  return headFrom((root?.loaderData ?? root?.data) as RootData);
}

const THEME_COLOR = '#F7F6F2';

/** Gated paths are always out of the index; otherwise the admin's robots flags win. */
export function pageRobots(head: SiteHead, pathname: string, override?: string): string {
  if (override) return override;
  if (isPrivatePath(pathname)) return 'noindex, nofollow';
  const index = head.seo?.robotsIndex !== false ? 'index' : 'noindex';
  const follow = head.seo?.robotsFollow !== false ? 'follow' : 'nofollow';
  return `${index}, ${follow}`;
}

export interface PageMetaInput {
  /** Site context taken from the root loader. */
  head: SiteHead;
  /** Branded title, usually built with {@link brandTitle}. */
  title: string;
  description: string;
  /** Canonical path without origin or query string, e.g. `/katalog`. */
  path: string;
  /** `website`, `article`, `product`… defaults to `website`. */
  type?: string;
  /** Page image; pass `null` to drop the site default, omit to inherit it. */
  image?: string | null;
  /** Only set when the page deviates from the site-wide robots directive. */
  robots?: string;
  /** Page-specific tags, appended after the site set. */
  extra?: MetaDescriptor[];
}

/**
 * The complete head for one page. React Router does not merge route meta by key:
 * the deepest matched route's array replaces its parents', so every route that
 * exports `meta` must carry the site defaults itself — otherwise robots,
 * theme-color and the store JSON-LD silently disappear from that page.
 */
export function pageMeta(input: PageMetaInput): MetaDescriptor[] {
  const { head } = input;
  const url = `${head.base}${input.path}`;
  const image = input.image === undefined ? head.image : input.image;
  const tags: MetaDescriptor[] = [
    { title: input.title },
    { name: 'description', content: input.description },
    { name: 'robots', content: pageRobots(head, input.path, input.robots) },
    { name: 'theme-color', content: THEME_COLOR },
    { property: 'og:type', content: input.type ?? 'website' },
    { property: 'og:site_name', content: head.site },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:url', content: url },
    { property: 'og:locale', content: 'id_ID' },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
    { tagName: 'link', rel: 'canonical', href: url },
  ];
  const keywords = head.seo?.keywords?.trim();
  if (keywords) tags.push({ name: 'keywords', content: keywords });
  const handle = head.seo?.twitterHandle?.trim();
  if (handle) tags.push({ name: 'twitter:site', content: handle });
  if (image) tags.push({ property: 'og:image', content: image }, { name: 'twitter:image', content: image });
  if (input.extra) tags.push(...input.extra);
  // Rendered as <script type="application/ld+json"> in <head>, with <, > and &
  // escaped so the block can never close the tag early.
  if (head.jsonLd) tags.push({ 'script:ld+json': head.jsonLd });
  return tags;
}

/* ------------------------------ page heads -------------------------------- */

/** First few category names shown on the homepage, used as title keywords. */
function homeCategoryNames(home: HomePagePayload | null | undefined): string[] {
  return (home?.categories ?? []).map((c) => c.name?.trim()).filter((name): name is string => Boolean(name));
}

/**
 * Homepage title: the admin override when set, otherwise one composed from the
 * live hero and category links, so an untouched store still ships a title that
 * says what the shop sells instead of the site-wide default.
 */
export function homeTitle(
  seo: SeoDoc | null | undefined,
  home: HomePagePayload | null | undefined,
  site: string,
): string {
  const override = seo?.homeTitle?.trim();
  if (override) return override;
  const names = homeCategoryNames(home).slice(0, 3);
  if (names.length >= 2) return `${site} — ${names.join(', ')}`;
  return brandTitle(home?.hero?.title?.trim() || 'Katalog Busana Modern', site);
}

/** Homepage description, same rule: override first, then hero/brand copy. */
export function homeDescription(
  seo: SeoDoc | null | undefined,
  home: HomePagePayload | null | undefined,
  site: string,
): string {
  const override = seo?.homeDescription?.trim();
  if (override) return metaText(override, 155);
  // The storefront default reads in the shop's language; the hero copy is only a
  // fallback because CMS content is free-form and often not tuned for search.
  const lead =
    seo?.defaultDescription?.trim() || metaText(home?.hero?.subtitle, 110) || metaText(home?.brandStory?.body, 110);
  const names = homeCategoryNames(home).slice(0, 3);
  const scope = names.length ? ` Tersedia ${names.join(', ')} dan koleksi lainnya.` : '';
  const text = `${lead ?? `Katalog busana modern ${site}.`}${scope}`.trim();
  return metaText(text, 155);
}

/** `outerwear-motif` → `Outerwear Motif`, for titles built from a slug. */
export function slugLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface CatalogMetaInput {
  head: SiteHead;
  /** Display name of the category when the route is `/kategori/:slug`. */
  category: string | null;
  /** Canonical path without the query string, e.g. `/katalog`. */
  path: string;
  total: number;
  page: number;
  q?: string | null;
  /** Any filter other than sorting is on: the result set is a duplicate view. */
  filtered?: boolean;
}

const CATALOG_FILTER_KEYS = ['brand', 'color', 'size', 'minPrice', 'maxPrice', 'inStock', 'onSale'];

/** Anything except search/sort: the result set is a narrowed copy of the page. */
export function isFilteredCatalog(params: URLSearchParams): boolean {
  return CATALOG_FILTER_KEYS.some((key) => Boolean(params.get(key)));
}

/** Counts a listing head needs, tolerant of a listing that failed to load. */
export function catalogHeadData(data: CatalogResponse | undefined) {
  return { total: data?.total ?? 0, page: data?.page ?? 1 };
}

/** Display name for a category slug, from the facets the listing already carries. */
export function catalogCategoryName(data: CatalogResponse | undefined, slug: string): string {
  const hit = data?.facets?.categories.find((c) => c.slug === slug)?.name?.trim();
  return hit || slugLabel(slug) || 'Katalog';
}

/**
 * Listing pages (`/katalog`, `/kategori/:slug`). Search results, filtered views,
 * page 2+ and empty category pages get `noindex, follow` so only the clean
 * category URL competes for the same keywords while the products stay reachable.
 */
export function catalogMeta(input: CatalogMetaInput): MetaDescriptor[] {
  const { head } = input;
  const term = input.q?.trim();
  const searching = Boolean(term);
  const label = searching
    ? `Hasil untuk “${term}”`
    : input.category
      ? `Katalog ${input.category}`
      : 'Katalog Busana Modern';
  const title = brandTitle(input.page > 1 ? `${label} Halaman ${input.page}` : label, head.site);
  const scope = input.category ? ` ${input.category}` : '';
  const body = searching
    ? `${input.total} hasil pencarian di ${head.site}.`
    : input.total > 0
      ? `${input.total} produk${scope} siap dikirim ke seluruh Indonesia dengan harga jujur.`
      : `Belum ada produk yang cocok di ${head.site}. Coba ubah kata kunci atau hapus beberapa filter.`;
  const fallback = head.seo?.defaultDescription?.trim() ?? '';
  // An empty category page is usually a typo in the slug: nothing to rank for.
  const empty = input.total === 0 && Boolean(input.category);
  return pageMeta({
    head,
    title,
    description: metaText(`${body} ${fallback}`.trim(), 155),
    path: input.path,
    robots: searching || input.filtered || input.page > 1 || empty ? 'noindex, follow' : undefined,
  });
}

/** Validate the free-form JSON-LD an admin pasted into Settings. */
export function parseJsonLdExtra(raw: string | null | undefined): ParsedJsonLd {
  const text = raw?.trim();
  if (!text) return { ok: true, value: null };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') {
      return { ok: false, error: 'JSON-LD harus berupa objek atau array.' };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'JSON tidak valid.' };
  }
}

export interface JsonLdGraph {
  '@context': 'https://schema.org';
  '@graph': Record<string, unknown>[];
}

/**
 * Store-level structured data: one Organization/OnlineStore node, a WebSite node
 * with the sitelinks search box, plus whatever extra nodes the admin added.
 */
export function buildStoreJsonLd(settings: PublicSettings | null, origin: string): JsonLdGraph | null {
  const seo = settings?.seo;
  const store = settings?.store;
  if (!seo?.jsonLdEnabled || !store) return null;

  const base = seoBase(seo, origin);
  const storeId = `${base}/#store`;
  const name = seo.siteName?.trim() || store.storeName || 'VELORA';
  const logo = absoluteUrl(store.logoUrl, base);
  const sameAs = Object.values(store.social ?? {})
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const organization: Record<string, unknown> = {
    '@type': seo.organizationType,
    '@id': storeId,
    name,
    url: base,
    description: seo.defaultDescription,
  };
  if (logo) {
    organization.logo = logo;
    organization.image = logo;
  }
  if (store.whatsapp) organization.telephone = store.whatsapp;
  if (store.email) organization.email = store.email;
  if (store.address) organization.address = { '@type': 'PostalAddress', streetAddress: store.address };
  if (sameAs.length) organization.sameAs = sameAs;

  const website: Record<string, unknown> = {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: base,
    name,
    inLanguage: 'id-ID',
    publisher: { '@id': storeId },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/katalog?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };

  const graph: Record<string, unknown>[] = [organization, website];
  const extra = parseJsonLdExtra(seo.jsonLdExtra);
  if (extra.ok && extra.value) {
    if (Array.isArray(extra.value)) {
      for (const node of extra.value) {
        if (node && typeof node === 'object') graph.push(node as Record<string, unknown>);
      }
    } else {
      graph.push(extra.value as Record<string, unknown>);
    }
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
