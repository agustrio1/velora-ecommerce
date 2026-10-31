-- Homepage meta fields added to the `seo_settings` document.
--
-- Both statements are safe data backfills, not DDL: `json_insert` only writes a
-- key that is still missing, and the default-title rewrite is guarded by the
-- exact bootstrap placeholder, so anything an admin has saved is left alone.

-- Blank on purpose: an empty home field tells the storefront head to compose the
-- title and description from the live hero copy and category links.
UPDATE store_settings
SET value = json_insert(
      value,
      '$.homeTitle', '',
      '$.homeDescription', ''
    ),
    updated_at = datetime('now')
WHERE key = 'seo_settings'
  AND json_valid(value);

-- The bootstrap row still carries the English sample title; swap it for the same
-- wording the API uses as its default.
UPDATE store_settings
SET value = json_set(
      value,
      '$.defaultTitle', 'VELORA — Busana Modern',
      '$.defaultDescription', 'Katalog busana modern dengan harga jujur dan pengiriman ke seluruh Indonesia.'
    ),
    updated_at = datetime('now')
WHERE key = 'seo_settings'
  AND json_valid(value)
  AND json_extract(value, '$.defaultTitle') = 'VELORA — Modern Fashion Store';
