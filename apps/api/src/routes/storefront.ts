import { ERROR_CODES, formatRupiah, parseOrThrow, schemas } from '@velora/shared';
import { Hono } from 'hono';
import { searchAreas } from '../integrations/biteship';
import { mailTemplate, sendEmail } from '../integrations/email';
import { cached } from '../lib/cache';
import { type Row, all, first, num, optStr, str } from '../lib/db';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { seoSettings, storefrontSettings } from '../lib/settings';
import { currentUser, limit, optionalUser } from '../mw/auth';
import { loadCart, resolveCartId } from '../services/cart';
import {
  addReview,
  availabilityMatrix,
  canReview,
  catalogFacets,
  getProduct,
  listBrands,
  listCategories,
  listColors,
  listProducts,
  listReviews,
  listSizes,
  recordProductView,
  relatedProducts,
} from '../services/catalog';
import {
  getMenus,
  getPage,
  homePage,
  listBanners,
  listFaqs,
  listPages,
  subscribeNewsletter,
  unsubscribeNewsletter,
} from '../services/content';
import { evaluateCoupon, publicCoupons } from '../services/coupon';
import { findOrderRow } from '../services/order';
import { availablePaymentMethods } from '../services/payment';
import { trackingView } from '../services/shipment';
import { PICKUP_OPTION_ID, type RateRequest, defaultOrigin, shippingOptions } from '../services/shipping';
import type { AppEnv, Ctx } from '../types';
import { flagsOf, intField, mediaFor, optionalString, readBody, readQuery, toFilters } from './_shared';

/**
 * Public storefront API. Cached responses are always public-shaped: no session
 * data ever enters a cache key that another visitor could read.
 */

export const storefront = new Hono<AppEnv>()
  .get('/health', (c) => c.json({ ok: true, service: 'velora-api', time: new Date().toISOString() }))

  /* --------------------------------- config -------------------------------- */
  .get('/config', async (c) => {
    const env = c.env;
    const db = env.DB;
    const settings = await storefrontSettings(db);
    const origin = await defaultOrigin(db);
    const f = flagsOf(c);
    return c.json({
      brand: env.BRAND_NAME ?? 'VELORA',
      storeName: settings.storeName,
      currency: 'IDR',
      whatsapp: settings.whatsapp,
      email: settings.email,
      social: settings.social,
      shipping: {
        originConfigured: Boolean(origin),
        pickupAvailable: true,
      },
      integrations: {
        payments: f.duitku.configured,
        shipping: f.biteship.configured,
        realtime: f.firebase.configured,
        email: f.email.configured,
      },
    });
  })

  /* -------------------------- public store settings ------------------------ */
  // Feeds the SSR <head>: titles, Open Graph, robots and the JSON-LD graph.
  // Cached briefly because it is read on every document request.
  .get('/settings/public', async (c) => {
    const payload = await cached(c.env, 'public:settings', 120, async () => {
      const [seo, store] = await Promise.all([seoSettings(c.env.DB), storefrontSettings(c.env.DB)]);
      return { seo, store };
    });
    return c.json(payload);
  })

  /* -------------------------------- homepage ------------------------------- */
  .get('/home', async (c) => {
    const payload = await cached(c.env, 'home:page', 45, () => homePage(c.env.DB, mediaFor(c.env)));
    return c.json(payload);
  })

  /* -------------------------------- catalogue ------------------------------ */
  .get('/catalog', async (c) => {
    const q = readQuery(c, schemas.catalogQuerySchema);
    const filters = toFilters(q);
    const [items, facets] = await Promise.all([
      listProducts(c.env.DB, filters, mediaFor(c.env)),
      c.req.query('include')?.includes('facets') ? catalogFacets(c.env.DB, filters) : Promise.resolve(null),
    ]);
    return c.json({ ...items, facets });
  })

  .get('/products/:slug', async (c) => {
    const { slug } = parseOrThrow(schemas.slugParam, { slug: c.req.param('slug') });
    const db = c.env.DB;
    const product = await getProduct(db, slug, mediaFor(c.env));
    if (!product) throw notFound('Produk tidak ditemukan');
    // Drafts and archived products are invisible to shoppers.
    if (product.status !== 'active' && product.status !== 'out_of_stock') {
      const user = optionalUser(c);
      if (!user?.roles.length) throw notFound('Produk tidak ditemukan');
    }
    const related = await relatedProducts(db, product, 8, mediaFor(c.env));
    return c.json({ product, availability: availabilityMatrix(product), related });
  })

  .post('/products/:slug/view', async (c) => {
    const { slug } = parseOrThrow(schemas.slugParam, { slug: c.req.param('slug') });
    const row = await first<Row>(c.env.DB, `SELECT id FROM products WHERE slug = ?1`, [slug]);
    if (row) await recordProductView(c.env.DB, str(row.id));
    return c.json({ ok: true }, 202);
  })

  .get('/products/:slug/reviews', async (c) => {
    const { slug } = parseOrThrow(schemas.slugParam, { slug: c.req.param('slug') });
    const row = await first<Row>(c.env.DB, `SELECT id FROM products WHERE slug = ?1`, [slug]);
    if (!row) throw notFound('Produk tidak ditemukan');
    const page = intField(c.req.query('page'), 1, 1, 200);
    const pageSize = intField(c.req.query('pageSize'), 10, 1, 30);
    const { items, total } = await listReviews(c.env.DB, str(row.id), page, pageSize);
    return c.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  })

  .post('/products/:slug/reviews', limit({ max: 5, scope: 'review' }), async (c) => {
    const user = currentUser(c);
    const { slug } = parseOrThrow(schemas.slugParam, { slug: c.req.param('slug') });
    const input = await readBody(c, schemas.reviewSchema);
    const db = c.env.DB;
    const row = await first<Row>(db, `SELECT id, status FROM products WHERE slug = ?1`, [slug]);
    if (!row || str(row.status) !== 'active') throw notFound('Produk tidak ditemukan');
    const productId = str(row.id);
    if (!(await canReview(db, user.id, productId))) {
      throw forbidden('Ulasan hanya bisa diberikan setelah pesanan Anda selesai dikirim');
    }
    const review = await addReview(db, {
      productId,
      userId: user.id,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body,
    });
    return c.json({ review }, 201);
  })

  .get('/categories', async (c) => c.json(await listCategories(c.env.DB, mediaFor(c.env))))
  .get('/brands', async (c) => c.json(await listBrands(c.env.DB, mediaFor(c.env))))
  .get('/colors', async (c) => c.json(await listColors(c.env.DB)))
  .get('/sizes', async (c) => c.json(await listSizes(c.env.DB)))

  /* --------------------------------- content ------------------------------- */
  .get('/banners', async (c) =>
    c.json(await listBanners(c.env.DB, mediaFor(c.env), optionalString(c.req.query('placement'), 30))),
  )
  .get('/faqs', async (c) => c.json(await listFaqs(c.env.DB)))
  .get('/menus', async (c) => c.json(await getMenus(c.env.DB)))
  .get('/pages', async (c) => c.json(await listPages(c.env.DB)))
  .get('/pages/:slug', async (c) => {
    const { slug } = parseOrThrow(schemas.slugParam, { slug: c.req.param('slug') });
    const page = await getPage(c.env.DB, slug);
    if (!page) throw notFound('Halaman tidak ditemukan');
    return c.json(page);
  })

  /* -------------------------------- newsletter ----------------------------- */
  .post('/newsletter', limit({ max: 5, scope: 'newsletter' }), async (c) => {
    const input = await readBody(c, schemas.newsletterSchema);
    const result = await subscribeNewsletter(c.env.DB, input.email, input.source ?? 'storefront', c.get('ip'));
    return c.json({ status: result.status, message: 'Terima kasih, langganan Anda tercatat.' }, 201);
  })

  .delete('/newsletter', async (c) => {
    const email = optionalString(c.req.query('email'), 200);
    if (!email) throw badRequest('Parameter email wajib diisi');
    await unsubscribeNewsletter(c.env.DB, email);
    return c.json({ status: 'unsubscribed' });
  })

  /* ---------------------------------- contact ------------------------------ */
  .post('/contact', limit({ max: 3, scope: 'contact' }), async (c) => {
    const f = flagsOf(c);
    const input = await readBody(c, schemas.contactSchema);
    const settings = await storefrontSettings(c.env.DB);
    const to = settings.email;
    if (!to) {
      return c.json({
        delivered: false,
        message: 'Surel toko belum diatur. Silakan hubungi WhatsApp kami.',
        fallback: { whatsapp: settings.whatsapp, email: null },
      });
    }
    const result = await sendEmail(c.env, f, {
      to,
      subject: `Pesan baru dari ${input.name}: ${input.subject}`,
      html: mailTemplate({
        storeName: settings.storeName,
        title: input.subject,
        body: `${input.message}\n\n— ${input.name} (${input.email})`,
        ctaLabel: 'Balas pelanggan',
        ctaHref: `mailto:${input.email}`,
      }),
      text: `${input.message}\n\n— ${input.name} <${input.email}>`,
    });
    return c.json({
      delivered: result.ok,
      message: result.ok
        ? 'Pesan Anda terkirim. Tim kami akan membalas via email.'
        : 'Pesan belum terkirim ke toko. Silakan hubungi WhatsApp kami.',
      fallback: { whatsapp: settings.whatsapp, email: to },
    });
  })

  /* --------------------------------- coupons ------------------------------- */
  .get('/coupons', async (c) => c.json(await publicCoupons(c.env.DB)))

  .post('/coupons/validate', limit({ max: 20, scope: 'coupon' }), async (c) => {
    const user = c.get('user') ?? null;
    const body = await c.req.json().catch(() => ({}));
    const code = String((body as { code?: unknown }).code ?? '');
    if (!code) throw badRequest('Kode promo wajib diisi');
    const cartId = await resolveCartId(c.env.DB, user?.id ?? null, c.get('guestToken'));
    if (!cartId) throw new AppError(ERROR_CODES.CART_EMPTY, 'Keranjang Anda masih kosong', 400);
    const cart = await loadCart(c.env.DB, cartId, c.env);
    const lines = cart.lines.filter((l) => l.status === 'ok');
    const categories = await categoryMap(
      c.env.DB,
      lines.map((l) => l.productId),
    );
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const { preview } = await evaluateCoupon(c.env.DB, {
      code,
      lines: lines.map((l) => ({
        productId: l.productId,
        categoryId: categories.get(l.productId) ?? null,
        lineTotal: l.unitPrice * l.quantity,
      })),
      subtotal,
      shippingFee: 0,
      userId: user?.id ?? null,
    });
    return c.json(preview);
  })

  /* -------------------------------- shipping ----------------------------- */
  .get('/shipping/options', limit({ max: 30, scope: 'shipping' }), async (c) => {
    const q = readQuery(c, schemas.shippingRateQuerySchema);
    const user = c.get('user') ?? null;
    const cartId = await resolveCartId(c.env.DB, user?.id ?? null, c.get('guestToken'), false);
    const cart = cartId ? await loadCart(c.env.DB, cartId, c.env) : null;
    const lines = (cart?.lines ?? []).filter((l) => l.status === 'ok');
    const weight = lines.reduce((s, l) => s + l.weightGrams * l.quantity, 0);
    const value = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const req: RateRequest = {
      destinationAreaId: q.areaId || null,
      destinationPostalCode: q.postcode || null,
      weightGrams: weight > 0 ? weight : q.weight,
      value,
      quantity: Math.max(
        1,
        lines.reduce((s, l) => s + l.quantity, 0),
      ),
      itemName: lines[0]?.productName ?? 'Paket busana',
    };
    const outcome = await shippingOptions(c.env.DB, c.env, flagsOf(c), req);
    return c.json({
      options: outcome.options,
      source: outcome.source,
      error: outcome.error,
      weightGrams: req.weightGrams,
      estimatedPickup: outcome.options.some((o) => o.id === PICKUP_OPTION_ID),
      note: outcome.error ? `Tarif kurir tidak tersedia: ${outcome.error}` : null,
    });
  })

  .get('/shipping/areas', limit({ max: 30, scope: 'areas' }), async (c) => {
    const q = readQuery(c, schemas.areaSearchSchema);
    const f = flagsOf(c);
    if (!f.biteship.configured) {
      return c.json({
        items: [],
        configured: false,
        message: 'Pelacakan wilayah memakai Biteship; kredensial belum diisi.',
      });
    }
    const items = await searchAreas(c.env, f, q.q, q.limit);
    return c.json({ items, configured: true });
  })

  /* -------------------------------- payments ------------------------------- */
  .get('/payment/methods', async (c) => {
    const amount = Math.max(0, num(c.req.query('amount')));
    const methods = await availablePaymentMethods(c.env, flagsOf(c), amount, (p) => c.executionCtx.waitUntil(p));
    return c.json({
      methods,
      configured: methods.length > 0,
      note: methods.length ? null : 'Metode pembayaran muncul setelah kredensial Duitku diisi administrator.',
      amountHint: formatRupiah(amount),
    });
  })

  /* ------------------------------ public tracking -------------------------- */
  .get('/track', limit({ max: 20, scope: 'track' }), async (c) => {
    const code = (c.req.query('code') ?? '').trim().toUpperCase();
    const email = (c.req.query('email') ?? '').trim().toLowerCase();
    if (code.length < 6 || !email) throw badRequest('Isi kode pesanan dan email pemesanan');
    const row = await findOrderRow(c.env.DB, code);
    if (!row) throw notFound('Pesanan tidak ditemukan');
    // Matching the ordering email is what keeps a code from being a bearer token.
    const owner = await first<Row>(c.env.DB, `SELECT email FROM users WHERE id = ?1`, [str(row.user_id)]);
    if (!owner || str(owner.email).toLowerCase() !== email) throw notFound('Pesanan tidak ditemukan');
    const shipment = await trackingView(c.env.DB, str(row.id));
    return c.json({
      code: str(row.code),
      status: str(row.status),
      shippingStatus: shipment?.status ?? null,
      courier: shipment ? `${shipment.courierCompany} ${shipment.courierService}`.trim() : null,
      waybillId: shipment?.waybillId ?? null,
      events: shipment?.events ?? [],
      estimate: shipment?.estimate ?? null,
    });
  });

/** Helper: category id per product, used by coupon scoping. */
async function categoryMap(db: D1Database, productIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!productIds.length) return map;
  const rows = await all(
    db,
    `SELECT id, primary_category_id FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
    productIds,
  );
  for (const r of rows) map.set(str(r.id), optStr(r.primary_category_id));
  return map;
}
