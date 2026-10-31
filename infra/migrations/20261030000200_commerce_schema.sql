-- VELORA · D1 — shopping, orders, payments, shipping, promotions

-- ================================== CARTS ==================================

CREATE TABLE IF NOT EXISTS carts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,   -- NULL for guests
  guest_token TEXT UNIQUE,                                   -- opaque random token in localStorage
  currency    TEXT NOT NULL DEFAULT 'IDR',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX uq_carts_user ON carts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_carts_guest ON carts(guest_token);

CREATE TABLE IF NOT EXISTS cart_items (
  id         TEXT PRIMARY KEY,
  cart_id    TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cart_id, variant_id)
);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE IF NOT EXISTS wishlists (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id          TEXT PRIMARY KEY,
  wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (wishlist_id, product_id)
);

-- ================================= PROMOTIONS ==============================

CREATE TABLE IF NOT EXISTS coupons (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('percent','fixed','free_shipping')),
  value              INTEGER NOT NULL CHECK (value > 0),
  min_purchase       INTEGER CHECK (min_purchase IS NULL OR min_purchase >= 0),
  max_discount       INTEGER CHECK (max_discount IS NULL OR max_discount >= 0),
  usage_limit        INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 0),
  per_user_limit     INTEGER CHECK (per_user_limit IS NULL OR per_user_limit >= 0),
  used_count         INTEGER NOT NULL DEFAULT 0,
  starts_at          TEXT,
  ends_at            TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  category_ids       TEXT NOT NULL DEFAULT '[]',   -- JSON string[] restriction
  product_ids        TEXT NOT NULL DEFAULT '[]',   -- JSON string[] restriction
  free_shipping_max  INTEGER CHECK (free_shipping_max IS NULL OR free_shipping_max >= 0),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_coupons_active ON coupons(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS coupon_usages (
  id              TEXT PRIMARY KEY,
  coupon_id       TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id        TEXT NOT NULL,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  shipping_discount INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (coupon_id, order_id)
);
CREATE INDEX idx_coupon_usage_user ON coupon_usages(coupon_id, user_id);

-- ================================== ORDERS ==================================

CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,                 -- VLRA-2610-000123
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'pending_payment'
                      CHECK (status IN ('pending_payment','paid','processing','shipped','delivered','completed','cancelled','refunded')),
  subtotal            INTEGER NOT NULL CHECK (subtotal >= 0),
  discount_total      INTEGER NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  shipping_fee        INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  payment_fee         INTEGER NOT NULL DEFAULT 0 CHECK (payment_fee >= 0),
  tax_amount          INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  grand_total         INTEGER NOT NULL CHECK (grand_total >= 0),
  total_weight_grams  INTEGER NOT NULL DEFAULT 0,
  coupon_code         TEXT,
  -- shipping snapshot (never re-derived: orders must stay historical truth)
  ship_recipient_name TEXT NOT NULL,
  ship_phone          TEXT NOT NULL,
  ship_province       TEXT NOT NULL,
  ship_city           TEXT NOT NULL,
  ship_district       TEXT NOT NULL,
  ship_postcode       TEXT NOT NULL,
  ship_detail         TEXT NOT NULL,
  ship_area_id        TEXT,
  address_id          TEXT REFERENCES user_addresses(id) ON DELETE SET NULL,
  payment_method      TEXT,
  payment_channel     TEXT,
  customer_note       TEXT,
  cancel_reason       TEXT,
  expires_at          TEXT,
  paid_at             TEXT,
  shipped_at          TEXT,
  delivered_at        TEXT,
  completed_at        TEXT,
  cancelled_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_orders_expires ON orders(status, expires_at);
CREATE INDEX idx_orders_grand_total ON orders(grand_total);

CREATE TABLE IF NOT EXISTS order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    TEXT REFERENCES products(id) ON DELETE SET NULL,
  variant_id    TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  product_slug  TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  color_name    TEXT,
  size_code     TEXT,
  sku           TEXT NOT NULL,
  unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  line_total    INTEGER NOT NULL CHECK (line_total >= 0),
  weight_grams  INTEGER NOT NULL DEFAULT 0,
  image_key     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  actor_type  TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('customer','admin','system','webhook')),
  actor_id    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_osh_order ON order_status_history(order_id, created_at);

CREATE TABLE IF NOT EXISTS order_notes (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  visibility  TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','customer')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_order_notes_order ON order_notes(order_id, created_at);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','released','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id, variant_id)
);
CREATE INDEX idx_reservations_status ON stock_reservations(status, expires_at);
CREATE INDEX idx_reservations_variant ON stock_reservations(variant_id, status);

-- ================================= PAYMENTS =================================

CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'duitku',
  merchant_order_id TEXT NOT NULL UNIQUE,          -- == orders.code, sent to Duitku
  reference         TEXT UNIQUE,                   -- Duitku reference number
  method            TEXT,                          -- payment method name
  channel_code      TEXT,                          -- e.g. QRIS / BCA / OVO
  amount            INTEGER NOT NULL CHECK (amount >= 0),
  fee               INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired','refunded')),
  payment_url       TEXT,
  qr_string         TEXT,
  va_number         TEXT,
  signed_at         TEXT,
  paid_at           TEXT,
  expired_at        TEXT,
  refunded_at       TEXT,
  result_code       TEXT,
  result_message    TEXT,
  raw_request       TEXT NOT NULL DEFAULT '{}',
  raw_response      TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_status ON payments(status, created_at DESC);
CREATE INDEX idx_payments_reference ON payments(reference);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id          TEXT PRIMARY KEY,
  payment_id  TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,                       -- created | status_check | callback | expire | refund
  amount      INTEGER,
  status      TEXT,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_paytx_payment ON payment_transactions(payment_id, created_at);

CREATE TABLE IF NOT EXISTS payment_callbacks (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL DEFAULT 'duitku',
  idempotency_key   TEXT NOT NULL UNIQUE,           -- reference + status + amount
  merchant_code     TEXT,
  merchant_order_id TEXT,
  reference         TEXT,
  amount            INTEGER,
  payment_status    TEXT,
  result_code       TEXT,
  result_message    TEXT,
  signature         TEXT,
  signature_valid   INTEGER NOT NULL DEFAULT 0,
  processed         INTEGER NOT NULL DEFAULT 0,
  processed_at      TEXT,
  payload           TEXT NOT NULL DEFAULT '{}',
  ip                TEXT,
  received_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_callbacks_processed ON payment_callbacks(processed, received_at);

-- ================================= SHIPPING =================================

CREATE TABLE IF NOT EXISTS shipping_origins (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone        TEXT NOT NULL,
  address      TEXT NOT NULL,
  province     TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  district     TEXT NOT NULL DEFAULT '',
  postcode     TEXT NOT NULL DEFAULT '',
  area_id      TEXT NOT NULL,                      -- Biteship origin area id
  is_default   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX uq_origin_default ON shipping_origins(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS shipments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'biteship',
  biteship_order_id TEXT UNIQUE,
  waybill_id        TEXT,
  tracking_number   TEXT,
  courier_company   TEXT NOT NULL,
  courier_service   TEXT NOT NULL,
  courier_type      TEXT,
  delivery_type     TEXT NOT NULL DEFAULT 'regular',
  service_code      TEXT NOT NULL,                  -- <company>-<service>-<type> snapshot id
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','allocated','picking_up','picked_up','dropping_off','in_transit','delivered','returned','cancelled')),
  price             INTEGER NOT NULL DEFAULT 0,
  price_changed     INTEGER NOT NULL DEFAULT 0,
  insurance_enabled INTEGER NOT NULL DEFAULT 0,
  insurance_price   INTEGER NOT NULL DEFAULT 0,
  weight_grams      INTEGER NOT NULL DEFAULT 0,
  item_name         TEXT NOT NULL DEFAULT 'Pakaian',
  from_snapshot     TEXT NOT NULL DEFAULT '{}',
  to_snapshot       TEXT NOT NULL DEFAULT '{}',
  estimate          TEXT,
  label_url         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  picked_up_at      TEXT,
  delivered_at      TEXT
);
CREATE INDEX idx_shipments_status ON shipments(status, updated_at DESC);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);

CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id          TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_code  TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook','polling','manual')),
  dedupe_key  TEXT NOT NULL UNIQUE,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_track_events_shipment ON shipment_tracking_events(shipment_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS shipping_rate_logs (
  id           TEXT PRIMARY KEY,
  cache_key    TEXT NOT NULL UNIQUE,   -- origin|dest|weight -> 15 min reuse, avoids duplicate API calls
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  origin_area_id TEXT NOT NULL,
  dest_area_id   TEXT NOT NULL,
  weight_grams INTEGER NOT NULL,
  request_body TEXT NOT NULL DEFAULT '{}',
  response_body TEXT NOT NULL DEFAULT '{}',
  success      INTEGER NOT NULL DEFAULT 1,
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL
);
CREATE INDEX idx_rate_logs_expiry ON shipping_rate_logs(expires_at);

-- ================================== CONTENT ==================================

CREATE TABLE IF NOT EXISTS banners (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  image_key   TEXT,
  target_url  TEXT,
  cta_label   TEXT,
  placement   TEXT NOT NULL DEFAULT 'hero' CHECK (placement IN ('hero','hero_secondary','promo','category')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  starts_at   TEXT,
  ends_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_banners_placement ON banners(placement, is_active, sort_order);

CREATE TABLE IF NOT EXISTS homepage_sections (
  id          TEXT PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE CHECK (section_key IN
    ('hero','featured_collection','new_arrivals','best_sellers','promo','brand_story','recommended')),
  title       TEXT,
  subtitle    TEXT,
  layout      TEXT NOT NULL DEFAULT 'grid',
  data        TEXT NOT NULL DEFAULT '{}',
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sections_active_sort ON homepage_sections(is_active, sort_order);

CREATE TABLE IF NOT EXISTS pages (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL DEFAULT '',
  is_published     INTEGER NOT NULL DEFAULT 0,
  meta_title       TEXT,
  meta_description TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menus (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code IN ('main','footer','mobile','category')),
  items      TEXT NOT NULL DEFAULT '[]',
  is_active  INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id           TEXT PRIMARY KEY,
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  category     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_faqs_pub ON faqs(is_published, sort_order);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed','bounced')),
  source     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =================================== SYSTEM ==================================

CREATE TABLE IF NOT EXISTS store_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '{}',
  is_public  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push','email','in_app')),
  template      TEXT NOT NULL,
  title         TEXT,
  body          TEXT,
  data          TEXT NOT NULL DEFAULT '{}',
  target        TEXT,                    -- device token / email address
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error         TEXT,
  order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
  sent_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notif_user ON notification_logs(user_id, created_at DESC);
CREATE INDEX idx_notif_status ON notification_logs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_logs (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL CHECK (provider IN ('duitku','biteship','firebase','resend','system')),
  direction   TEXT NOT NULL DEFAULT 'request' CHECK (direction IN ('request','callback')),
  endpoint    TEXT NOT NULL,
  reference   TEXT,
  status_code INTEGER,
  success     INTEGER NOT NULL DEFAULT 0,
  message     TEXT,
  payload     TEXT NOT NULL DEFAULT '{}',
  duration_ms INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_integ_provider ON integration_logs(provider, created_at DESC);
CREATE INDEX idx_integ_ref ON integration_logs(reference);

CREATE TABLE IF NOT EXISTS chat_threads (
  id           TEXT PRIMARY KEY,      -- mirrors the RTDB chatId for server-side indexes
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rtdb_path    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  subject      TEXT,
  last_message TEXT,
  last_message_at TEXT,
  unread_for_admin INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, status)
);
CREATE INDEX idx_chat_status ON chat_threads(status, last_message_at DESC);
