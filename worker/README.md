# Hydra real-estate bot (Cloudflare Workers, free plan)

Telegram bot that watches Divar, scores new ads against each user's saved searches
(10–15 % tolerance on budget and area) and sends a card per match. Includes an admin panel
for subscriptions. Zero runtime dependencies.

```
src/core/     pure logic (no Cloudflare imports): normalize, match/score, card, access rules, range parser
src/          worker: bot (wizard), jobs (crawl + drain), admin API, Divar + Telegram clients
migrations/   D1 schema
public/admin/ admin panel (served by the same Worker at /admin/)
tools/divar-forwarder/  tiny relay for the proxy (see below)
test/         node:test suites, incl. end-to-end with in-memory SQLite
```

## Deploy

```bash
cd worker && npm install
npx wrangler d1 create hydra            # paste the database_id into wrangler.jsonc
# edit wrangler.jsonc -> routes[0].pattern = your subdomain (domain must be on your Cloudflare account)
npm run db:migrate

npx wrangler secret put BOT_TOKEN           # NEW bot from @BotFather (not the legacy bot's token)
npx wrangler secret put WEBHOOK_SECRET      # any long random string
npx wrangler secret put ADMIN_TOKEN         # any long random string; used to log in to /admin/
npx wrangler secret put DIVAR_PROXY_URL     # e.g. https://relay.example.com/forward  (optional)
npx wrangler secret put DIVAR_PROXY_SECRET  # same value as SECRET on the forwarder     (optional)
npm run deploy
```

Then open `https://<your-subdomain>/admin/`, log in with `ADMIN_TOKEN` and:

1. **اتصال‌ها → ثبت وب‌هوک تلگرام** (registers the webhook + bot commands).
2. **اتصال‌ها → تست اتصال به دیوار.** The result shows whether Divar is reachable, how many ads came back,
   and which labels/values the parser extracted from one real ad. If a field is missing, send that output
   back and the label map in `src/core/normalize.ts` gets adjusted.
3. **تنظیمات:** city ids, categories, tolerance, default plan, support contact.

Local checks: `npm test` (Node ≥ 22.6) and `npm run typecheck`.

## The proxy

Workers cannot use an HTTP/SOCKS proxy. If Divar is only reachable through your proxy host, run
`tools/divar-forwarder/server.mjs` there (behind HTTPS) and set `DIVAR_PROXY_URL` / `DIVAR_PROXY_SECRET`.
It only forwards to `api.divar.ir` and requires the shared secret. Without `DIVAR_PROXY_URL` the Worker calls Divar directly.

## Free-plan budget

* `*/5 * * * *` crawl: 1 search per category + detail fetches for unseen ads, capped by `crawl_budget` (default 40 of the 50 external subrequests).
* `* * * * *` drain: up to `drain_batch` (default 20) Telegram sends per minute from the D1 `outbox` table (a photo that Telegram rejects falls back to text, so up to 2 calls per card).
* D1 calls are not counted against the 50. Queues are not used (free quota is only 10k operations/day).
* Moving to a VPS later: `src/core/*` has no platform imports; replace `D1Database` access in `db.ts`/`jobs.ts` and the cron entry points.

## More sources (Sheypoor, Aryamarz, Amlak Mall, ...)

Besides Divar's JSON API, the crawler can read any classifieds site through its **public HTML pages**:
list page -> ad links (regex) -> ad page -> generic extraction (table rows, `<dt>/<dd>`, two-span list items,
"label: value" text, JSON-LD / `__NEXT_DATA__` blobs, `og:` tags). Sites are configured in the admin panel
(تنظیمات -> منابع HTML), no code change needed. Tokens are namespaced (`sheypoor:468031034`).

```json
[
  {
    "id": "sheypoor",
    "lists": [{ "url": "<newest-ads page for apartments for sale>", "deal": "buy", "property": "apartment" }],
    "linkPattern": "https://www\\.sheypoor\\.com/.*-\\d+\\.html",
    "idPattern": "-(\\d+)\\.html",
    "priceUnit": "toman",
    "maxDetails": 3
  }
]
```

The `linkPattern` above is a guess (one community tool documents Sheypoor ad URLs as ending in `-<id>.html`); it and the
list URLs must be confirmed on the real site. Workflow per site:

1. On the forwarder host set `ALLOWED_HOSTS=api.divar.ir,www.sheypoor.com,...`.
2. Admin -> اتصال‌ها -> **بررسی صفحه**: paste a list page URL plus a link regex. You get the matched ad links.
   Paste one ad URL: you get the extracted label/value rows and the normalized ad. If a field is wrong or missing,
   adjust the label map in `src/core/normalize.ts` (or send the output to be tuned).
3. Add the site to the `sites` setting. `priceUnit: "rial"` divides prices by 10.

Notes
* HTML parsing costs more CPU than Divar's JSON and the free plan allows 10 ms per invocation. `maxDetails` (default 3 per run)
  keeps it low; if you see CPU-limit errors, lower it to 1 or move to a paid plan/VPS.
* Check each site's terms and robots.txt before enabling it, and keep the request rate low (the budget settings do).
* Sites may block Cloudflare IPs; the forwarder host is the workaround.

## Legacy sender

The GitHub Actions sender on branch `HydraSender` is untouched and keeps running. Develop on a separate branch
(e.g. `next`) and merge only at release. The two bots use different Telegram tokens.
