-- Homepage meta copy.
--
-- The storefront used to inherit the site-wide default title/description, so the
-- homepage competed with every other page for the same keywords. This writes real
-- homepage copy into the `seo_settings` document, which the admin can then edit in
-- Settings → SEO.
--
-- Both statements only fill fields that are still blank, so any copy an admin has
-- saved is left untouched.

UPDATE store_settings
SET value = json_set(
      value,
      '$.homeTitle', 'VELORA — Busana Modern, Harga Jujur, Kirim Seluruh Indonesia'
    ),
    updated_at = datetime('now')
WHERE key = 'seo_settings'
  AND json_valid(value)
  AND COALESCE(json_extract(value, '$.homeTitle'), '') = '';

UPDATE store_settings
SET value = json_set(
      value,
      '$.homeDescription', 'Belanja kaos, kemeja, outerwear, celana, denim, dan aksesori dengan harga jujur dan pengiriman ke seluruh Indonesia. Proses 1x24 jam, bayar dengan QRIS.'
    ),
    updated_at = datetime('now')
WHERE key = 'seo_settings'
  AND json_valid(value)
  AND COALESCE(json_extract(value, '$.homeDescription'), '') = '';
