-- VELORA · Cloudflare D1 (SQLite) — core schema
-- Money: INTEGER Rupiah (never floats). Weight: INTEGER grams.
-- Ids: TEXT (UUID v4 minted in the Worker) + human readable order codes.
PRAGMA foreign_keys = ON;

-- ============================ IDENTITY & ACCESS ============================

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  firebase_uid    TEXT NOT NULL UNIQUE,          -- Firebase Auth is the identity owner
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,
  display_name    TEXT,
  avatar_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  email_verified  INTEGER NOT NULL DEFAULT 0,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name         TEXT,
  nickname          TEXT,
  gender            TEXT CHECK (gender IN ('male','female','other')),
  birthday          TEXT,
  preferred_size    TEXT,
  height_cm         INTEGER,
  weight_kg         INTEGER,
  locale            TEXT NOT NULL DEFAULT 'id-ID',
  newsletter        INTEGER NOT NULL DEFAULT 0,
  notification_prefs TEXT NOT NULL DEFAULT '{}',  -- JSON: NotificationPrefs
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id   TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS user_addresses (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  recipient_name      TEXT NOT NULL,
  phone               TEXT NOT NULL,
  province            TEXT NOT NULL,
  city                TEXT NOT NULL,
  district            TEXT NOT NULL,
  postcode            TEXT NOT NULL,
  detail              TEXT NOT NULL,
  area_id             TEXT,                      -- Biteship area id (validated server-side)
  is_default_shipping INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_addresses_user ON user_addresses(user_id);

CREATE TABLE IF NOT EXISTS device_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,              -- FCM registration token
  platform    TEXT NOT NULL DEFAULT 'web',
  is_active   INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id, is_active);

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  metadata   TEXT NOT NULL DEFAULT '{}',
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_actor ON admin_activity_logs(actor_id, created_at);
CREATE INDEX idx_activity_entity ON admin_activity_logs(entity, entity_id);

-- ================================ CATALOGUE ================================

CREATE TABLE IF NOT EXISTS size_guides (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'tops' CHECK (type IN ('tops','bottoms','dress','shoes','general')),
  description TEXT,
  columns     TEXT NOT NULL DEFAULT '[]',        -- JSON string[]
  rows        TEXT NOT NULL DEFAULT '[]',        -- JSON string[][]
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  description       TEXT,
  image_key         TEXT,
  parent_id         TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  meta_title        TEXT,
  meta_description  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_categories_active_sort ON categories(is_active, sort_order);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS brands (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_key    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_brands_active ON brands(is_active);

CREATE TABLE IF NOT EXISTS colors (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  hex_code   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sizes (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  size_guide_id TEXT REFERENCES size_guides(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sizes_sort ON sizes(sort_order);

CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  sku                 TEXT NOT NULL UNIQUE,
  description         TEXT NOT NULL DEFAULT '',
  primary_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand_id            TEXT REFERENCES brands(id) ON DELETE SET NULL,
  material            TEXT,
  size_guide_id       TEXT REFERENCES size_guides(id) ON DELETE SET NULL,
  price               INTEGER NOT NULL CHECK (price >= 0),      -- Rupiah
  sale_price          INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  weight_grams        INTEGER NOT NULL DEFAULT 250 CHECK (weight_grams > 0),
  length_cm           REAL,
  width_cm            REAL,
  height_cm           REAL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('active','draft','archived','out_of_stock')),
  is_featured         INTEGER NOT NULL DEFAULT 0,
  is_new_arrival      INTEGER NOT NULL DEFAULT 0,
  is_best_seller      INTEGER NOT NULL DEFAULT 0,
  meta_title          TEXT,
  meta_description    TEXT,
  view_count          INTEGER NOT NULL DEFAULT 0,
  sold_count          INTEGER NOT NULL DEFAULT 0,
  published_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_status_created ON products(status, created_at DESC);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_sale_price ON products(sale_price);
CREATE INDEX idx_products_category ON products(primary_category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_featured ON products(is_featured, status);
CREATE INDEX idx_products_new ON products(is_new_arrival, published_at DESC);
CREATE INDEX idx_products_best ON products(is_best_seller, sold_count DESC);
CREATE INDEX idx_products_view ON products(view_count DESC);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX idx_pc_category ON product_categories(category_id);

CREATE TABLE IF NOT EXISTS product_colors (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id   TEXT NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, color_id)
);
CREATE INDEX idx_pcolor_color ON product_colors(color_id);

CREATE TABLE IF NOT EXISTS product_sizes (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_id    TEXT NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, size_id)
);
CREATE INDEX idx_psize_size ON product_sizes(size_id);

CREATE TABLE IF NOT EXISTS product_images (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_key   TEXT NOT NULL,
  alt         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pimages_product ON product_images(product_id, sort_order);
CREATE UNIQUE INDEX uq_pimages_primary ON product_images(product_id) WHERE is_primary = 1;

-- Variant = one concrete color/size combination. Its own SKU, price, weight.
-- Stock lives in `inventory` (one row per variant) so there is a single truth.
CREATE TABLE IF NOT EXISTS product_variants (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id     TEXT NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
  size_id      TEXT NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
  sku          TEXT NOT NULL UNIQUE,
  price        INTEGER CHECK (price IS NULL OR price >= 0),
  sale_price   INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams > 0),
  image_key    TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, color_id, size_id)
);
CREATE INDEX idx_variants_product ON product_variants(product_id, status);
CREATE INDEX idx_variants_color ON product_variants(color_id);
CREATE INDEX idx_variants_size ON product_variants(size_id);

CREATE TABLE IF NOT EXISTS product_reviews (
  id               TEXT PRIMARY KEY,
  product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id         TEXT,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title            TEXT,
  body             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('published','pending','rejected')),
  verified_purchase INTEGER NOT NULL DEFAULT 0,
  seller_note      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);
CREATE INDEX idx_reviews_product_status ON product_reviews(product_id, status, created_at DESC);

-- ================================ INVENTORY ================================

CREATE TABLE IF NOT EXISTS inventory (
  id                   TEXT PRIMARY KEY,
  variant_id           TEXT NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
  product_id           TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity             INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold  INTEGER NOT NULL DEFAULT 3,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (reserved_quantity <= quantity)
);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_low ON inventory(quantity, low_stock_threshold);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id             TEXT PRIMARY KEY,
  variant_id     TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  actor_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN ('stock_in','stock_out','reserve','release','sale','return','adjust')),
  quantity       INTEGER NOT NULL,               -- signed delta
  balance_after  INTEGER NOT NULL,
  reference_type TEXT,                           -- order | admin | system | migration
  reference_id   TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_movements_variant ON inventory_movements(variant_id, created_at DESC);
CREATE INDEX idx_movements_ref ON inventory_movements(reference_type, reference_id);
-- stock_reservations is created in 20261030000200_commerce.sql (it references orders).
