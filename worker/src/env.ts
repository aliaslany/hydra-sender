export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  ADMIN_TOKEN: string;
  DIVAR_PROXY_URL?: string;     // forwarder endpoint, see tools/divar-forwarder
  DIVAR_PROXY_SECRET?: string;
}
