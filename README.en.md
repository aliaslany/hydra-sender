# Hydra Real Estate Bot (ربات هوشمند املاک هیدرا) 🏠🤖

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Edge-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://hydra-bot.a77aslani.workers.dev/admin/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-SQLite-0284c7?style=for-the-badge&logo=sqlite&logoColor=white)](migrations/0001_init.sql)
[![Vitest](https://img.shields.io/badge/Tests-26_Passing-10b981?style=for-the-badge)](tests)
[![Website](https://img.shields.io/badge/Website-hydra.startstar.ir-0f766e?style=for-the-badge)](https://hydra.startstar.ir/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-aliaslanik-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/aliaslanik)

🌐 **[Live Product Website](https://hydra.startstar.ir/)** · 📘 **[SEO & Architecture Guide](https://hydra.startstar.ir/seo.html)** · 🖥 **[Admin Dashboard](https://hydra-bot.a77aslani.workers.dev/admin/)** · 🤖 **[@hydrasendertelBot](https://t.me/hydrasendertelBot)** · 📢 **[@aliabadmelk](https://t.me/aliabadmelk)** · 🇮🇷 **[نسخه فارسی (پیش‌فرض)](README.md)**

> 📌 **Repository Split Notice:**  
> The legacy 4-messenger Python broadcaster (`Telegram / Bale / Rubika / Eitaa`) has been preserved intact on branch/tag [`legacy-hydra-sender`](https://github.com/aliaslany/hydra-sender/tree/legacy-hydra-sender). The active `HydraSender` branch is now dedicated exclusively to the serverless **Cloudflare Workers Real Estate Ads Bot**.

---

## Core Capabilities

- **Dual-Source Real Estate Ingestion (`Divar API v8` + `Sheypoor API v10`):** Multi-city slug support (`resolveSheypoorCitySlugs`), independent pagination cursors (`pagination_page` & `sheypoor_page`), fair token interleaving (`interleaveSourceTokens`), and filtering out promoted cross-city `paidEngagement` blocks.
- **Two-Stage Tolerance Scoring & Persian NLP (`src/engine/scorer.ts`):** Authoritative deal-type & property-category classification (`inferDealType`, `inferPropertyCategory`, `doesPropertyCategoryMatch`), ±0–25% tolerance evaluation, 3% rahn conversion, negation-aware Persian spec extraction (`ندارد` / Unicode word boundaries), and broker/agency exclusion.
- **Geo-Fence & District Enforcement:** Interactive Leaflet polygon drawing plus district validation (`parseNormalizedDistricts` / `doesDistrictMatch`).
- **Cross-Source Deduplication (72h):** Tight structural fingerprints (`computeAdFingerprint`) suppress only opposite-source duplicates (`Divar <-> Sheypoor`) per channel without suppressing distinct same-source properties.
- **Resilient Telegram Delivery (`src/telegram/`):** Multi-photo album sending (`sendMediaGroup`) with automatic `sendPhoto` -> `sendMessage` fallback on CDN media errors, HTML caption links, per-channel branding, interactive 7-step Telegram wizard, and subscription quota enforcement.
- **Edge Admin Dashboard (`public/admin/`):** Served statically via Workers `[assets]` with Dark/Light modes, RTL Vazirmatn typography, Leaflet polygon editor, Stage-2 form controls, endless status-filtered activity log, error diagnostics, and live token scoring simulator.

---

## Verification

```bash
npm install
npm run typecheck
npm test
```

Latest verified test run: **5 test files / 26 tests passing** (`tests/scorer.test.ts`, `tests/sheypoor.test.ts`, `tests/scheduler.test.ts`, `tests/geo.test.ts`, `tests/cardBuilder.test.ts`).

---

## Creator & Contact

- **Ali Aslani (علی اصلانی)**
- 💼 **LinkedIn:** [https://www.linkedin.com/in/aliaslanik](https://www.linkedin.com/in/aliaslanik)
- 💻 **GitHub:** [https://github.com/aliaslany/hydra-sender](https://github.com/aliaslany/hydra-sender)
- 🌐 **Website:** [https://hydra.startstar.ir/](https://hydra.startstar.ir/)
