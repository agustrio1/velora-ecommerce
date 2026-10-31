import type {
  CouponType,
  HomepageSectionKey,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  RoleCode,
  ShippingStatus,
} from './constants';

export type ID = string;
export type ISODateTime = string;
/** Integer Rupiah. */
export type Rupiah = number;
/** Grams. */
export type Grams = number;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/* ------------------------------- identity ------------------------------- */

export interface SessionUser {
  id: ID;
  firebaseUid: ID;
  email: string;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  roles: RoleCode[];
  emailVerified: boolean;
  notificationPrefs: NotificationPrefs;
  createdAt: ISODateTime;
}

export interface NotificationPrefs {
  orderUpdates: boolean;
  payments: boolean;
  shipping: boolean;
  promotions: boolean;
  email: boolean;
}

export interface UserProfile {
  userId: ID;
  fullName: string | null;
  nickname: string | null;
  gender: 'male' | 'female' | 'other' | null;
  birthday: string | null;
  preferredSize: string | null;
  heightCm: number | null;
  weightKg: number | null;
  locale: string;
  newsletter: boolean;
}

export interface UserAddress {
  id: ID;
  userId: ID;
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  postcode: string;
  detail: string;
  areaId: string | null;
  isDefaultShipping: boolean;
  createdAt: ISODateTime;
}

/* ------------------------------- catalogue ------------------------------ */

export interface Category {
  id: ID;
  name: string;
  slug: string;
  description: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  parentId: ID | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface Brand {
  id: ID;
  name: string;
  slug: string;
  description: string | null;
  logoKey: string | null;
  isActive: boolean;
  productCount: number;
}

export interface ColorRef {
  id: ID;
  name: string;
  slug: string;
  hexCode: string;
}

export interface SizeRef {
  id: ID;
  code: string;
  name: string;
  sortOrder: number;
}

export interface ProductImage {
  id: ID;
  imageKey: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: ID;
  productId: ID;
  colorId: ID;
  sizeId: ID;
  sku: string;
  price: Rupiah;
  salePrice: Rupiah | null;
  weightGrams: Grams;
  imageKey: string | null;
  imageUrl: string | null;
  status: 'active' | 'inactive';
  stock: number;
  available: number;
  color: ColorRef;
  size: SizeRef;
}

export interface SizeGuide {
  id: ID;
  name: string;
  type: string;
  description: string | null;
  columns: string[];
  rows: string[][];
}

export interface ProductSummary {
  id: ID;
  name: string;
  slug: string;
  sku: string;
  price: Rupiah;
  salePrice: Rupiah | null;
  status: ProductStatus;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  categoryName: string | null;
  categorySlug: string | null;
  brandName: string | null;
  primaryImage: string | null;
  imageCount: number;
  totalStock: number;
  ratingAvg: number | null;
  ratingCount: number;
  soldCount: number;
  viewCount: number;
  createdAt: ISODateTime;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  material: string | null;
  sizeGuide: SizeGuide | null;
  weightGrams: Grams;
  dimensions: { lengthCm: number; widthCm: number; heightCm: number } | null;
  colors: ColorRef[];
  sizes: SizeRef[];
  variants: ProductVariant[];
  images: ProductImage[];
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface RelatedProduct extends ProductSummary {
  relation: 'same_category' | 'same_brand' | 'best_seller';
}

export interface ProductReview {
  id: ID;
  productId: ID;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  status: 'published' | 'pending' | 'rejected';
  verifiedPurchase: boolean;
  createdAt: ISODateTime;
}

/* --------------------------------- cart -------------------------------- */

export interface CartLine {
  id: ID;
  productId: ID;
  variantId: ID;
  productName: string;
  productSlug: string;
  variantLabel: string;
  sku: string;
  unitPrice: Rupiah;
  quantity: number;
  lineTotal: Rupiah;
  weightGrams: Grams;
  imageUrl: string | null;
  availableStock: number;
  status: 'ok' | 'out_of_stock' | 'unavailable' | 'price_changed';
}

export interface CartView {
  id: ID;
  lines: CartLine[];
  subtotal: Rupiah;
  discount: Rupiah;
  totalWeightGrams: number;
  itemCount: number;
  currency: 'IDR';
  appliedCoupon: CouponPreview | null;
  issues: string[];
}

/* ------------------------------- coupons -------------------------------- */

export interface CouponPublic {
  code: string;
  name: string;
  type: CouponType;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  minPurchase: Rupiah | null;
  maxDiscount: Rupiah | null;
}

export interface CouponPreview {
  code: string;
  name: string;
  type: CouponType;
  discount: Rupiah;
  freeShipping: boolean;
  reason: string | null;
}

/* ------------------------------- checkout ------------------------------- */

export interface ShippingOption {
  id: string;
  courier: string;
  courierName: string;
  service: string;
  type: string;
  price: Rupiah;
  estimate: string | null;
  insuranceAvailable: boolean;
}

export interface CheckoutQuoteInput {
  addressId: ID | null;
  shippingOptionId: string | null;
  couponCode: string | null;
  customerNote?: string;
}

/** Payment channels the shopper can pick from, straight from Get Payment Method. */
export interface PaymentMethodChoice {
  code: string;
  name: string;
  group: string;
  icon: string | null;
  fee: Rupiah;
  feeType: 'flat' | 'percent';
}

export interface CheckoutQuote {
  lines: CartLine[];
  subtotal: Rupiah;
  discount: Rupiah;
  shippingFee: Rupiah;
  paymentFee: Rupiah;
  taxAmount: Rupiah;
  grandTotal: Rupiah;
  totalWeightGrams: number;
  appliedCoupon: CouponPreview | null;
  shippingOption: ShippingOption | null;
  freeShipping: boolean;
  issues: string[];
}

/** Result of placing an order: the order plus how the customer should pay. */
export interface PlaceOrderResult {
  order: OrderSummary;
  quote: CheckoutQuote;
  payment: {
    provider: 'duitku';
    merchantOrderId: string;
    method: string | null;
    methodName: string | null;
    amount: Rupiah;
    fee: Rupiah;
    status: PaymentStatus;
    paymentUrl: string | null;
    vaNumber: string | null;
    qrString: string | null;
    reference: string | null;
    expiresAt: ISODateTime | null;
    /** False when the store has no Duitku credentials: the order is saved, payment is pending setup. */
    gatewayConfigured: boolean;
    message: string | null;
  };
  reused: boolean;
}

/* -------------------------------- orders -------------------------------- */

export interface OrderItem {
  id: ID;
  productId: ID;
  variantId: ID;
  productName: string;
  variantLabel: string;
  sku: string;
  unitPrice: Rupiah;
  quantity: number;
  lineTotal: Rupiah;
  weightGrams: Grams;
  imageUrl: string | null;
}

export interface OrderTimelineEntry {
  id: ID;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  actorType: 'customer' | 'admin' | 'system' | 'webhook';
  createdAt: ISODateTime;
}

export interface OrderSummary {
  id: ID;
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  shippingStatus: ShippingStatus | null;
  grandTotal: Rupiah;
  itemCount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  expiresAt: ISODateTime | null;
  primaryImage: string | null;
  courier: string | null;
  trackingNumber: string | null;
}

export interface OrderDetail extends OrderSummary {
  userId: ID;
  customerName: string | null;
  customerEmail: string | null;
  subtotal: Rupiah;
  discountTotal: Rupiah;
  shippingFee: Rupiah;
  paymentFee: Rupiah;
  couponCode: string | null;
  shipping: {
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    postcode: string;
    detail: string;
    areaId: string | null;
  };
  items: OrderItem[];
  timeline: OrderTimelineEntry[];
  notes: { id: ID; body: string; visibility: 'internal' | 'customer'; createdAt: ISODateTime }[];
  payment: PaymentInfo | null;
  shipment: ShipmentInfo | null;
  customerNote: string | null;
  cancelReason: string | null;
}

export interface PaymentInfo {
  id: ID;
  provider: 'duitku';
  merchantOrderId: string;
  reference: string | null;
  method: string | null;
  channelCode: string | null;
  amount: Rupiah;
  status: PaymentStatus;
  paymentUrl: string | null;
  qrString: string | null;
  paidAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  fee: Rupiah;
}

export interface ShipmentInfo {
  id: ID;
  provider: 'biteship';
  biteshipOrderId: string | null;
  waybillId: string | null;
  trackingNumber: string | null;
  courierCompany: string;
  courierService: string;
  courierType: string | null;
  status: ShippingStatus;
  price: Rupiah;
  estimate: string | null;
  events: TrackingEvent[];
  createdAt: ISODateTime;
  deliveredAt: ISODateTime | null;
}

export interface TrackingEvent {
  id: ID;
  eventCode: string;
  label: string;
  occurredAt: ISODateTime;
  source: 'webhook' | 'polling' | 'manual';
}

/* ------------------------------- payments ------------------------------- */

export interface PaymentMethod {
  code: string;
  name: string;
  group: string;
  icon: string | null;
  fee: Rupiah;
  feeType: 'flat' | 'percent';
  enabled: boolean;
}

/* ------------------------------- content -------------------------------- */

export interface Banner {
  id: ID;
  title: string;
  subtitle: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  targetUrl: string | null;
  ctaLabel: string | null;
  placement: string;
  sortOrder: number;
  isActive: boolean;
}

export interface HomepageSection {
  id: ID;
  sectionKey: HomepageSectionKey;
  title: string | null;
  subtitle: string | null;
  isActive: boolean;
  sortOrder: number;
  data: Record<string, unknown> | null;
}

export interface HomePagePayload {
  announcement: string | null;
  hero: {
    eyebrow: string | null;
    title: string | null;
    subtitle: string | null;
    ctaLabel: string | null;
    ctaHref: string | null;
    imageUrl: string | null;
  } | null;
  heroSecondary: Banner | null;
  sections: {
    section: HomepageSection;
    products: ProductSummary[];
    banner?: Banner | null;
  }[];
  categories: Category[];
  brandStory: { title: string; body: string; imageUrl: string | null } | null;
  csHint: { whatsapp: string | null; email: string | null };
}

export interface StaticPage {
  id: ID;
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: ISODateTime;
}

export interface Faq {
  id: ID;
  question: string;
  answer: string;
  category: string | null;
  sortOrder: number;
}

export interface MenuLink {
  label: string;
  href: string;
  children?: MenuLink[];
}

/* -------------------------------- admin --------------------------------- */

export interface DashboardStats {
  revenueTotal: Rupiah;
  revenue30d: Rupiah;
  ordersTotal: number;
  pendingPayments: number;
  statusCounts: Record<OrderStatus, number>;
  customersTotal: number;
  productsTotal: number;
  lowStockCount: number;
  bestSellers: { id: ID; name: string; slug: string; sold: number; revenue: Rupiah }[];
  recentOrders: OrderSummary[];
  revenueSeries: { date: string; revenue: Rupiah; orders: number }[];
  topCategories: { name: string; revenue: Rupiah }[];
}

export interface InventoryRow {
  variantId: ID;
  productId: ID;
  productName: string;
  productSlug: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  status: 'active' | 'inactive';
}

export interface InventoryMovementRow {
  id: ID;
  variantId: ID;
  productName: string;
  sku: string;
  type: InventoryMovementType;
  quantity: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  actorName: string | null;
  createdAt: ISODateTime;
}

export interface AdminCustomerRow {
  id: ID;
  email: string;
  displayName: string | null;
  phone: string | null;
  status: 'active' | 'disabled';
  roles: RoleCode[];
  orderCount: number;
  totalSpent: Rupiah;
  lastOrderAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface ReportRow {
  [column: string]: string | number | null;
}

export interface ChatThreadSummary {
  chatId: string;
  userId: ID;
  customerName: string | null;
  customerEmail: string | null;
  lastMessage: string | null;
  lastMessageAt: ISODateTime | null;
  unreadForAdmin: number;
  open: boolean;
}

export interface StoreSettingRow {
  key: string;
  value: unknown;
  updatedAt: ISODateTime;
}

export interface IntegrationLogRow {
  id: ID;
  provider: 'duitku' | 'biteship' | 'firebase' | 'resend' | 'system';
  direction: 'request' | 'callback';
  endpoint: string;
  statusCode: number | null;
  success: boolean;
  message: string | null;
  reference: string | null;
  createdAt: ISODateTime;
}
