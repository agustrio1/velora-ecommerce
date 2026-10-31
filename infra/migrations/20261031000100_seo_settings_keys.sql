-- SEO / JSON-LD keys added to the `seo_settings` document.
--
-- store_settings stores one JSON document per key, so this is a data backfill
-- rather than DDL. It is additive on purpose: json_insert only writes a key that
-- is still missing, so any value an admin has already saved is left untouched,
-- and re-running it is a no-op.

UPDATE store_settings
SET value = json_insert(
      value,
      '$.keywords', '',
      '$.twitterHandle', NULL,
      '$.robotsIndex', json('true'),
      '$.robotsFollow', json('true'),
      '$.jsonLdEnabled', json('true'),
      '$.organizationType', 'OnlineStore',
      '$.jsonLdExtra', NULL
    ),
    updated_at = datetime('now')
WHERE key = 'seo_settings'
  AND json_valid(value);
