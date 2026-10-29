import type { Env } from './env.ts';
import type { Ad } from './core/types.ts';
import { renderCard, type CardMatch } from './core/card.ts';

export interface TgResult { ok: boolean; status: number; result?: any; description?: string; retryAfter?: number }

export async function tg(env: Env, method: string, body: Record<string, unknown>): Promise<TgResult> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  return {
    ok: !!data?.ok, status: res.status, result: data?.result, description: data?.description,
    retryAfter: data?.parameters?.retry_after,
  };
}

export const sendText = (env: Env, chatId: number, text: string, extra: Record<string, unknown> = {}) =>
  tg(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

/** Photo + caption when the ad has an image; falls back to plain text if Telegram rejects the photo. */
export async function sendCard(env: Env, chatId: number, ad: Ad, m: CardMatch): Promise<TgResult> {
  const caption = renderCard(ad, m);
  if (ad.image) {
    const r = await tg(env, 'sendPhoto', { chat_id: chatId, photo: ad.image, caption, parse_mode: 'HTML' });
    if (r.ok || r.status === 429 || r.status === 403) return r;
  }
  return sendText(env, chatId, caption);
}
