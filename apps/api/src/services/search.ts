import { type Row, all, num, optStr, str } from '../lib/db';

/**
 * Cross-collection lookup behind the ⌘K palette. One row shape for every
 * collection keeps the client generic: `title` is what the admin recognises,
 * `hint` is the disambiguating detail (SKU, e-mail, recipient…), and `amount`
 * only exists for orders so totals can be formatted on the client.
 */

export interface SearchHit {
  id: string;
  title: string;
  hint: string | null;
  amount?: number;
}

export interface SearchGroup {
  /** Matches before the LIMIT — drives the "lihat semua" row. */
  total: number;
  items: SearchHit[];
}

export interface GlobalSearchResult {
  q: string;
  products: SearchGroup;
  orders: SearchGroup;
  customers: SearchGroup;
  categories: SearchGroup;
  coupons: SearchGroup;
  pages: SearchGroup;
  faqs: SearchGroup;
}

/** Rows shown per collection in the palette; the rest are one page away. */
const LIMIT = 5;

const EMPTY: SearchGroup = { total: 0, items: [] };

/** Same sanitising the list endpoints use: wildcards never reach the LIKE. */
const cleanTerm = (term: string): string => term.replace(/[^\w\s.@\-]/g, '').trim();

export async function globalSearch(db: D1Database, term: string): Promise<GlobalSearchResult> {
  const cleaned = cleanTerm(term);
  // Punctuation-only input sanitises down to nothing — that LIKE would match every row.
  if (cleaned.length < 2) return emptySearch(term);
  const like = `%${cleaned}%`;
  const [products, orders, customers, categories, coupons, pages, faqs] = await Promise.all([
    group(
      db,
      `SELECT p.id, p.name AS title, p.sku AS hint, COUNT(*) OVER () AS n
       FROM products p
       WHERE p.name LIKE ?1 OR p.sku LIKE ?1 OR p.slug LIKE ?1
       ORDER BY p.updated_at DESC LIMIT ${LIMIT}`,
      [like],
    ),
    group(
      db,
      `SELECT o.code AS id, o.code AS title, o.ship_recipient_name AS hint, o.grand_total AS amount,
              COUNT(*) OVER () AS n
       FROM orders o
       WHERE o.code LIKE ?1 OR o.ship_recipient_name LIKE ?1 OR o.ship_phone LIKE ?1 OR o.coupon_code LIKE ?1
       ORDER BY o.created_at DESC LIMIT ${LIMIT}`,
      [like],
    ),
    group(
      db,
      `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), p.full_name, u.email) AS title, u.email AS hint,
              COUNT(*) OVER () AS n
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.email LIKE ?1 OR u.display_name LIKE ?1 OR p.full_name LIKE ?1 OR u.phone LIKE ?1
       ORDER BY u.created_at DESC LIMIT ${LIMIT}`,
      [like],
    ),
    group(
      db,
      `SELECT c.id, c.name AS title, c.slug AS hint, COUNT(*) OVER () AS n
       FROM categories c
       WHERE c.name LIKE ?1 OR c.slug LIKE ?1
       ORDER BY c.sort_order ASC LIMIT ${LIMIT}`,
      [like],
    ),
    group(
      db,
      `SELECT k.id, k.code AS title, k.name AS hint, COUNT(*) OVER () AS n
       FROM coupons k
       WHERE k.code LIKE ?1 OR k.name LIKE ?1
       ORDER BY k.created_at DESC LIMIT ${LIMIT}`,
      [like],
    ),
    group(
      db,
      `SELECT pg.id, pg.title, pg.slug AS hint, COUNT(*) OVER () AS n
       FROM pages pg
       WHERE pg.title LIKE ?1 OR pg.slug LIKE ?1
       ORDER BY pg.updated_at DESC LIMIT ${LIMIT}`,
      [like],
    ),
    group(
      db,
      `SELECT f.id, f.question AS title, f.category AS hint, COUNT(*) OVER () AS n
       FROM faqs f
       WHERE f.question LIKE ?1 OR f.answer LIKE ?1
       ORDER BY f.sort_order ASC LIMIT ${LIMIT}`,
      [like],
    ),
  ]);

  return { q: term, products, orders, customers, categories, coupons, pages, faqs };
}

export const emptySearch = (q = ''): GlobalSearchResult => ({
  q,
  products: EMPTY,
  orders: EMPTY,
  customers: EMPTY,
  categories: EMPTY,
  coupons: EMPTY,
  pages: EMPTY,
  faqs: EMPTY,
});

/**
 * `COUNT(*) OVER ()` rides along with the page, so the total costs no extra
 * round trip. Zero rows means zero matches, hence the fallback.
 */
async function group(db: D1Database, sql: string, params: unknown[]): Promise<SearchGroup> {
  const rows = await all<Row>(db, sql, params);
  return {
    total: rows.length ? num(rows[0].n) : 0,
    items: rows.map((row) => {
      const hit: SearchHit = { id: str(row.id), title: str(row.title), hint: optStr(row.hint) };
      if (row.amount !== undefined && row.amount !== null) hit.amount = num(row.amount);
      return hit;
    }),
  };
}
