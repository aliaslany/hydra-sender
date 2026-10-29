import type { Env } from './env.ts';
import { handleUpdate } from './bot.ts';
import { handleAdmin } from './admin.ts';
import { crawl, drain } from './jobs.ts';
import { safeEqual } from './util.ts';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/telegram' && req.method === 'POST') {
      const secret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
      if (!env.WEBHOOK_SECRET || !(await safeEqual(secret, env.WEBHOOK_SECRET))) return new Response('forbidden', { status: 403 });
      const update = await req.json().catch(() => null);
      if (update) ctx.waitUntil(handleUpdate(env, update).catch((e) => console.error('update failed', e)));
      return new Response('ok');                       // answer fast so Telegram does not retry
    }

    if (url.pathname.startsWith('/api/admin/')) return handleAdmin(req, env);
    if (url.pathname === '/') return Response.redirect(`${url.origin}/admin/`, 302);
    return env.ASSETS.fetch(req);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Two crons: "*/5 * * * *" crawls Divar, "* * * * *" delivers pending notifications.
    const job = event.cron === '*/5 * * * *' ? crawl(env) : drain(env);
    ctx.waitUntil(job.catch((e) => console.error('job failed', event.cron, e)));
  },
};
