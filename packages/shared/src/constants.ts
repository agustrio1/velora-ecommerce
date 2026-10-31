/**
 * VELORA shared constants — single source of truth for both the Worker (Hono)
 * and the browser (React) so status machines, money rules and API paths can
 * never drift apart.
 */

export const BRAND = {
  name: 'VELORA',
  tagline: 'Modern fashion, made honest.',
  currency: 'IDR',
  currencySymbol: 'Rp',
  locale: 'id-ID',
} as const;

/** Money is always an integer amount of Rupiah. Never floats. */
export const MONEY = {
  minAmount: 0,
  maxAmount: 1_000_000_000, // Duitku per-transaction guard (Rp 1 M)
  decimals: 0,
} as const;

export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUSES = Object.values(ORDER_STATUS) as OrderStatus[];

/** Allowed forward transitions. Anything else must be rejected by the API. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
  paid: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED],
  processing: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED],
  shipped: [ORDER_STATUS.DELIVERED, ORDER_STATUS.REFUNDED],
  delivered: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED],
  completed: [ORDER_STATUS.REFUNDED],
  cancelled: [],
  refunded: [],
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const SHIPPING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ALLOCATED: 'allocated',
  PICKING_UP: 'picking_up',
  PICKED_UP: 'picked_up',
  DROPPING_OFF: 'dropping_off',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
} as const;
export type ShippingStatus = (typeof SHIPPING_STATUS)[keyof typeof SHIPPING_STATUS];

/**
 * Biteship order status -> VELORA shipping status.
 * Only statuses documented by Biteship are mapped; unknown values are kept raw.
 */
export const BITESHIP_SHIPPING_STATUS_MAP: Record<string, ShippingStatus> = {
  pending: SHIPPING_STATUS.PENDING,
  confirmed: SHIPPING_STATUS.CONFIRMED,
  allocated: SHIPPING_STATUS.ALLOCATED,
  picking_up: SHIPPING_STATUS.PICKING_UP,
  picked_up: SHIPPING_STATUS.PICKED_UP,
  // Biteship webhook examples use the short form "picked".
  picked: SHIPPING_STATUS.PICKED_UP,
  dropping_off: SHIPPING_STATUS.DROPPING_OFF,
  in_transit: SHIPPING_STATUS.IN_TRANSIT,
  transit: SHIPPING_STATUS.IN_TRANSIT,
  delivered: SHIPPING_STATUS.DELIVERED,
  returned: SHIPPING_STATUS.RETURNED,
  cancelled: SHIPPING_STATUS.CANCELLED,
};

/** Biteship tracking event codes -> customer-facing order status. */
export const SHIPMENT_TO_ORDER_STATUS: Partial<Record<ShippingStatus, OrderStatus>> = {
  [SHIPPING_STATUS.PICKED_UP]: ORDER_STATUS.SHIPPED,
  [SHIPPING_STATUS.DROPPING_OFF]: ORDER_STATUS.SHIPPED,
  [SHIPPING_STATUS.DELIVERED]: ORDER_STATUS.DELIVERED,
};

export const PRODUCT_STATUS = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVED: 'archived',
  OUT_OF_STOCK: 'out_of_stock',
} as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const VARIANT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export const ROLE_CODE = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;
export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];

export const COUPON_TYPE = {
  PERCENT: 'percent',
  FIXED: 'fixed',
  FREE_SHIPPING: 'free_shipping',
} as const;
export type CouponType = (typeof COUPON_TYPE)[keyof typeof COUPON_TYPE];

export const INVENTORY_MOVEMENT_TYPE = {
  STOCK_IN: 'stock_in',
  STOCK_OUT: 'stock_out',
  RESERVE: 'reserve',
  RELEASE: 'release',
  SALE: 'sale',
  RETURN: 'return',
  ADJUST: 'adjust',
} as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPE)[keyof typeof INVENTORY_MOVEMENT_TYPE];

export const HOMEPAGE_SECTION = {
  HERO: 'hero',
  FEATURED_COLLECTION: 'featured_collection',
  NEW_ARRIVALS: 'new_arrivals',
  BEST_SELLERS: 'best_sellers',
  PROMO: 'promo',
  BRAND_STORY: 'brand_story',
  RECOMMENDED: 'recommended',
} as const;
export type HomepageSectionKey = (typeof HOMEPAGE_SECTION)[keyof typeof HOMEPAGE_SECTION];

export const BANNER_PLACEMENT = {
  HERO: 'hero',
  HERO_SECONDARY: 'hero_secondary',
  PROMO: 'promo',
  CATEGORY: 'category',
} as const;

export const SORT_OPTIONS = {
  LATEST: 'latest',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  POPULAR: 'popular',
  BEST_SELLER: 'best_seller',
  NAME_ASC: 'name_asc',
} as const;
export type SortOption = (typeof SORT_OPTIONS)[keyof typeof SORT_OPTIONS];

export const PAGINATION = {
  defaultPageSize: 12,
  maxPageSize: 60,
  adminPageSize: 20,
  maxAdminPageSize: 100,
} as const;

export const CART = {
  maxItemsPerCart: 60,
  maxQuantityPerLine: 20,
  guestCartTtlDays: 30,
} as const;

export const CHECKOUT = {
  /** Pending orders hold stock until this deadline (Duitku expiry aligned). */
  orderExpiryMinutes: 60,
  reservationExpiryMinutes: 60,
  maxShippingItems: 40,
} as const;

export const UPLOAD = {
  maxBytes: 5 * 1024 * 1024,
  allowedMime: ['image/avif', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  allowedExt: ['.avif', '.jpg', '.jpeg', '.png', '.webp', '.gif'] as const,
  maxDimension: 4096,
  maxImagesPerProduct: 12,
} as const;

export const RATE_LIMIT = {
  windowSeconds: 60,
  anonymousMax: 120,
  authenticatedMax: 300,
  checkoutMax: 10,
  webhookMax: 240,
} as const;

export const STORE_SETTINGS_KEYS = {
  STORE_NAME: 'store_name',
  LOGO: 'logo',
  STORE_ADDRESS: 'store_address',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  SOCIAL_MEDIA: 'social_media',
  SHIPPING_ORIGIN: 'shipping_origin',
  DUITKU: 'duitku_config',
  BITESHIP: 'biteship_config',
  TAX: 'tax_settings',
  ORDER: 'order_settings',
  SEO: 'seo_settings',
  ANNOUNCEMENT: 'announcement_bar',
} as const;

/** schema.org types offered for the store's JSON-LD block (see seo_settings). */
export const SEO_ORG_TYPES = ['Organization', 'OnlineStore', 'Store', 'LocalBusiness'] as const;
export type SeoOrgType = (typeof SEO_ORG_TYPES)[number];

/** Error codes returned by the API — the UI maps them to human messages. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  VARIANT_UNAVAILABLE: 'VARIANT_UNAVAILABLE',
  PRICE_MISMATCH: 'PRICE_MISMATCH',
  COUPON_INVALID: 'COUPON_INVALID',
  CART_EMPTY: 'CART_EMPTY',
  ADDRESS_REQUIRED: 'ADDRESS_REQUIRED',
  SHIPPING_RATE_FAILED: 'SHIPPING_RATE_FAILED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',
  WEBHOOK_INVALID: 'WEBHOOK_INVALID',
  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const API_PREFIX = '/api';

export const ROUTES = {
  // public / customer
  home: '/',
  catalog: '/katalog',
  product: (slug: string) => `/produk/${slug}`,
  category: (slug: string) => `/kategori/${slug}`,
  cart: '/keranjang',
  wishlist: '/wishlist',
  checkout: '/checkout',
  checkoutResult: (code: string) => `/pembayaran/${code}`,
  orders: '/akun/pesanan',
  orderDetail: (code: string) => `/akun/pesanan/${code}`,
  profile: '/akun',
  accountChat: '/akun/bantuan',
  login: '/masuk',
  register: '/daftar',
  forgotPassword: '/lupa-sandi',
  page: (slug: string) => `/halaman/${slug}`,
  // admin
  admin: '/admin',
  adminDashboard: '/admin',
  adminProducts: '/admin/produk',
  adminOrders: '/admin/pesanan',
  adminChat: '/admin/chat',
} as const;

/** Firebase Auth -> D1 bootstrap: a user row is upserted on first verified token. */
export const AUTH_HEADER = 'authorization';

/** Realtime Database path helpers shared by customer & admin chat clients. */
export const RTDB = {
  chats: (chatId: string) => `chats/${chatId}`,
  messages: (chatId: string) => `chatMessages/${chatId}`,
  presence: (userId: string) => `presence/${userId}`,
  typing: (chatId: string, userId: string) => `typing/${chatId}/${userId}`,
  userNotifications: (userId: string) => `userNotifications/${userId}`,
} as const;
