import { Env } from './types';
import { handleTelegramWebhook } from './telegram/webhook';
import { handleAdminApi } from './api/admin';
import { runScheduledTick } from './cron/scheduler';

const SCHEMA_VERSION = 2;

const INIT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
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
  )`,
  `INSERT OR IGNORE INTO plans (id, name_fa, price_toman, duration_days, max_channels, max_active_rules, daily_ad_quota, allow_stage2_filters, allow_backfill, max_backfill_ads, is_active) VALUES
    ('FREE_TRIAL', 'تست رایگان (۳ روزه)', 0, 3, 1, 1, 15, 1, 1, 10, 1),
    ('BASIC_MONTH', 'پایه ماهانه (شخصی)', 290000, 30, 1, 2, 50, 1, 1, 20, 1),
    ('PRO_MONTH', 'حرفه‌ای مشاورین املاک', 690000, 30, 3, 6, 200, 1, 1, 40, 1),
    ('AGENCY_VIP', 'ویژه آژانس‌های املاک', 1850000, 90, 10, 25, 1000, 1, 1, 100, 1)`,
  `CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('SUPERADMIN', 'ADMIN', 'USER')),
    is_banned INTEGER NOT NULL DEFAULT 0,
    wizard_state TEXT NOT NULL DEFAULT 'IDLE',
    wizard_draft_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subs_user_status ON subscriptions(user_id, status, expires_at)`,
  `CREATE TABLE IF NOT EXISTS channels (
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
    contact_mobile TEXT,
    contact_phone TEXT,
    office_address TEXT,
    brand_hashtags_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS filter_rules (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    city_ids_json TEXT NOT NULL DEFAULT '["823"]',
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
    geo_polygon_json TEXT,
    exclude_agency INTEGER NOT NULL DEFAULT 1,
    max_post_age_hours INTEGER NOT NULL DEFAULT 24,
    negative_keywords_json TEXT,
    show_btn_divar INTEGER NOT NULL DEFAULT 1,
    show_btn_map INTEGER NOT NULL DEFAULT 1,
    show_btn_score INTEGER NOT NULL DEFAULT 1,
    show_btn_contact INTEGER NOT NULL DEFAULT 1,
    album_followup_buttons INTEGER NOT NULL DEFAULT 0,
    source_divar INTEGER NOT NULL DEFAULT 1,
    source_sheypoor INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    rule_id TEXT PRIMARY KEY REFERENCES filter_rules(id) ON DELETE CASCADE,
    phase TEXT NOT NULL DEFAULT 'BACKFILL' CHECK(phase IN ('BACKFILL', 'LIVE', 'PAUSED', 'ERROR')),
    backfill_target_count INTEGER NOT NULL DEFAULT 30,
    backfill_queued_count INTEGER NOT NULL DEFAULT 0,
    backfill_dispatched_count INTEGER NOT NULL DEFAULT 0,
    pagination_cursor_date TEXT,
    pagination_page INTEGER NOT NULL DEFAULT 1,
    sheypoor_page INTEGER NOT NULL DEFAULT 1,
    search_uid TEXT,
    last_watermark_timestamp INTEGER NOT NULL DEFAULT 0,
    last_polled_at INTEGER NOT NULL DEFAULT 0,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    last_error_msg TEXT,
    next_retry_at INTEGER NOT NULL DEFAULT 0,
    is_auto_paused INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sent_ads (
    rule_id TEXT NOT NULL REFERENCES filter_rules(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    post_token TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
    telegram_message_id INTEGER,
    card_payload_json TEXT,
    fingerprint TEXT,
    last_error_msg TEXT,
    discovered_at INTEGER NOT NULL DEFAULT (unixepoch()),
    sent_at INTEGER,
    PRIMARY KEY (rule_id, post_token)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sent_ads_queue ON sent_ads(status, channel_id, discovered_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sent_ads_fingerprint ON sent_ads(channel_id, fingerprint, discovered_at)`,
  `CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR')),
    component TEXT NOT NULL,
    rule_id TEXT,
    message TEXT NOT NULL,
    meta_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`
];

let schemaBootstrapped = false;

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaBootstrapped) return;

  // Fast-path: if schema_migrations already records current version, skip DDL statements
  try {
    const existingVer: any = await db
      .prepare(`SELECT version FROM schema_migrations WHERE version = ?`)
      .bind(SCHEMA_VERSION)
      .first();
    if (existingVer?.version === SCHEMA_VERSION) {
      schemaBootstrapped = true;
      return;
    }
  } catch {
    // schema_migrations does not exist yet — run bootstrap & upgrade
  }

  for (const stmt of INIT_STATEMENTS) {
    try {
      await db.prepare(stmt).run();
    } catch (err) {
      console.error('Schema statement error:', err);
    }
  }

  const migrations = [
    'ALTER TABLE filter_rules ADD COLUMN geo_polygon_json TEXT',
    'ALTER TABLE filter_rules ADD COLUMN exclude_agency INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE filter_rules ADD COLUMN max_post_age_hours INTEGER NOT NULL DEFAULT 24',
    'ALTER TABLE filter_rules ADD COLUMN negative_keywords_json TEXT',
    'ALTER TABLE filter_rules ADD COLUMN show_btn_divar INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE filter_rules ADD COLUMN show_btn_map INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE filter_rules ADD COLUMN show_btn_score INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE filter_rules ADD COLUMN show_btn_contact INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE filter_rules ADD COLUMN album_followup_buttons INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE filter_rules ADD COLUMN source_divar INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE filter_rules ADD COLUMN source_sheypoor INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE channels ADD COLUMN contact_mobile TEXT',
    'ALTER TABLE channels ADD COLUMN contact_phone TEXT',
    'ALTER TABLE channels ADD COLUMN office_address TEXT',
    'ALTER TABLE channels ADD COLUMN brand_hashtags_json TEXT',
    'ALTER TABLE sync_state ADD COLUMN sheypoor_page INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE sync_state ADD COLUMN next_retry_at INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE sync_state ADD COLUMN is_auto_paused INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE sent_ads ADD COLUMN fingerprint TEXT',
    'ALTER TABLE sent_ads ADD COLUMN last_error_msg TEXT',
    'CREATE INDEX IF NOT EXISTS idx_sent_ads_fingerprint ON sent_ads(channel_id, fingerprint, discovered_at)'
  ];
  for (const mig of migrations) {
    try {
      await db.prepare(mig).run();
    } catch (_) {}
  }

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO users (telegram_id, username, full_name, role) VALUES (1000000, 'admin', 'مدیر سیستم', 'SUPERADMIN') ON CONFLICT(telegram_id) DO NOTHING`
      ),
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, starts_at, expires_at)
         VALUES ('sub_admin_vip', 1000000, 'AGENCY_VIP', 'ACTIVE', unixepoch(), unixepoch() + 315360000)
         ON CONFLICT(id) DO UPDATE SET status = 'ACTIVE', expires_at = unixepoch() + 315360000`
      ),
      db.prepare(
        `UPDATE channels
         SET contact_mobile = COALESCE(contact_mobile, '09922434338'),
             contact_phone = COALESCE(contact_phone, '01734241371'),
             office_address = COALESCE(office_address, 'علی‌آباد کتول، خیابان پاسداران (کمربندی قدیم)، نبش پاسداران ۸، املاک امیران'),
             brand_hashtags_json = COALESCE(brand_hashtags_json, '["#املاک_امیران","#علی_آباد_ملک"]')
         WHERE chat_id = '@aliabadmelk'`
      ),
      db.prepare(
        `UPDATE sync_state
         SET pagination_page = 1, sheypoor_page = 1, last_error_msg = NULL, consecutive_errors = 0
         WHERE phase = 'LIVE' AND pagination_page > 50`
      ),
      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).bind(SCHEMA_VERSION)
    ]);
  } catch (_) {}

  schemaBootstrapped = true;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Static Admin Assets fallback (wrangler [assets] handles /admin/* directly, this handles /admin without trailing slash)
    if (url.pathname === '/admin') {
      const redirectUrl = new URL('/admin/', url.origin);
      return Response.redirect(redirectUrl.toString(), 301);
    }
    if (url.pathname.startsWith('/admin/') && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    await ensureSchema(env.DB);

    // 2. Telegram Bot Webhook Endpoint
    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }

    // 3. REST API for Admin Panel (/api/admin/*)
    if (url.pathname.startsWith('/api/admin/')) {
      return handleAdminApi(request, env);
    }

    // 4. Manual Cron Trigger Endpoint for Admin Testing
    if (url.pathname === '/api/internal/cron-tick' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.ADMIN_MASTER_TOKEN || auth !== `Bearer ${env.ADMIN_MASTER_TOKEN}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      ctx.waitUntil(runScheduledTick(env));
      return new Response(JSON.stringify({ ok: true, status: 'Cron tick triggered asynchronously' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Hydra-Sender Real Estate Bot Edge Worker is running. Visit /admin/ for dashboard.', {
      status: 200
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await ensureSchema(env.DB);
    ctx.waitUntil(runScheduledTick(env));
  }
};
