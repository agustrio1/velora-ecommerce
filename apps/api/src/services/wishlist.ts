import type { ProductSummary } from '@velora/shared';
import { type Row, all, first, str } from '../lib/db';
import { badRequest, notFound } from '../lib/errors';
import { uuid } from '../lib/ids';
import { SUMMARY_SELECT, mapSummary } from './catalog';

/**
 * Wishlist. Each user owns exactly one list (`wishlists.user_id UNIQUE`), so the
 * list row is created lazily and never exposed to the client.
 */

async function mustWishlistId(db: D1Database, userId: string): Promise<string> {
  const row = await first<Row>(db, `SELECT id FROM wishlists WHERE user_id = ?1`, [userId]);
  if (row) return str(row.id);
  const id = uuid();
  await db
    .prepare(`INSERT INTO wishlists (id, user_id, created_at) VALUES (?1,?2,datetime('now'))`)
    .bind(id, userId)
    .run();
  return id;
}

export async function wishlistIds(db: D1Database, userId: string): Promise<string[]> {
  const row = await first<Row>(db, `SELECT id FROM wishlists WHERE user_id = ?1`, [userId]);
  if (!row) return [];
  const items = await all<Row>(db, `SELECT product_id FROM wishlist_items WHERE wishlist_id = ?1`, [str(row.id)]);
  return items.map((i) => str(i.product_id));
}

export async function listWishlist(
  db: D1Database,
  userId: string,
  mediaFor: (key: string | null) => string | null,
): Promise<ProductSummary[]> {
  // Newest wish first, and only products that are still sellable.
  const ids = await all<Row>(
    db,
    `SELECT p.id FROM wishlist_items wi
       JOIN wishlists w ON w.id = wi.wishlist_id
       JOIN products p ON p.id = wi.product_id
      WHERE w.user_id = ?1 AND p.status IN ('active','out_of_stock')
      ORDER BY wi.created_at DESC`,
    [userId],
  );
  if (!ids.length) return [];
  const orderedIds = ids.map((r) => str(r.id));
  const detailed = await loadByIds(db, orderedIds);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return detailed.map((r) => mapSummary(r, mediaFor)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

/** Same card projection as the catalogue, restricted to the wanted ids. */
async function loadByIds(db: D1Database, ids: string[]): Promise<Row[]> {
  const placeholders = ids.map(() => '?').join(',');
  return all<Row>(db, `${SUMMARY_SELECT} WHERE p.id IN (${placeholders})`, ids);
}

export async function addProduct(
  db: D1Database,
  userId: string,
  productId: string,
): Promise<{ count: number; added: boolean }> {
  const product = await first<Row>(db, `SELECT id FROM products WHERE id = ?1`, [productId]);
  if (!product) throw notFound('Produk tidak ditemukan');
  const wishlistId = await mustWishlistId(db, userId);
  const existing = await first<Row>(db, `SELECT id FROM wishlist_items WHERE wishlist_id = ?1 AND product_id = ?2`, [
    wishlistId,
    productId,
  ]);
  if (existing) return { count: await countItems(db, wishlistId), added: false };
  await db
    .prepare(`INSERT INTO wishlist_items (id, wishlist_id, product_id, created_at) VALUES (?1,?2,?3,datetime('now'))`)
    .bind(uuid(), wishlistId, productId)
    .run();
  return { count: await countItems(db, wishlistId), added: true };
}

export async function removeProduct(db: D1Database, userId: string, productId: string): Promise<{ count: number }> {
  const row = await first<Row>(db, `SELECT id FROM wishlists WHERE user_id = ?1`, [userId]);
  if (!row) return { count: 0 };
  await db
    .prepare(`DELETE FROM wishlist_items WHERE wishlist_id = ?1 AND product_id = ?2`)
    .bind(str(row.id), productId)
    .run();
  return { count: await countItems(db, str(row.id)) };
}

export async function clearWishlist(db: D1Database, userId: string): Promise<void> {
  const row = await first<Row>(db, `SELECT id FROM wishlists WHERE user_id = ?1`, [userId]);
  if (!row) return;
  await db.prepare(`DELETE FROM wishlist_items WHERE wishlist_id = ?1`).bind(str(row.id)).run();
}

async function countItems(db: D1Database, wishlistId: string): Promise<number> {
  const r = await first<Row>(db, `SELECT COUNT(*) AS n FROM wishlist_items WHERE wishlist_id = ?1`, [wishlistId]);
  return Number(r?.n ?? 0);
}

/** Lightweight badge for the header: ids only, no product projection. */
export async function wishlistBadge(db: D1Database, userId: string): Promise<{ count: number; ids: string[] }> {
  const ids = await wishlistIds(db, userId);
  return { count: ids.length, ids };
}

export function assertProductIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.some((v) => typeof v !== 'string' || !v)) {
    throw badRequest('Daftar produk tidak valid');
  }
  return input as string[];
}
