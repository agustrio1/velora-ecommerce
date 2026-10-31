import type {
  Banner,
  Category,
  Faq,
  HomePagePayload,
  HomepageSection,
  MenuLink,
  ProductSummary,
  StaticPage,
} from '@velora/shared';
import { HOMEPAGE_SECTION, type Paginated } from '@velora/shared';
import {
  type Row,
  all,
  bool,
  first,
  jsonParse,
  limitOffset,
  num,
  optStr,
  paginate,
  str,
  toIso,
  value,
} from '../lib/db';
import { notFound } from '../lib/errors';
import { uuid } from '../lib/ids';
import { announcementSettings, storefrontSettings } from '../lib/settings';
import { listCategories } from './catalog';

/**
 * Storefront content: homepage blocks, banners, pages, menus, FAQs and the
 * newsletter list. Everything the admin edits lands in D1, so the storefront
 * renders real database content rather than baked-in copy.
 */

type MediaFor = (key: string | null) => string | null;

/* --------------------------------- banners -------------------------------- */

export async function listBanners(db: D1Database, mediaFor: MediaFor, placement?: string): Promise<Banner[]> {
  const params: unknown[] = [];
  const filter = placement ? `AND placement = ?${params.push(placement)}` : '';
  const rows = await all<Row>(
    db,
    `SELECT * FROM banners WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= datetime('now'))
       AND (ends_at IS NULL OR ends_at >= datetime('now'))
       ${filter}
     ORDER BY sort_order ASC, created_at DESC`,
    params,
  );
  return rows.map((r) => mapBanner(r, mediaFor));
}

function mapBanner(r: Row, mediaFor: MediaFor): Banner {
  return {
    id: str(r.id),
    title: str(r.title),
    subtitle: optStr(r.subtitle),
    imageKey: optStr(r.image_key),
    imageUrl: r.image_key ? mediaFor(str(r.image_key)) : null,
    targetUrl: optStr(r.target_url),
    ctaLabel: optStr(r.cta_label),
    placement: str(r.placement),
    sortOrder: num(r.sort_order),
    isActive: bool(r.is_active),
  };
}

/* -------------------------------- sections -------------------------------- */

export async function listSections(db: D1Database): Promise<HomepageSection[]> {
  const rows = await all<Row>(db, `SELECT * FROM homepage_sections WHERE is_active = 1 ORDER BY sort_order ASC`);
  return rows.map((r) => ({
    id: str(r.id),
    sectionKey: str(r.section_key) as HomepageSection['sectionKey'],
    title: optStr(r.title),
    subtitle: optStr(r.subtitle),
    isActive: bool(r.is_active),
    sortOrder: num(r.sort_order),
    data: jsonParse<Record<string, unknown> | null>(r.data, null),
  }));
}

async function productsForSection(
  db: D1Database,
  section: HomepageSection,
  mediaFor: MediaFor,
  limit: number,
): Promise<ProductSummary[]> {
  const explicit = jsonParse<{ productIds?: string[] }>(section.data ?? {}, {}).productIds ?? [];
  if (explicit.length) {
    const placeholders = explicit.map(() => '?').join(',');
    const rows = await all<Row>(
      db,
      `SELECT id FROM products WHERE id IN (${placeholders}) AND status = 'active'`,
      explicit,
    );
    const ids = rows.map((r) => str(r.id));
    if (!ids.length) return [];
    return loadSummaries(db, `WHERE p.id IN (${ids.map(() => '?').join(',')})`, ids, mediaFor, limit);
  }
  const where =
    section.sectionKey === HOMEPAGE_SECTION.FEATURED_COLLECTION
      ? `WHERE p.status = 'active' AND p.is_featured = 1`
      : section.sectionKey === HOMEPAGE_SECTION.NEW_ARRIVALS
        ? `WHERE p.status = 'active' AND p.is_new_arrival = 1`
        : section.sectionKey === HOMEPAGE_SECTION.BEST_SELLERS
          ? `WHERE p.status = 'active' AND p.is_best_seller = 1`
          : `WHERE p.status = 'active'`;
  const order =
    section.sectionKey === HOMEPAGE_SECTION.BEST_SELLERS
      ? 'ORDER BY p.sold_count DESC, p.view_count DESC'
      : section.sectionKey === HOMEPAGE_SECTION.NEW_ARRIVALS
        ? 'ORDER BY COALESCE(p.published_at, p.created_at) DESC'
        : 'ORDER BY p.is_featured DESC, p.created_at DESC';
  return loadSummaries(db, `${where} ${order}`, [], mediaFor, limit);
}

/** Lightweight summary projection reused by the homepage (full filters live in catalog.ts). */
async function loadSummaries(
  db: D1Database,
  tail: string,
  params: unknown[],
  mediaFor: MediaFor,
  limit: number,
): Promise<ProductSummary[]> {
  const rows = await all<Row>(
    db,
    `SELECT p.id, p.name, p.slug, p.sku, p.price, p.sale_price, p.status, p.is_featured, p.is_new_arrival, p.is_best_seller,
            p.view_count, p.sold_count, p.created_at,
            c.name AS category_name, c.slug AS category_slug, b.name AS brand_name,
            (SELECT pi.image_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1) AS primary_image,
            (SELECT COUNT(*) FROM product_images pi2 WHERE pi2.product_id = p.id) AS image_count,
            (SELECT COALESCE(SUM(i.quantity - i.reserved_quantity), 0) FROM inventory i WHERE i.product_id = p.id) AS total_stock,
            (SELECT ROUND(AVG(r.rating), 2) FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_avg,
            (SELECT COUNT(*) FROM product_reviews r2 WHERE r2.product_id = p.id AND r2.status = 'published') AS rating_count
     FROM products p
     LEFT JOIN categories c ON c.id = p.primary_category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     ${tail}
     LIMIT ${Math.max(1, Math.trunc(limit))}`,
    params,
  );
  return rows.map((r) => {
    const price = num(r.price);
    const sale = optNumSafe(r.sale_price);
    return {
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      sku: str(r.sku),
      price,
      salePrice: sale !== null && sale > 0 && sale < price ? sale : null,
      status: str(r.status) as ProductSummary['status'],
      isFeatured: bool(r.is_featured),
      isNewArrival: bool(r.is_new_arrival),
      isBestSeller: bool(r.is_best_seller),
      categoryName: optStr(r.category_name),
      categorySlug: optStr(r.category_slug),
      brandName: optStr(r.brand_name),
      primaryImage: r.primary_image ? mediaFor(str(r.primary_image)) : null,
      imageCount: num(r.image_count),
      totalStock: num(r.total_stock),
      ratingAvg: optNumSafe(r.rating_avg),
      ratingCount: num(r.rating_count),
      soldCount: num(r.sold_count),
      viewCount: num(r.view_count),
      createdAt: toIso(r.created_at) ?? '',
    };
  });
}

function optNumSafe(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------ homepage blob ----------------------------- */

export async function homePage(db: D1Database, mediaFor: MediaFor): Promise<HomePagePayload> {
  const [sections, banners, categories, announcement, store] = await Promise.all([
    listSections(db),
    listBanners(db, mediaFor),
    listCategories(db, mediaFor),
    announcementSettings(db),
    storefrontSettings(db),
  ]);

  const hero = banners.find((b) => b.placement === 'hero') ?? null;
  const heroSection = sections.find((s) => s.sectionKey === HOMEPAGE_SECTION.HERO) ?? null;
  const heroData = jsonParse<Record<string, string>>(heroSection?.data ?? {}, {});

  const built: HomePagePayload['sections'] = [];
  for (const section of sections.filter((s) => s.sectionKey !== HOMEPAGE_SECTION.HERO)) {
    const limit = num(jsonParse<{ limit?: number }>(section.data ?? {}, {}).limit ?? 8, 8);
    const products = await productsForSection(db, section, mediaFor, limit);
    if (!products.length && section.sectionKey !== HOMEPAGE_SECTION.PROMO) continue;
    built.push({
      section,
      products,
      banner:
        section.sectionKey === HOMEPAGE_SECTION.PROMO ? (banners.find((b) => b.placement === 'promo') ?? null) : null,
    });
  }

  const story = sections.find((s) => s.sectionKey === HOMEPAGE_SECTION.BRAND_STORY);
  const storyData = jsonParse<{ title?: string; body?: string; imageKey?: string }>(story?.data ?? {}, {});

  return {
    announcement: announcement.enabled && announcement.text.trim() ? announcement.text.trim() : null,
    hero: hero
      ? {
          eyebrow: heroData.eyebrow ?? hero.subtitle,
          title: hero.title,
          subtitle: hero.subtitle,
          ctaLabel: hero.ctaLabel ?? 'Belanja sekarang',
          ctaHref: hero.targetUrl ?? '/katalog',
          imageUrl: hero.imageUrl,
        }
      : heroSection
        ? {
            eyebrow: heroData.eyebrow ?? null,
            title: heroSection.title,
            subtitle: heroSection.subtitle,
            ctaLabel: heroData.ctaLabel ?? 'Belanja sekarang',
            ctaHref: heroData.ctaHref ?? '/katalog',
            imageUrl: heroData.imageKey ? mediaFor(heroData.imageKey) : null,
          }
        : null,
    heroSecondary: banners.find((b) => b.placement === 'hero_secondary') ?? null,
    sections: built,
    categories,
    brandStory:
      story && storyData.body
        ? {
            title: storyData.title ?? story.title ?? 'Cerita VELORA',
            body: storyData.body,
            imageUrl: storyData.imageKey ? mediaFor(storyData.imageKey) : null,
          }
        : null,
    csHint: { whatsapp: store.whatsapp, email: store.email },
  };
}

/* ---------------------------------- pages --------------------------------- */

export async function getPage(db: D1Database, slug: string): Promise<StaticPage | null> {
  const r = await first<Row>(db, `SELECT * FROM pages WHERE slug = ?1 AND is_published = 1`, [slug]);
  if (!r) return null;
  return mapPage(r);
}

function mapPage(r: Row): StaticPage {
  return {
    id: str(r.id),
    slug: str(r.slug),
    title: str(r.title),
    content: str(r.content),
    metaTitle: optStr(r.meta_title),
    metaDescription: optStr(r.meta_description),
    updatedAt: toIso(r.updated_at) ?? '',
  };
}

export async function listPages(db: D1Database, includeDrafts = false): Promise<StaticPage[]> {
  const rows = await all<Row>(
    db,
    `SELECT * FROM pages ${includeDrafts ? '' : 'WHERE is_published = 1'} ORDER BY title ASC`,
  );
  return rows.map(mapPage);
}

export async function upsertPage(
  db: D1Database,
  input: {
    id?: string;
    slug: string;
    title: string;
    content: string;
    isPublished: boolean;
    metaTitle?: string | null;
    metaDescription?: string | null;
  },
): Promise<StaticPage> {
  const id = input.id ?? uuid();
  await db
    .prepare(
      `INSERT INTO pages (id, slug, title, content, is_published, meta_title, meta_description, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'),datetime('now'))
       ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, content = excluded.content,
         is_published = excluded.is_published, meta_title = excluded.meta_title, meta_description = excluded.meta_description,
         updated_at = datetime('now')`,
    )
    .bind(
      id,
      input.slug,
      input.title,
      input.content,
      input.isPublished ? 1 : 0,
      input.metaTitle ?? null,
      input.metaDescription ?? null,
    )
    .run();
  const row = await first<Row>(db, `SELECT * FROM pages WHERE id = ?1`, [id]);
  return mapPage(row ?? (await mustPageBySlug(db, input.slug)));
}

async function mustPageBySlug(db: D1Database, slug: string): Promise<Row> {
  const r = await first<Row>(db, `SELECT * FROM pages WHERE slug = ?1`, [slug]);
  if (!r) throw notFound('Halaman tidak ditemukan');
  return r;
}

/* ----------------------------------- faqs --------------------------------- */

export async function listFaqs(db: D1Database, includeDrafts = false): Promise<Faq[]> {
  const rows = await all<Row>(
    db,
    `SELECT * FROM faqs ${includeDrafts ? '' : 'WHERE is_published = 1'} ORDER BY category ASC, sort_order ASC, question ASC`,
  );
  return rows.map((r) => ({
    id: str(r.id),
    question: str(r.question),
    answer: str(r.answer),
    category: optStr(r.category),
    sortOrder: num(r.sort_order),
  }));
}

export async function upsertFaq(
  db: D1Database,
  input: {
    id?: string;
    question: string;
    answer: string;
    category?: string | null;
    sortOrder: number;
    isPublished: boolean;
  },
): Promise<void> {
  const id = input.id ?? uuid();
  if (input.id) {
    await db
      .prepare(
        `UPDATE faqs SET question = ?1, answer = ?2, category = ?3, sort_order = ?4, is_published = ?5 WHERE id = ?6`,
      )
      .bind(input.question, input.answer, input.category ?? null, input.sortOrder, input.isPublished ? 1 : 0, id)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO faqs (id, question, answer, category, sort_order, is_published, created_at) VALUES (?1,?2,?3,?4,?5,?6,datetime('now'))`,
    )
    .bind(id, input.question, input.answer, input.category ?? null, input.sortOrder, input.isPublished ? 1 : 0)
    .run();
}

export async function deleteFaq(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM faqs WHERE id = ?1`).bind(id).run();
}

/* ---------------------------------- menus --------------------------------- */

export async function getMenus(db: D1Database): Promise<Record<string, MenuLink[]>> {
  const rows = await all<Row>(db, `SELECT code, items FROM menus WHERE is_active = 1`);
  const out: Record<string, MenuLink[]> = { main: [], footer: [], mobile: [], category: [] };
  for (const r of rows) out[str(r.code)] = jsonParse<MenuLink[]>(r.items, []);
  return out;
}

/* -------------------------------- newsletter ------------------------------ */

export async function subscribeNewsletter(
  db: D1Database,
  email: string,
  source: string | null,
  ip: string | null,
): Promise<{ status: 'subscribed' | 'updated' }> {
  const normalised = email.trim().toLowerCase();
  const existing = await first<Row>(db, `SELECT id, status FROM newsletter_subscribers WHERE email = ?1`, [normalised]);
  if (existing) {
    await db
      .prepare(`UPDATE newsletter_subscribers SET status = 'subscribed', updated_at = datetime('now') WHERE id = ?1`)
      .bind(str(existing.id))
      .run();
    return { status: 'updated' };
  }
  await db
    .prepare(
      `INSERT INTO newsletter_subscribers (id, email, status, source, ip, created_at, updated_at)
       VALUES (?1,?2,'subscribed',?3,?4,datetime('now'),datetime('now'))`,
    )
    .bind(uuid(), normalised, source, ip)
    .run();
  return { status: 'subscribed' };
}

export async function unsubscribeNewsletter(db: D1Database, email: string): Promise<void> {
  await db
    .prepare(`UPDATE newsletter_subscribers SET status = 'unsubscribed', updated_at = datetime('now') WHERE email = ?1`)
    .bind(email.trim().toLowerCase())
    .run();
}

export async function listSubscribers(
  db: D1Database,
  opts: { page: number; pageSize: number },
): Promise<Paginated<{ email: string; status: string; source: string | null; createdAt: string }>> {
  const total = num(await value<number>(db, `SELECT COUNT(*) AS n FROM newsletter_subscribers`));
  const rows = await all<Row>(
    db,
    `SELECT email, status, source, created_at FROM newsletter_subscribers ORDER BY created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
  );
  return paginate(
    rows.map((r) => ({
      email: str(r.email),
      status: str(r.status),
      source: optStr(r.source),
      createdAt: toIso(r.created_at) ?? '',
    })),
    total,
    opts.page,
    opts.pageSize,
  );
}

/* ------------------------------ admin content ----------------------------- */

export async function upsertBanner(
  db: D1Database,
  input: {
    id?: string;
    title: string;
    subtitle?: string | null;
    imageKey?: string | null;
    targetUrl?: string | null;
    ctaLabel?: string | null;
    placement: string;
    sortOrder: number;
    isActive: boolean;
  },
): Promise<void> {
  const id = input.id ?? uuid();
  await db
    .prepare(
      `INSERT INTO banners (id, title, subtitle, image_key, target_url, cta_label, placement, sort_order, is_active, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,datetime('now'),datetime('now'))
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle, image_key = excluded.image_key,
         target_url = excluded.target_url, cta_label = excluded.cta_label, placement = excluded.placement,
         sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = datetime('now')`,
    )
    .bind(
      id,
      input.title,
      input.subtitle ?? null,
      input.imageKey ?? null,
      input.targetUrl ?? null,
      input.ctaLabel ?? null,
      input.placement,
      input.sortOrder,
      input.isActive ? 1 : 0,
    )
    .run();
}

export async function deleteBanner(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM banners WHERE id = ?1`).bind(id).run();
}

export async function upsertSection(
  db: D1Database,
  input: {
    id?: string;
    sectionKey: string;
    title?: string | null;
    subtitle?: string | null;
    isActive: boolean;
    sortOrder: number;
    data?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (input.id) {
    await db
      .prepare(
        `UPDATE homepage_sections SET title = ?1, subtitle = ?2, is_active = ?3, sort_order = ?4, data = ?5, updated_at = datetime('now') WHERE id = ?6`,
      )
      .bind(
        input.title ?? null,
        input.subtitle ?? null,
        input.isActive ? 1 : 0,
        input.sortOrder,
        JSON.stringify(input.data ?? {}),
        input.id,
      )
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO homepage_sections (id, section_key, title, subtitle, layout, data, is_active, sort_order, created_at, updated_at)
       VALUES (?1,?2,?3,?4,'grid',?5,?6,?7,datetime('now'),datetime('now'))
       ON CONFLICT(section_key) DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle,
         data = excluded.data, is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = datetime('now')`,
    )
    .bind(
      uuid(),
      input.sectionKey,
      input.title ?? null,
      input.subtitle ?? null,
      JSON.stringify(input.data ?? {}),
      input.isActive ? 1 : 0,
      input.sortOrder,
    )
    .run();
}

export async function upsertMenu(db: D1Database, code: string, items: MenuLink[], isActive: boolean): Promise<void> {
  await db
    .prepare(
      `INSERT INTO menus (id, code, items, is_active, updated_at) VALUES (?1,?2,?3,?4,datetime('now'))
       ON CONFLICT(code) DO UPDATE SET items = excluded.items, is_active = excluded.is_active, updated_at = datetime('now')`,
    )
    .bind(uuid(), code, JSON.stringify(items), isActive ? 1 : 0)
    .run();
}

/** Sitemap rows: published products, categories and static pages. */
export async function sitemapEntries(db: D1Database): Promise<{ path: string; updatedAt: string | null }[]> {
  const products = await all<Row>(db, `SELECT slug, updated_at FROM products WHERE status = 'active'`);
  const cats = await all<Row>(db, `SELECT slug FROM categories WHERE is_active = 1`);
  const pages = await all<Row>(db, `SELECT slug, updated_at FROM pages WHERE is_published = 1`);
  return [
    { path: '/', updatedAt: null },
    { path: '/katalog', updatedAt: null },
    ...products.map((r) => ({ path: `/produk/${str(r.slug)}`, updatedAt: toIso(r.updated_at) })),
    ...cats.map((r) => ({ path: `/kategori/${str(r.slug)}`, updatedAt: null })),
    ...pages.map((r) => ({ path: `/halaman/${str(r.slug)}`, updatedAt: toIso(r.updated_at) })),
  ];
}

export type { Category };
