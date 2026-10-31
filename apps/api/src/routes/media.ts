import { Hono } from 'hono';
import { type Row, all, str } from '../lib/db';
import { badRequest, notFound } from '../lib/errors';
import {
  type MediaFolder,
  assertKeySafe,
  buildObjectKey,
  mediaUrl,
  renderGarmentSvg,
  shapeForCategory,
  validateImageUpload,
} from '../lib/media';
import { requireAdmin } from '../mw/auth';
import type { AppEnv, Ctx } from '../types';

/**
 * Media.
 *
 * Public reads (`/media/*`) stream from R2, or re-render the deterministic
 * editorial illustration used by the demo catalogue. Uploads (`/api/media/*`)
 * are admin-only and validate the actual bytes, not the declared type.
 */

const GENERATED_FILE = /^([a-z0-9][a-z0-9-]{1,120})(?:--([a-z0-9][a-z0-9-]{1,60}))?\.svg$/;

export const mediaRoutes = new Hono<AppEnv>()
  .get('/generated/:file', async (c) => {
    const file = c.req.param('file') ?? '';
    const match = GENERATED_FILE.exec(file.toLowerCase());
    if (!match) throw notFound('Gambar tidak ditemukan');
    const [, slug, colorSlug] = match;
    const svg = await renderForProduct(c, slug, colorSlug ?? null);
    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400, immutable',
        etag: `"${slug}-${colorSlug ?? 'default'}"`,
        vary: 'Accept-Encoding',
      },
    });
  })

  .get('/*', async (c) => {
    const key = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/media\/?/, '');
    if (!key) throw notFound('Gambar tidak ditemukan');
    assertKeySafe(key);
    const object = await c.env.MEDIA.get(key);
    if (!object) throw notFound('Gambar tidak ditemukan');
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && object.etag && ifNoneMatch === object.etag) return new Response(null, { status: 304 });
    return new Response(object.body as ReadableStream, {
      headers: {
        'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        'content-length': String(object.size),
        'cache-control': 'public, max-age=31536000, immutable',
        etag: object.etag ?? '',
      },
    });
  });

/** Admin upload surface, mounted under `/api/media`. */
export const mediaAdminRoutes = new Hono<AppEnv>().post('/upload', requireAdmin, async (c) => {
  const body = await c.req.formData().catch(() => null);
  if (!body) throw badRequest('Formulir upload tidak terbaca');
  const file = body.get('file');
  if (!(file instanceof File)) throw badRequest('File gambar wajib diunggah');
  const folder = normaliseFolder(String(body.get('folder') ?? 'products'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const declared = file.type || 'image/jpeg';
  const sniffed = validateImageUpload({ bytes, declaredMime: declared, filename: file.name });
  const key = buildObjectKey(folder, sniffed.mime, String(body.get('hint') ?? file.name.replace(/\.[^.]+$/, '')));
  await c.env.MEDIA.put(key, bytes as unknown as ArrayBuffer, {
    httpMetadata: { contentType: sniffed.mime, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { uploadedBy: c.get('user')?.id ?? '', originalName: file.name.slice(0, 140) },
  });
  return c.json(
    { key, url: mediaUrl(c.env, key), mime: sniffed.mime, width: sniffed.width, height: sniffed.height },
    201,
  );
});

/* --------------------------------- helpers -------------------------------- */

const FOLDERS: MediaFolder[] = ['products', 'variants', 'banners', 'categories', 'brands', 'pages', 'demo'];

function normaliseFolder(raw: string): MediaFolder {
  return (FOLDERS as string[]).includes(raw) ? (raw as MediaFolder) : 'products';
}

/** Builds the flat-lay render from real catalogue data: name, category, colour. */
async function renderForProduct(c: Ctx, slug: string, colorSlug: string | null): Promise<string> {
  const rows = await all<Row>(
    c.env.DB,
    `SELECT p.name, p.slug, co.slug AS color_slug, co.hex_code, ca.slug AS category_slug, b.name AS brand_name
     FROM products p
     LEFT JOIN categories ca ON ca.id = p.primary_category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN product_colors pc ON pc.product_id = p.id
     LEFT JOIN colors co ON co.id = pc.color_id
     WHERE p.slug = ?1
     ORDER BY co.slug ASC`,
    [slug],
  );
  if (!rows.length) {
    // Unknown product: a neutral editorial placeholder, never a broken image.
    return renderGarmentSvg({
      shape: 'tee',
      color: '#E8E6E0',
      label: 'VELORA',
      sublabel: 'Modern Fashion Store',
      seed: 1,
    });
  }
  const pick = (colorSlug ? rows.find((r) => str(r.color_slug) === colorSlug) : undefined) ?? rows[0];
  return renderGarmentSvg({
    shape: shapeForCategory(optStr(pick.category_slug), str(pick.name)),
    color: optHex(pick.hex_code),
    label: str(pick.name),
    sublabel: optStr(pick.brand_name) ?? undefined,
    seed: seedFor(str(pick.slug) + (optStr(pick.color_slug) ?? '')),
  });
}

function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

function optHex(v: unknown): string {
  const s = optStr(v);
  return s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#8A8A8A';
}

/** Stable small integer so the same garment always renders at the same tilt. */
function seedFor(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 97) + 1;
}
