import type { CartLine, CartView } from '@velora/shared';
import { CART, ERROR_CODES } from '@velora/shared';
import type { Env } from '../env';
import { type Row, all, first, num, optStr, str } from '../lib/db';
import { AppError, badRequest, notFound } from '../lib/errors';
import { guestToken as newGuestToken, uuid } from '../lib/ids';
import { mediaUrl } from '../lib/media';

/**
 * Server-side cart. Prices and stock are ALWAYS re-read from D1 on every
 * render — a client can never pin a stale price into a cart line.
 */

const SELECT_LINE = `
  SELECT ci.id AS line_id, ci.quantity, ci.updated_at AS line_updated_at,
         v.id AS variant_id, v.status AS variant_status, v.sku AS variant_sku,
         COALESCE(v.price, p.price) AS unit_price,
         COALESCE(NULLIF(v.sale_price,0), p.sale_price, NULL) AS unit_sale_price,
         COALESCE(v.weight_grams, p.weight_grams, 250) AS weight_grams,
         COALESCE(v.image_key, (SELECT pi.image_key FROM product_images pi
             WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1),
             'demo/' || COALESCE(c.slug,'tee') || '/' || p.slug || '.svg') AS image_key,
         p.id AS product_id, p.name AS product_name, p.slug AS product_slug, p.status AS product_status,
         co.name AS color_name, si.code AS size_code,
         i.quantity AS stock, i.reserved_quantity AS reserved
  FROM cart_items ci
  JOIN product_variants v ON v.id = ci.variant_id
  JOIN products p ON p.id = v.product_id
  JOIN colors co ON co.id = v.color_id
  JOIN sizes si ON si.id = v.size_id
  LEFT JOIN categories c ON c.id = p.primary_category_id
  LEFT JOIN inventory i ON i.variant_id = v.id
  WHERE ci.cart_id = ?1
  ORDER BY ci.created_at ASC`;

export async function resolveCartId(
  db: D1Database,
  userId: string | null,
  guestTokenHeader: string | null,
  createIfMissing = true,
): Promise<string | null> {
  if (userId) {
    const existing = await first<Row>(db, `SELECT id FROM carts WHERE user_id = ?1`, [userId]);
    if (existing) return str(existing.id);
    if (!createIfMissing) return null;
    const id = uuid();
    await db
      .prepare(`INSERT INTO carts (id, user_id, guest_token, currency, created_at, updated_at)
                VALUES (?1,?2,NULL,'IDR',datetime('now'),datetime('now'))`)
      .bind(id, userId)
      .run();
    return id;
  }
  if (guestTokenHeader) {
    const existing = await first<Row>(db, `SELECT id FROM carts WHERE guest_token = ?1`, [guestTokenHeader]);
    return existing ? str(existing.id) : createIfMissing ? createGuestCart(db, guestTokenHeader) : null;
  }
  return null;
}

export async function createGuestCart(db: D1Database, token?: string): Promise<string> {
  const id = uuid();
  const guest = token ?? newGuestToken();
  await db
    .prepare(
      `INSERT INTO carts (id, user_id, guest_token, currency, created_at, updated_at)
       VALUES (?1,NULL,?2,'IDR',datetime('now'),datetime('now'))`,
    )
    .bind(id, guest)
    .run();
  return id;
}

/** Called right after login so a guest does not lose the basket. */
export async function mergeGuestCart(db: D1Database, userId: string, guestTokenValue: string): Promise<void> {
  const guestCart = await first<Row>(db, `SELECT id FROM carts WHERE guest_token = ?1`, [guestTokenValue]);
  const userCartId = await resolveCartId(db, userId, null);
  if (!guestCart || !userCartId) return;
  if (str(guestCart.id) === userCartId) return;

  const lines = await all<Row>(db, `SELECT variant_id, quantity FROM cart_items WHERE cart_id = ?1`, [
    str(guestCart.id),
  ]);
  for (const line of lines) {
    await db
      .prepare(
        `INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
         VALUES (?1,?2,?3,?4,datetime('now'),datetime('now'))
         ON CONFLICT(cart_id, variant_id) DO UPDATE SET
           quantity = MIN(?5, quantity + ?4), updated_at = datetime('now')`,
      )
      .bind(uuid(), userCartId, str(line.variant_id), num(line.quantity), CART.maxQuantityPerLine)
      .run();
  }
  await db.batch([
    db.prepare(`DELETE FROM cart_items WHERE cart_id = ?1`).bind(str(guestCart.id)),
    db.prepare(`DELETE FROM carts WHERE id = ?1`).bind(str(guestCart.id)),
  ]);
}

export function mapLine(row: Row, c: Env): CartLine {
  const stock = num(row.stock);
  const reserved = num(row.reserved);
  const available = Math.max(0, stock - reserved);
  const listPrice = num(row.unit_price);
  const saleRaw = optStr(row.unit_sale_price);
  const salePrice = saleRaw ? num(saleRaw) : null;
  const unit = salePrice && salePrice > 0 && salePrice < listPrice ? salePrice : listPrice;
  const qty = num(row.quantity);
  const productStatus = str(row.product_status);
  const variantStatus = str(row.variant_status);
  const status: CartLine['status'] =
    productStatus !== 'active' || variantStatus !== 'active' ? 'unavailable' : available <= 0 ? 'out_of_stock' : 'ok';
  return {
    id: str(row.line_id),
    productId: str(row.product_id),
    variantId: str(row.variant_id),
    productName: str(row.product_name),
    productSlug: str(row.product_slug),
    variantLabel: `${str(row.color_name)} / ${str(row.size_code)}`,
    sku: str(row.variant_sku),
    unitPrice: unit,
    quantity: qty,
    lineTotal: unit * Math.min(qty, available > 0 ? qty : 0),
    weightGrams: num(row.weight_grams, 250),
    imageUrl: mediaUrl(c, str(row.image_key)),
    availableStock: available,
    status,
  };
}

export async function loadCart(db: D1Database, cartId: string, c: Env): Promise<CartView> {
  const rowsFound = await all<Row>(db, SELECT_LINE, [cartId]);
  const lines = rowsFound.map((r) => mapLine(r, c));
  const valid = lines.filter((l) => l.status === 'ok');
  const subtotal = valid.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const totalWeight = valid.reduce((sum, l) => sum + l.weightGrams * l.quantity, 0);
  const issues = lines
    .filter((l) => l.status !== 'ok')
    .map((l) =>
      l.status === 'out_of_stock'
        ? `${l.productName} (${l.variantLabel}) sedang habis`
        : `${l.productName} (${l.variantLabel}) tidak lagi tersedia`,
    );
  return {
    id: cartId,
    lines,
    subtotal,
    discount: 0,
    totalWeightGrams: totalWeight,
    itemCount: valid.reduce((s, l) => s + l.quantity, 0),
    currency: 'IDR',
    appliedCoupon: null,
    issues,
  };
}

export async function addToCart(
  db: D1Database,
  cartId: string,
  variantId: string,
  quantity: number,
  c: Env,
): Promise<CartView> {
  if (quantity < 1) throw badRequest('Jumlah minimal 1');
  const variant = await first<Row>(
    db,
    `SELECT v.id, v.status, p.status AS product_status, COALESCE(i.quantity,0) AS stock, COALESCE(i.reserved_quantity,0) AS reserved
     FROM product_variants v JOIN products p ON p.id = v.product_id
     LEFT JOIN inventory i ON i.variant_id = v.id
     WHERE v.id = ?1`,
    [variantId],
  );
  if (!variant) throw notFound('Varian produk tidak ditemukan');
  if (str(variant.product_status) !== 'active' || str(variant.status) !== 'active') {
    throw new AppError(ERROR_CODES.VARIANT_UNAVAILABLE, 'Varian ini tidak tersedia saat ini', 409);
  }
  const available = num(variant.stock) - num(variant.reserved);
  if (available <= 0) {
    throw new AppError(ERROR_CODES.OUT_OF_STOCK, 'Stok varian ini habis', 409);
  }

  const existing = await first<Row>(
    db,
    `SELECT ci.id, ci.quantity FROM cart_items ci WHERE ci.cart_id = ?1 AND ci.variant_id = ?2`,
    [cartId, variantId],
  );
  const current = existing ? num(existing.quantity) : 0;
  const wanted = current + quantity;
  if (wanted > available) {
    throw new AppError(ERROR_CODES.OUT_OF_STOCK, `Stok tersisa hanya ${available} untuk varian ini`, 409, {
      available,
      requested: wanted,
    });
  }
  if (wanted > CART.maxQuantityPerLine) {
    throw badRequest(`Maksimal ${CART.maxQuantityPerLine} pcs per varian dalam keranjang`);
  }
  const lineCount = num(
    await first<Row>(db, `SELECT COUNT(*) AS n FROM cart_items WHERE cart_id = ?1`, [cartId]).then((r) => r?.n ?? 0),
    0,
  );
  if (!existing && lineCount >= CART.maxItemsPerCart) throw badRequest('Keranjang sudah penuh');

  if (existing) {
    await db
      .prepare(`UPDATE cart_items SET quantity = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(wanted, str(existing.id))
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
         VALUES (?1,?2,?3,?4,datetime('now'),datetime('now'))`,
      )
      .bind(uuid(), cartId, variantId, wanted)
      .run();
  }
  await db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?1`).bind(cartId).run();
  return loadCart(db, cartId, c);
}

export async function updateLine(
  db: D1Database,
  cartId: string,
  lineId: string,
  quantity: number,
  c: Env,
): Promise<CartView> {
  const line = await first<Row>(db, `SELECT * FROM cart_items WHERE id = ?1 AND cart_id = ?2`, [lineId, cartId]);
  if (!line) throw notFound('Baris keranjang tidak ditemukan');
  if (quantity <= 0) {
    await db.prepare(`DELETE FROM cart_items WHERE id = ?1`).bind(lineId).run();
  } else {
    const stock = await first<Row>(
      db,
      `SELECT COALESCE(i.quantity,0) AS q, COALESCE(i.reserved_quantity,0) AS r
       FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.id = ?1`,
      [str(line.variant_id)],
    );
    const available = num(stock?.q) - num(stock?.r);
    if (quantity > available) {
      throw new AppError(ERROR_CODES.OUT_OF_STOCK, `Stok tersisa ${available}`, 409);
    }
    if (quantity > CART.maxQuantityPerLine) throw badRequest(`Maksimal ${CART.maxQuantityPerLine} pcs`);
    await db
      .prepare(`UPDATE cart_items SET quantity = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(quantity, lineId)
      .run();
  }
  await db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?1`).bind(cartId).run();
  return loadCart(db, cartId, c);
}

/** Swap the color/size of an existing line, preserving quantity when possible. */
export async function swapLineVariant(
  db: D1Database,
  cartId: string,
  lineId: string,
  newVariantId: string,
  c: Env,
): Promise<CartView> {
  const line = await first<Row>(db, `SELECT * FROM cart_items WHERE id = ?1 AND cart_id = ?2`, [lineId, cartId]);
  if (!line) throw notFound('Baris keranjang tidak ditemukan');
  const target = await first<Row>(
    db,
    `SELECT COALESCE(i.quantity,0) AS q, COALESCE(i.reserved_quantity,0) AS r, v.status
     FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.id = ?1`,
    [newVariantId],
  );
  if (!target || str(target.status) !== 'active')
    throw new AppError(ERROR_CODES.VARIANT_UNAVAILABLE, 'Varian tidak tersedia', 409);
  const available = num(target.q) - num(target.r);
  const wanted = Math.min(num(line.quantity), available);
  if (wanted < 1) throw new AppError(ERROR_CODES.OUT_OF_STOCK, 'Stok varian baru habis', 409);

  const clash = await first<Row>(
    db,
    `SELECT id, quantity FROM cart_items WHERE cart_id = ?1 AND variant_id = ?2 AND id <> ?3`,
    [cartId, newVariantId, lineId],
  );
  if (clash) {
    await db
      .prepare(`UPDATE cart_items SET quantity = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(Math.min(CART.maxQuantityPerLine, num(clash.quantity) + wanted), str(clash.id))
      .run();
    await db.prepare(`DELETE FROM cart_items WHERE id = ?1`).bind(lineId).run();
  } else {
    await db
      .prepare(`UPDATE cart_items SET variant_id = ?1, quantity = ?2, updated_at = datetime('now') WHERE id = ?3`)
      .bind(newVariantId, wanted, lineId)
      .run();
  }
  await db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?1`).bind(cartId).run();
  return loadCart(db, cartId, c);
}

export async function removeLine(db: D1Database, cartId: string, lineId: string, c: Env): Promise<CartView> {
  await db.prepare(`DELETE FROM cart_items WHERE id = ?1 AND cart_id = ?2`).bind(lineId, cartId).run();
  return loadCart(db, cartId, c);
}

export async function clearCart(db: D1Database, cartId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM cart_items WHERE cart_id = ?1`).bind(cartId),
    db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?1`).bind(cartId),
  ]);
}

/** Used right before checkout: everything must still be purchasable. */
export async function assertCartPurchasable(db: D1Database, cartId: string, c: Env): Promise<CartView> {
  const cart = await loadCart(db, cartId, c);
  if (!cart.lines.length) throw new AppError(ERROR_CODES.CART_EMPTY, 'Keranjang Anda masih kosong', 400);
  const blocking = cart.lines.filter((l) => l.status !== 'ok');
  if (blocking.length) {
    throw new AppError(
      ERROR_CODES.OUT_OF_STOCK,
      `Beberapa produk tidak lagi tersedia: ${blocking.map((b) => b.productName).join(', ')}`,
      409,
      { issues: cart.issues },
    );
  }
  const overQuantity = cart.lines.find((l) => l.quantity > l.availableStock);
  if (overQuantity) {
    throw new AppError(
      ERROR_CODES.OUT_OF_STOCK,
      `Stok ${overQuantity.productName} tersisa ${overQuantity.availableStock}`,
      409,
    );
  }
  return cart;
}

export function cartBadge(cart: CartView): { count: number; subtotal: number; issues: number } {
  return {
    count: cart.itemCount,
    subtotal: cart.subtotal,
    issues: cart.lines.filter((l) => l.status !== 'ok').length,
  };
}
