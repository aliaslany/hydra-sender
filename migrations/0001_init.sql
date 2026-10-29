PRAGMA foreign_keys = ON;

-- 1. Subscription Tiers & Quota Definitions
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name_fa TEXT NOT NULL,
    price_toman INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    max_channels INTEGER NOT NULL DEFAULT 1,
    max_active_rules INTEGER NOT NULL DEFAULT 2,
    daily_ad_quota INTEGER NOT NULL DEFAULT 50,
    allow_stage2_filters INTEGER NOT NULL DEFAULT 1,
    allow_backfill INTEGER NOT NULL DEFAULT 1,
    max_backfill_ads INTEGER NOT NULL DEFAULT 30,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed Default Subscription Plans
INSERT OR IGNORE INTO plans (id, name_fa, price_toman, duration_days, max_channels, max_active_rules, daily_ad_quota, allow_stage2_filters, allow_backfill, max_backfill_ads, is_active) VALUES
('FREE_TRIAL', 'تست رایگان (۳ روزه)', 0, 3, 1, 1, 15, 1, 1, 10, 1),
('BASIC_MONTH', 'پایه ماهانه (شخصی)', 290000, 30, 1, 2, 50, 1, 1, 20, 1),
('PRO_MONTH', 'حرفه‌ای مشاورین املاک', 690000, 30, 3, 6, 200, 1, 1, 40, 1),
('AGENCY_VIP', 'ویژه آژانس‌های املاک', 1850000, 90, 10, 25, 1000, 1, 1, 100, 1);

-- 2. Users, RBAC Roles & In-Chat Wizard State
CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('SUPERADMIN', 'ADMIN', 'USER')),
    is_banned INTEGER NOT NULL DEFAULT 0,
    wizard_state TEXT NOT NULL DEFAULT 'IDLE',
    wizard_draft_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 3. User Subscriptions (Time & Search Limits)
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES plans(id),
    granted_by INTEGER REFERENCES users(telegram_id),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'DEPLETED')),
    starts_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    searches_used_today INTEGER NOT NULL DEFAULT 0,
    total_ads_sent INTEGER NOT NULL DEFAULT 0,
    max_total_searches INTEGER,
    last_quota_reset_day TEXT NOT NULL DEFAULT '2026-10-28',
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_subs_user_status ON subscriptions(user_id, status, expires_at);

-- 4. Target Telegram Channels (@somechannel or -100xxxx)
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL UNIQUE,
    title TEXT,
    bot_is_admin INTEGER NOT NULL DEFAULT 0,
    can_post_messages INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    last_verified_at INTEGER,
    last_sent_at INTEGER NOT NULL DEFAULT 0,
    sent_count_current_minute INTEGER NOT NULL DEFAULT 0,
    minute_window_start INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 5. Two-Stage Filter Rules & Tolerance Configuration
CREATE TABLE IF NOT EXISTS filter_rules (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    city_ids_json TEXT NOT NULL DEFAULT '["1"]',
    districts_json TEXT NOT NULL DEFAULT '[]',
    deal_type TEXT NOT NULL CHECK(deal_type IN ('BUY', 'RENT')),
    property_type TEXT NOT NULL CHECK(property_type IN ('APARTMENT', 'VILLA_LAND', 'OLD_HOUSE', 'COMMERCIAL', 'ALL_RESIDENTIAL')),
    divar_category_slug TEXT NOT NULL,
    min_budget INTEGER DEFAULT 0,
    max_budget INTEGER DEFAULT 0,
    min_rent INTEGER DEFAULT 0,
    max_rent INTEGER DEFAULT 0,
    allow_rahn_conversion INTEGER NOT NULL DEFAULT 1,
    max_price_per_m2 INTEGER DEFAULT 0,
    min_area INTEGER DEFAULT 0,
    max_area INTEGER DEFAULT 0,
    tolerance_pct REAL NOT NULL DEFAULT 0.15 CHECK(tolerance_pct BETWEEN 0.0 AND 0.25),
    min_match_score INTEGER NOT NULL DEFAULT 65 CHECK(min_match_score BETWEEN 0 AND 100),
    stage2_filters_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 6. Backfill & Live Streaming Sync State Machine
CREATE TABLE IF NOT EXISTS sync_state (
    rule_id TEXT PRIMARY KEY REFERENCES filter_rules(id) ON DELETE CASCADE,
    phase TEXT NOT NULL DEFAULT 'BACKFILL' CHECK(phase IN ('BACKFILL', 'LIVE', 'PAUSED', 'ERROR')),
    backfill_target_count INTEGER NOT NULL DEFAULT 30,
    backfill_queued_count INTEGER NOT NULL DEFAULT 0,
    backfill_dispatched_count INTEGER NOT NULL DEFAULT 0,
    pagination_cursor_date TEXT,
    pagination_page INTEGER NOT NULL DEFAULT 1,
    search_uid TEXT,
    last_watermark_timestamp INTEGER NOT NULL DEFAULT 0,
    last_polled_at INTEGER NOT NULL DEFAULT 0,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    last_error_msg TEXT
);

-- 7. Deduplication & Outbound Message Queue
CREATE TABLE IF NOT EXISTS sent_ads (
    rule_id TEXT NOT NULL REFERENCES filter_rules(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    post_token TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
    telegram_message_id INTEGER,
    card_payload_json TEXT,
    discovered_at INTEGER NOT NULL DEFAULT (unixepoch()),
    sent_at INTEGER,
    PRIMARY KEY (rule_id, post_token)
);
CREATE INDEX IF NOT EXISTS idx_sent_ads_queue ON sent_ads(status, channel_id, discovered_at);

-- 8. Operational Telemetry & Audit Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR')),
    component TEXT NOT NULL,
    rule_id TEXT,
    message TEXT NOT NULL,
    meta_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
