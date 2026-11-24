-- Migration 0002: Dual-source cursors, per-channel branding, error backoff, cross-source dedup

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 1. Channel Branding (multi-tenant support)
ALTER TABLE channels ADD COLUMN contact_mobile TEXT;
ALTER TABLE channels ADD COLUMN contact_phone TEXT;
ALTER TABLE channels ADD COLUMN office_address TEXT;
ALTER TABLE channels ADD COLUMN brand_hashtags_json TEXT;

-- 2. Filter Rule Option: Album follow-up buttons toggle (default off to avoid clutter/2x API calls)
ALTER TABLE filter_rules ADD COLUMN album_followup_buttons INTEGER NOT NULL DEFAULT 0;

-- 3. Separate Sheypoor pagination & error backoff state
ALTER TABLE sync_state ADD COLUMN sheypoor_page INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sync_state ADD COLUMN next_retry_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN is_auto_paused INTEGER NOT NULL DEFAULT 0;

-- 4. Cross-source ad fingerprint & delivery failure tracking
ALTER TABLE sent_ads ADD COLUMN fingerprint TEXT;
ALTER TABLE sent_ads ADD COLUMN last_error_msg TEXT;
CREATE INDEX IF NOT EXISTS idx_sent_ads_fingerprint ON sent_ads(channel_id, fingerprint, discovered_at);

-- 5. Backfill defaults for @aliabadmelk and sanitize runaway pagination state
UPDATE channels
SET contact_mobile = COALESCE(contact_mobile, '09922434338'),
    contact_phone = COALESCE(contact_phone, '01734241371'),
    office_address = COALESCE(office_address, 'علی‌آباد کتول، خیابان پاسداران (کمربندی قدیم)، نبش پاسداران ۸، املاک امیران'),
    brand_hashtags_json = COALESCE(brand_hashtags_json, '["#املاک_امیران","#علی_آباد_ملک"]')
WHERE chat_id = '@aliabadmelk';

UPDATE sync_state
SET pagination_page = 1,
    sheypoor_page = 1,
    last_error_msg = NULL,
    consecutive_errors = 0
WHERE phase = 'LIVE' AND pagination_page > 50;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (2);
