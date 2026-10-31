import type {
  CartView,
  CheckoutQuote,
  Faq,
  HomePagePayload,
  OrderDetail,
  OrderSummary,
  Paginated,
  PaymentMethod,
  ProductDetail,
  ProductReview,
  ProductSummary,
  RelatedProduct,
  ShippingOption,
  StaticPage,
  UserAddress,
} from '@velora/shared';

export type {
  CartView,
  CheckoutQuote,
  Faq,
  HomePagePayload,
  OrderDetail,
  OrderSummary,
  Paginated,
  PaymentMethod,
  ProductDetail,
  ProductReview,
  ProductSummary,
  RelatedProduct,
  ShippingOption,
  StaticPage,
  UserAddress,
};

/** A Biteship area result (mirrors the adapter's BiteshipArea shape). */
export interface BiteshipAreaLike {
  id: string;
  name: string;
  province: string;
  city: string;
  district: string;
  postcode: string;
  country: string;
}

export interface FacetCount {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface CatalogFacets {
  colors: (FacetCount & { hexCode: string })[];
  sizes: { id: string; code: string; name: string; sortOrder: number; count: number }[];
  price: { min: number; max: number };
  categories: FacetCount[];
  brands: FacetCount[];
}

export type CatalogResponse = Paginated<ProductSummary> & { facets: CatalogFacets | null };

export interface ProductResponse {
  product: ProductDetail;
  /** The Worker serializes this as an object of functions; the client derives
   *  availability from `product.variants` instead and ignores this field. */
  availability?: unknown;
  related: RelatedProduct[];
}

export interface ReviewPage {
  items: ProductReview[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ShippingOptionsResponse {
  options: ShippingOption[];
  source: string;
  error: string | null;
  weightGrams: number;
  estimatedPickup: boolean;
  note: string | null;
}

export interface AreasResponse {
  items: BiteshipAreaLike[];
  configured: boolean;
  message?: string;
}

export interface PaymentMethodsResponse {
  methods: PaymentMethod[];
  configured: boolean;
  note: string | null;
  amountHint: string;
}

export interface QuoteResponse {
  quote: CheckoutQuote;
  ready: boolean;
  paymentAvailable: boolean;
}

export interface PlaceOrderPayment {
  provider: 'duitku';
  merchantOrderId: string;
  method: string | null;
  methodName: string | null;
  amount: number;
  fee: number;
  status: string;
  paymentUrl: string | null;
  vaNumber: string | null;
  qrString: string | null;
  reference: string | null;
  expiresAt: string | null;
  gatewayConfigured: boolean;
  message: string | null;
}

export interface PlaceOrderResponse {
  order: OrderSummary;
  quote: CheckoutQuote;
  payment: PlaceOrderPayment;
  reused: boolean;
}

export interface WishlistResponse {
  items: ProductSummary[];
}

export interface AddressList {
  items: UserAddress[];
}

/* ------------------------------- admin -------------------------------- */

/** Admin product list row: the storefront summary plus the edit timestamp. */
export type AdminProductRow = ProductSummary & { updatedAt: string };

/** Client mirror of the Worker's AdminProductDetail projection. */
export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  categoryId: string | null;
  categoryIds: string[];
  brandId: string | null;
  material: string | null;
  sizeGuideId: string | null;
  price: number;
  salePrice: number | null;
  weightGrams: number;
  dimensions: { lengthCm: number | null; widthCm: number | null; heightCm: number | null };
  status: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  colors: string[];
  sizes: string[];
  images: { id: string; imageKey: string; alt: string | null; sortOrder: number; isPrimary: boolean }[];
  variants: {
    id: string;
    colorId: string;
    sizeId: string;
    colorName: string;
    sizeCode: string;
    sku: string;
    price: number | null;
    salePrice: number | null;
    weightGrams: number | null;
    imageKey: string | null;
    status: string;
    stock: number;
    reserved: number;
    available: number;
  }[];
}

export interface Taxonomies {
  categories: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    parentId: string | null;
    imageKey: string | null;
    imageUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    productCount: number;
    directCount: number;
    metaTitle: string | null;
    metaDescription: string | null;
  }[];
  brands: {
    id: string;
    name: string;
    slug: string;
    logoKey: string | null;
    logoUrl: string | null;
    isActive: boolean;
    productCount: number;
  }[];
  colors: { id: string; name: string; slug: string; hexCode: string; productCount: number }[];
  sizes: {
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    sizeGuideId: string | null;
    variantCount: number;
  }[];
}

export interface AdminSearchHit {
  id: string;
  title: string;
  hint: string | null;
  /** Order grand total only; every other collection leaves it out. */
  amount?: number;
}

export interface AdminSearchGroup {
  /** Matches before the per-collection limit, used for the "lihat semua" row. */
  total: number;
  items: AdminSearchHit[];
}

/** Client mirror of `GET /admin/search` — one group per admin menu. */
export interface AdminSearchResult {
  q: string;
  products: AdminSearchGroup;
  orders: AdminSearchGroup;
  customers: AdminSearchGroup;
  categories: AdminSearchGroup;
  coupons: AdminSearchGroup;
  pages: AdminSearchGroup;
  faqs: AdminSearchGroup;
}

export interface CouponRow {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  minPurchase: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  categoryIds: string[];
  productIds: string[];
}

/** Moderation row from `GET /admin/reviews` (joins product + reviewer email). */
export interface AdminReviewRow {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  email: string;
  rating: number;
  title: string | null;
  body: string;
  status: 'published' | 'pending' | 'rejected';
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface SettingsPayload {
  settings: import('@velora/shared').StoreSettingRow[];
  shipping: Record<string, unknown>;
  tax: Record<string, unknown>;
  order: Record<string, unknown>;
  announcement: Record<string, unknown>;
  seo: SeoDoc;
  origins: Record<string, unknown>[];
  gateway: {
    duitku: { configured: boolean; environment: string; merchantCode: string | null };
    biteship: { configured: boolean; environment: string };
  };
}

/** SEO document as stored under `seo_settings` and read by the storefront head. */
export interface SeoDoc {
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
  /** Homepage-only overrides; empty means "compose the home head from content". */
  homeTitle: string;
  homeDescription: string;
  defaultOgImage: string | null;
  canonicalBaseUrl: string | null;
  keywords: string;
  twitterHandle: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  jsonLdEnabled: boolean;
  organizationType: import('@velora/shared').SeoOrgType;
  jsonLdExtra: string | null;
}

/** `/api/settings/public` — everything the SSR <head> needs. */
export interface PublicSettings {
  seo: SeoDoc;
  store: {
    storeName: string;
    logoUrl: string | null;
    address: string;
    whatsapp: string | null;
    email: string | null;
    social: Record<string, string>;
  };
}

export interface SalesSummary {
  orders: number;
  revenue: number;
  avgOrderValue: number;
  discounts: number;
  shipping: number;
  tax: number;
  from: string | null;
  to: string | null;
  cancelledCount: number;
}

export interface ReportResponse {
  kind: string;
  range: { from: string; to: string };
  total: number;
  rows: import('@velora/shared').ReportRow[];
}

export interface ContentBanners {
  items: import('@velora/shared').Banner[];
}

export interface AdminThreadsResponse extends Paginated<import('@velora/shared').ChatThreadSummary> {
  realtimeConfigured: boolean;
}
