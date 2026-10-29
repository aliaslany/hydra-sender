#!/usr/bin/env bash
set -euo pipefail

# Hydra Bot Automated Cloudflare Deployment Script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "=== Hydra Real Estate Bot: Cloudflare Deployment ==="

# Load .env.deploy if exists
if [ -f "$DIR/.env.deploy" ]; then
  echo "Loading variables from .env.deploy..."
  # shellcheck disable=SC1091
  source "$DIR/.env.deploy"
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set."
  echo "Please set CLOUDFLARE_API_TOKEN in your environment or create worker/.env.deploy"
  echo "Example:"
  echo "  CLOUDFLARE_API_TOKEN=your_token_here"
  echo "  CLOUDFLARE_ACCOUNT_ID=your_account_id_here"
  echo "  BOT_TOKEN=your_telegram_bot_token"
  exit 1
fi

if [ -z "${BOT_TOKEN:-}" ]; then
  echo "Error: BOT_TOKEN (Telegram bot token) is not set."
  exit 1
fi

ADMIN_TOKEN="${ADMIN_TOKEN:-$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | head -c 32)}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | head -c 32)}"

echo "1. Checking D1 Database..."
D1_ID=""
# Check if database hydra already exists
D1_LIST=$(npx wrangler d1 list --json 2>/dev/null || echo "[]")
EXISTING_ID=$(echo "$D1_LIST" | grep -o '"uuid":"[^"]*"' | head -n 1 | cut -d'"' -f4 || true)

if [ -n "$EXISTING_ID" ]; then
  echo "Found existing D1 database: $EXISTING_ID"
  D1_ID="$EXISTING_ID"
else
  echo "Creating new D1 database: hydra..."
  D1_CREATE_OUTPUT=$(npx wrangler d1 create hydra || true)
  D1_ID=$(echo "$D1_CREATE_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2 || true)
  if [ -z "$D1_ID" ]; then
    D1_ID=$(echo "$D1_CREATE_OUTPUT" | grep -E '[a-f0-9-]{36}' -o | head -n 1 || true)
  fi
fi

if [ -z "$D1_ID" ]; then
  echo "Warning: Could not automatically parse D1 ID. Checking wrangler.jsonc..."
else
  echo "Configuring database_id ($D1_ID) in wrangler.jsonc..."
  sed -i '' "s/REPLACE_WITH_D1_ID/$D1_ID/g" wrangler.jsonc 2>/dev/null || sed -i "s/REPLACE_WITH_D1_ID/$D1_ID/g" wrangler.jsonc
fi

echo "2. Applying database migrations to Cloudflare D1..."
npx wrangler d1 migrations apply hydra --remote --yes

echo "3. Setting Cloudflare Worker secrets..."
echo "$BOT_TOKEN" | npx wrangler secret put BOT_TOKEN
echo "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
echo "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET

if [ -n "${DIVAR_PROXY_URL:-}" ]; then
  echo "$DIVAR_PROXY_URL" | npx wrangler secret put DIVAR_PROXY_URL
fi
if [ -n "${DIVAR_PROXY_SECRET:-}" ]; then
  echo "$DIVAR_PROXY_SECRET" | npx wrangler secret put DIVAR_PROXY_SECRET
fi

echo "4. Deploying Worker to Cloudflare..."
DEPLOY_OUTPUT=$(npx wrangler deploy)
echo "$DEPLOY_OUTPUT"

# Extract deployed worker URL
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^ ]*\.workers\.dev' | head -n 1 || true)
if [ -z "$WORKER_URL" ] && [ -n "${CUSTOM_DOMAIN:-}" ]; then
  WORKER_URL="https://$CUSTOM_DOMAIN"
fi

if [ -n "$WORKER_URL" ]; then
  echo "5. Registering Telegram Webhook..."
  WEBHOOK_URL="$WORKER_URL/webhook"
  SET_WEBHOOK_RES=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
    -d "url=${WEBHOOK_URL}" \
    -d "secret_token=${WEBHOOK_SECRET}")
  echo "Telegram Webhook Response: $SET_WEBHOOK_RES"
fi

echo "======================================================="
echo "🎉 DEPLOYMENT COMPLETE!"
if [ -n "$WORKER_URL" ]; then
  echo "Bot Webhook: $WORKER_URL/webhook"
  echo "Admin Dashboard: $WORKER_URL/admin/"
fi
echo "Admin Token: $ADMIN_TOKEN"
echo "Keep your Admin Token safe; use it to log in to the admin panel."
echo "======================================================="
