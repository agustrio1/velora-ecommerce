import {
  type AdminCustomerRow,
  type DashboardStats,
  type IntegrationLogRow,
  ORDER_STATUS,
  type OrderStatus,
  PRODUCT_STATUS,
  type ProductStatus,
  type ProductUpsertInput,
  ROLE_CODE,
  type RoleCode,
  STORE_SETTINGS_KEYS,
  type StoreSettingRow,
  slugify,
} from '@velora/shared';
import type { Env } from '../env';
import {
  type Row,
  all,
  bool,
  count,
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
import { badRequest, conflict, notFound } from '../lib/errors';
import { uuid, variantSku } from '../lib/ids';
import { audit } from '../lib/log';
import { allSettings, getSetting, setSetting } from '../lib/settings';
import { mapSummary } from './catalog';
import { grantRole, revokeRole } from './identity';
import { adjustStock, ensureInventoryRow } from './inventory';
import { listOrdersAdmin } from './order';

/**
 * Admin operations. Every write here is reached only through `requireAdmin`,
 * which reads roles from D1 — the token is never the authority.
 */

const REVENUE_STATUSES = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.COMPLETED,
] as string[];
const REVENUE_PLACEHOLDERS = REVENUE_STATUSES.map(() => '?').join(',');

/* ------------------------------- dashboard -------------------------------- */

export async function dashboardStats(db: D1Database, env: Env): Promise<DashboardStats> {
  const statusRows = await all<Row>(db, `SELECT status, COUNT(*) AS n FROM orders GROUP BY status`);
  const statusCounts = Object.fromEntries(
    Object.values(ORDER_STATUS).map((s) => [s, num(statusRows.find((r) => str(r.status) === s)?.n)]),
  ) as Record<OrderStatus, number>;

  const revenueTotal = num(
    await value<number>(
      db,
      `SELECT COALESCE(SUM(grand_total),0) AS s FROM orders WHERE status IN (${REVENUE_PLACEHOLDERS})`,
      REVENUE_STATUSES,
    ),
  );
  const revenue30d = num(
    await value<number>(
      db,
      `SELECT COALESCE(SUM(grand_total),0) AS s FROM orders
        WHERE status IN (${REVENUE_PLACEHOLDERS}) AND created_at >= datetime('now','-30 days')`,
      REVENUE_STATUSES,
    ),
  );
  const ordersTotal = num(await value<number>(db, `SELECT COUNT(*) AS n FROM orders`));
  const customersTotal = num(await value<number>(db, `SELECT COUNT(*) AS n FROM users WHERE 1=1`));
  const productsTotal = num(await value<number>(db, `SELECT COUNT(*) AS n FROM products`));
  const lowStockCount = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS n FROM inventory WHERE quantity - reserved_quantity <= low_stock_threshold`,
    ),
  );

  const bestSellers = await all<Row>(
    db,
    `SELECT p.id, p.name, p.slug, p.sold_count,
            (SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0) FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id AND o.status IN (${REVENUE_PLACEHOLDERS})) AS revenue
     FROM products p ORDER BY p.sold_count DESC, revenue DESC LIMIT 5`,
    REVENUE_STATUSES,
  );

  const recent = await listOrdersAdmin(db, env, { page: 1, pageSize: 8 });

  const series = await all<Row>(
    db,
    `SELECT substr(o.created_at,1,10) AS date, SUM(o.grand_total) AS revenue, COUNT(*) AS orders
     FROM orders o WHERE o.status IN (${REVENUE_PLACEHOLDERS}) AND o.created_at >= datetime('now','-30 days')
     GROUP BY date ORDER BY date ASC`,
    REVENUE_STATUSES,
  );

  const topCategories = await all<Row>(
    db,
    `SELECT COALESCE(c.name,'Lainnya') AS name, SUM(oi.quantity * oi.unit_price) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id AND o.status IN (${REVENUE_PLACEHOLDERS})
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.primary_category_id
     GROUP BY c.name ORDER BY revenue DESC LIMIT 6`,
    REVENUE_STATUSES,
  );

  return {
    revenueTotal,
    revenue30d,
    ordersTotal,
    pendingPayments: statusCounts[ORDER_STATUS.PENDING_PAYMENT],
    statusCounts,
    customersTotal,
    productsTotal,
    lowStockCount,
    bestSellers: bestSellers.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      sold: num(r.sold_count),
      revenue: num(r.revenue),
    })),
    recentOrders: recent.items,
    revenueSeries: series.map((r) => ({ date: str(r.date), revenue: num(r.revenue), orders: num(r.orders) })),
    topCategories: topCategories.map((r) => ({ name: str(r.name), revenue: num(r.revenue) })),
  };
}

/* -------------------------------- products -------------------------------- */

export async function listAdminProducts(
  db: D1Database,
  opts: { q?: string; status?: string; page: number; pageSize: number },
  mediaFor: (key: string | null) => string | null,
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    clauses.push(
      `(p.name LIKE ?${params.length + 1} OR p.sku LIKE ?${params.length + 2} OR p.slug LIKE ?${params.length + 3})`,
    );
    const like = `%${opts.q.replace(/[^\w\s.@\-]/g, '')}%`;
    params.push(like, like, like);
  }
  if (opts.status) {
    clauses.push(`p.status = ?${params.length + 1}`);
    params.push(opts.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS n FROM products p
       LEFT JOIN categories c ON c.id = p.primary_category_id
       LEFT JOIN brands b ON b.id = p.brand_id ${where}`,
      params,
    ),
  );
  const rows = await all<Row>(
    db,
    `${PRODUCT_CARD_SELECT} ${where} ORDER BY p.updated_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return paginate(
    rows.map((r) => ({ ...mapSummary(r, mediaFor), updatedAt: toIso(r.updated_at) ?? '' })),
    total,
    opts.page,
    opts.pageSize,
  );
}

/** Card projection plus `updated_at`, so admin cards match storefront cards. */
const PRODUCT_CARD_SELECT = `
  SELECT
    p.id, p.name, p.slug, p.sku, p.price, p.sale_price, p.status,
    p.is_featured, p.is_new_arrival, p.is_best_seller, p.view_count, p.sold_count,
    p.created_at, p.updated_at,
    c.name AS category_name, c.slug AS category_slug, c.id AS category_id,
    b.name AS brand_name, b.slug AS brand_slug,
    (SELECT pi.image_key FROM product_images pi WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS primary_image,
    (SELECT COUNT(*) FROM product_images pi2 WHERE pi2.product_id = p.id) AS image_count,
    (SELECT COALESCE(SUM(i.quantity - i.reserved_quantity), 0) FROM inventory i WHERE i.product_id = p.id) AS total_stock,
    (SELECT ROUND(AVG(r.rating), 2) FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_avg,
    (SELECT COUNT(*) FROM product_reviews r2 WHERE r2.product_id = p.id AND r2.status = 'published') AS rating_count,
    (SELECT MIN(COALESCE(NULLIF(v.sale_price, -1), NULLIF(v.price, -1), COALESCE(p.sale_price, p.price)))
       FROM product_variants v WHERE v.product_id = p.id AND v.status = 'active') AS variant_min_price
  FROM products p
  LEFT JOIN categories c ON c.id = p.primary_category_id
  LEFT JOIN brands b ON b.id = p.brand_id`;

export interface AdminProductDetail extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  categoryId: string | null;
  categoryIds: string[];
  brandId: string | null;
  material: string | null;
  sizeGuideId: string | null;
  price: number;
  salePrice: number | null;
  weightGrams: number;
  dimensions: { lengthCm: number | null; widthCm: number | null; heightCm: number | null };
  status: ProductStatus;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  colors: string[];
  sizes: string[];
  images: { id: string; imageKey: string; alt: string | null; sortOrder: number; isPrimary: boolean }[];
  variants: {
    id: string;
    colorId: string;
    sizeId: string;
    colorName: string;
    sizeCode: string;
    sku: string;
    price: number | null;
    salePrice: number | null;
    weightGrams: number | null;
    imageKey: string | null;
    status: string;
    stock: number;
    reserved: number;
    available: number;
  }[];
}

export async function getAdminProduct(db: D1Database, id: string): Promise<AdminProductDetail> {
  const p = await first<Row>(db, `SELECT * FROM products WHERE id = ?1`, [id]);
  if (!p) throw notFound('Produk tidak ditemukan');
  const cats = await all<Row>(db, `SELECT category_id FROM product_categories WHERE product_id = ?1`, [id]);
  const colors = await all<Row>(db, `SELECT color_id FROM product_colors WHERE product_id = ?1`, [id]);
  const sizes = await all<Row>(db, `SELECT size_id FROM product_sizes WHERE product_id = ?1`, [id]);
  const images = await all<Row>(
    db,
    `SELECT id, image_key, alt, sort_order, is_primary FROM product_images WHERE product_id = ?1 ORDER BY is_primary DESC, sort_order ASC`,
    [id],
  );
  const variants = await all<Row>(
    db,
    `SELECT v.*, c.name AS color_name, s.code AS size_code,
            COALESCE(i.quantity,0) AS stock, COALESCE(i.reserved_quantity,0) AS reserved
     FROM product_variants v
     JOIN colors c ON c.id = v.color_id JOIN sizes s ON s.id = v.size_id
     LEFT JOIN inventory i ON i.variant_id = v.id
     WHERE v.product_id = ?1 ORDER BY s.sort_order, c.name`,
    [id],
  );
  return {
    id: str(p.id),
    name: str(p.name),
    slug: str(p.slug),
    sku: str(p.sku),
    description: str(p.description),
    categoryId: optStr(p.primary_category_id),
    categoryIds: cats.map((r) => str(r.category_id)),
    brandId: optStr(p.brand_id),
    material: optStr(p.material),
    sizeGuideId: optStr(p.size_guide_id),
    price: num(p.price),
    salePrice: optNumOrNull(p.sale_price),
    weightGrams: num(p.weight_grams),
    dimensions: {
      lengthCm: optNumOrNull(p.length_cm),
      widthCm: optNumOrNull(p.width_cm),
      heightCm: optNumOrNull(p.height_cm),
    },
    status: str(p.status) as ProductStatus,
    isFeatured: bool(p.is_featured),
    isNewArrival: bool(p.is_new_arrival),
    isBestSeller: bool(p.is_best_seller),
    metaTitle: optStr(p.meta_title),
    metaDescription: optStr(p.meta_description),
    colors: colors.map((r) => str(r.color_id)),
    sizes: sizes.map((r) => str(r.size_id)),
    images: images.map((r) => ({
      id: str(r.id),
      imageKey: str(r.image_key),
      alt: optStr(r.alt),
      sortOrder: num(r.sort_order),
      isPrimary: bool(r.is_primary),
    })),
    variants: variants.map((r) => ({
      id: str(r.id),
      colorId: str(r.color_id),
      sizeId: str(r.size_id),
      colorName: str(r.color_name),
      sizeCode: str(r.size_code),
      sku: str(r.sku),
      price: optNumOrNull(r.price),
      salePrice: optNumOrNull(r.sale_price),
      weightGrams: optNumOrNull(r.weight_grams),
      imageKey: optStr(r.image_key),
      status: str(r.status),
      stock: num(r.stock),
      reserved: num(r.reserved),
      available: num(r.stock) - num(r.reserved),
    })),
  };
}

function optNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Create or replace a product with its taxonomy, images and variants.
 *
 * Stock is only ever written through `adjustStock` so the movement ledger stays
 * complete; variants that disappear are deactivated (never deleted) because they
 * may already appear in historical orders.
 */
export async function upsertProduct(
  db: D1Database,
  actorId: string | null,
  input: ProductUpsertInput & { id?: string },
): Promise<{ id: string; slug: string; created: boolean; stockClamped: string[] }> {
  const id = input.id ?? uuid();
  const existing = input.id ? await first<Row>(db, `SELECT * FROM products WHERE id = ?1`, [id]) : null;
  if (input.id && !existing) throw notFound('Produk tidak ditemukan');

  const slug = await uniqueSlug(db, input.slug ? slugify(input.slug) : slugify(input.name), id);
  const sku = existing ? str(existing.sku) : await uniqueProductSku(db, input.sku);
  const status = (input.status ?? (existing ? str(existing.status) : PRODUCT_STATUS.DRAFT)) as ProductStatus;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO products (id, name, slug, sku, description, primary_category_id, brand_id, material, size_guide_id,
            price, sale_price, weight_grams, length_cm, width_cm, height_cm, status, is_featured, is_new_arrival, is_best_seller,
            meta_title, meta_description, published_at, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,datetime('now'),datetime('now'))
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, description = excluded.description,
           primary_category_id = excluded.primary_category_id, brand_id = excluded.brand_id, material = excluded.material,
           size_guide_id = excluded.size_guide_id, price = excluded.price, sale_price = excluded.sale_price,
           weight_grams = excluded.weight_grams, length_cm = excluded.length_cm, width_cm = excluded.width_cm,
           height_cm = excluded.height_cm, status = excluded.status, is_featured = excluded.is_featured,
           is_new_arrival = excluded.is_new_arrival, is_best_seller = excluded.is_best_seller,
           meta_title = excluded.meta_title, meta_description = excluded.meta_description,
           published_at = COALESCE(products.published_at, excluded.published_at), updated_at = datetime('now')`,
      )
      .bind(
        id,
        input.name,
        slug,
        sku,
        input.description,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.material ?? null,
        input.sizeGuideId ?? null,
        input.price,
        input.salePrice ?? null,
        input.weightGrams,
        input.dimensions?.lengthCm ?? null,
        input.dimensions?.widthCm ?? null,
        input.dimensions?.heightCm ?? null,
        status,
        input.isFeatured ? 1 : 0,
        input.isNewArrival ? 1 : 0,
        input.isBestSeller ? 1 : 0,
        input.metaTitle ?? null,
        input.metaDescription ?? null,
        status === PRODUCT_STATUS.ACTIVE ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
      ),
    db.prepare(`DELETE FROM product_categories WHERE product_id = ?1`).bind(id),
    db.prepare(`DELETE FROM product_colors WHERE product_id = ?1`).bind(id),
    db.prepare(`DELETE FROM product_sizes WHERE product_id = ?1`).bind(id),
    db.prepare(`DELETE FROM product_images WHERE product_id = ?1`).bind(id),
  ];

  const categoryIds = Array.from(
    new Set([input.categoryId, ...(input.categoryIds ?? [])].filter((v): v is string => Boolean(v))),
  );
  for (const categoryId of categoryIds) {
    statements.push(
      db.prepare(`INSERT INTO product_categories (product_id, category_id) VALUES (?1,?2)`).bind(id, categoryId),
    );
  }
  for (const colorId of new Set(input.colors)) {
    statements.push(db.prepare(`INSERT INTO product_colors (product_id, color_id) VALUES (?1,?2)`).bind(id, colorId));
  }
  for (const sizeId of new Set(input.sizes)) {
    statements.push(db.prepare(`INSERT INTO product_sizes (product_id, size_id) VALUES (?1,?2)`).bind(id, sizeId));
  }
  const images = input.images ?? [];
  const primaryIdx = images.findIndex((i) => i.isPrimary);
  images.forEach((img, index) => {
    const primary = primaryIdx >= 0 ? index === primaryIdx : index === 0;
    statements.push(
      db
        .prepare(
          `INSERT INTO product_images (id, product_id, image_key, alt, sort_order, is_primary, created_at) VALUES (?1,?2,?3,?4,?5,?6,datetime('now'))`,
        )
        .bind(uuid(), id, img.imageKey, img.alt ?? null, img.sortOrder ?? index, primary ? 1 : 0),
    );
  });

  await db.batch(statements);

  // Validate taxonomy ids before touching variants so a typo can't orphan rows.
  for (const [table, label, ids] of [
    ['colors', 'warna', input.colors],
    ['sizes', 'ukuran', input.sizes],
  ] as const) {
    const placeholders = ids.map(() => '?').join(',');
    const found = num(await value<number>(db, `SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${placeholders})`, ids));
    if (found !== new Set(ids).size) throw badRequest(`Daftar ${label} mengandung id yang tidak dikenal`);
  }

  const colorSlugs = await all<Row>(
    db,
    `SELECT id, slug FROM colors WHERE id IN (${input.colors.map(() => '?').join(',')})`,
    input.colors,
  );
  const slugOf = new Map(colorSlugs.map((c) => [str(c.id), str(c.slug)]));

  const stockClamped: string[] = [];
  for (const draft of input.variants) {
    const colorSlug = slugOf.get(draft.colorId) ?? 'x';
    const sizeRow = await first<Row>(db, `SELECT code FROM sizes WHERE id = ?1`, [draft.sizeId]);
    if (!sizeRow) throw badRequest(`Ukuran ${draft.sizeId} tidak ditemukan`);
    const sizeCode = str(sizeRow.code);
    const expectedSku = draft.sku || variantSku(sku, colorSlug, sizeCode);
    const byPair = await first<Row>(
      db,
      `SELECT v.id, COALESCE(i.quantity,0) AS qty, COALESCE(i.reserved_quantity,0) AS res
       FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
       WHERE v.product_id = ?1 AND v.color_id = ?2 AND v.size_id = ?3`,
      [id, draft.colorId, draft.sizeId],
    );

    let variantId: string;
    if (byPair) {
      variantId = str(byPair.id);
      await db
        .prepare(
          `UPDATE product_variants SET sku = ?1, price = ?2, sale_price = ?3, weight_grams = ?4, image_key = ?5,
             status = ?6, updated_at = datetime('now') WHERE id = ?7`,
        )
        .bind(
          expectedSku,
          draft.price ?? null,
          draft.salePrice ?? null,
          draft.weightGrams ?? null,
          draft.imageKey ?? null,
          draft.status,
          variantId,
        )
        .run();
    } else {
      variantId = uuid();
      await db
        .prepare(
          `INSERT INTO product_variants (id, product_id, color_id, size_id, sku, price, sale_price, weight_grams, image_key, status, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,datetime('now'),datetime('now'))`,
        )
        .bind(
          variantId,
          id,
          draft.colorId,
          draft.sizeId,
          expectedSku,
          draft.price ?? null,
          draft.salePrice ?? null,
          draft.weightGrams ?? null,
          draft.imageKey ?? null,
          draft.status,
        )
        .run();
      await ensureInventoryRow(db, variantId, id, 0);
    }

    const current = byPair ? num(byPair.qty) : 0;
    const reserved = byPair ? num(byPair.res) : 0;
    const target = Math.max(draft.stock, reserved);
    if (target !== draft.stock) stockClamped.push(`${colorSlug}/${sizeCode}`);
    if (target !== current) {
      await adjustStock(db, {
        variantId,
        type: 'adjust',
        quantity: target,
        actorId,
        note: existing ? 'Sinkron stok lewat formulir produk' : 'Stok awal produk',
      });
    }
    void current;
  }

  // Variants the admin removed from the form are deactivated, never deleted.
  const draftKeys = new Set(input.variants.map((v) => `${v.colorId}:${v.sizeId}`));
  const allVariants = await all<Row>(
    db,
    `SELECT id, color_id, size_id, status FROM product_variants WHERE product_id = ?1`,
    [id],
  );
  for (const v of allVariants) {
    if (draftKeys.has(`${str(v.color_id)}:${str(v.size_id)}`)) continue;
    if (str(v.status) === 'inactive') continue;
    await db
      .prepare(`UPDATE product_variants SET status = 'inactive', updated_at = datetime('now') WHERE id = ?1`)
      .bind(str(v.id))
      .run();
  }

  await refreshProductRollups(db, id);
  return { id, slug, created: !existing, stockClamped };
}

/** Keeps `sold_count` derived and the status honest after variant edits. */
export async function refreshProductRollups(db: D1Database, productId: string): Promise<void> {
  const available = num(
    await value<number>(
      db,
      `SELECT COALESCE(SUM(i.quantity - i.reserved_quantity),0) AS n FROM inventory i
         JOIN product_variants v ON v.id = i.variant_id
        WHERE i.product_id = ?1 AND v.status = 'active'`,
      [productId],
    ),
  );
  await db
    .prepare(
      `UPDATE products SET status = CASE
          WHEN status = 'active' AND ?1 <= 0 THEN 'out_of_stock'
          WHEN status = 'out_of_stock' AND ?1 > 0 THEN 'active'
          ELSE status END,
        updated_at = datetime('now') WHERE id = ?2`,
    )
    .bind(available, productId)
    .run();
}

async function uniqueSlug(db: D1Database, base: string, keepId: string): Promise<string> {
  const root = (base || 'produk').slice(0, 150);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await first<Row>(db, `SELECT id FROM products WHERE slug = ?1 AND id <> ?2`, [candidate, keepId]);
    if (!clash) return candidate;
  }
  throw conflict('Slug produk penuh, gunakan nama lain');
}

async function uniqueProductSku(db: D1Database, wanted: string): Promise<string> {
  const root = wanted.toUpperCase().slice(0, 50);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await first<Row>(db, `SELECT id FROM products WHERE sku = ?1`, [candidate]);
    if (!clash) return candidate;
  }
  throw conflict('SKU produk penuh, gunakan kode lain');
}

export async function setProductStatus(db: D1Database, id: string, status: ProductStatus): Promise<void> {
  const row = await first<Row>(db, `SELECT id, published_at FROM products WHERE id = ?1`, [id]);
  if (!row) throw notFound('Produk tidak ditemukan');
  await db
    .prepare(
      `UPDATE products SET status = ?1, published_at = COALESCE(published_at, CASE WHEN ?1 = 'active' THEN datetime('now') END),
        updated_at = datetime('now') WHERE id = ?2`,
    )
    .bind(status, id)
    .run();
}

/**
 * Hard delete is only offered for products that were never ordered; anything
 * with history is archived so reports and customer receipts stay intact.
 */
export async function deleteOrArchiveProduct(db: D1Database, id: string): Promise<{ deleted: boolean }> {
  const row = await first<Row>(db, `SELECT id, name FROM products WHERE id = ?1`, [id]);
  if (!row) throw notFound('Produk tidak ditemukan');
  const ordered = num(await value<number>(db, `SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?1`, [id]));
  if (ordered > 0) {
    await setProductStatus(db, id, PRODUCT_STATUS.ARCHIVED);
    return { deleted: false };
  }
  await db.prepare(`DELETE FROM products WHERE id = ?1`).bind(id).run();
  return { deleted: true };
}

/* ------------------------------- taxonomy --------------------------------- */

export async function upsertCategory(
  db: D1Database,
  actorId: string | null,
  input: Record<string, unknown> & { id?: string },
): Promise<string> {
  const id = input.id ?? uuid();
  const name = String(input.name);
  const base = input.slug ? slugify(String(input.slug)) : slugify(name);
  const clash = await first<Row>(db, `SELECT id FROM categories WHERE slug = ?1 AND id <> ?2`, [base, id]);
  const slug = clash ? `${base}-${id.slice(0, 4)}` : base;
  await db
    .prepare(
      `INSERT INTO categories (id, name, slug, description, image_key, parent_id, sort_order, is_active, meta_title, meta_description, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,datetime('now'),datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, description = excluded.description,
         image_key = excluded.image_key, parent_id = excluded.parent_id, sort_order = excluded.sort_order,
         is_active = excluded.is_active, meta_title = excluded.meta_title, meta_description = excluded.meta_description, updated_at = datetime('now')`,
    )
    .bind(
      id,
      name,
      slug,
      input.description ?? null,
      input.imageKey ?? null,
      input.parentId ?? null,
      num(input.sortOrder),
      input.isActive === false ? 0 : 1,
      input.metaTitle ?? null,
      input.metaDescription ?? null,
    )
    .run();
  await audit(db, { actorId, action: 'category.upsert', entity: 'category', entityId: id, metadata: { name } });
  return id;
}

export async function deleteCategory(db: D1Database, actorId: string | null, id: string): Promise<void> {
  const used = num(await value<number>(db, `SELECT COUNT(*) AS n FROM products WHERE primary_category_id = ?1`, [id]));
  if (used > 0) throw conflict(`${used} produk masih memakai kategori ini`);
  await db.prepare(`DELETE FROM categories WHERE id = ?1`).bind(id).run();
  await audit(db, { actorId, action: 'category.delete', entity: 'category', entityId: id });
}

export async function upsertBrand(
  db: D1Database,
  actorId: string | null,
  input: Record<string, unknown> & { id?: string },
): Promise<string> {
  const id = input.id ?? uuid();
  const name = String(input.name);
  const base = input.slug ? slugify(String(input.slug)) : slugify(name);
  const clash = await first<Row>(db, `SELECT id FROM brands WHERE slug = ?1 AND id <> ?2`, [base, id]);
  const slug = clash ? `${base}-${id.slice(0, 4)}` : base;
  await db
    .prepare(
      `INSERT INTO brands (id, name, slug, description, logo_key, is_active, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,datetime('now'),datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, description = excluded.description,
         logo_key = excluded.logo_key, is_active = excluded.is_active, updated_at = datetime('now')`,
    )
    .bind(id, name, slug, input.description ?? null, input.logoKey ?? null, input.isActive === false ? 0 : 1)
    .run();
  await audit(db, { actorId, action: 'brand.upsert', entity: 'brand', entityId: id, metadata: { name } });
  return id;
}

export async function deleteBrand(db: D1Database, actorId: string | null, id: string): Promise<void> {
  const used = num(await value<number>(db, `SELECT COUNT(*) AS n FROM products WHERE brand_id = ?1`, [id]));
  if (used > 0) throw conflict(`${used} produk masih memakai brand ini`);
  await db.prepare(`DELETE FROM brands WHERE id = ?1`).bind(id).run();
  await audit(db, { actorId, action: 'brand.delete', entity: 'brand', entityId: id });
}

export async function upsertColor(
  db: D1Database,
  actorId: string | null,
  input: { id?: string; name: string; slug?: string; hexCode: string },
): Promise<string> {
  const id = input.id ?? uuid();
  const base = input.slug ? slugify(input.slug) : slugify(input.name);
  const clash = await first<Row>(db, `SELECT id FROM colors WHERE slug = ?1 AND id <> ?2`, [base, id]);
  const slug = clash ? `${base}-${id.slice(0, 4)}` : base;
  await db
    .prepare(
      `INSERT INTO colors (id, name, slug, hex_code, created_at) VALUES (?1,?2,?3,?4,datetime('now')) ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, hex_code = excluded.hex_code`,
    )
    .bind(id, input.name, slug, input.hexCode)
    .run();
  await audit(db, { actorId, action: 'color.upsert', entity: 'color', entityId: id });
  return id;
}

export async function deleteColor(db: D1Database, actorId: string | null, id: string): Promise<void> {
  const used = num(await value<number>(db, `SELECT COUNT(*) AS n FROM product_variants WHERE color_id = ?1`, [id]));
  if (used > 0) throw conflict(`${used} varian masih memakai warna ini`);
  await db.prepare(`DELETE FROM colors WHERE id = ?1`).bind(id).run();
  await audit(db, { actorId, action: 'color.delete', entity: 'color', entityId: id });
}

export async function upsertSize(
  db: D1Database,
  actorId: string | null,
  input: { id?: string; code: string; name: string; sortOrder: number; sizeGuideId?: string | null },
): Promise<string> {
  const id = input.id ?? uuid();
  await db
    .prepare(
      `INSERT INTO sizes (id, code, name, sort_order, size_guide_id, created_at) VALUES (?1,?2,?3,?4,?5,datetime('now')) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, sort_order = excluded.sort_order, size_guide_id = excluded.size_guide_id`,
    )
    .bind(id, input.code.toUpperCase(), input.name, input.sortOrder, input.sizeGuideId ?? null)
    .run();
  await audit(db, { actorId, action: 'size.upsert', entity: 'size', entityId: id });
  return id;
}

export async function deleteSize(db: D1Database, actorId: string | null, id: string): Promise<void> {
  const used = num(await value<number>(db, `SELECT COUNT(*) AS n FROM product_variants WHERE size_id = ?1`, [id]));
  if (used > 0) throw conflict(`${used} varian masih memakai ukuran ini`);
  await db.prepare(`DELETE FROM sizes WHERE id = ?1`).bind(id).run();
  await audit(db, { actorId, action: 'size.delete', entity: 'size', entityId: id });
}

export async function listSizeGuides(db: D1Database) {
  const rows = await all<Row>(db, `SELECT * FROM size_guides ORDER BY type, name`);
  return rows.map((r) => ({
    id: str(r.id),
    name: str(r.name),
    type: str(r.type),
    description: optStr(r.description),
    columns: jsonParse<string[]>(r.columns, []),
    rows: jsonParse<string[][]>(r.rows, []),
  }));
}

/* ------------------------------ taxonomies ------------------------------ */

/** Admin view of the taxonomy: inactive rows stay visible so they can be re-enabled. */
export async function listTaxonomies(db: D1Database, media: (key: string | null) => string | null) {
  const [categories, brands, colors, sizes] = await Promise.all([
    all<Row>(
      db,
      `SELECT c.*, (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count,
              (SELECT COUNT(*) FROM products p WHERE p.primary_category_id = c.id) AS direct_count
       FROM categories c ORDER BY c.sort_order ASC, c.name ASC`,
    ),
    all<Row>(
      db,
      `SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS product_count
       FROM brands b ORDER BY b.name ASC`,
    ),
    all<Row>(
      db,
      `SELECT co.*, (SELECT COUNT(*) FROM product_colors pc WHERE pc.color_id = co.id) AS product_count
       FROM colors co ORDER BY co.name ASC`,
    ),
    all<Row>(
      db,
      `SELECT s.*, (SELECT COUNT(*) FROM product_variants v WHERE v.size_id = s.id AND v.status = 'active') AS variant_count
       FROM sizes s ORDER BY s.sort_order ASC`,
    ),
  ]);
  return {
    categories: categories.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      description: optStr(r.description),
      parentId: optStr(r.parent_id),
      imageUrl: media(optStr(r.image_key)),
      imageKey: optStr(r.image_key),
      sortOrder: num(r.sort_order),
      isActive: bool(r.is_active),
      productCount: num(r.product_count),
      directCount: num(r.direct_count),
      metaTitle: optStr(r.meta_title),
      metaDescription: optStr(r.meta_description),
    })),
    brands: brands.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      description: optStr(r.description),
      logoKey: optStr(r.logo_key),
      logoUrl: media(optStr(r.logo_key)),
      isActive: bool(r.is_active),
      productCount: num(r.product_count),
    })),
    colors: colors.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      hexCode: str(r.hex_code),
      productCount: num(r.product_count),
    })),
    sizes: sizes.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      name: str(r.name),
      sortOrder: num(r.sort_order),
      sizeGuideId: optStr(r.size_guide_id),
      variantCount: num(r.variant_count),
    })),
  };
}

/** Shipping origins, newest default first. */
export async function listShippingOrigins(db: D1Database) {
  const rows = await all<Row>(db, `SELECT * FROM shipping_origins ORDER BY is_default DESC, created_at ASC`);
  return rows.map((r) => ({
    id: str(r.id),
    name: str(r.name),
    contactName: str(r.contact_name),
    phone: str(r.phone),
    address: str(r.address),
    province: str(r.province),
    city: str(r.city),
    district: str(r.district),
    postcode: str(r.postcode),
    areaId: str(r.area_id),
    isDefault: bool(r.is_default),
    isActive: bool(r.is_active),
  }));
}

/* -------------------------------- coupons --------------------------------- */

export async function listCoupons(db: D1Database, opts: { page: number; pageSize: number }) {
  const total = num(await value<number>(db, `SELECT COUNT(*) AS n FROM coupons`));
  const rows = await all<Row>(
    db,
    `SELECT * FROM coupons ORDER BY created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
  );
  return paginate(rows.map(mapCoupon), total, opts.page, opts.pageSize);
}

function mapCoupon(r: Row) {
  return {
    id: str(r.id),
    code: str(r.code),
    name: str(r.name),
    type: str(r.type),
    value: num(r.value),
    minPurchase: optNumOrNull(r.min_purchase),
    maxDiscount: optNumOrNull(r.max_discount),
    usageLimit: optNumOrNull(r.usage_limit),
    perUserLimit: optNumOrNull(r.per_user_limit),
    usedCount: num(r.used_count),
    startsAt: toIso(r.starts_at),
    endsAt: toIso(r.ends_at),
    isActive: bool(r.is_active),
    categoryIds: jsonParse<string[]>(r.category_ids, []),
    productIds: jsonParse<string[]>(r.product_ids, []),
    freeShippingMax: optNumOrNull(r.free_shipping_max),
    createdAt: toIso(r.created_at) ?? '',
  };
}

export async function upsertCoupon(
  db: D1Database,
  actorId: string | null,
  input: Record<string, unknown> & { id?: string },
): Promise<string> {
  const id = input.id ?? uuid();
  const code = String(input.code).toUpperCase();
  const clash = await first<Row>(db, `SELECT id FROM coupons WHERE code = ?1 AND id <> ?2`, [code, id]);
  if (clash) throw conflict('Kode kupon sudah dipakai');
  const toSql = (v: unknown) => (v ? String(v).replace('T', ' ').slice(0, 19) : null);
  await db
    .prepare(
      `INSERT INTO coupons (id, code, name, type, value, min_purchase, max_discount, usage_limit, per_user_limit,
          used_count, starts_at, ends_at, is_active, category_ids, product_ids, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11,?12,?13,?14,datetime('now'),datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, value = excluded.value,
         min_purchase = excluded.min_purchase, max_discount = excluded.max_discount, usage_limit = excluded.usage_limit,
         per_user_limit = excluded.per_user_limit, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
         is_active = excluded.is_active, category_ids = excluded.category_ids, product_ids = excluded.product_ids, updated_at = datetime('now')`,
    )
    .bind(
      id,
      code,
      String(input.name),
      String(input.type),
      num(input.value),
      input.minPurchase ?? null,
      input.maxDiscount ?? null,
      input.usageLimit ?? null,
      input.perUserLimit ?? null,
      toSql(input.startsAt),
      toSql(input.endsAt),
      input.isActive === false ? 0 : 1,
      JSON.stringify(input.categoryIds ?? []),
      JSON.stringify(input.productIds ?? []),
    )
    .run();
  await audit(db, { actorId, action: 'coupon.upsert', entity: 'coupon', entityId: id, metadata: { code } });
  return id;
}

export async function deleteCoupon(db: D1Database, actorId: string | null, id: string): Promise<void> {
  const used = num(await value<number>(db, `SELECT COUNT(*) AS n FROM coupon_usages WHERE coupon_id = ?1`, [id]));
  if (used > 0) throw conflict(`Kupon sudah dipakai ${used} kali dan tidak dapat dihapus; nonaktifkan saja`);
  await db.prepare(`DELETE FROM coupons WHERE id = ?1`).bind(id).run();
  await audit(db, { actorId, action: 'coupon.delete', entity: 'coupon', entityId: id });
}

/* ------------------------------- customers -------------------------------- */

export async function listCustomers(db: D1Database, opts: { q?: string; page: number; pageSize: number }) {
  // The display name lives on `users`; `user_profiles` only carries `full_name`.
  const where = opts.q
    ? `WHERE u.email LIKE ?1 OR u.display_name LIKE ?1 OR p.full_name LIKE ?1 OR u.phone LIKE ?1`
    : '';
  const params = opts.q ? [`%${opts.q.replace(/[^\w\s.@\-]/g, '')}%`] : [];
  const total = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS n FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id ${where}`,
      params,
    ),
  );
  const items = await customerRows(
    db,
    `${where} ORDER BY u.created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return paginate(items, total, opts.page, opts.pageSize);
}

/** One customer row, whether it comes from the list or the detail screen. */
async function customerRows(db: D1Database, tail: string, filterParams: unknown[]): Promise<AdminCustomerRow[]> {
  const rows = await all<Row>(
    db,
    `SELECT u.id, u.email, u.phone, u.status, u.created_at,
            COALESCE(NULLIF(u.display_name, ''), p.full_name) AS display_name,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(o.grand_total),0) FROM orders o WHERE o.user_id = u.id AND o.status IN (${REVENUE_PLACEHOLDERS})) AS total_spent,
            (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) AS last_order_at
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     ${tail}`,
    [...filterParams, ...REVENUE_STATUSES],
  );
  const ids = rows.map((r) => str(r.id));
  const rolesByUser = new Map<string, string[]>();
  if (ids.length) {
    const roleRows = await all<Row>(
      db,
      `SELECT ur.user_id, r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    for (const r of roleRows) {
      const list = rolesByUser.get(str(r.user_id)) ?? [];
      list.push(str(r.code));
      rolesByUser.set(str(r.user_id), list);
    }
  }
  return rows.map<AdminCustomerRow>((r) => ({
    id: str(r.id),
    email: str(r.email),
    displayName: optStr(r.display_name),
    phone: optStr(r.phone),
    status: str(r.status) as AdminCustomerRow['status'],
    roles: (rolesByUser.get(str(r.id)) ?? [ROLE_CODE.CUSTOMER]) as RoleCode[],
    orderCount: num(r.order_count),
    totalSpent: num(r.total_spent),
    lastOrderAt: toIso(r.last_order_at),
    createdAt: toIso(r.created_at) ?? '',
  }));
}

export async function customerDetail(db: D1Database, id: string) {
  const [found] = await customerRows(db, 'WHERE u.id = ?1', [id]);
  if (!found) throw notFound('Pelanggan tidak ditemukan');
  const addresses = await all<Row>(
    db,
    `SELECT * FROM user_addresses WHERE user_id = ?1 ORDER BY is_default DESC, created_at ASC`,
    [id],
  );
  const orders = await all<Row>(
    db,
    `SELECT id, code, status, grand_total, created_at FROM orders WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20`,
    [id],
  );
  return {
    ...found,
    addresses: addresses.map((a) => ({
      id: str(a.id),
      label: optStr(a.label),
      recipientName: str(a.recipient_name),
      phone: str(a.phone),
      province: str(a.province),
      city: str(a.city),
      district: str(a.district),
      postcode: str(a.postcode),
      detail: str(a.detail),
      isDefault: bool(a.is_default),
    })),
    orders: orders.map((o) => ({
      id: str(o.id),
      code: str(o.code),
      status: str(o.status),
      grandTotal: num(o.grand_total),
      createdAt: toIso(o.created_at) ?? '',
    })),
  };
}

export async function updateCustomer(
  db: D1Database,
  actorId: string | null,
  targetId: string,
  input: { status?: 'active' | 'disabled'; roles?: RoleCode[] },
): Promise<void> {
  const user = await first<Row>(db, `SELECT id FROM users WHERE id = ?1`, [targetId]);
  if (!user) throw notFound('Pengguna tidak ditemukan');
  if (targetId === actorId && input.roles) {
    throw conflict('Peran akun sendiri tidak dapat diubah');
  }
  if (input.status) {
    await db
      .prepare(`UPDATE users SET status = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(input.status, targetId)
      .run();
  }
  if (input.roles) {
    const current = await all<Row>(
      db,
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?1`,
      [targetId],
    );
    const have = new Set(current.map((c) => str(c.code)));
    for (const role of input.roles) if (!have.has(role)) await grantRole(db, targetId, role, actorId);
    for (const code of have)
      if (!input.roles.includes(code as RoleCode)) await revokeRole(db, targetId, code as RoleCode);
  }
  await audit(db, { actorId, action: 'customer.update', entity: 'user', entityId: targetId, metadata: input });
}

/* --------------------------------- reviews -------------------------------- */

export async function listReviewsAdmin(db: D1Database, opts: { status?: string; page: number; pageSize: number }) {
  const params: unknown[] = [];
  const where = opts.status ? 'WHERE r.status = ?1' : '';
  if (opts.status) params.push(opts.status);
  const total = num(await value<number>(db, `SELECT COUNT(*) AS n FROM product_reviews r ${where}`, params));
  const rows = await all<Row>(
    db,
    `SELECT r.*, p.name AS product_name, p.slug AS product_slug, u.email
     FROM product_reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id
     ${where} ORDER BY r.created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return paginate(
    rows.map((r) => ({
      id: str(r.id),
      productId: str(r.product_id),
      productName: str(r.product_name),
      productSlug: str(r.product_slug),
      email: str(r.email),
      rating: num(r.rating),
      title: optStr(r.title),
      body: str(r.body),
      status: str(r.status),
      verifiedPurchase: bool(r.verified_purchase),
      createdAt: toIso(r.created_at) ?? '',
    })),
    total,
    opts.page,
    opts.pageSize,
  );
}

export async function setReviewStatus(
  db: D1Database,
  actorId: string | null,
  id: string,
  status: 'published' | 'pending' | 'rejected',
): Promise<void> {
  const row = await first<Row>(db, `SELECT id FROM product_reviews WHERE id = ?1`, [id]);
  if (!row) throw notFound('Ulasan tidak ditemukan');
  await db
    .prepare(`UPDATE product_reviews SET status = ?1, updated_at = datetime('now') WHERE id = ?2`)
    .bind(status, id)
    .run();
  await audit(db, { actorId, action: 'review.moderate', entity: 'review', entityId: id, metadata: { status } });
}

/* -------------------------------- settings -------------------------------- */

export async function publicSettings(db: D1Database): Promise<StoreSettingRow[]> {
  const rows = await allSettings(db);
  return rows.filter((r) => r.key !== STORE_SETTINGS_KEYS.DUITKU && r.key !== STORE_SETTINGS_KEYS.BITESHIP);
}

export async function patchSettings(
  db: D1Database,
  actorId: string | null,
  patch: Record<string, unknown>,
  ip: string | null,
): Promise<string[]> {
  const keys = Object.keys(patch);
  for (const key of keys) {
    const value = patch[key];
    if (key === STORE_SETTINGS_KEYS.SHIPPING_ORIGIN) {
      await setShippingOrigin(db, value as Record<string, unknown>);
      continue;
    }
    const isPublic = ![STORE_SETTINGS_KEYS.DUITKU, STORE_SETTINGS_KEYS.BITESHIP].includes(key as never);
    await setSetting(db, key, value, isPublic);
  }
  await audit(db, { actorId, action: 'settings.patch', entity: 'store_settings', metadata: { keys }, ip });
  return keys;
}

/** The shipping origin lives in its own table because Biteship needs the record. */
export async function setShippingOrigin(db: D1Database, input: Record<string, unknown>): Promise<void> {
  const existing = await first<Row>(
    db,
    `SELECT id FROM shipping_origins ORDER BY is_default DESC, created_at ASC LIMIT 1`,
  );
  const id = existing ? str(existing.id) : uuid();
  await db
    .prepare(
      `INSERT INTO shipping_origins (id, name, contact_name, phone, address, province, city, district, postcode, area_id, is_default, is_active, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,1,datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, contact_name = excluded.contact_name, phone = excluded.phone,
         address = excluded.address, province = excluded.province, city = excluded.city, district = excluded.district,
         postcode = excluded.postcode, area_id = excluded.area_id, is_default = 1, is_active = 1`,
    )
    .bind(
      id,
      String(input.name),
      String(input.contactName),
      String(input.phone),
      String(input.address),
      String(input.province ?? ''),
      String(input.city ?? ''),
      String(input.district ?? ''),
      String(input.postcode ?? ''),
      String(input.areaId),
    )
    .run();
}

export async function getSettingValue<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  return getSetting(db, key, fallback);
}

/* ---------------------------------- logs ---------------------------------- */

export async function listIntegrationLogs(
  db: D1Database,
  opts: { provider?: string; onlyFailed?: boolean; page: number; pageSize: number },
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.provider) {
    clauses.push(`provider = ?${params.length + 1}`);
    params.push(opts.provider);
  }
  if (opts.onlyFailed) clauses.push('success = 0');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = num(await value<number>(db, `SELECT COUNT(*) AS n FROM integration_logs ${where}`, params));
  const rows = await all<Row>(
    db,
    `SELECT id, provider, direction, endpoint, status_code, success, message, reference, created_at
     FROM integration_logs ${where} ORDER BY created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return paginate(
    rows.map((r) => ({
      id: str(r.id),
      provider: str(r.provider) as IntegrationLogRow['provider'],
      direction: str(r.direction) as 'request' | 'callback',
      endpoint: str(r.endpoint),
      statusCode: optNumOrNull(r.status_code),
      success: bool(r.success),
      message: optStr(r.message),
      reference: optStr(r.reference),
      createdAt: toIso(r.created_at) ?? '',
    })),
    total,
    opts.page,
    opts.pageSize,
  );
}

export async function listActivityLogs(db: D1Database, opts: { page: number; pageSize: number }) {
  const total = num(await value<number>(db, `SELECT COUNT(*) AS n FROM admin_activity_logs`));
  const rows = await all<Row>(
    db,
    `SELECT l.*, u.email AS actor_email FROM admin_activity_logs l LEFT JOIN users u ON u.id = l.actor_id
     ORDER BY l.created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
  );
  return paginate(
    rows.map((r) => ({
      id: str(r.id),
      actor: optStr(r.actor_email) ?? 'sistem',
      action: str(r.action),
      entity: str(r.entity),
      entityId: optStr(r.entity_id),
      metadata: jsonParse<Record<string, unknown>>(r.metadata, {}),
      ip: optStr(r.ip),
      createdAt: toIso(r.created_at) ?? '',
    })),
    total,
    opts.page,
    opts.pageSize,
  );
}

export async function healthCounters(db: D1Database): Promise<{ orders: number; products: number; users: number }> {
  return {
    orders: await count(db, `SELECT COUNT(*) AS n FROM orders`),
    products: await count(db, `SELECT COUNT(*) AS n FROM products`),
    users: await count(db, `SELECT COUNT(*) AS n FROM users`),
  };
}

export type { AdminProductDetail as AdminProduct };
