import type {
  Brand,
  Category,
  ColorRef,
  ProductDetail,
  ProductImage,
  ProductReview,
  ProductSummary,
  ProductVariant,
  RelatedProduct,
  SizeGuide,
  SizeRef,
} from '@velora/shared';
import { discountPercent } from '@velora/shared';
import {
  type Row,
  all,
  bool,
  first,
  jsonParse,
  limitOffset,
  num,
  optNum,
  optStr,
  paginate,
  rows,
  str,
  toIso,
  value,
} from '../lib/db';
import { badRequest, notFound } from '../lib/errors';
import { shapeForCategory } from '../lib/media';

/**
 * Catalogue reads. Every filter, sort and pagination decision below is made in
 * SQL — the browser never receives the whole product table to filter locally.
 */

export interface CatalogFilters {
  q?: string;
  categorySlug?: string;
  brandSlug?: string;
  colorIds?: string[];
  sizeIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  featured?: boolean;
  newOnly?: boolean;
  bestOnly?: boolean;
  sort: string;
  page: number;
  pageSize: number;
}

/** Effective selling price expression, variant-aware, computed in SQL. */
const EFFECTIVE_PRICE_SQL = `COALESCE(NULLIF(v.sale_price, -1), NULLIF(v.price, -1), COALESCE(p.sale_price, p.price))`;

/** Shared projection so every product-card feature returns identical shapes. */
export const SUMMARY_SELECT = `
  SELECT
    p.id, p.name, p.slug, p.sku, p.price, p.sale_price, p.status,
    p.is_featured, p.is_new_arrival, p.is_best_seller, p.view_count, p.sold_count,
    p.created_at, p.published_at,
    c.name AS category_name, c.slug AS category_slug, c.id AS category_id,
    b.name AS brand_name, b.slug AS brand_slug,
    (SELECT pi.image_key FROM product_images pi WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS primary_image,
    (SELECT COUNT(*) FROM product_images pi2 WHERE pi2.product_id = p.id) AS image_count,
    (SELECT COALESCE(SUM(i.quantity - i.reserved_quantity), 0) FROM inventory i WHERE i.product_id = p.id) AS total_stock,
    (SELECT ROUND(AVG(r.rating), 2) FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_avg,
    (SELECT COUNT(*) FROM product_reviews r2 WHERE r2.product_id = p.id AND r2.status = 'published') AS rating_count,
    (SELECT MIN(${EFFECTIVE_PRICE_SQL}) FROM product_variants v WHERE v.product_id = p.id AND v.status = 'active') AS variant_min_price
  FROM products p
  LEFT JOIN categories c ON c.id = p.primary_category_id
  LEFT JOIN brands b ON b.id = p.brand_id`;

function buildFilterWhere(f: CatalogFilters): { sql: string; params: unknown[] } {
  const parts: string[] = ["p.status = 'active'"];
  const params: unknown[] = [];

  if (f.q) {
    const like = `%${f.q.replace(/[^\w\s\-']/g, '').trim()}%`;
    parts.push(`(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ? OR b.name LIKE ? OR c.name LIKE ?)`);
    params.push(like, like, like, like, like);
  }
  if (f.categorySlug) {
    // Inactive categories stay in the database but must not surface products:
    // the storefront only links to categories where `is_active = 1`.
    parts.push(
      `(p.primary_category_id IN (SELECT id FROM categories WHERE slug = ? AND is_active = 1)
        OR p.id IN (SELECT pc.product_id FROM product_categories pc JOIN categories c2 ON c2.id = pc.category_id
                    WHERE c2.slug = ? AND c2.is_active = 1))`,
    );
    params.push(f.categorySlug, f.categorySlug);
  }
  if (f.brandSlug) {
    parts.push('b.slug = ?');
    params.push(f.brandSlug);
  }
  if (f.colorIds?.length) {
    parts.push(
      `p.id IN (SELECT pco.product_id FROM product_colors pco WHERE pco.color_id IN (${f.colorIds.map(() => '?').join(',')}))`,
    );
    params.push(...f.colorIds);
  }
  if (f.sizeIds?.length) {
    parts.push(
      `p.id IN (SELECT pso.product_id FROM product_sizes pso WHERE pso.size_id IN (${f.sizeIds.map(() => '?').join(',')}))`,
    );
    params.push(...f.sizeIds);
  }
  if (typeof f.minPrice === 'number') {
    parts.push('COALESCE(p.sale_price, p.price) >= ?');
    params.push(f.minPrice);
  }
  if (typeof f.maxPrice === 'number') {
    parts.push('COALESCE(p.sale_price, p.price) <= ?');
    params.push(f.maxPrice);
  }
  if (f.inStock) {
    parts.push(`EXISTS (SELECT 1 FROM inventory i JOIN product_variants v2 ON v2.id = i.variant_id
                        WHERE i.product_id = p.id AND v2.status = 'active' AND (i.quantity - i.reserved_quantity) > 0)`);
  }
  if (f.onSale) {
    parts.push('p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.price');
  }
  if (f.featured) parts.push('p.is_featured = 1');
  if (f.newOnly) parts.push('p.is_new_arrival = 1');
  if (f.bestOnly) parts.push('p.is_best_seller = 1');

  return { sql: `WHERE ${parts.join(' AND ')}`, params };
}

const SORT_SQL: Record<string, string> = {
  latest: 'COALESCE(p.published_at, p.created_at) DESC, p.id DESC',
  price_asc: 'COALESCE(p.sale_price, p.price) ASC',
  price_desc: 'COALESCE(p.sale_price, p.price) DESC',
  popular: 'p.view_count DESC, p.sold_count DESC',
  best_seller: 'p.sold_count DESC, p.is_best_seller DESC',
  name_asc: 'p.name ASC',
};

export function mapSummary(row: Row, mediaFor: (key: string | null) => string | null): ProductSummary {
  const price = num(row.price);
  const salePrice = optNum(row.sale_price);
  const realSale = salePrice && salePrice > 0 && salePrice < price ? salePrice : null;
  // A catalogue card must show the cheapest live variant price when variants differ.
  const variantMin = optNum(row.variant_min_price);
  const displaySale =
    variantMin !== null && realSale !== null && variantMin < price ? Math.min(variantMin, realSale) : realSale;
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    sku: str(row.sku),
    price,
    salePrice: displaySale,
    status: str(row.status) as ProductSummary['status'],
    isFeatured: bool(row.is_featured),
    isNewArrival: bool(row.is_new_arrival),
    isBestSeller: bool(row.is_best_seller),
    categoryName: optStr(row.category_name),
    categorySlug: optStr(row.category_slug),
    brandName: optStr(row.brand_name),
    primaryImage: mediaFor(optStr(row.primary_image) ?? syntheticKey(row)),
    imageCount: num(row.image_count),
    totalStock: num(row.total_stock),
    ratingAvg: row.rating_avg === null || row.rating_avg === undefined ? null : Number(row.rating_avg),
    ratingCount: num(row.rating_count),
    soldCount: num(row.sold_count),
    viewCount: num(row.view_count),
    createdAt: toIso(row.created_at) ?? '',
  };
}

/**
 * Demo products have no uploaded photo; we synthesise a deterministic flat-lay
 * illustration key which the /media route renders on the fly as SVG.
 */
function syntheticKey(row: Row): string {
  return `demo/${optStr(row.category_slug) ?? 'tee'}/${str(row.slug)}.svg`;
}

export async function listProducts(db: D1Database, f: CatalogFilters, mediaFor: (key: string | null) => string | null) {
  const { sql: whereSql, params } = buildFilterWhere(f);
  const total = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS c FROM products p
       LEFT JOIN categories c ON c.id = p.primary_category_id
       LEFT JOIN brands b ON b.id = p.brand_id ${whereSql}`,
      params,
    ),
  );
  const order = SORT_SQL[f.sort] ?? SORT_SQL.latest;
  const offset = (f.page - 1) * f.pageSize;
  const items = await all<Row>(
    db,
    `${SUMMARY_SELECT} ${whereSql} ORDER BY ${order} ${limitOffset(f.pageSize, offset)}`,
    params,
  );
  return paginate(
    items.map((r) => mapSummary(r, mediaFor)),
    total,
    f.page,
    f.pageSize,
  );
}

/** Facets for the filter drawer: computed in SQL, not in the browser. */
export async function catalogFacets(db: D1Database, f: CatalogFilters) {
  const { sql: whereSql, params } = buildFilterWhere(f);
  const base = `FROM products p
    LEFT JOIN categories c ON c.id = p.primary_category_id
    LEFT JOIN brands b ON b.id = p.brand_id ${whereSql}`;

  const [colors, sizes, priceBounds, categories, brands] = await Promise.all([
    all<Row>(
      db,
      `SELECT co.id, co.name, co.slug, co.hex_code, COUNT(*) AS n
       FROM product_colors pcx
       JOIN products p ON p.id = pcx.product_id
       LEFT JOIN categories c ON c.id = p.primary_category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       JOIN colors co ON co.id = pcx.color_id
       ${whereSql}
       GROUP BY co.id ORDER BY n DESC LIMIT 40`,
      params,
    ),
    all<Row>(
      db,
      `SELECT si.id, si.code, si.name, si.sort_order, COUNT(*) AS n
       FROM product_sizes psx JOIN products p ON p.id = psx.product_id AND p.status = 'active'
       JOIN sizes si ON si.id = psx.size_id
       GROUP BY si.id ORDER BY si.sort_order ASC`,
      [],
    ),
    first<Row>(
      db,
      `SELECT MIN(COALESCE(p.sale_price,p.price)) AS min_price, MAX(COALESCE(p.sale_price,p.price)) AS max_price ${base}`,
      params,
    ),
    all<Row>(
      db,
      `SELECT c2.id, c2.name, c2.slug, COUNT(*) AS n
       FROM product_categories pc2 JOIN products p ON p.id = pc2.product_id AND p.status = 'active'
       JOIN categories c2 ON c2.id = pc2.category_id
       GROUP BY c2.id ORDER BY n DESC LIMIT 30`,
      [],
    ),
    all<Row>(
      db,
      `SELECT b.id, b.name, b.slug, COUNT(*) AS n
       FROM products p
       LEFT JOIN categories c ON c.id = p.primary_category_id
       LEFT JOIN brands b ON b.id = p.brand_id ${whereSql}
       GROUP BY b.id ORDER BY n DESC LIMIT 20`,
      params,
    ),
  ]);

  return {
    colors: colors.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      hexCode: str(r.hex_code),
      count: num(r.n),
    })),
    sizes: sizes.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      name: str(r.name),
      sortOrder: num(r.sort_order),
      count: num(r.n),
    })),
    price: {
      min: optNum(priceBounds?.min_price) ?? 0,
      max: optNum(priceBounds?.max_price) ?? 0,
    },
    categories: categories.map((r) => ({ id: str(r.id), name: str(r.name), slug: str(r.slug), count: num(r.n) })),
    brands: brands.map((r) => ({ id: str(r.id), name: str(r.name), slug: str(r.slug), count: num(r.n) })),
  };
}

export async function findProductRow(db: D1Database, slugOrId: string): Promise<Row | null> {
  return first<Row>(db, `${SUMMARY_SELECT} WHERE (p.slug = ?1 OR p.id = ?1)`, [slugOrId]);
}

async function loadColors(db: D1Database, productId: string): Promise<ColorRef[]> {
  const r = await all<Row>(
    db,
    `SELECT co.id, co.name, co.slug, co.hex_code FROM product_colors pc
     JOIN colors co ON co.id = pc.color_id WHERE pc.product_id = ?1
     ORDER BY (co.name) ASC`,
    [productId],
  );
  return r.map((x) => ({ id: str(x.id), name: str(x.name), slug: str(x.slug), hexCode: str(x.hex_code) }));
}

async function loadSizes(db: D1Database, productId: string): Promise<SizeRef[]> {
  const r = await all<Row>(
    db,
    `SELECT si.id, si.code, si.name, si.sort_order FROM product_sizes ps
     JOIN sizes si ON si.id = ps.size_id WHERE ps.product_id = ?1
     ORDER BY si.sort_order ASC`,
    [productId],
  );
  return r.map((x) => ({ id: str(x.id), code: str(x.code), name: str(x.name), sortOrder: num(x.sort_order) }));
}

async function loadImages(
  db: D1Database,
  product: Row,
  mediaFor: (key: string | null) => string | null,
): Promise<ProductImage[]> {
  const r = await all<Row>(
    db,
    `SELECT * FROM product_images WHERE product_id = ?1 ORDER BY is_primary DESC, sort_order ASC`,
    [str(product.id)],
  );
  if (r.length) {
    return r.map((x) => ({
      id: str(x.id),
      imageKey: str(x.image_key),
      url: mediaFor(str(x.image_key)) ?? '',
      alt: optStr(x.alt),
      sortOrder: num(x.sort_order),
      isPrimary: bool(x.is_primary),
    }));
  }
  // No upload yet -> deterministic editorial illustration (never a blank box).
  const key = syntheticKey(product);
  return [
    {
      id: 'synthetic',
      imageKey: key,
      url: mediaFor(key) ?? '',
      alt: str(product.name),
      sortOrder: 0,
      isPrimary: true,
    },
  ];
}

async function loadVariants(
  db: D1Database,
  productId: string,
  product: Row,
  mediaFor: (key: string | null) => string | null,
): Promise<ProductVariant[]> {
  const r = await all<Row>(
    db,
    `SELECT v.*, co.name AS color_name, co.slug AS color_slug, co.hex_code,
            si.code AS size_code, si.name AS size_name, si.sort_order AS size_order,
            i.quantity, i.reserved_quantity, i.id AS inventory_id
     FROM product_variants v
     JOIN colors co ON co.id = v.color_id
     JOIN sizes si ON si.id = v.size_id
     LEFT JOIN inventory i ON i.variant_id = v.id
     WHERE v.product_id = ?1
     ORDER BY si.sort_order ASC, co.name ASC`,
    [productId],
  );
  const fallbackWeight = num(product.weight_grams, 250);
  const basePrice = num(product.price);
  const baseSale = optNum(product.sale_price);
  return r.map((x) => {
    const price = optNum(x.price) ?? basePrice;
    const sale = optNum(x.sale_price) ?? baseSale;
    const qty = num(x.quantity);
    const reserved = num(x.reserved_quantity);
    const colorSlug = str(x.color_slug);
    const imageKey = optStr(x.image_key);
    return {
      id: str(x.id),
      productId: str(x.product_id),
      colorId: str(x.color_id),
      sizeId: str(x.size_id),
      sku: str(x.sku),
      price,
      salePrice: sale && sale < price ? sale : null,
      weightGrams: optNum(x.weight_grams) ?? fallbackWeight,
      imageKey,
      imageUrl: imageKey
        ? mediaFor(imageKey)
        : mediaFor(`demo/${colorSlug}/${str(x.product_id)}-${str(x.size_id)}.svg`),
      status: x.status === 'inactive' ? 'inactive' : 'active',
      stock: qty,
      available: Math.max(0, qty - reserved),
      color: { id: str(x.color_id), name: str(x.color_name), slug: colorSlug, hexCode: str(x.hex_code) },
      size: { id: str(x.size_id), code: str(x.size_code), name: str(x.size_name), sortOrder: num(x.size_order) },
    };
  });
}

async function loadSizeGuide(db: D1Database, id: string | null): Promise<SizeGuide | null> {
  if (!id) return null;
  const r = await first<Row>(db, `SELECT * FROM size_guides WHERE id = ?1`, [id]);
  if (!r) return null;
  return {
    id: str(r.id),
    name: str(r.name),
    type: str(r.type),
    description: optStr(r.description),
    columns: jsonParse<string[]>(r.columns, []),
    rows: jsonParse<string[][]>(r.rows, []),
  };
}

export async function getProduct(
  db: D1Database,
  slugOrId: string,
  mediaFor: (key: string | null) => string | null,
): Promise<ProductDetail | null> {
  const row = await findProductRow(db, slugOrId);
  if (!row) return null;

  const [colors, sizes, variants, images, sizeGuide] = await Promise.all([
    loadColors(db, str(row.id)),
    loadSizes(db, str(row.id)),
    loadVariants(db, str(row.id), row, mediaFor),
    loadImages(db, row, mediaFor),
    loadSizeGuide(db, optStr(row.size_guide_id)),
  ]);

  const base = mapSummary(row, mediaFor);
  const lengthCm = optNum(row.length_cm);
  const widthCm = optNum(row.width_cm);
  const heightCm = optNum(row.height_cm);

  return {
    ...base,
    description: str(row.description),
    material: optStr(row.material),
    sizeGuide,
    weightGrams: num(row.weight_grams, 250),
    dimensions: lengthCm !== null && widthCm !== null && heightCm !== null ? { lengthCm, widthCm, heightCm } : null,
    colors,
    sizes,
    variants,
    images,
    metaTitle: optStr(row.meta_title),
    metaDescription: optStr(row.meta_description),
  };
}

/** Availability matrix so the UI can disable impossible color/size picks. */
export function availabilityMatrix(product: ProductDetail) {
  const byVariant = new Map<string, ProductVariant>();
  for (const v of product.variants) byVariant.set(`${v.colorId}|${v.sizeId}`, v);
  const lookup = (colorId: string, sizeId: string): ProductVariant | null =>
    byVariant.get(`${colorId}|${sizeId}`) ?? null;
  return {
    isAvailable(colorId: string, sizeId: string): boolean {
      return Boolean(lookup(colorId, sizeId)?.status === 'active' && (lookup(colorId, sizeId)?.available ?? 0) > 0);
    },
    variant: lookup,
    /** Sizes that still have stock for a chosen colour — drives the picker UI. */
    availableSizeIds(colorId: string): string[] {
      return product.sizes.filter((s) => (lookup(colorId, s.id)?.available ?? 0) > 0).map((s) => s.id);
    },
    colorsForSize(sizeId: string): string[] {
      return product.colors.filter((c) => (lookup(c.id, sizeId)?.available ?? 0) > 0).map((c) => c.id);
    },
  };
}

export async function relatedProducts(
  db: D1Database,
  product: ProductDetail,
  limit: number,
  mediaFor: (key: string | null) => string | null,
): Promise<RelatedProduct[]> {
  const primaryCategoryId = await value<string>(db, `SELECT primary_category_id FROM products WHERE id = ?1`, [
    product.id,
  ]);
  const brandId = await value<string>(db, `SELECT brand_id FROM products WHERE id = ?1`, [product.id]);
  const rowsFound = await all<Row>(
    db,
    `${SUMMARY_SELECT}
     WHERE p.status = 'active' AND p.id <> ?1
       AND (p.primary_category_id = ?2 OR p.brand_id = ?3 OR p.is_best_seller = 1)
     ORDER BY (p.primary_category_id = ?2) DESC, p.sold_count DESC, p.view_count DESC
     LIMIT ?4`,
    [product.id, primaryCategoryId, brandId, limit],
  );
  return rowsFound.map((r) => ({
    ...mapSummary(r, mediaFor),
    relation: str(r.category_id) && str(r.category_id) === str(primaryCategoryId) ? 'same_category' : 'same_brand',
  })) as RelatedProduct[];
}

export async function listReviews(
  db: D1Database,
  productId: string,
  page = 1,
  pageSize = 10,
): Promise<{ items: ProductReview[]; total: number }> {
  const total = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS c FROM product_reviews WHERE product_id = ?1 AND status = 'published'`,
      [productId],
    ),
  );
  const items = await all<Row>(
    db,
    `SELECT r.*, u.display_name, u.avatar_url FROM product_reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ?1 AND r.status = 'published'
     ORDER BY r.created_at DESC ${limitOffset(pageSize, (page - 1) * pageSize)}`,
    [productId],
  );
  return {
    items: items.map((x) => ({
      id: str(x.id),
      productId: str(x.product_id),
      authorName: optStr(x.display_name) ?? 'Pelanggan VELORA',
      rating: num(x.rating),
      title: optStr(x.title),
      body: str(x.body),
      status: str(x.status) as ProductReview['status'],
      verifiedPurchase: bool(x.verified_purchase),
      createdAt: toIso(x.created_at) ?? '',
    })),
    total,
  };
}

export async function canReview(db: D1Database, userId: string, productId: string): Promise<boolean> {
  const purchased = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS c FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ?1 AND o.user_id = ?2 AND o.status IN ('paid','processing','shipped','delivered','completed')`,
      [productId, userId],
    ),
  );
  return purchased > 0;
}

export async function addReview(
  db: D1Database,
  input: { productId: string; userId: string; rating: number; title: string | null; body: string },
) {
  const product = await first<Row>(db, `SELECT id FROM products WHERE id = ?1`, [input.productId]);
  if (!product) throw notFound('Produk tidak ditemukan');
  const existing = await first<Row>(db, `SELECT id FROM product_reviews WHERE product_id = ?1 AND user_id = ?2`, [
    input.productId,
    input.userId,
  ]);
  if (existing) throw badRequest('Anda sudah memberi ulasan produk ini');

  const verified = await canReview(db, input.userId, input.productId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await db.batch([
    db
      .prepare(
        `INSERT INTO product_reviews (id, product_id, user_id, rating, title, body, status, verified_purchase, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'published',?7,?8,?9)`,
      )
      .bind(id, input.productId, input.userId, input.rating, input.title, input.body, verified ? 1 : 0, now, now),
    db
      .prepare(
        `INSERT INTO notification_logs (id, user_id, channel, template, title, body, data, target, status, created_at)
         VALUES (?1,NULL,'in_app','review_submitted','Ulasan baru','Ada ulasan baru pada produk.','{}',NULL,'sent',?2)`,
      )
      .bind(crypto.randomUUID(), now),
  ]);
  const r = await first<Row>(
    db,
    `SELECT ROUND(AVG(rating),2) AS avg_rating, COUNT(*) AS total FROM product_reviews WHERE product_id = ?1 AND status='published'`,
    [input.productId],
  );
  return { id, average: Number(r?.avg_rating ?? 0), count: Number(r?.total ?? 0) };
}

/* ------------------------------- taxonomies ------------------------------- */

export async function listCategories(
  db: D1Database,
  mediaFor: (k: string | null) => string | null,
): Promise<Category[]> {
  const r = await all<Row>(
    db,
    `SELECT c.*, (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count,
            (SELECT COUNT(*) FROM products p WHERE p.primary_category_id = c.id AND p.status='active') AS direct_count
     FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order ASC, c.name ASC`,
  );
  return r.map((x) => ({
    id: str(x.id),
    name: str(x.name),
    slug: str(x.slug),
    description: optStr(x.description),
    imageKey: optStr(x.image_key),
    imageUrl: mediaFor(optStr(x.image_key)),
    parentId: optStr(x.parent_id),
    sortOrder: num(x.sort_order),
    isActive: bool(x.is_active),
    productCount: num(x.product_count) || num(x.direct_count),
    metaTitle: optStr(x.meta_title),
    metaDescription: optStr(x.meta_description),
  }));
}

export async function listBrands(db: D1Database, mediaFor: (k: string | null) => string | null): Promise<Brand[]> {
  const r = await all<Row>(
    db,
    `SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.status='active') AS product_count
     FROM brands b WHERE b.is_active = 1 ORDER BY b.name ASC`,
  );
  return r.map((x) => ({
    id: str(x.id),
    name: str(x.name),
    slug: str(x.slug),
    description: optStr(x.description),
    logoKey: optStr(x.logo_key),
    isActive: bool(x.is_active),
    productCount: num(x.product_count),
  }));
}

export async function listColors(db: D1Database): Promise<ColorRef[]> {
  const r = await rows<Row>(db, `SELECT * FROM colors ORDER BY name ASC`);
  return r.map((x) => ({ id: str(x.id), name: str(x.name), slug: str(x.slug), hexCode: str(x.hex_code) }));
}

export async function listSizes(db: D1Database): Promise<SizeRef[]> {
  const r = await rows<Row>(db, `SELECT * FROM sizes ORDER BY sort_order ASC`);
  return r.map((x) => ({ id: str(x.id), code: str(x.code), name: str(x.name), sortOrder: num(x.sort_order) }));
}

export async function recordProductView(db: D1Database, productId: string): Promise<void> {
  await db.prepare(`UPDATE products SET view_count = view_count + 1 WHERE id = ?1`).bind(productId).run();
}

export function productDiscount(s: ProductSummary): number {
  return discountPercent(s.price, s.salePrice);
}

export function garmentShapeOf(product: ProductSummary) {
  return shapeForCategory(product.categorySlug, product.name);
}
