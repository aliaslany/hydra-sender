#!/usr/bin/env bash
set -euo pipefail

echo "1. Installing dependencies..."
npm install

echo "2. Creating Cloudflare D1 database (if not exists)..."
# Note: After running `npx wrangler d1 create hydra-db`, ensure database_id in wrangler.toml is updated.
npx wrangler d1 execute hydra-db --remote --file=migrations/0001_init.sql

echo "3. Deploying Cloudflare Worker to https://hydra-bot.a77aslani.workers.dev..."
npx wrangler deploy

echo "4. Registering Telegram Webhook with my_chat_member support..."
if [[ -n "${BOT_TOKEN:-}" && -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"https://hydra-bot.a77aslani.workers.dev/webhook/telegram\",
      \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
      \"allowed_updates\": [\"message\", \"callback_query\", \"my_chat_member\", \"chat_member\"]
    }"
  echo ""
fi

echo "Deployment complete!"
