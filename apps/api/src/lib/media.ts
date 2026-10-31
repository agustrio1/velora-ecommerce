import { UPLOAD } from '@velora/shared';
import type { Env } from '../env';
import { badRequest } from './errors';
import { uuid } from './ids';

/* ------------------------------ object keys ------------------------------ */

export type MediaFolder = 'products' | 'variants' | 'banners' | 'categories' | 'brands' | 'pages' | 'demo';

const SAFE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Unpredictable, collision free keys. Original filenames never reach storage. */
export function buildObjectKey(folder: MediaFolder, mime: string, hint?: string): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ext = SAFE_EXT[mime] ?? 'bin';
  const slug = (hint ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${folder}/${ym}/${uuid()}${slug ? `-${slug}` : ''}.${ext}`;
}

export function assertKeySafe(key: string): string {
  if (!key || key.includes('..') || key.startsWith('/') || key.length > 300) {
    throw badRequest('Path gambar tidak valid');
  }
  if (!/^[a-z0-9/_-]+\.[a-z0-9]+$/i.test(key)) throw badRequest('Path gambar tidak valid');
  return key;
}

/* ---------------------------- content sniffing ---------------------------- */

export interface SniffedImage {
  mime: string;
  ext: string;
  width: number;
  height: number;
}

/**
 * Trust but verify: the browser declared MIME is ignored, we read magic bytes.
 * Also decodes dimensions for JPEG/PNG/WebP/GIF headers without native deps
 * (Workers has no `sharp`), which is enough to reject malformed payloads.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const u = bytes;
  const has = (sig: number[], at = 0) => sig.every((b, i) => u[at + i] === b);
  const be16 = (at: number) => (u[at] << 8) | u[at + 1];
  const be32 = (at: number) => ((u[at] << 24) | (u[at + 1] << 16) | (u[at + 2] << 8) | u[at + 3]) >>> 0;
  const le32 = (at: number) => u[at] | (u[at + 1] << 8) | (u[at + 2] << 16) | (u[at + 3] << 24);

  if (u.length < 12) return null;

  // PNG
  if (has([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png', width: be32(16), height: be32(20) };
  }
  // GIF
  if (has([0x47, 0x49, 0x46, 0x38])) {
    return { mime: 'image/gif', ext: 'gif', width: be16(7), height: be16(9) };
  }
  // WEBP: RIFF....WEBP
  if (has([0x52, 0x49, 0x46, 0x46]) && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) {
    const fourcc = String.fromCharCode(u[12], u[13], u[14], u[15]);
    if (fourcc === 'VP8 ') {
      return {
        mime: 'image/webp',
        ext: 'webp',
        width: (u[26] | (u[27] << 8)) & 0x3fff,
        height: (u[28] | (u[29] << 8)) & 0x3fff,
      };
    }
    if (fourcc === 'VP8L') {
      const bits = le32(21);
      return { mime: 'image/webp', ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      return {
        mime: 'image/webp',
        ext: 'webp',
        width: 1 + (u[24] | (u[25] << 8) | (u[26] << 16)),
        height: 1 + (u[27] | (u[28] << 8) | (u[29] << 16)),
      };
    }
    return { mime: 'image/webp', ext: 'webp', width: 0, height: 0 };
  }
  // AVIF/HEIF: ....ftypavif
  if (u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70) {
    const brand = String.fromCharCode(u[8], u[9], u[10], u[11]);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif', width: 0, height: 0 };
    return null;
  }
  // JPEG
  if (has([0xff, 0xd8, 0xff])) {
    let at = 2;
    while (at + 9 < u.length) {
      if (u[at] !== 0xff) {
        at++;
        continue;
      }
      const marker = u[at + 1];
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      const len = be16(at + 2);
      if (isSof) return { mime: 'image/jpeg', ext: 'jpg', height: be16(at + 5), width: be16(at + 7) };
      if ([0xd8, 0x01].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2;
        continue;
      }
      at += 2 + len;
    }
    return { mime: 'image/jpeg', ext: 'jpg', width: 0, height: 0 };
  }
  return null;
}

export function validateImageUpload(input: {
  bytes: Uint8Array;
  declaredMime: string;
  filename: string;
}): SniffedImage {
  if (input.bytes.byteLength === 0) throw badRequest('File kosong');
  if (input.bytes.byteLength > UPLOAD.maxBytes) {
    throw badRequest(`Ukuran gambar maksimum ${(UPLOAD.maxBytes / 1024 / 1024).toFixed(1)} MB`);
  }
  if (!(UPLOAD.allowedMime as readonly string[]).includes(input.declaredMime)) {
    throw badRequest('Tipe gambar tidak diizinkan');
  }
  const sniffed = sniffImage(input.bytes);
  if (!sniffed) throw badRequest('Isi file bukan gambar yang valid');
  if (sniffed.mime !== input.declaredMime) {
    throw badRequest('Tipe file tidak cocok dengan isinya');
  }
  if (sniffed.width > UPLOAD.maxDimension || sniffed.height > UPLOAD.maxDimension) {
    throw badRequest(`Dimensi maksimum ${UPLOAD.maxDimension}px`);
  }
  return sniffed;
}

/* ------------------------------ public URLs ------------------------------ */

export function mediaPublicBase(c: Env): string {
  const configured = (c.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  return `${(c.APP_URL ?? '').replace(/\/$/, '')}/media`;
}

export function mediaUrl(c: Env, key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  return `${mediaPublicBase(c)}/${key.replace(/^\/+/, '')}`;
}

/* ------------------------- generated editorial art ----------------------- */

export type GarmentShape = 'tee' | 'shirt' | 'hoodie' | 'jacket' | 'pants' | 'denim' | 'cap' | 'bag';

const SHAPE_BY_CATEGORY: Record<string, GarmentShape> = {
  kaos: 'tee',
  kemeja: 'shirt',
  outerwear: 'jacket',
  celana: 'pants',
  denim: 'denim',
  aksesori: 'bag',
};

export function shapeForCategory(slug: string | null | undefined, name = ''): GarmentShape {
  const key = (slug ?? name ?? '').toLowerCase();
  if (key.includes('kaos') || key.includes('t-shirt') || key.includes('tee')) return 'tee';
  if (key.includes('kemeja') || key.includes('shirt')) return 'shirt';
  if (key.includes('outer') || key.includes('hoodie') || key.includes('jaket')) return 'jacket';
  if (key.includes('denim') || key.includes('jeans')) return 'denim';
  if (key.includes('celana') || key.includes('trouser') || key.includes('chino')) return 'pants';
  if (key.includes('topi') || key.includes('cap')) return 'cap';
  if (key.includes('aksesori') || key.includes('tas') || key.includes('bag')) return 'bag';
  return SHAPE_BY_CATEGORY[key] ?? 'tee';
}

function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean.padEnd(6, '0');
  const n = Number.parseInt(full.slice(0, 6), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function esc(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Deterministic editorial flat-lay illustration for demo products.
 * Deliberately NOT a stock photo of a person or another brand's campaign: it is
 * our own vector garment render, so the demo store stays legally clean while
 * still looking like a real fashion catalogue.
 */
export function renderGarmentSvg(opts: {
  shape: GarmentShape;
  color: string;
  label: string;
  sublabel?: string;
  seed?: number;
}): string {
  const { shape, label } = opts;
  const color = /^#[0-9a-fA-F]{6}$/.test(opts.color) ? opts.color : '#8A8A8A';
  const dark = shade(color, -46);
  const light = shade(color, 26);
  const bg = '#F1EFE9';
  const seed = opts.seed ?? 1;
  const angle = ((seed % 5) - 2) * 1.6;

  const body: Record<GarmentShape, string> = {
    tee: `
      <path d="M300 200 L390 170 Q450 205 510 170 L600 200 L640 300 L570 320 L570 640 Q450 665 330 640 L330 320 L260 300 Z"
            fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M390 170 Q450 235 510 170" fill="none" stroke="${dark}" stroke-width="3"/>
      <path d="M330 320 L260 300 M570 320 L640 300" stroke="${dark}" stroke-width="2" opacity=".7"/>
      <path d="M370 430 Q450 448 530 430" fill="none" stroke="${light}" stroke-width="2" opacity=".8"/>`,
    shirt: `
      <path d="M300 200 L388 168 L450 205 L512 168 L600 200 L642 302 L574 322 L574 645 Q450 668 326 645 L326 322 L258 302 Z"
            fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M388 168 L450 205 L414 250 Z" fill="${light}" stroke="${dark}" stroke-width="2"/>
      <path d="M512 168 L450 205 L486 250 Z" fill="${light}" stroke="${dark}" stroke-width="2"/>
      <line x1="450" y1="205" x2="450" y2="650" stroke="${dark}" stroke-width="2.5"/>
      ${[270, 340, 410, 480, 550, 610].map((y) => `<circle cx="440" cy="${y}" r="5" fill="${dark}"/>`).join('')}`,
    hoodie: `
      <path d="M292 215 L382 175 Q450 210 518 175 L608 215 L650 330 L578 350 L578 650 Q450 675 322 650 L322 350 L250 330 Z"
            fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M375 178 Q450 120 525 178 Q450 245 375 178 Z" fill="${shade(color, -18)}" stroke="${dark}" stroke-width="3"/>
      <path d="M420 210 L420 300 M480 210 L480 300" stroke="${light}" stroke-width="4" stroke-linecap="round"/>
      <rect x="368" y="470" width="164" height="90" rx="10" fill="${shade(color, -12)}" stroke="${dark}" stroke-width="2.5"/>`,
    jacket: `
      <path d="M295 205 L385 170 Q450 200 515 170 L605 205 L648 320 L576 340 L576 648 Q450 672 324 648 L324 340 L252 320 Z"
            fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M385 170 L450 232 L405 268 Z" fill="${shade(color, 16)}" stroke="${dark}" stroke-width="2"/>
      <path d="M515 170 L450 232 L495 268 Z" fill="${shade(color, 16)}" stroke="${dark}" stroke-width="2"/>
      <line x1="450" y1="232" x2="450" y2="648" stroke="${dark}" stroke-width="3.5"/>
      <rect x="352" y="470" width="70" height="58" rx="6" fill="none" stroke="${dark}" stroke-width="2.5"/>
      <rect x="478" y="470" width="70" height="58" rx="6" fill="none" stroke="${dark}" stroke-width="2.5"/>`,
    pants: `
      <path d="M330 190 L570 190 L586 300 L560 640 L470 640 L450 380 L430 640 L340 640 L314 300 Z"
            fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M330 232 L570 232" stroke="${dark}" stroke-width="2.5"/>
      <path d="M450 232 L450 380" stroke="${dark}" stroke-width="2"/>
      <path d="M348 262 L410 262 M492 262 L552 262" stroke="${light}" stroke-width="3" opacity=".7"/>`,
    denim: `
      <path d="M328 188 L572 188 L590 302 L562 644 L470 644 L450 382 L430 644 L338 644 L310 302 Z"
            fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M328 234 L572 234" stroke="${dark}" stroke-width="2.5"/>
      <path d="M352 268 L432 300 M548 268 L468 300" stroke="${light}" stroke-width="2.5" stroke-dasharray="7 6"/>
      <path d="M356 208 Q400 236 444 208 M456 208 Q500 236 544 208" fill="none" stroke="${light}" stroke-width="2.5" stroke-dasharray="7 6"/>
      <path d="M470 644 L470 382 M430 644 L430 382" stroke="${dark}" stroke-width="1.6" opacity=".6"/>`,
    cap: `
      <path d="M262 430 Q262 250 450 250 Q638 250 638 430 Z" fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M450 250 L450 430 M342 268 Q360 350 356 430 M558 268 Q540 350 544 430" stroke="${dark}" stroke-width="2" opacity=".65"/>
      <path d="M262 430 L638 430 Q700 442 690 476 L250 476 Q238 442 262 430 Z" fill="${shade(color, -20)}" stroke="${dark}" stroke-width="3"/>
      <circle cx="450" cy="258" r="10" fill="${dark}"/>`,
    bag: `
      <path d="M330 300 Q450 190 570 300" fill="none" stroke="${dark}" stroke-width="7"/>
      <rect x="300" y="300" width="300" height="330" rx="26" fill="${color}" stroke="${dark}" stroke-width="3"/>
      <path d="M300 390 L600 390" stroke="${dark}" stroke-width="2.5"/>
      <rect x="410" y="360" width="80" height="60" rx="10" fill="${shade(color, -22)}" stroke="${dark}" stroke-width="2.5"/>`,
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900" role="img" aria-label="${esc(label)}">
  <rect width="900" height="900" fill="${bg}"/>
  <g transform="rotate(${angle} 450 450)">
    <ellipse cx="450" cy="740" rx="210" ry="24" fill="#000" opacity=".07"/>
    ${body[shape]}
  </g>
  <text x="52" y="840" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="30" letter-spacing="4" fill="#191919" opacity=".82">${esc(label.toUpperCase())}</text>
  ${opts.sublabel ? `<text x="52" y="872" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="20" letter-spacing="2" fill="#777777">${esc(opts.sublabel)}</text>` : ''}
</svg>`;
}
