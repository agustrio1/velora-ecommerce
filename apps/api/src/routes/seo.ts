import { discountPercent, effectivePrice } from '@velora/shared';
import { Hono } from 'hono';
import { notFound } from '../lib/errors';
import { seoSettings } from '../lib/settings';
import { getProduct } from '../services/catalog';
import { sitemapEntries } from '../services/content';
import type { AppEnv, Ctx } from '../types';
import { flagsOf, mediaFor } from './_shared';

/**
 * SEO endpoints. The sitemap is generated from live catalogue rows, so a product
 * that is unpublished simply is not listed — nothing is faked or cached forever.
 */

export const seoRoutes = new Hono<AppEnv>()
  .get('/sitemap.xml', async (c) => {
    const base = await canonicalBase(c);
    const entries = await sitemapEntries(c.env.DB);
    const urls = entries
      .map((e) => {
        const loc = `${base}${e.path}`.replace(/([^:])\/{2,}/g, '$1/');
        const lastmod = e.updatedAt ? `<lastmod>${e.updatedAt.slice(0, 10)}</lastmod>` : '';
        return `<url><loc>${escapeXml(loc)}</loc>${lastmod}<changefreq>daily</changefreq><priority>${priorityFor(e.path)}</priority></url>`;
      })
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    return new Response(xml, {
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  })

  .get('/robots.txt', async (c) => {
    const base = await canonicalBase(c);
    const f = flagsOf(c);
    // Staging must never be indexed; production opens everything except private areas.
    const disallow = f.isProduction
      ? ['/admin', '/akun', '/keranjang', '/checkout', '/pembayaran', '/masuk', '/daftar']
      : ['/'];
    const text = [
      `# VELORA — ${f.env}`,
      'User-agent: *',
      ...disallow.map((p) => `Disallow: ${p}`),
      'Allow: /',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n');
    return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  })

  /**
   * PWA manifest. Served by the Worker (not as a static asset) so `wrangler dev`,
   * the Vite dev server and production answer identically — an asset miss here
   * would hand the browser an HTML body it cannot parse as JSON.
   */
  .get('/manifest.webmanifest', (c) => {
    const manifest = {
      id: '/',
      name: 'VELORA — Busana Modern',
      short_name: 'VELORA',
      description: 'Katalog busana modern dengan harga jujur dan pengiriman ke seluruh Indonesia.',
      lang: 'id',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#F7F6F2',
      theme_color: '#191919',
      categories: ['shopping', 'lifestyle'],
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      shortcuts: [
        { name: 'Katalog', short_name: 'Katalog', url: '/katalog' },
        { name: 'Keranjang', short_name: 'Keranjang', url: '/keranjang' },
      ],
    };
    return new Response(JSON.stringify(manifest), {
      headers: {
        'content-type': 'application/manifest+json; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    });
  });

/** Structured data served from the same numbers the storefront shows. */
export const seoDataRoutes = new Hono<AppEnv>().get('/product/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug) throw notFound('Produk tidak ditemukan');
  const product = await getProduct(c.env.DB, slug, mediaFor(c.env));
  if (!product || (product.status !== 'active' && product.status !== 'out_of_stock')) {
    throw notFound('Produk tidak ditemukan');
  }
  const base = await canonicalBase(c);
  const url = `${base}/produk/${product.slug}`;
  const buyable = product.variants.filter((v) => v.status === 'active');
  const prices = buyable.map((v) => effectivePrice(v.price, v.salePrice)).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : effectivePrice(product.price, product.salePrice);
  const maxPrice = prices.length ? Math.max(...prices) : minPrice;
  const inStock = buyable.some((v) => v.available > 0);
  const images = product.images.length
    ? product.images.map((i) => i.url)
    : product.primaryImage
      ? [product.primaryImage]
      : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.metaDescription ?? stripLead(product.description),
    sku: product.sku,
    category: product.categoryName ?? undefined,
    brand: product.brandName ? { '@type': 'Brand', name: product.brandName } : undefined,
    image: images,
    url,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'IDR',
      lowPrice: minPrice,
      highPrice: maxPrice,
      offerCount: buyable.length || 1,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url,
    },
    ...(product.ratingCount > 0 && product.ratingAvg
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(product.ratingAvg.toFixed(2)),
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };

  return c.json({
    jsonLd,
    meta: {
      title: product.metaTitle ?? `${product.name} | VELORA`,
      description: jsonLd.description,
      canonical: url,
      ogImage: images[0] ?? null,
      discountPercent: discountPercent(product.price, product.salePrice),
      lowStockHint: inStock ? null : 'Stok habis',
    },
  });
});

/* --------------------------------- helpers -------------------------------- */

async function canonicalBase(c: Ctx): Promise<string> {
  const seo = await seoSettings(c.env.DB);
  return (seo.canonicalBaseUrl || flagsOf(c).appUrl || new URL(c.req.url).origin).replace(/\/$/, '');
}

function priorityFor(path: string): string {
  if (path === '/') return '1.0';
  if (path.startsWith('/produk/')) return '0.8';
  if (path.startsWith('/kategori/')) return '0.7';
  if (path === '/katalog') return '0.9';
  return '0.4';
}

function escapeXml(input: string): string {
  return input.replace(/[<>&'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** First sentence of the description, for a sane default meta description. */
function stripLead(body: string): string {
  const plain = body.replace(/\s+/g, ' ').trim();
  return plain.length > 200 ? `${plain.slice(0, 197)}...` : plain;
}
