# Hydra Real Estate Bot (Cloudflare Workers, Free Plan) 🏢⚡

Telegram bot and crawling platform deployed at the edge on Cloudflare Workers and Cloudflare D1. Ingests real estate listings across Divar, Sheypoor, Ariamarz, and generic HTML classifieds, computes a 10–15% tolerance score, delivers Persian Card Views, and provides a web-based Admin Dashboard.

---

## 📂 Architecture Overview

```
src/core/               pure logic (0 Cloudflare imports): normalize, match/score, card, access rules, range parser
src/                    worker runtime: bot wizard (/telegram), jobs (crawl + drain), admin API, portal clients
migrations/             D1 schema definition (auto-applied at runtime via ensureSchema)
public/admin/           Admin Dashboard SPA (served at /admin/)
tools/divar-forwarder/  Optional lightweight relay for external IP masking / proxying
test/                   24 automated test suites (node:test) with in-memory SQLite
```

- **Detailed System Architecture:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- **Requirements & Checklist Matrix:** [`../REQUIREMENTS.md`](../REQUIREMENTS.md)

---

## 🚀 Live Production Deployment

- **Worker Base URL:** `https://hydra-bot.a77aslani.workers.dev`
- **Admin Dashboard:** `https://hydra-bot.a77aslani.workers.dev/admin/`
- **Telegram Webhook:** `https://hydra-bot.a77aslani.workers.dev/telegram`
- **Telegram Bot:** [@hydrasendertelBot](https://t.me/hydrasendertelBot)
- **Cloudflare D1 Database ID:** `3874e7bc-cbea-4954-9003-77584d82f489`

---

## 🛠 Setup & Deployment

### 1. Install Dependencies
```bash
cd worker
npm install --legacy-peer-deps
```

### 2. Configure D1 Database
In `wrangler.jsonc`, the database binding is configured as:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "hydra",
    "database_id": "3874e7bc-cbea-4954-9003-77584d82f489"
  }
]
```
*(Note: Tables auto-bootstrap on the worker's first invocation via `ensureSchema` in `src/db.ts`)*

### 3. Set Cloudflare Worker Secrets
```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"

npx wrangler secret put BOT_TOKEN           # Bot token from @BotFather
npx wrangler secret put WEBHOOK_SECRET      # Webhook validation secret
npx wrangler secret put ADMIN_TOKEN         # Authentication token for /admin/
npx wrangler secret put DIVAR_PROXY_URL     # Optional proxy forwarder URL
npx wrangler secret put DIVAR_PROXY_SECRET  # Optional proxy secret
```

### 4. Deploy to Cloudflare
```bash
npm run deploy
```

### 5. Post-Deploy Configuration
1. Open `https://<your-worker-subdomain>/admin/` and authenticate using `ADMIN_TOKEN`.
2. Navigate to **اتصال‌ها** → Click **ثبت وب‌هوک تلگرام** to bind the webhook.
3. Click **تست اتصال به دیوار** to verify live portal crawling.
4. Customize search cities, categories, tolerance caps, and subrequest budgets under **تنظیمات**.

---

## 🧪 Automated Testing

All tests use Node.js's native test runner without third-party dependencies:
```bash
npm test
```
Runs 24 tests across unit parsers, scoring algorithms, end-to-end SQLite pipelines, and real Sheypoor/Ariamarz JSON-LD extracts.

---

## ⏱ Cron Execution & Free-Tier Budgeting

* `*/5 * * * *` (Ingestion): Searches configured categories, extracts details for unseen ads, capped by `crawl_budget` (40 subrequests).
* `* * * * *` (Drain): Pops up to 20 queued cards per minute from the D1 `outbox` table and delivers them to Telegram.
* `src/core/*` has zero platform dependencies — easily portable to Node.js / VPS if scaling beyond the free tier.
