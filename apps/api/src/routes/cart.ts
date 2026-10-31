import { schemas } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { badRequest } from '../lib/errors';
import { guestToken as newGuestToken } from '../lib/ids';
import { currentUser, guestTokenBridge, limit, requireAuth } from '../mw/auth';
import {
  addToCart,
  clearCart,
  createGuestCart,
  loadCart,
  mergeGuestCart,
  removeLine,
  resolveCartId,
  swapLineVariant,
  updateLine,
} from '../services/cart';
import { addProduct, clearWishlist, listWishlist, removeProduct, wishlistBadge } from '../services/wishlist';
import type { AppEnv, Ctx } from '../types';
import { mediaFor, readBody } from './_shared';

/**
 * Cart + wishlist.
 *
 * A guest cart is addressed by the `x-guest-cart` header (a random token issued
 * here). It is a basket key only — never an identity — and every mutation is
 * rate limited. On login the guest basket is merged into the user's basket.
 */

const EMPTY_CART = {
  id: '',
  lines: [],
  subtotal: 0,
  discount: 0,
  totalWeightGrams: 0,
  itemCount: 0,
  currency: 'IDR' as const,
  appliedCoupon: null,
  issues: [],
};

const productIdBody = z.object({ productId: z.string().min(1).max(64) });

export const cartRoutes = new Hono<AppEnv>()
  .use('*', guestTokenBridge)

  .post('/session', limit({ max: 30, scope: 'cart-session' }), async (c) => {
    // The token is generated server side so a client cannot claim an existing one.
    const token = newGuestToken();
    await createGuestCart(c.env.DB, token);
    return c.json({ guestToken: token });
  })

  .post('/merge', requireAuth, async (c) => {
    const user = currentUser(c);
    const { guestToken } = await readBody(c, schemas.guestCartSchema);
    await mergeGuestCart(c.env.DB, user.id, guestToken);
    const cartId = await resolveCartId(c.env.DB, user.id, null);
    if (!cartId) throw badRequest('Keranjang tidak dapat disiapkan');
    return c.json(await loadCart(c.env.DB, cartId, c.env));
  })

  .get('/', async (c) => {
    const cartId = await currentCartId(c);
    if (!cartId) return c.json(EMPTY_CART);
    return c.json(await loadCart(c.env.DB, cartId, c.env));
  })

  .post('/items', limit({ max: 60, scope: 'cart-add' }), async (c) => {
    const cartId = await mustCartId(c);
    const input = await readBody(c, schemas.cartAddSchema);
    return c.json(await addToCart(c.env.DB, cartId, input.variantId, input.quantity, c.env));
  })

  .post('/items/swap', limit({ max: 60, scope: 'cart-swap' }), async (c) => {
    const cartId = await mustCartId(c);
    const input = await readBody(c, schemas.cartSwapVariantSchema);
    return c.json(await swapLineVariant(c.env.DB, cartId, input.lineId, input.variantId, c.env));
  })

  .patch('/items/:lineId', limit({ max: 120, scope: 'cart-update' }), async (c) => {
    const cartId = await mustCartId(c);
    const lineId = c.req.param('lineId');
    if (!lineId) throw badRequest('Baris keranjang wajib diisi');
    const input = await readBody(c, schemas.cartUpdateSchema);
    return c.json(await updateLine(c.env.DB, cartId, lineId, input.quantity, c.env));
  })

  .delete('/items/:lineId', async (c) => {
    const cartId = await mustCartId(c);
    const lineId = c.req.param('lineId');
    if (!lineId) throw badRequest('Baris keranjang wajib diisi');
    return c.json(await removeLine(c.env.DB, cartId, lineId, c.env));
  })

  .delete('/', async (c) => {
    const cartId = await mustCartId(c);
    await clearCart(c.env.DB, cartId);
    return c.json(await loadCart(c.env.DB, cartId, c.env));
  });

export const wishlistRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/', async (c) => {
    const user = currentUser(c);
    return c.json({ items: await listWishlist(c.env.DB, user.id, mediaFor(c.env)) });
  })
  .get('/badge', async (c) => c.json(await wishlistBadge(c.env.DB, currentUser(c).id)))
  .post('/', limit({ max: 60, scope: 'wishlist-add' }), async (c) => {
    const user = currentUser(c);
    const { productId } = await readBody(c, productIdBody);
    const result = await addProduct(c.env.DB, user.id, productId);
    return c.json({ ...result, items: await listWishlist(c.env.DB, user.id, mediaFor(c.env)) }, 201);
  })
  .delete('/', async (c) => {
    await clearWishlist(c.env.DB, currentUser(c).id);
    return c.json({ items: [] });
  })
  .delete('/:productId', async (c) => {
    const user = currentUser(c);
    const productId = c.req.param('productId');
    if (!productId) throw badRequest('Id produk wajib diisi');
    const result = await removeProduct(c.env.DB, user.id, productId);
    return c.json({ ...result, items: await listWishlist(c.env.DB, user.id, mediaFor(c.env)) });
  });

/* --------------------------------- helpers -------------------------------- */

/** Resolves the basket for this request: the user's cart when signed in, else the guest one. */
async function currentCartId(c: Ctx, createIfMissing = false): Promise<string | null> {
  const user = c.get('user');
  const guest = c.get('guestToken');
  if (!user && !guest) return null;
  return resolveCartId(c.env.DB, user?.id ?? null, guest, createIfMissing);
}

/**
 * Mutations may create the basket: a guest key that no longer has a cart row
 * (pruned, or issued before a migration) would otherwise fail every add forever.
 */
async function mustCartId(c: Ctx): Promise<string> {
  const id = await currentCartId(c, true);
  if (!id) throw badRequest('Keranjang belum tersedia. Muat ulang halaman lalu coba lagi.');
  return id;
}
