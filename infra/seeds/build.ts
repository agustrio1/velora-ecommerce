/**
 * VELORA demo seed generator.
 *
 *   bun run infra/seeds/build.ts
 *   bun run db:seed:local
 *
 * Everything here is deterministic (fixed random seed) so re-running produces byte
 * identical SQL: ids, SKUs, prices and stock levels never drift between runs.
 * Product imagery is never invented as photography: every image_key points at the
 * Worker's own `/media/generated/<slug>.svg` renderer, so the seed contains no
 * binary assets and no third-party pictures of people or real brands.
 *
 * Money and stock are written the same way the live services would: an order that
 * is paid consumed its reservation (`sale`), an unpaid one still holds it
 * (`reserve` + active reservation row), a cancelled one released it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------ deterministic rng ----------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261030);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
const intBetween = (min: number, max: number): number => min + Math.floor(rnd() * (max - min + 1));

/* ---------------------------------- formatting -------------------------------- */

/** One row of generated SQL: column name -> value. */
type SqlRow = Record<string, unknown>;

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};

const json = (v: unknown): string => q(JSON.stringify(v));

/**
 * SQLite TEXT timestamps, UTC, no `T`/`Z` — the format every service writes.
 * The clock is anchored to "now" (floored to the hour) so seeding always tells the
 * same story: the newest order really did arrive minutes ago and its payment window
 * is still open. Ids, SKUs and prices stay byte-for-byte deterministic.
 */
const BASE = Math.floor(Date.now() / 3_600_000) * 3_600_000;
const ts = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString().slice(0, 19).replace('T', ' ');
const days = (n: number): number => n * 86_400_000;
const hours = (n: number): number => n * 3_600_000;

const rows = (table: string, columns: string[], values: SqlRow[]): string => {
  if (!values.length) return '';
  const body = values.map((v) => `  (${columns.map((col) => q(v[col])).join(', ')})`).join(',\n');
  return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES\n${body};\n`;
};

/* ---------------------------------- taxonomy ---------------------------------- */

const CATEGORIES = [
  'cat_tshirts',
  'cat_shirts',
  'cat_outerwear',
  'cat_trousers',
  'cat_denim',
  'cat_accessories',
] as const;

const BRANDS = ['brand_velora', 'brand_atelier', 'brand_north', 'brand_studio'] as const;

const COLOR_LABEL: Record<string, string> = {
  color_black: 'hitam',
  color_white: 'putih',
  color_cream: 'cream',
  color_navy: 'navy',
  color_charcoal: 'charcoal',
  color_olive: 'olive',
  color_sand: 'sand',
  color_brown: 'cokelat',
  color_grey: 'abu-abu',
  color_indigo: 'indigo',
  color_stone: 'stone',
  color_wine: 'wine',
};

const SIZE_CODE: Record<string, string> = {
  size_s: 'S',
  size_m: 'M',
  size_l: 'L',
  size_xl: 'XL',
  size_xxl: 'XXL',
  size_28: '28',
  size_30: '30',
  size_32: '32',
  size_34: '34',
  size_os: 'OS',
};

const TOP_SIZES = ['size_s', 'size_m', 'size_l', 'size_xl', 'size_xxl'];
const WAIST_SIZES = ['size_28', 'size_30', 'size_32', 'size_34'];

/* ---------------------------------- products ---------------------------------- */

type SeedProduct = {
  name: string;
  category: (typeof CATEGORIES)[number];
  brand: (typeof BRANDS)[number];
  price: number;
  sale?: number;
  material: string;
  weight: number;
  colors: string[];
  sizes: string[];
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  blurb: string;
};

const P = (
  name: string,
  category: SeedProduct['category'],
  brand: SeedProduct['brand'],
  price: number,
  material: string,
  weight: number,
  colors: string[],
  sizes: string[],
  blurb: string,
  flags?: Partial<Pick<SeedProduct, 'sale' | 'featured' | 'newArrival' | 'bestSeller'>>,
): SeedProduct => ({
  name,
  category,
  brand,
  price,
  material,
  weight,
  colors,
  sizes,
  blurb,
  ...flags,
});

const COMBED = 'Katun combed 30s';
const OXFORD = 'Katun oxford';
const LINEN = 'Campuran linen-rayon';
const TWILL = 'Katun twill';
const DENIM = 'Denim 12oz';
const FLEECE = 'Fleece cotton 320gsm';
const RIPSTOP = 'Nylon ripstop';
const WOOL = 'Wool blend';
const CANVAS = 'Kanvas 12oz';

const PRODUCTS: SeedProduct[] = [
  // ------------------------------- T-Shirts (5) -------------------------------
  P(
    'Kaos Oversight Box-fit',
    'cat_tshirts',
    'brand_velora',
    189_000,
    COMBED,
    180,
    ['color_black', 'color_cream', 'color_sand'],
    TOP_SIZES,
    'Potongan boxy dengan jahitan bahu jatuh. Katun combed 30s tebalnya 180 gsm, tidak menerawang.',
    { featured: true, bestSeller: true },
  ),
  P(
    'Kaos Heritage Crewneck',
    'cat_tshirts',
    'brand_studio',
    159_000,
    COMBED,
    170,
    ['color_white', 'color_charcoal', 'color_navy'],
    TOP_SIZES,
    'Kerah rib tiga lapis yang tidak melar setelah dicuci berulang.',
    { sale: 129_000, bestSeller: true },
  ),
  P(
    'Kaos Relaxed Boxy Lengan Panjang',
    'cat_tshirts',
    'brand_velora',
    229_000,
    COMBED,
    210,
    ['color_grey', 'color_olive'],
    TOP_SIZES,
    'Lengan panjang dengan badan longgar, pas dipakai sebagai lapisan tipis.',
    { newArrival: true },
  ),
  P(
    'Kaos Graphic Editorial Line',
    'cat_tshirts',
    'brand_atelier',
    249_000,
    COMBED,
    190,
    ['color_black', 'color_wine', 'color_indigo'],
    TOP_SIZES,
    'Sablon rubber berbasis air, cetak garis editorial khas VELORA.',
    { featured: true },
  ),
  P(
    'Kaos Basic Multi-pack Ready',
    'cat_tshirts',
    'brand_studio',
    139_000,
    COMBED,
    160,
    ['color_white', 'color_black', 'color_cream', 'color_stone'],
    TOP_SIZES,
    'Versi paling sederhana dari kemeja harian: tanpa logo, tanpa hiasan.',
    { sale: 99_000, bestSeller: true },
  ),

  // -------------------------------- Shirts (5) --------------------------------
  P(
    'Kemeja Oxford Regular Fit',
    'cat_shirts',
    'brand_atelier',
    389_000,
    OXFORD,
    320,
    ['color_white', 'color_navy', 'color_stone'],
    TOP_SIZES,
    'Kerah oxford dengan tulang punggung rapi, dipakai ke kantor maupun akhir pekan.',
    { featured: true, bestSeller: true },
  ),
  P(
    'Kemeja Linen Santai',
    'cat_shirts',
    'brand_velora',
    429_000,
    LINEN,
    300,
    ['color_cream', 'color_sand', 'color_olive'],
    TOP_SIZES,
    'Anyaman longgar yang membiarkan udara lewat — cocok untuk iklim tropis.',
    { newArrival: true },
  ),
  P(
    'Kemeja Flannel Kotak Klasik',
    'cat_shirts',
    'brand_north',
    379_000,
    WOOL,
    360,
    ['color_wine', 'color_charcoal', 'color_indigo'],
    TOP_SIZES,
    'Motif kotak berukuran sedang, bisa jadi lapisan tengah saat dingin.',
    { sale: 299_000 },
  ),
  P(
    'Kemeja Polo Pique',
    'cat_shirts',
    'brand_studio',
    269_000,
    'Katun pique',
    250,
    ['color_navy', 'color_white', 'color_black'],
    TOP_SIZES,
    'Kerah polo dengan dua kancing, potongan tidak terlalu ketat di pinggang.',
  ),
  P(
    'Kemeja Kancing Tekstur Halus',
    'cat_shirts',
    'brand_atelier',
    459_000,
    OXFORD,
    330,
    ['color_grey', 'color_cream'],
    TOP_SIZES,
    'Tenunan bertekstur samar yang memberi kedalaman tanpa motif.',
    { newArrival: true, featured: true },
  ),

  // ------------------------------ Outerwear (5) -------------------------------
  P(
    'Hoodie Heavyweight Klasik',
    'cat_outerwear',
    'brand_north',
    469_000,
    FLEECE,
    620,
    ['color_charcoal', 'color_black', 'color_sand'],
    TOP_SIZES,
    'Fleece 320 gsm, kantong kanguru, tali kerah tanpa ujung plastik.',
    { bestSeller: true, featured: true },
  ),
  P(
    'Jaket Varsity Wol Asli',
    'cat_outerwear',
    'brand_north',
    749_000,
    WOOL,
    780,
    ['color_indigo', 'color_cream', 'color_wine'],
    TOP_SIZES,
    'Lengan kulit sintetis, badan wool, rib elastis di pergelangan.',
  ),
  P(
    'Jaket Ringan Tahan Angin',
    'cat_outerwear',
    'brand_velora',
    559_000,
    RIPSTOP,
    420,
    ['color_olive', 'color_black', 'color_navy'],
    TOP_SIZES,
    'Bahan ripstop yang lipatnya kecil — muat di tas selempang.',
    { newArrival: true },
  ),
  P(
    'Kemeja Outerwear Sherpa',
    'cat_outerwear',
    'brand_atelier',
    529_000,
    'Sherpa katun',
    560,
    ['color_cream', 'color_stone'],
    TOP_SIZES,
    'Dipakai terbuka seperti jaket, lengan tidak menggembung.',
  ),
  P(
    'Cardigan Rajut Longgar',
    'cat_outerwear',
    'brand_atelier',
    499_000,
    WOOL,
    480,
    ['color_grey', 'color_brown', 'color_cream'],
    TOP_SIZES,
    'Rajutan sedang dengan kancing kayu, jatuh di bawah pinggul.',
    { sale: 399_000 },
  ),

  // ------------------------------- Trousers (5) -------------------------------
  P(
    'Celana Chino Straight Fit',
    'cat_trousers',
    'brand_velora',
    349_000,
    TWILL,
    420,
    ['color_sand', 'color_navy', 'color_olive', 'color_black'],
    WAIST_SIZES,
    'Twill katun dengan sedikit stretch, garis paha bersih tanpa lipatan.',
    { bestSeller: true },
  ),
  P(
    'Celana Kargo Ringan',
    'cat_trousers',
    'brand_north',
    399_000,
    TWILL,
    480,
    ['color_olive', 'color_charcoal', 'color_sand'],
    WAIST_SIZES,
    'Empat kantong dengan penutup kancing, tidak menggembung saat penuh.',
    { featured: true },
  ),
  P(
    'Celana Formal Lipat Tengah',
    'cat_trousers',
    'brand_atelier',
    469_000,
    'Wool blend ringan',
    440,
    ['color_charcoal', 'color_navy', 'color_black'],
    WAIST_SIZES,
    'Kain tidak mengilap, cocok untuk foto maupun ruang rapat.',
    { newArrival: true },
  ),
  P(
    'Celana Pendek Kanvas',
    'cat_trousers',
    'brand_studio',
    229_000,
    CANVAS,
    300,
    ['color_cream', 'color_olive', 'color_grey'],
    WAIST_SIZES,
    'Panjang di atas lutut, kanvas yang makin lemas setelah beberapa cuci.',
  ),
  P(
    'Celana Kering Longgar',
    'cat_trousers',
    'brand_velora',
    329_000,
    TWILL,
    400,
    ['color_stone', 'color_brown'],
    WAIST_SIZES,
    'Potongan lebar yang tetap rapi dipakai jalan.',
    { sale: 259_000 },
  ),

  // --------------------------------- Denim (5) --------------------------------
  P(
    'Jeans Straight Wash Gelap',
    'cat_denim',
    'brand_velora',
    499_000,
    DENIM,
    620,
    ['color_indigo', 'color_charcoal'],
    WAIST_SIZES,
    'Cucian minimal, tidak ada sobekan, jahitan ganda di sela paha.',
    { bestSeller: true, featured: true },
  ),
  P(
    'Jeans Slim Kontong Elastis',
    'cat_denim',
    'brand_studio',
    449_000,
    'Denim 11oz stretch',
    560,
    ['color_black', 'color_indigo'],
    WAIST_SIZES,
    'Empat arah stretch yang kembali ke bentuk semula.',
  ),
  P(
    'Jeans Relaxed Fit Cucian Terang',
    'cat_denim',
    'brand_north',
    529_000,
    DENIM,
    640,
    ['color_stone', 'color_indigo'],
    WAIST_SIZES,
    'Cucian terang dengan tepi yang sedikit tidak rata — sengaja.',
    { newArrival: true },
  ),
  P(
    'Jeans Kargo Denim',
    'cat_denim',
    'brand_north',
    559_000,
    DENIM,
    680,
    ['color_indigo', 'color_olive'],
    WAIST_SIZES,
    'Kantong kargo pada denim 12oz, berat tapi seimbang.',
  ),
  P(
    'Jeans Wide Leg Lipat',
    'cat_denim',
    'brand_atelier',
    589_000,
    DENIM,
    700,
    ['color_charcoal', 'color_black'],
    WAIST_SIZES,
    'Kaki lebar dengan garis lipat, dipakai dengan sepatu kets tebal.',
    { sale: 459_000 },
  ),

  // ------------------------------ Accessories (5) -----------------------------
  P(
    'Topi Baseball Panel Enam',
    'cat_accessories',
    'brand_studio',
    149_000,
    CANVAS,
    90,
    ['color_black', 'color_navy', 'color_cream'],
    ['size_os'],
    'Bordir kecil di panel depan, pengait logam di belakang.',
  ),
  P(
    'Tas Selempang Kanvas',
    'cat_accessories',
    'brand_velora',
    289_000,
    CANVAS,
    320,
    ['color_black', 'color_olive', 'color_sand'],
    ['size_os'],
    'Muat laptop 13 inci, tali bisa disetel sampai pendek.',
    { featured: true, bestSeller: true },
  ),
  P(
    'Kaus Kaki Tiga Pack',
    'cat_accessories',
    'brand_studio',
    119_000,
    'Katun sisir',
    150,
    ['color_white', 'color_black', 'color_grey'],
    ['size_os'],
    'Ukutan longgar di betis, tidak melintang setelah dicuci.',
    { sale: 89_000 },
  ),
  P(
    'Ikat Pinggang Kulit Sederhana',
    'cat_accessories',
    'brand_atelier',
    259_000,
    'Kulit sapi',
    220,
    ['color_brown', 'color_black'],
    ['size_os'],
    'Buckle kunmat tanpa logo, panjang dapat dipangkas.',
  ),
  P(
    'Syal Rajut Musim Hujan',
    'cat_accessories',
    'brand_north',
    199_000,
    WOOL,
    180,
    ['color_stone', 'color_charcoal', 'color_wine'],
    ['size_os'],
    'Lebar cukup untuk dililit dua kali tanpa terasa tebal.',
    { newArrival: true },
  ),
];

/* ---------------------------------- humans ------------------------------------ */

const CUSTOMERS = [
  {
    id: 'usr_demo_01',
    name: 'Raka Wibisono',
    email: 'raka@example.com',
    phone: '081234567001',
    city: 'Kota Bandung',
    province: 'Jawa Barat',
    district: 'Coblong',
    postcode: '40115',
    area: '1712',
  },
  {
    id: 'usr_demo_02',
    name: 'Nadia Prameswari',
    email: 'nadia@example.com',
    phone: '081234567002',
    city: 'Kota Jakarta Selatan',
    province: 'DKI Jakarta',
    district: 'Kebayoran Baru',
    postcode: '12190',
    area: '1481',
  },
  {
    id: 'usr_demo_03',
    name: 'Bagas Nugroho',
    email: 'bagas@example.com',
    phone: '081234567003',
    city: 'Kota Surabaya',
    province: 'Jawa Timur',
    district: 'Gubeng',
    postcode: '60228',
    area: '1841',
  },
  {
    id: 'usr_demo_04',
    name: 'Salsabila Hanum',
    email: 'salsabila@example.com',
    phone: '081234567004',
    city: 'Kota Yogyakarta',
    province: 'DI Yogyakarta',
    district: 'Depok',
    postcode: '55224',
    area: '1903',
  },
  {
    id: 'usr_demo_05',
    name: 'Dimas Ardiansyah',
    email: 'dimas@example.com',
    phone: '081234567005',
    city: 'Kota Medan',
    province: 'Sumatera Utara',
    district: 'Medan Petisah',
    postcode: '20112',
    area: '1014',
  },
  {
    id: 'usr_demo_06',
    name: 'Ayu Larasati',
    email: 'ayu@example.com',
    phone: '081234567006',
    city: 'Kota Denpasar',
    province: 'Bali',
    district: 'Denpasar Selatan',
    postcode: '80212',
    area: '1604',
  },
  {
    id: 'usr_demo_07',
    name: 'Fajar Ramadhan',
    email: 'fajar@example.com',
    phone: '081234567007',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    district: 'Tembalang',
    postcode: '50235',
    area: '1741',
  },
  {
    id: 'usr_demo_08',
    name: 'Kirana Adiningrum',
    email: 'kirana@example.com',
    phone: '081234567008',
    city: 'Kota Makassar',
    province: 'Sulawesi Selatan',
    district: 'Rappocini',
    postcode: '90222',
    area: '2005',
  },
  {
    id: 'usr_demo_09',
    name: 'Yoga Pratama',
    email: 'yoga@example.com',
    phone: '081234567009',
    city: 'Kota Balikpapan',
    province: 'Kalimantan Timur',
    district: 'Balikpapan Kota',
    postcode: '76111',
    area: '1512',
  },
  {
    id: 'usr_demo_10',
    name: 'Melati Kusuma',
    email: 'melati@example.com',
    phone: '081234567010',
    city: 'Kota Palembang',
    province: 'Sumatera Selatan',
    district: 'Ilir Timur I',
    postcode: '30231',
    area: '1112',
  },
];

/**
 * Historical shipping figures for demo orders. These are snapshots stored on past
 * orders — NOT live quotes. The storefront never reads them: real rates always come
 * from Biteship at checkout time.
 */
const DEMO_SHIPPING: Record<string, { courier: string; service: string; fee: number; estimate: string }> = {
  'Kota Bandung': { courier: 'pos', service: 'REG', fee: 12_000, estimate: '1-2 hari' },
  'Kota Jakarta Selatan': { courier: 'jne', service: 'YES', fee: 18_000, estimate: '1 hari' },
  'Kota Surabaya': { courier: 'jne', service: 'REG', fee: 22_000, estimate: '2-3 hari' },
  'Kota Yogyakarta': { courier: 'si_reg', service: 'OKE', fee: 20_000, estimate: '2-3 hari' },
  'Kota Medan': { courier: 'jt_express', service: 'JTR', fee: 34_000, estimate: '3-5 hari' },
  'Kota Denpasar': { courier: 'jne', service: 'REG', fee: 30_000, estimate: '3-4 hari' },
  'Kota Semarang': { courier: 'pos', service: 'POS_KILIM', fee: 21_000, estimate: '2-3 hari' },
  'Kota Makassar': { courier: 'jt_express', service: 'JTR', fee: 38_000, estimate: '4-6 hari' },
  'Kota Balikpapan': { courier: 'si_reg', service: 'OKE', fee: 36_000, estimate: '4-5 hari' },
  'Kota Palembang': { courier: 'jne', service: 'REG', fee: 32_000, estimate: '3-5 hari' },
};

const CHANNELS = [
  { code: 'QRIS', method: 'QRIS', fee: 0 },
  { code: 'BCA', method: 'BCA Virtual Account', fee: 4_000 },
  { code: 'OVO', method: 'OVO', fee: 0 },
  { code: 'MANDIRI', method: 'Mandiri Virtual Account', fee: 4_000 },
];

/* --------------------------------- build tables -------------------------------- */

type Variant = {
  id: string;
  productId: string;
  productSlug: string;
  colorId: string;
  sizeId: string;
  sku: string;
  price: number;
  sale: number | null;
  weight: number;
  imageKey: string;
  onHand: number;
  reserved: number;
  sold: number;
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const products: Record<string, unknown>[] = [];
const productCategories: Record<string, unknown>[] = [];
const productColors: Record<string, unknown>[] = [];
const productSizes: Record<string, unknown>[] = [];
const productImages: Record<string, unknown>[] = [];
const variants: Record<string, unknown>[] = [];
const variantIndex: Variant[] = [];

PRODUCTS.forEach((p, index) => {
  const num = String(index + 1).padStart(3, '0');
  const id = `prod_demo_${num}`;
  const slug = slugify(p.name);
  const sku = `VLR-${p.name
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase()}-${num}`;
  const publishedAt = ts(-days(150 - index * 4) - hours(index));
  const createdAt = publishedAt;

  products.push({
    id,
    name: p.name,
    slug,
    sku,
    description: `${p.blurb}\n\nBahan: ${p.material}.\nPerawatan: cuci mesin suhu dingin, jangan gunakan pemutih, keringkan dengan diangin-anginkan.\nSemua ukuran diukur datar; toleransi 1-2 cm.`,
    primary_category_id: p.category,
    brand_id: p.brand,
    material: p.material,
    size_guide_id:
      p.category === 'cat_trousers' || p.category === 'cat_denim'
        ? 'sg_bottoms'
        : p.category === 'cat_accessories'
          ? 'sg_general'
          : 'sg_tops',
    price: p.price,
    sale_price: p.sale ?? null,
    weight_grams: p.weight,
    length_cm: 24,
    width_cm: 18,
    height_cm: 4,
    status: 'active',
    is_featured: p.featured ?? false,
    is_new_arrival: p.newArrival ?? false,
    is_best_seller: p.bestSeller ?? false,
    meta_title: `${p.name} | VELORA`,
    meta_description: `${p.blurb} Tersedia dalam ${p.colors.length} warna.`,
    view_count: intBetween(40, 2_400),
    sold_count: 0, // recomputed from the demo orders below
    published_at: publishedAt,
    created_at: createdAt,
    updated_at: createdAt,
  });

  productCategories.push({ product_id: id, category_id: p.category });
  if (rnd() > 0.65) {
    // A few products legitimately live in a second category (denim styled as trousers).
    const other = pick(CATEGORIES.filter((c) => c !== p.category));
    productCategories.push({ product_id: id, category_id: other });
  }

  p.colors.forEach((colorId) => {
    productColors.push({ product_id: id, color_id: colorId });
    productImages.push({
      id: `img_${num}_${COLOR_LABEL[colorId]}`,
      product_id: id,
      image_key: `generated/${slug}--${COLOR_LABEL[colorId]}.svg`,
      alt: `${p.name} warna ${COLOR_LABEL[colorId]}`,
      sort_order: p.colors.indexOf(colorId) + 1,
      is_primary: 0,
      created_at: createdAt,
    });
  });
  p.sizes.forEach((sizeId) => productSizes.push({ product_id: id, size_id: sizeId }));

  productImages.push({
    id: `img_${num}_primary`,
    product_id: id,
    image_key: `generated/${slug}.svg`,
    alt: `${p.name} — tampilan depan`,
    sort_order: 0,
    is_primary: 1,
    created_at: createdAt,
  });

  p.colors.forEach((colorId) => {
    p.sizes.forEach((sizeId) => {
      const vNum = variantIndex.length + 1;
      const idV = `var_${String(vNum).padStart(4, '0')}`;
      const baseWeight = Math.round(p.weight * (0.9 + 0.05 * (p.sizes.indexOf(sizeId) + 1)));
      const v: Variant = {
        id: idV,
        productId: id,
        productSlug: slug,
        colorId,
        sizeId,
        sku: `${sku}-${COLOR_LABEL[colorId].slice(0, 3).toUpperCase()}-${SIZE_CODE[sizeId].replace(/[^A-Z0-9]/g, '')}`,
        price: p.price,
        sale: p.sale ?? null,
        weight: baseWeight,
        imageKey: `generated/${slug}--${COLOR_LABEL[colorId]}.svg`,
        onHand: intBetween(6, 48),
        reserved: 0,
        sold: 0,
      };
      variantIndex.push(v);
      variants.push({
        id: v.id,
        product_id: v.productId,
        color_id: v.colorId,
        size_id: v.sizeId,
        sku: v.sku,
        price: v.price,
        sale_price: v.sale,
        weight_grams: v.weight,
        image_key: v.imageKey,
        status: 'active',
        created_at: createdAt,
        updated_at: createdAt,
      });
    });
  });
});

/* ---------------------------------- coupons ---------------------------------- */

const coupons = [
  {
    id: 'coupon_velora30',
    code: 'VELORA30',
    name: 'Potongan Musim 30%',
    type: 'percent',
    value: 30,
    min: 400_000,
    max: 150_000,
    usage: 500,
    perUser: 2,
    used: 0,
    active: 1,
  },
  {
    id: 'coupon_hemat50k',
    code: 'HEMAT50K',
    name: 'Hemat Rp 50.000',
    type: 'fixed',
    value: 50_000,
    min: 300_000,
    max: 50_000,
    usage: 300,
    perUser: 1,
    used: 0,
    active: 1,
  },
  {
    id: 'coupon_gratisongkir',
    code: 'GRATISONGKIR',
    name: 'Gratis Ongkir Jawa',
    type: 'free_shipping',
    value: 30_000,
    min: 250_000,
    max: 30_000,
    usage: null,
    perUser: 3,
    used: 0,
    active: 1,
  },
  {
    id: 'coupon_newmember',
    code: 'NEW MEMBER',
    name: 'Kupon Anggota Baru',
    type: 'fixed',
    value: 75_000,
    min: 500_000,
    max: 75_000,
    usage: 1_000,
    perUser: 1,
    used: 0,
    active: 0,
  },
];

/* ----------------------------------- orders ---------------------------------- */

type OrderPlan = { status: string; ageDays: number; coupon?: string };

const ORDER_PLAN: OrderPlan[] = [
  { status: 'completed', ageDays: 54 },
  { status: 'completed', ageDays: 48 },
  { status: 'delivered', ageDays: 41, coupon: 'VELORA30' },
  { status: 'cancelled', ageDays: 37 },
  { status: 'delivered', ageDays: 33 },
  { status: 'refunded', ageDays: 29 },
  { status: 'shipped', ageDays: 24 },
  { status: 'completed', ageDays: 21, coupon: 'HEMAT50K' },
  { status: 'shipped', ageDays: 17 },
  { status: 'processing', ageDays: 12 },
  { status: 'paid', ageDays: 8 },
  { status: 'delivered', ageDays: 6, coupon: 'GRATISONGKIR' },
  { status: 'processing', ageDays: 3 },
  { status: 'paid', ageDays: 1 },
  { status: 'pending_payment', ageDays: 0 },
];

const orders: Record<string, unknown>[] = [];
const orderItems: Record<string, unknown>[] = [];
const orderHistory: Record<string, unknown>[] = [];
const orderNotes: Record<string, unknown>[] = [];
const payments: Record<string, unknown>[] = [];
const paymentTransactions: Record<string, unknown>[] = [];
const reservations: Record<string, unknown>[] = [];
const movements: Record<string, unknown>[] = [];
const couponUsages: Record<string, unknown>[] = [];
const shipments: Record<string, unknown>[] = [];
const trackingEvents: Record<string, unknown>[] = [];
const reviews: Record<string, unknown>[] = [];
const chatThreads: Record<string, unknown>[] = [];

/** Initial goods-in receipt, so the movement ledger has an honest opening balance. */
variantIndex.forEach((v) => {
  movements.push({
    id: `mv_in_${v.id}`,
    variant_id: v.id,
    product_id: v.productId,
    actor_id: null,
    type: 'stock_in',
    quantity: v.onHand,
    balance_after: v.onHand,
    reference_type: 'migration',
    reference_id: 'seed',
    note: 'Stok awal katalog demo',
    created_at: ts(-days(60)),
  });
});

const HISTORY_FLOW: Record<string, string[]> = {
  pending_payment: ['pending_payment'],
  paid: ['pending_payment', 'paid'],
  processing: ['pending_payment', 'paid', 'processing'],
  shipped: ['pending_payment', 'paid', 'processing', 'shipped'],
  delivered: ['pending_payment', 'paid', 'processing', 'shipped', 'delivered'],
  completed: ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed'],
  cancelled: ['pending_payment', 'cancelled'],
  refunded: ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'refunded'],
};

const FULFILL = new Set(['paid', 'processing', 'shipped', 'delivered', 'completed', 'refunded']);
const SHIPPED = new Set(['shipped', 'delivered', 'completed', 'refunded']);
const HOLD = new Set(['pending_payment']);

ORDER_PLAN.forEach((plan, idx) => {
  const orderNum = String(idx + 1).padStart(6, '0');
  const id = `ord_demo_${orderNum}`;
  const yymm = '2610';
  const code = `VLRA-${yymm}-D${orderNum.slice(-4)}${String(idx).padStart(2, '0')}`;
  const customer = CUSTOMERS[idx % CUSTOMERS.length] as (typeof CUSTOMERS)[number];
  const createdAt = ts(-days(plan.ageDays) - hours(intBetween(1, 9)));
  const channel = pick(CHANNELS);
  const ship = DEMO_SHIPPING[customer.city] as (typeof DEMO_SHIPPING)[string];
  const lineCount = intBetween(1, 3);

  // ---- lines
  const chosen: { v: Variant; qty: number }[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const v = pick(variantIndex);
    if (chosen.some((c) => c.v.id === v.id)) continue;
    const qty = intBetween(1, 2);
    chosen.push({ v, qty });
  }

  let subtotal = 0;
  let weight = 0;
  chosen.forEach(({ v, qty }, i) => {
    const unit = v.sale ?? v.price;
    const line = unit * qty;
    subtotal += line;
    weight += v.weight * qty;
    const product = products.find((p) => p.id === v.productId);
    orderItems.push({
      id: `oit_${orderNum}_${i + 1}`,
      order_id: id,
      product_id: v.productId,
      variant_id: v.id,
      product_name: product ? String(product.name) : 'Produk VELORA',
      product_slug: v.productSlug,
      variant_label: `${COLOR_LABEL[v.colorId]} / ${SIZE_CODE[v.sizeId]}`,
      color_name: COLOR_LABEL[v.colorId],
      size_code: SIZE_CODE[v.sizeId],
      sku: v.sku,
      unit_price: unit,
      quantity: qty,
      line_total: line,
      weight_grams: v.weight * qty,
      image_key: v.imageKey,
      created_at: createdAt,
    });
  });

  // ---- stock effect, mirroring the live services
  const freeShipping = plan.coupon === 'GRATISONGKIR' || subtotal >= 500_000;
  let shipping = freeShipping ? 0 : ship.fee;
  let discount = 0;
  if (plan.coupon === 'VELORA30' && subtotal >= 400_000)
    discount = Math.min(150_000, Math.round((subtotal * 30) / 100));
  if (plan.coupon === 'HEMAT50K' && subtotal >= 300_000) discount = 50_000;
  if (plan.coupon === 'GRATISONGKIR') shipping = 0;
  const tax = 0; // store default: tax disabled, prices shown inclusive
  const paymentFee = channel.fee;
  const grandTotal = Math.max(0, subtotal - discount + shipping + paymentFee + tax);

  chosen.forEach(({ v, qty }, i) => {
    const status = plan.status;
    if (HOLD.has(status)) {
      v.reserved += qty;
      reservations.push({
        id: `rsv_${orderNum}_${i + 1}`,
        order_id: id,
        variant_id: v.id,
        quantity: qty,
        status: 'active',
        expires_at: ts(-days(plan.ageDays) + hours(1)),
        created_at: createdAt,
        updated_at: createdAt,
      });
      movements.push({
        id: `mv_r_${orderNum}_${i + 1}`,
        variant_id: v.id,
        product_id: v.productId,
        actor_id: customer.id,
        type: 'reserve',
        quantity: -qty,
        balance_after: v.onHand - v.reserved,
        reference_type: 'order',
        reference_id: id,
        note: 'Reservasi stok saat checkout',
        created_at: createdAt,
      });
    } else if (FULFILL.has(status)) {
      v.onHand = Math.max(0, v.onHand - qty);
      v.sold += qty;
      reservations.push({
        id: `rsv_${orderNum}_${i + 1}`,
        order_id: id,
        variant_id: v.id,
        quantity: qty,
        status: 'consumed',
        expires_at: ts(-days(plan.ageDays) + hours(1)),
        created_at: createdAt,
        updated_at: createdAt,
      });
      movements.push({
        id: `mv_s_${orderNum}_${i + 1}`,
        variant_id: v.id,
        product_id: v.productId,
        actor_id: null,
        type: 'sale',
        quantity: -qty,
        balance_after: v.onHand - v.reserved,
        reference_type: 'order',
        reference_id: id,
        note: 'Stok berkurang karena pembayaran terkonfirmasi',
        created_at: ts(-days(plan.ageDays) + hours(2)),
      });
      if (status === 'refunded') {
        v.onHand += qty;
        movements.push({
          id: `mv_rt_${orderNum}_${i + 1}`,
          variant_id: v.id,
          product_id: v.productId,
          actor_id: 'usr_operator_demo',
          type: 'return',
          quantity: qty,
          balance_after: v.onHand - v.reserved,
          reference_type: 'order',
          reference_id: id,
          note: 'Retur: stok dikembalikan',
          created_at: ts(-days(plan.ageDays) + days(2)),
        });
      }
    } else if (status === 'cancelled') {
      reservations.push({
        id: `rsv_${orderNum}_${i + 1}`,
        order_id: id,
        variant_id: v.id,
        quantity: qty,
        status: 'released',
        expires_at: ts(-days(plan.ageDays) + hours(1)),
        created_at: createdAt,
        updated_at: ts(-days(plan.ageDays) + hours(20)),
      });
      movements.push({
        id: `mv_rel_${orderNum}_${i + 1}`,
        variant_id: v.id,
        product_id: v.productId,
        actor_id: customer.id,
        type: 'release',
        quantity: qty,
        balance_after: v.onHand - v.reserved,
        reference_type: 'order',
        reference_id: id,
        note: 'Reservasi dilepas (pesanan dibatalkan)',
        created_at: ts(-days(plan.ageDays) + hours(20)),
      });
    }
  });

  const paidAt = FULFILL.has(plan.status) ? ts(-days(plan.ageDays) + hours(2)) : null;
  const shippedAt = SHIPPED.has(plan.status) ? ts(-days(plan.ageDays) + days(1)) : null;
  const deliveredAt = ['delivered', 'completed', 'refunded'].includes(plan.status)
    ? ts(-days(plan.ageDays) + days(3))
    : null;
  const completedAt = plan.status === 'completed' ? ts(-days(plan.ageDays) + days(4)) : null;
  const cancelledAt = plan.status === 'cancelled' ? ts(-days(plan.ageDays) + hours(20)) : null;

  orders.push({
    id,
    code,
    user_id: customer.id,
    status: plan.status,
    subtotal,
    discount_total: discount,
    shipping_fee: shipping,
    payment_fee: paymentFee,
    tax_amount: tax,
    grand_total: grandTotal,
    total_weight_grams: weight,
    coupon_code: plan.coupon ?? null,
    ship_recipient_name: customer.name,
    ship_phone: customer.phone,
    ship_province: customer.province,
    ship_city: customer.city,
    ship_district: customer.district,
    ship_postcode: customer.postcode,
    ship_detail: `Jl. Contoh No. ${intBetween(1, 99)}, RT ${intBetween(1, 9)}/RW ${intBetween(1, 9)}`,
    ship_area_id: customer.area,
    address_id: `addr_${customer.id.slice(-2)}_home`,
    payment_method: plan.status === 'pending_payment' ? null : channel.method,
    payment_channel: plan.status === 'pending_payment' ? channel.code : channel.code,
    customer_note: idx % 4 === 0 ? 'Tolong titip kurir sore ya.' : null,
    cancel_reason: plan.status === 'cancelled' ? 'Pembayaran belum masuk sampai batas waktu' : null,
    expires_at: plan.status === 'pending_payment' ? ts(-days(plan.ageDays) + hours(1)) : null,
    paid_at: paidAt,
    shipped_at: shippedAt,
    delivered_at: deliveredAt,
    completed_at: completedAt,
    cancelled_at: cancelledAt,
    created_at: createdAt,
    updated_at: completedAt ?? deliveredAt ?? cancelledAt ?? shippedAt ?? paidAt ?? createdAt,
  });

  (HISTORY_FLOW[plan.status] as string[]).forEach((to, step) => {
    const from = step === 0 ? null : (HISTORY_FLOW[plan.status] as string[])[step - 1];
    orderHistory.push({
      id: `osh_${orderNum}_${step + 1}`,
      order_id: id,
      from_status: from,
      to_status: to,
      note: step === 0 ? 'Pesanan dibuat' : null,
      actor_type: to === 'paid' ? 'webhook' : step === 0 ? 'customer' : 'admin',
      actor_id: step === 0 ? customer.id : to === 'paid' ? null : 'usr_operator_demo',
      created_at: ts(-days(plan.ageDays) + hours(step * 6)),
    });
  });

  if (idx === 2 || idx === 9) {
    orderNotes.push({
      id: `onot_${orderNum}`,
      order_id: id,
      author_id: 'usr_operator_demo',
      body:
        idx === 2
          ? 'Pelanggan minta dibungkus kertas kado, sudah dipenuhi gudang.'
          : 'Stok warna terakhir disimpan untuk pesanan ini.',
      visibility: 'internal',
      created_at: ts(-days(plan.ageDays) + hours(4)),
    });
  }

  if (plan.coupon && (discount > 0 || shipping === 0)) {
    const coupon = coupons.find((c) => c.code === plan.coupon);
    if (coupon) {
      coupon.used += 1;
      couponUsages.push({
        id: `cus_${orderNum}`,
        coupon_id: coupon.id,
        order_id: id,
        user_id: customer.id,
        discount_amount: discount,
        shipping_discount: coupon.type === 'free_shipping' ? ship.fee : 0,
        created_at: createdAt,
      });
    }
  }

  // ---- payment
  const payStatus =
    plan.status === 'pending_payment'
      ? 'pending'
      : plan.status === 'cancelled'
        ? 'expired'
        : plan.status === 'refunded'
          ? 'refunded'
          : 'paid';
  payments.push({
    id: `pay_${orderNum}`,
    order_id: id,
    provider: 'duitku',
    merchant_order_id: code,
    reference: payStatus === 'pending' || payStatus === 'expired' ? null : `DK${orderNum}${idx}`,
    method: payStatus === 'pending' ? channel.method : channel.method,
    channel_code: channel.code,
    amount: grandTotal,
    fee: paymentFee,
    status: payStatus,
    payment_url:
      payStatus === 'paid'
        ? null
        : `https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry/page?merchantCode=DEMO&amount=${grandTotal}&paymentCode=${channel.code}`,
    qr_string:
      channel.code === 'QRIS' && payStatus !== 'paid' ? `00020104001426F761500014ID.CO.QRIS.WWW${orderNum}` : null,
    va_number: channel.code === 'BCA' || channel.code === 'MANDIRI' ? `88809${orderNum}` : null,
    signed_at: createdAt,
    paid_at: paidAt,
    expired_at: plan.status === 'cancelled' ? ts(-days(plan.ageDays) + hours(1)) : null,
    refunded_at: plan.status === 'refunded' ? ts(-days(plan.ageDays) + days(5)) : null,
    result_code: payStatus === 'paid' ? '200' : payStatus === 'expired' ? '404' : null,
    result_message:
      payStatus === 'paid' ? 'Transaction successful' : payStatus === 'expired' ? 'Transaction expired' : null,
    raw_request: json({ merchant_code: 'DEMO_MERCHANT', amount: grandTotal, merchant_order_id: code }),
    raw_response: json({ status_code: payStatus === 'paid' ? '200' : '404', message: 'seed' }),
    created_at: createdAt,
    updated_at: paidAt ?? ts(-days(plan.ageDays) + hours(1)) ?? createdAt,
  });

  paymentTransactions.push({
    id: `ptx_${orderNum}_created`,
    payment_id: `pay_${orderNum}`,
    event_type: 'created',
    amount: grandTotal,
    status: 'pending',
    payload: json({ source: 'seed', channel: channel.code }),
    created_at: createdAt,
  });
  if (payStatus === 'paid' || payStatus === 'refunded') {
    paymentTransactions.push({
      id: `ptx_${orderNum}_callback`,
      payment_id: `pay_${orderNum}`,
      event_type: 'callback',
      amount: grandTotal,
      status: 'paid',
      payload: json({ source: 'seed', reference: `DK${orderNum}${idx}` }),
      created_at: ts(-days(plan.ageDays) + hours(2)),
    });
  }

  // ---- shipment (created once payment is confirmed, like the live flow)
  if (SHIPPED.has(plan.status)) {
    const serviceCode = `${ship.courier}-${ship.service}-regular`;
    shipments.push({
      id: `shp_${orderNum}`,
      order_id: id,
      provider: 'biteship',
      biteship_order_id: `seed_${orderNum}`,
      waybill_id: null,
      tracking_number: `${ship.courier.toUpperCase().replace(/[^A-Z0-9]/g, '')}${orderNum}ID`,
      courier_company: ship.courier,
      courier_service: ship.service,
      courier_type: 'regular',
      delivery_type: 'regular',
      service_code: serviceCode,
      status: plan.status === 'shipped' ? 'in_transit' : 'delivered',
      price: shipping,
      price_changed: 0,
      insurance_enabled: 0,
      insurance_price: 0,
      weight_grams: weight,
      item_name: `${chosen.length} produk VELORA`,
      from_snapshot: json({
        name: 'Gudang VELORA Bandung',
        address: 'Jl. Soekarno-Hatta No. 123',
        city: 'Kota Bandung',
        postcode: '40115',
        areaId: '1712',
      }),
      to_snapshot: json({
        name: customer.name,
        address: `Jl. Contoh No. ${orderNum.slice(-2)}`,
        city: customer.city,
        province: customer.province,
        postcode: customer.postcode,
        areaId: customer.area,
      }),
      estimate: ship.estimate,
      label_url: null,
      created_at: shippedAt,
      updated_at: deliveredAt ?? shippedAt,
      picked_up_at: shippedAt,
      delivered_at: deliveredAt,
    });

    const events: [string, string, number][] = [
      ['label_created', 'Label pengiriman dibuat', 0],
      ['dropped_off', 'Paket diterima konter kurir', 6],
      ['transit_hub', 'Tiba di pusat sortir transit', 30],
    ];
    if (deliveredAt) events.push(['delivered', 'Paket diterima pemesan', 72]);
    events.forEach(([codeEv, label, offset], i) => {
      trackingEvents.push({
        id: `tev_${orderNum}_${i + 1}`,
        shipment_id: `shp_${orderNum}`,
        event_code: codeEv,
        label,
        description: `${label} — ${customer.city}`,
        occurred_at: ts(-days(plan.ageDays) + days(1) + hours(offset)),
        source: 'polling',
        dedupe_key: `seed:${id}:${codeEv}:${i}`,
        payload: json({ seeded: true }),
        created_at: ts(-days(plan.ageDays) + days(1) + hours(offset)),
      });
    });
  }

  // ---- reviews on completed / delivered orders
  if (['completed', 'delivered'].includes(plan.status) && idx % 2 === 0) {
    const first = chosen[0];
    if (first) {
      const rating = intBetween(4, 5);
      reviews.push({
        id: `rev_${orderNum}`,
        product_id: first.v.productId,
        user_id: customer.id,
        order_id: id,
        rating,
        title: rating === 5 ? 'Bahannya enak, jahitan rapi' : 'Sesuai ekspektasi',
        body:
          rating === 5
            ? `Saya pesan ${first.v.sku.slice(0, 12)} dan potongannya pas. Setelah lima kali cuci belum melar.`
            : 'Warna sedikit lebih terang dari foto, tapi secara keseluruhan nyaman dipakai harian.',
        status: 'published',
        verified_purchase: 1,
        seller_note: null,
        created_at: ts(-days(plan.ageDays) + days(6)),
        updated_at: ts(-days(plan.ageDays) + days(6)),
      });
    }
  }
});

/* ------------------------- extra reviews (pending + low) ----------------------- */

[3, 11, 24].forEach((productIdx, i) => {
  const product = products[productIdx];
  const customer = CUSTOMERS[(i + 4) % CUSTOMERS.length] as (typeof CUSTOMERS)[number];
  if (!product) return;
  reviews.push({
    id: `rev_seed_${i + 1}`,
    product_id: product.id,
    user_id: customer.id,
    order_id: null,
    rating: i === 1 ? 3 : 5,
    title: i === 1 ? 'Ukuran perlu dicoba dulu' : null,
    body:
      i === 1
        ? 'Bagus, tapi lingkar dada terasa lebih kecil dari tabel. Saya saran naikkan satu ukuran.'
        : 'Dua kali beli dan kualitasnya konsisten. Pengiriman juga cepat.',
    status: i === 2 ? 'pending' : 'published',
    verified_purchase: 0,
    seller_note: null,
    created_at: ts(-days(9 - i)),
    updated_at: ts(-days(9 - i)),
  });
});

/* --------------------------------- customers ---------------------------------- */

CUSTOMERS.push({
  id: 'usr_operator_demo',
  name: 'Operator VELORA',
  email: 'operator@velora.example',
  phone: '081200000099',
  city: 'Kota Bandung',
  province: 'Jawa Barat',
  district: 'Coblong',
  postcode: '40115',
  area: '1712',
} as (typeof CUSTOMERS)[number]);

const users: Record<string, unknown>[] = [];
const profiles: Record<string, unknown>[] = [];
const addresses: Record<string, unknown>[] = [];
const userRoles: Record<string, unknown>[] = [];
const deviceTokens: Record<string, unknown>[] = [];

CUSTOMERS.forEach((c, i) => {
  const createdAt = ts(-days(120 - i * 6));
  const isOperator = c.id === 'usr_operator_demo';
  users.push({
    id: c.id,
    firebase_uid: isOperator ? 'seedfirebaseuidoperator' : `seedfirebaseuid${String(i + 1).padStart(3, '0')}`,
    email: c.email,
    phone: c.phone,
    display_name: c.name,
    avatar_url: null,
    status: 'active',
    email_verified: 1,
    last_login_at: ts(-days(i % 7)),
    created_at: createdAt,
    updated_at: createdAt,
  });
  profiles.push({
    user_id: c.id,
    full_name: c.name,
    nickname: (c.name as string).split(' ')[0],
    gender: i % 3 === 1 ? 'female' : 'male',
    birthday: `199${intBetween(0, 9)}-0${intBetween(1, 9)}-1${intBetween(0, 9)}`,
    preferred_size: pick(['S', 'M', 'L', 'XL']),
    height_cm: intBetween(158, 182),
    weight_kg: intBetween(52, 84),
    locale: 'id-ID',
    newsletter: i % 2 === 0 ? 1 : 0,
    notification_prefs: json({
      orderUpdates: true,
      payments: true,
      promotions: i % 2 === 0,
      stockAlerts: true,
      chat: true,
    }),
    updated_at: createdAt,
  });
  addresses.push({
    id: `addr_${String(i + 1).padStart(2, '0')}_home`,
    user_id: c.id,
    label: 'Rumah',
    recipient_name: c.name,
    phone: c.phone,
    province: c.province,
    city: c.city,
    district: c.district,
    postcode: c.postcode,
    detail: `Jl. Contoh No. ${intBetween(1, 99)}, RT ${intBetween(1, 9)}/RW ${intBetween(1, 9)}`,
    area_id: c.area,
    is_default_shipping: 1,
    created_at: createdAt,
    updated_at: createdAt,
  });
  userRoles.push({
    user_id: c.id,
    role_id: isOperator ? 'role_admin' : 'role_customer',
    granted_by: null,
    granted_at: createdAt,
  });
  if (i === 0) {
    deviceTokens.push({
      id: `dev_${c.id}`,
      user_id: c.id,
      token: 'seed-demo-fcm-token-do-not-use-in-production',
      platform: 'web',
      is_active: 1,
      failure_count: 0,
      last_used_at: ts(-days(2)),
      created_at: createdAt,
    });
  }
});

/** A single chat thread so the admin inbox is not empty on first login. */
chatThreads.push({
  id: 'chat_seed_01',
  user_id: 'usr_demo_02',
  rtdb_path: 'chats/chat_seed_01',
  status: 'open',
  subject: 'Tukar ukuran kemeja oxford',
  last_message: 'Halo, apakah kemeja yang saya pesan bisa tukar ke ukuran L?',
  last_message_at: ts(-hours(5)),
  unread_for_admin: 1,
  created_at: ts(-hours(5)),
  updated_at: ts(-hours(5)),
});

/* ---------------------------------- banners ---------------------------------- */

const banners = [
  {
    id: 'ban_hero_1',
    title: 'Autumn Editorial 2026',
    subtitle: 'Potongan bersih untuk dipakai berulang',
    image: 'generated/hero-editorial.svg',
    target: '/katalog',
    cta: 'Belanja Koleksi',
    placement: 'hero',
    sort: 1,
  },
  {
    id: 'ban_hero_2',
    title: 'Denim Tanpa Cucian Berlebihan',
    subtitle: 'Indigo murni, jahitan ganda',
    image: 'generated/hero-denim.svg',
    target: '/kategori/denim',
    cta: 'Lihat Denim',
    placement: 'hero_secondary',
    sort: 2,
  },
  {
    id: 'ban_promo_1',
    title: 'Potongan hingga 30%',
    subtitle: 'Selected items selama stok ada',
    image: 'generated/promo-sale.svg',
    target: '/katalog?onSale=1',
    cta: 'Pakai VELORA30',
    placement: 'promo',
    sort: 1,
  },
  {
    id: 'ban_cat_1',
    title: 'Outerwear Ringan Tropis',
    subtitle: 'Lapisan yang tidak membuat gerah',
    image: 'generated/category-outerwear.svg',
    target: '/kategori/outerwear',
    cta: 'Eksplorasi',
    placement: 'category',
    sort: 1,
  },
];

/* ------------------------------- subscribers --------------------------------- */

const subscribers = CUSTOMERS.filter((_, i) => i % 2 === 0).map((c, i) => ({
  id: `sub_${String(i + 1).padStart(3, '0')}`,
  email: c.email,
  status: 'subscribed',
  source: 'footer',
  ip: '0.0.0.0',
  created_at: ts(-days(30 - i)),
  updated_at: ts(-days(30 - i)),
}));

/* ----------------------------------- output ---------------------------------- */

const soldByProduct = new Map<string, number>();
variantIndex.forEach((v) => soldByProduct.set(v.productId, (soldByProduct.get(v.productId) ?? 0) + v.sold));

const sql = [
  `-- VELORA demo seed — generated by infra/seeds/build.ts (deterministic, re-runnable).`,
  `-- ${variantIndex.length} variants across ${PRODUCTS.length} products, ${CUSTOMERS.length} customers, ${ORDER_PLAN.length} orders.`,
  `-- Product imagery is rendered on the fly by /media/generated/*.svg; no external assets.`,
  `PRAGMA foreign_keys = OFF;`,
  ``,
  `-- accounts first: every later row points at them (Firebase uids are placeholders —`,
  `-- run infra/scripts/bootstrap-admin.ts to link a real sign-in to the operator account)`,
  rows(
    'users',
    [
      'id',
      'firebase_uid',
      'email',
      'phone',
      'display_name',
      'avatar_url',
      'status',
      'email_verified',
      'last_login_at',
      'created_at',
      'updated_at',
    ],
    users,
  ),
  rows(
    'user_profiles',
    [
      'user_id',
      'full_name',
      'nickname',
      'gender',
      'birthday',
      'preferred_size',
      'height_cm',
      'weight_kg',
      'locale',
      'newsletter',
      'notification_prefs',
      'updated_at',
    ],
    profiles,
  ),
  rows(
    'user_addresses',
    [
      'id',
      'user_id',
      'label',
      'recipient_name',
      'phone',
      'province',
      'city',
      'district',
      'postcode',
      'detail',
      'area_id',
      'is_default_shipping',
      'created_at',
      'updated_at',
    ],
    addresses,
  ),
  rows('user_roles', ['user_id', 'role_id', 'granted_by', 'granted_at'], userRoles),
  rows(
    'device_tokens',
    ['id', 'user_id', 'token', 'platform', 'is_active', 'failure_count', 'last_used_at', 'created_at'],
    deviceTokens,
  ),
  ``,
  `-- products`,
  rows('products', Object.keys(products[0] as object), products),
  `-- product <-> category / color / size`,
  rows('product_categories', ['product_id', 'category_id'], productCategories),
  rows('product_colors', ['product_id', 'color_id'], productColors),
  rows('product_sizes', ['product_id', 'size_id'], productSizes),
  rows(
    'product_images',
    ['id', 'product_id', 'image_key', 'alt', 'sort_order', 'is_primary', 'created_at'],
    productImages,
  ),
  `-- variants + inventory (single source of stock truth)`,
  rows(
    'product_variants',
    [
      'id',
      'product_id',
      'color_id',
      'size_id',
      'sku',
      'price',
      'sale_price',
      'weight_grams',
      'image_key',
      'status',
      'created_at',
      'updated_at',
    ],
    variants,
  ),
  rows(
    'inventory',
    ['id', 'variant_id', 'product_id', 'quantity', 'reserved_quantity', 'low_stock_threshold', 'updated_at'],
    variantIndex.map((v) => ({
      id: `inv_${v.id}`,
      variant_id: v.id,
      product_id: v.productId,
      quantity: Math.max(0, v.onHand),
      reserved_quantity: v.reserved,
      low_stock_threshold: v.onHand - v.reserved <= 5 ? 5 : 3,
      updated_at: ts(0),
    })),
  ),
  rows(
    'inventory_movements',
    [
      'id',
      'variant_id',
      'product_id',
      'actor_id',
      'type',
      'quantity',
      'balance_after',
      'reference_type',
      'reference_id',
      'note',
      'created_at',
    ],
    movements,
  ),
  `-- sold_count mirrors the demo orders exactly`,
  ...[...soldByProduct.entries()]
    .filter(([, n]) => n > 0)
    .map(([productId, n]) => `UPDATE products SET sold_count = ${n} WHERE id = ${q(productId)};`),
  ``,
  `-- storefront content`,
  rows(
    'banners',
    [
      'id',
      'title',
      'subtitle',
      'image_key',
      'target_url',
      'cta_label',
      'placement',
      'sort_order',
      'is_active',
      'created_at',
      'updated_at',
    ],
    banners.map((b) => ({
      ...b,
      image_key: b.image,
      target_url: b.target,
      cta_label: b.cta,
      is_active: 1,
      created_at: ts(-days(20)),
      updated_at: ts(-days(20)),
    })),
  ),
  rows(
    'product_reviews',
    [
      'id',
      'product_id',
      'user_id',
      'order_id',
      'rating',
      'title',
      'body',
      'status',
      'verified_purchase',
      'seller_note',
      'created_at',
      'updated_at',
    ],
    reviews,
  ),
  rows(
    'chat_threads',
    [
      'id',
      'user_id',
      'rtdb_path',
      'status',
      'subject',
      'last_message',
      'last_message_at',
      'unread_for_admin',
      'created_at',
      'updated_at',
    ],
    chatThreads,
  ),
  rows(
    'newsletter_subscribers',
    ['id', 'email', 'status', 'source', 'ip', 'created_at', 'updated_at'],
    subscribers.map((s) => ({ ...s }) as Record<string, unknown>),
  ),
  ``,
  `-- promotions`,
  rows(
    'coupons',
    [
      'id',
      'code',
      'name',
      'type',
      'value',
      'min_purchase',
      'max_discount',
      'usage_limit',
      'per_user_limit',
      'used_count',
      'starts_at',
      'ends_at',
      'is_active',
      'category_ids',
      'product_ids',
      'free_shipping_max',
      'created_at',
      'updated_at',
    ],
    coupons
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        value: c.value,
        min: c.min,
        max: c.max,
        usage: c.usage,
        perUser: c.perUser,
        used: c.used,
        active: c.active,
      }))
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        value: c.value,
        min_purchase: c.min,
        max_discount: c.max,
        usage_limit: c.usage,
        per_user_limit: c.perUser,
        used_count: c.used,
        starts_at: ts(-days(45)),
        ends_at: ts(days(45)),
        is_active: c.active,
        category_ids: json([]),
        product_ids: json([]),
        free_shipping_max: c.type === 'free_shipping' ? c.max : null,
        created_at: ts(-days(60)),
        updated_at: ts(-days(1)),
      })),
  ),
  rows(
    'coupon_usages',
    ['id', 'coupon_id', 'order_id', 'user_id', 'discount_amount', 'shipping_discount', 'created_at'],
    couponUsages,
  ),
  ``,
  `-- demo order history`,
  rows(
    'orders',
    [
      'id',
      'code',
      'user_id',
      'status',
      'subtotal',
      'discount_total',
      'shipping_fee',
      'payment_fee',
      'tax_amount',
      'grand_total',
      'total_weight_grams',
      'coupon_code',
      'ship_recipient_name',
      'ship_phone',
      'ship_province',
      'ship_city',
      'ship_district',
      'ship_postcode',
      'ship_detail',
      'ship_area_id',
      'address_id',
      'payment_method',
      'payment_channel',
      'customer_note',
      'cancel_reason',
      'expires_at',
      'paid_at',
      'shipped_at',
      'delivered_at',
      'completed_at',
      'cancelled_at',
      'created_at',
      'updated_at',
    ],
    orders,
  ),
  rows(
    'order_items',
    [
      'id',
      'order_id',
      'product_id',
      'variant_id',
      'product_name',
      'product_slug',
      'variant_label',
      'color_name',
      'size_code',
      'sku',
      'unit_price',
      'quantity',
      'line_total',
      'weight_grams',
      'image_key',
      'created_at',
    ],
    orderItems,
  ),
  rows(
    'order_status_history',
    ['id', 'order_id', 'from_status', 'to_status', 'note', 'actor_type', 'actor_id', 'created_at'],
    orderHistory,
  ),
  rows('order_notes', ['id', 'order_id', 'author_id', 'body', 'visibility', 'created_at'], orderNotes),
  rows(
    'stock_reservations',
    ['id', 'order_id', 'variant_id', 'quantity', 'status', 'expires_at', 'created_at', 'updated_at'],
    reservations,
  ),
  rows(
    'payments',
    [
      'id',
      'order_id',
      'provider',
      'merchant_order_id',
      'reference',
      'method',
      'channel_code',
      'amount',
      'fee',
      'status',
      'payment_url',
      'qr_string',
      'va_number',
      'signed_at',
      'paid_at',
      'expired_at',
      'refunded_at',
      'result_code',
      'result_message',
      'raw_request',
      'raw_response',
      'created_at',
      'updated_at',
    ],
    payments,
  ),
  rows(
    'payment_transactions',
    ['id', 'payment_id', 'event_type', 'amount', 'status', 'payload', 'created_at'],
    paymentTransactions,
  ),
  rows(
    'shipments',
    [
      'id',
      'order_id',
      'provider',
      'biteship_order_id',
      'waybill_id',
      'tracking_number',
      'courier_company',
      'courier_service',
      'courier_type',
      'delivery_type',
      'service_code',
      'status',
      'price',
      'price_changed',
      'insurance_enabled',
      'insurance_price',
      'weight_grams',
      'item_name',
      'from_snapshot',
      'to_snapshot',
      'estimate',
      'label_url',
      'created_at',
      'updated_at',
      'picked_up_at',
      'delivered_at',
    ],
    shipments,
  ),
  rows(
    'shipment_tracking_events',
    [
      'id',
      'shipment_id',
      'event_code',
      'label',
      'description',
      'occurred_at',
      'source',
      'dedupe_key',
      'payload',
      'created_at',
    ],
    trackingEvents,
  ),
  ``,
  `PRAGMA foreign_keys = ON;`,
  ``,
].join('\n');

const outDir = join(import.meta.dir, 'generated');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'seed.sql');
writeFileSync(outFile, sql, 'utf8');

console.log(
  `seed.sql written: ${PRODUCTS.length} products, ${variantIndex.length} variants, ${CUSTOMERS.length} customers, ${orders.length} orders, ${reviews.length} reviews (${(sql.length / 1024).toFixed(0)} KB)`,
);
