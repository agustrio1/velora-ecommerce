import { z } from 'zod';
import {
  COUPON_TYPE,
  HOMEPAGE_SECTION,
  ORDER_STATUS,
  PRODUCT_STATUS,
  ROLE_CODE,
  SEO_ORG_TYPES,
  SORT_OPTIONS,
  UPLOAD,
} from './constants';

/* -------------------------------------------------------------------------- */
/* Shared primitives. Every mutating endpoint validates with one of these so   */
/* the Worker never trusts the browser for prices, roles or stock.             */
/* -------------------------------------------------------------------------- */

export const idParam = z.object({ id: z.string().min(1).max(64) });
export const slugParam = z.object({ slug: z.string().min(1).max(120) });

export const rupiahs = z.coerce.number().int().min(0).max(1_000_000_000);
export const grams = z.coerce.number().int().min(1).max(100_000);
export const positiveInt = z.coerce.number().int().min(1).max(1_000_000);
export const percent = z.coerce.number().min(0).max(100);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});

export const booleanField = z
  .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === true || v === 'true' || v === '1');

/**
 * z.enum() requires a non-empty tuple, which is awkward straight after Object.values().
 * This keeps the parsed value typed as the literal union instead of collapsing to string.
 */
export const strictEnum = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

/* --------------------------------- auth ---------------------------------- */

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).nullable().optional(),
  nickname: z.string().trim().max(60).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  preferredSize: z.string().trim().max(10).nullable().optional(),
  heightCm: z.coerce.number().int().min(80).max(250).nullable().optional(),
  weightKg: z.coerce.number().min(20).max(400).nullable().optional(),
  newsletter: z.boolean().optional(),
});

export const notificationPrefsSchema = z.object({
  orderUpdates: z.boolean().default(true),
  payments: z.boolean().default(true),
  shipping: z.boolean().default(true),
  promotions: z.boolean().default(false),
  email: z.boolean().default(true),
});

export const deviceTokenSchema = z.object({
  token: z.string().min(20).max(600),
  platform: z.enum(['web', 'android', 'ios']).default('web'),
});

export const addressSchema = z.object({
  label: z.string().trim().min(2).max(40),
  recipientName: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+62|62|0)8[1-9][0-9]{6,11}$/, 'Nomor telepon Indonesia tidak valid'),
  province: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().min(1).max(80),
  postcode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'Kode pos harus 5 angka'),
  detail: z.string().trim().min(5).max(400),
  areaId: z.string().trim().max(64).nullable().optional(),
  isDefaultShipping: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

/* -------------------------------- catalog -------------------------------- */

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  color: z.string().trim().max(200).optional(),
  size: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  inStock: booleanField.optional(),
  onSale: booleanField.optional(),
  featured: booleanField.optional(),
  sort: z
    .enum([
      SORT_OPTIONS.LATEST,
      SORT_OPTIONS.PRICE_ASC,
      SORT_OPTIONS.PRICE_DESC,
      SORT_OPTIONS.POPULAR,
      SORT_OPTIONS.BEST_SELLER,
      SORT_OPTIONS.NAME_ASC,
    ])
    .default(SORT_OPTIONS.LATEST),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().min(4).max(2000),
});

/* ---------------------------------- cart --------------------------------- */

export const cartAddSchema = z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

export const cartUpdateSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(20),
});

export const cartSwapVariantSchema = z.object({
  lineId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64),
});

export const guestCartSchema = z.object({
  guestToken: z.string().min(16).max(64),
});

/* -------------------------------- checkout ------------------------------- */

export const quoteSchema = z.object({
  addressId: z.string().min(1).max(64).nullable().default(null),
  shippingOptionId: z.string().max(120).nullable().default(null),
  couponCode: z.string().trim().max(40).nullable().optional(),
  customerNote: z.string().trim().max(500).optional(),
});

export const checkoutSchema = z.object({
  addressId: z.string().min(1).max(64),
  shippingOptionId: z.string().min(1).max(120),
  couponCode: z.string().trim().max(40).nullable().optional(),
  paymentChannelCode: z.string().trim().min(1).max(40),
  customerNote: z.string().trim().max(500).optional(),
  guestToken: z.string().min(16).max(64).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const shippingRateQuerySchema = z.object({
  areaId: z.string().trim().min(1).max(64).optional(),
  postcode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/)
    .optional(),
  city: z.string().trim().min(2).max(80).optional(),
  province: z.string().trim().min(2).max(80).optional(),
  weight: z.coerce.number().int().min(1).max(100_000).default(250),
});

export const areaSearchSchema = z.object({
  q: z.string().trim().min(2).max(80),
  type: z.enum(['regency', 'district', 'postcode']).default('regency'),
  limit: z.coerce.number().int().min(1).max(15).default(8),
});

/* -------------------------------- products ------------------------------- */

export const productImageSchema = z.object({
  imageKey: z.string().min(1).max(300),
  alt: z.string().max(200).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isPrimary: z.boolean().default(false),
});

export const variantDraftSchema = z.object({
  colorId: z.string().min(1).max(64),
  sizeId: z.string().min(1).max(64),
  sku: z.string().trim().min(3).max(64),
  price: rupiahs.optional(),
  salePrice: rupiahs.nullable().optional(),
  weightGrams: grams.optional(),
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  imageKey: z.string().max(300).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const productUpsertSchema = z.object({
  name: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung')
    .max(160)
    .optional(),
  sku: z.string().trim().min(3).max(64),
  description: z.string().trim().min(10).max(20000),
  categoryId: z.string().max(64).nullable().optional(),
  categoryIds: z.array(z.string().max(64)).max(10).optional(),
  brandId: z.string().max(64).nullable().optional(),
  material: z.string().max(120).nullable().optional(),
  sizeGuideId: z.string().max(64).nullable().optional(),
  price: rupiahs,
  salePrice: rupiahs.nullable().optional(),
  weightGrams: grams,
  dimensions: z
    .object({
      lengthCm: z.coerce.number().min(0).max(500),
      widthCm: z.coerce.number().min(0).max(500),
      heightCm: z.coerce.number().min(0).max(500),
    })
    .nullable()
    .optional(),
  status: strictEnum(Object.values(PRODUCT_STATUS)).optional(),
  isFeatured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  metaTitle: z.string().max(180).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  colors: z.array(z.string().min(1).max(64)).min(1).max(20),
  sizes: z.array(z.string().min(1).max(64)).min(1).max(20),
  variants: z.array(variantDraftSchema).min(1).max(400),
  images: z.array(productImageSchema).max(UPLOAD.maxImagesPerProduct).optional(),
});
export type ProductUpsertInput = z.infer<typeof productUpsertSchema>;

export const productStatusSchema = z.object({
  status: z.enum([PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.ARCHIVED, PRODUCT_STATUS.OUT_OF_STOCK]),
});

export const taxonomiesSchema = {
  categoryUpsert: z.object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(80)
      .optional(),
    description: z.string().max(1000).nullable().optional(),
    parentId: z.string().max(64).nullable().optional(),
    imageKey: z.string().max(300).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    isActive: z.boolean().default(true),
    metaTitle: z.string().max(180).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
  }),
  brandUpsert: z.object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(80)
      .optional(),
    description: z.string().max(1000).nullable().optional(),
    logoKey: z.string().max(300).nullable().optional(),
    isActive: z.boolean().default(true),
  }),
  colorUpsert: z.object({
    name: z.string().trim().min(2).max(40),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(40)
      .optional(),
    hexCode: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Hex color tidak valid'),
  }),
  sizeUpsert: z.object({
    code: z.string().trim().min(1).max(10).toUpperCase(),
    name: z.string().trim().min(1).max(40),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    sizeGuideId: z.string().max(64).nullable().optional(),
  }),
};

/* -------------------------------- inventory ------------------------------ */

export const stockAdjustSchema = z.object({
  variantId: z.string().min(1).max(64),
  type: z.enum(['stock_in', 'stock_out', 'adjust']),
  quantity: z.coerce.number().int().min(1).max(100_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
  note: z.string().max(300).nullable().optional(),
});

export const bulkStockSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(64),
        quantity: z.coerce.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    .max(500),
  note: z.string().max(300).nullable().optional(),
});

/* -------------------------------- coupons -------------------------------- */

export const couponUpsertSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,19}$/, 'Kode kupon: 3-20 karakter huruf besar/angka'),
  name: z.string().trim().min(3).max(120),
  type: z.enum([COUPON_TYPE.PERCENT, COUPON_TYPE.FIXED, COUPON_TYPE.FREE_SHIPPING]),
  value: z.coerce.number().int().min(1).max(100_000_000),
  minPurchase: rupiahs.nullable().optional(),
  maxDiscount: rupiahs.nullable().optional(),
  usageLimit: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  perUserLimit: z.coerce.number().int().min(0).max(100_000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
  categoryIds: z.array(z.string().max(64)).max(20).optional(),
  productIds: z.array(z.string().max(64)).max(200).optional(),
});

/* ------------------------------- order ops ------------------------------- */

export const adminOrderStatusSchema = z.object({
  status: strictEnum(Object.values(ORDER_STATUS)),
  note: z.string().max(500).nullable().optional(),
});

export const orderNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  visibility: z.enum(['internal', 'customer']).default('internal'),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const refundSchema = z.object({
  amount: rupiahs,
  reason: z.string().trim().min(3).max(300),
});

/* -------------------------------- content -------------------------------- */

export const bannerUpsertSchema = z.object({
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().max(200).nullable().optional(),
  imageKey: z.string().max(300).nullable().optional(),
  targetUrl: z.string().max(300).nullable().optional(),
  ctaLabel: z.string().max(40).nullable().optional(),
  placement: z.enum(['hero', 'hero_secondary', 'promo', 'category']),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const homepageSectionUpsertSchema = z.object({
  sectionKey: strictEnum(Object.values(HOMEPAGE_SECTION)),
  title: z.string().max(120).nullable().optional(),
  subtitle: z.string().max(200).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const pageUpsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(120),
  title: z.string().trim().min(2).max(160),
  content: z.string().min(1).max(200_000),
  isPublished: z.boolean().default(true),
  metaTitle: z.string().max(180).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
});

export const faqUpsertSchema = z.object({
  question: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(5).max(5000),
  category: z.string().max(60).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isPublished: z.boolean().default(true),
});

export const menuUpsertSchema = z.object({
  code: z.enum(['main', 'footer', 'mobile', 'category']),
  items: z
    .array(z.lazy(() => menuLinkSchema))
    .min(1)
    .max(50),
  isActive: z.boolean().default(true),
});

const menuLinkSchema: z.ZodType<any> = z.object({
  label: z.string().trim().min(1).max(60),
  href: z.string().trim().min(1).max(300),
  children: z
    .array(z.lazy(() => menuLinkSchema))
    .max(30)
    .optional(),
});

export const newsletterSchema = z.object({
  email: z.string().trim().email().max(200),
  source: z.string().max(40).optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
});

/* -------------------------------- settings ------------------------------- */

export const storeSettingsPatchSchema = z.object({
  store_name: z.string().trim().min(2).max(80).optional(),
  logo: z.string().max(300).nullable().optional(),
  store_address: addressSchema.partial().optional(),
  whatsapp: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  social_media: z
    .object({
      instagram: z.string().max(200).nullable().optional(),
      tiktok: z.string().max(200).nullable().optional(),
      facebook: z.string().max(200).nullable().optional(),
      twitter: z.string().max(200).nullable().optional(),
    })
    .optional(),
  shipping_origin: z
    .object({
      name: z.string().min(2).max(80),
      contactName: z.string().min(2).max(80),
      phone: z.string().min(8).max(30),
      address: z.string().min(5).max(400),
      province: z.string().min(2).max(80).optional(),
      city: z.string().min(2).max(80).optional(),
      district: z.string().min(1).max(80).optional(),
      postcode: z
        .string()
        .trim()
        .regex(/^[0-9]{5}$/)
        .optional(),
      areaId: z.string().min(1).max(64),
      isDefault: z.boolean().optional(),
    })
    .optional(),
  shipping_settings: z
    .object({
      couriers: z.string().max(200).optional(),
      enablePickup: z.boolean().optional(),
      pickupLabel: z.string().max(80).optional(),
      pickupAddress: z.string().max(400).optional(),
      freeShippingThreshold: rupiahs.optional(),
      allowManualRates: z.boolean().optional(),
      manualOptions: z
        .array(
          z.object({
            id: z
              .string()
              .trim()
              .regex(/^manual:[a-z0-9-]{2,30}$/),
            label: z.string().min(2).max(80),
            price: rupiahs,
            estimate: z.string().max(80).nullable().optional(),
          }),
        )
        .max(10)
        .optional(),
    })
    .optional(),
  order_settings: z
    .object({
      pendingExpiryMinutes: z.coerce.number().int().min(10).max(2880).optional(),
      autoCancelUnpaid: z.boolean().optional(),
      minOrderValue: rupiahs.optional(),
    })
    .optional(),
  tax_settings: z
    .object({
      enabled: z.boolean(),
      ratePercent: percent.optional(),
      includeInPrice: z.boolean().optional(),
    })
    .optional(),
  seo_settings: z
    .object({
      siteName: z.string().max(80).optional(),
      defaultTitle: z.string().max(180).optional(),
      defaultDescription: z.string().max(320).optional(),
      // Entry-page overrides: the homepage is the one URL that should never fall
      // back to the generic default, so it gets its own pair of fields.
      homeTitle: z.string().max(180).optional(),
      homeDescription: z.string().max(320).optional(),
      defaultOgImage: z.string().max(300).nullable().optional(),
      canonicalBaseUrl: z.string().url().nullable().optional(),
      keywords: z.string().max(300).optional(),
      twitterHandle: z.string().max(30).nullable().optional(),
      robotsIndex: z.boolean().optional(),
      robotsFollow: z.boolean().optional(),
      jsonLdEnabled: z.boolean().optional(),
      organizationType: strictEnum(SEO_ORG_TYPES).optional(),
      // Free-form JSON-LD pasted by the admin; must parse to an object or array.
      jsonLdExtra: z
        .string()
        .max(4000)
        .nullable()
        .optional()
        .refine(
          (raw) => {
            if (!raw || !raw.trim()) return true;
            try {
              const parsed: unknown = JSON.parse(raw);
              return typeof parsed === 'object' && parsed !== null;
            } catch {
              return false;
            }
          },
          { message: 'JSON-LD tambahan harus berupa JSON objek atau array yang valid.' },
        ),
    })
    .optional(),
  announcement_bar: z.string().max(240).nullable().optional(),
});

export const duitkuConfigSchema = z.object({
  merchantCode: z.string().max(64).optional(),
  environment: z.enum(['sandbox', 'production']),
  expiryMinutes: z.coerce.number().int().min(10).max(2880).default(60),
  enabledChannels: z.array(z.string().max(30)).max(40).optional(),
});

export const biteshipConfigSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  allowedCouriers: z.array(z.string().max(30)).max(40).optional(),
  deliveryType: z.enum(['regular', 'same_day', 'instant', 'cargo']).default('regular'),
  insurancePercent: percent.default(0),
});

/* --------------------------------- users ------------------------------- */

export const adminUserUpdateSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  roles: z
    .array(strictEnum(Object.values(ROLE_CODE)))
    .max(4)
    .optional(),
});

export const roleAssignmentSchema = z.object({
  role: strictEnum(Object.values(ROLE_CODE)),
});

/* --------------------------------- upload -------------------------------- */

export const uploadRequestSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(3)
    .max(140)
    .refine(
      (name) => UPLOAD.allowedExt.some((ext) => name.toLowerCase().endsWith(ext)),
      'Ekstensi file tidak diizinkan',
    ),
  contentType: z
    .string()
    .trim()
    .refine((t) => (UPLOAD.allowedMime as readonly string[]).includes(t), 'Tipe file tidak diizinkan'),
  sizeBytes: z.coerce.number().int().min(1).max(UPLOAD.maxBytes),
  folder: z.enum(['products', 'variants', 'banners', 'categories', 'brands', 'pages']).default('products'),
  productId: z.string().max(64).optional(),
});

export const reviewModerationSchema = z.object({
  status: z.enum(['published', 'pending', 'rejected']),
});

/* --------------------------------- helpers -------------------------------- */

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flat = result.error.flatten();
    throw new ValidationDetailError(flat.fieldErrors, flat.formErrors);
  }
  return result.data;
}

export class ValidationDetailError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string[] | undefined>,
    readonly formErrors: string[],
  ) {
    super('Validation failed');
    this.name = 'ValidationDetailError';
  }
}

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;
