-- Plans: free or paid, limited by days and/or number of searches (NULL = unlimited)
CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER,
  max_searches INTEGER,
  price INTEGER
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,               -- Telegram user id
  chat_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  is_blocked INTEGER NOT NULL DEFAULT 0,   -- blocked by admin
  bot_stopped INTEGER NOT NULL DEFAULT 0,  -- user blocked the bot on Telegram
  plan_id INTEGER REFERENCES plans(id),
  expires_at INTEGER,                   -- unix seconds, NULL = no time limit
  searches_remaining INTEGER,           -- NULL = unlimited
  wizard TEXT,                          -- JSON state of the search wizard
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  deal TEXT NOT NULL,                   -- buy | rent
  property TEXT NOT NULL,
  criteria TEXT NOT NULL,               -- JSON (see src/core/types.ts)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_searches_lookup ON searches(is_active, deal, property);

CREATE TABLE ads (
  token TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ok',    -- ok | failed
  deal TEXT, property TEXT,
  title TEXT, url TEXT, image TEXT, district TEXT,
  total INTEGER, per_m2 INTEGER, deposit INTEGER, rent INTEGER,
  area INTEGER, rooms INTEGER, floor INTEGER, year INTEGER,
  parking INTEGER, storage INTEGER, elevator INTEGER, balcony INTEGER,
  orientation TEXT, structure TEXT, cabinet TEXT, cooling TEXT, heating TEXT,
  first_seen INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ads_seen ON ads(first_seen);

-- Pending/sent notifications. Drained by the per-minute cron (no Queues needed).
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  search_id INTEGER NOT NULL,
  ad_token TEXT NOT NULL,
  score INTEGER,                        -- NULL = nothing measurable
  checked INTEGER NOT NULL DEFAULT 0,
  asked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at INTEGER,
  UNIQUE (search_id, ad_token)
);
CREATE INDEX idx_outbox_status ON outbox(status, id);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL DEFAULT (unixepoch()),
  action TEXT NOT NULL,
  detail TEXT
);

INSERT INTO plans (id, name, is_paid, duration_days, max_searches, price) VALUES (1, 'آزمایشی رایگان', 0, 7, 2, 0);
INSERT INTO settings (key, value) VALUES ('default_plan_id', '1');
