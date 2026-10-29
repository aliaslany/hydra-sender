import type { Env } from './env.ts';
import { json, safeEqual } from './util.ts';
import {
  audit, getPlan, getUser, grantStatement, loadSettings, rawSettings, DEFAULT_CATEGORIES, DEFAULT_SITES, SETTING_KEYS,
} from './db.ts';
import { searchTokens, fetchDetail } from './divar.ts';
import { collectRows, normalizeAd } from './core/normalize.ts';
import { extractLinks } from './core/html.ts';
import { pageToDetail, siteAd } from './core/sitepage.ts';
import { fetchHtml } from './http.ts';
import { MAX_TOLERANCE } from './core/types.ts';
import { tg } from './telegram.ts';

const DEFAULTS: Record<string, string> = {
  city_ids: '1', categories: JSON.stringify(DEFAULT_CATEGORIES), sites: JSON.stringify(DEFAULT_SITES), tolerance: '0.1', min_score: '60',
  crawl_budget: '40', drain_batch: '20', default_plan_id: '', support_contact: '', retention_days: '30',
};

const intOrNull = (v: unknown): number | null | undefined =>
  v === undefined ? undefined : v === null || v === '' ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : undefined;

function validateSetting(key: string, value: string): string | null {
  switch (key) {
    case 'categories': {
      try {
        const arr = JSON.parse(value);
        const ok = Array.isArray(arr) && arr.every((c) =>
          typeof c?.slug === 'string' && ['buy', 'rent'].includes(c.deal) &&
          ['apartment', 'villa', 'old', 'land', 'commercial', 'office'].includes(c.property));
        return ok ? null : 'categories must be [{slug, deal: buy|rent, property}]';
      } catch { return 'categories must be valid JSON'; }
    }
    case 'sites': {
      try {
        const arr = JSON.parse(value);
        if (!Array.isArray(arr)) return 'sites must be a JSON array';
        for (const x of arr) {
          if (!/^[a-z0-9_-]{2,20}$/.test(x?.id ?? '') || x.id === 'divar') return 'each site needs an id (a-z, 0-9, _ -, not "divar")';
          if (typeof x.linkPattern !== 'string') return `${x.id}: linkPattern is required`;
          try { new RegExp(x.linkPattern); if (x.idPattern) new RegExp(x.idPattern); } catch { return `${x.id}: invalid regex`; }
          if (!Array.isArray(x.lists) || !x.lists.length) return `${x.id}: lists must not be empty`;
          for (const l of x.lists) {
            if (!/^https?:\/\//.test(l?.url ?? '') || !['buy', 'rent'].includes(l.deal) ||
                !['apartment', 'villa', 'old', 'land', 'commercial', 'office'].includes(l.property)) return `${x.id}: each list needs url, deal, property`;
          }
        }
        return null;
      } catch { return 'sites must be valid JSON'; }
    }
    case 'tolerance': {
      const n = Number(value);
      return n >= 0 && n <= MAX_TOLERANCE ? null : `tolerance must be between 0 and ${MAX_TOLERANCE}`;
    }
    case 'min_score': { const n = Number(value); return n >= 0 && n <= 100 ? null : 'min_score must be 0-100'; }
    case 'crawl_budget': { const n = Number(value); return n >= 2 && n <= 45 ? null : 'crawl_budget must be 2-45 (free plan limit is 50)'; }
    case 'drain_batch': { const n = Number(value); return n >= 1 && n <= 24 ? null : 'drain_batch must be 1-24'; }
    case 'city_ids': return /^\d+(\s*,\s*\d+)*$/.test(value) ? null : 'city_ids must be comma-separated numbers';
    case 'default_plan_id': return value === '' || /^\d+$/.test(value) ? null : 'default_plan_id must be a plan id or empty';
    default: return null;
  }
}

export async function handleAdmin(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!env.ADMIN_TOKEN || !(await safeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`))) return json({ error: 'unauthorized' }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/admin/, '');
  const method = req.method;
  const db = env.DB;
  const body = method === 'POST' || method === 'PUT' ? await req.json<any>().catch(() => ({})) : {};

  if (path === '/stats' && method === 'GET') {
    const row = await db.prepare(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM searches WHERE is_active = 1) AS active_searches,
              (SELECT COUNT(*) FROM ads WHERE status = 'ok') AS ads,
              (SELECT COUNT(*) FROM outbox WHERE status = 'pending') AS pending,
              (SELECT COUNT(*) FROM outbox WHERE status = 'failed') AS failed`).first();
    return json(row);
  }

  if (path === '/users' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim();
    const like = `%${q}%`;
    const { results } = await db.prepare(
      `SELECT u.id, u.username, u.first_name, u.is_blocked, u.bot_stopped, u.plan_id, p.name AS plan_name,
              u.expires_at, u.searches_remaining, u.created_at
         FROM users u LEFT JOIN plans p ON p.id = u.plan_id
        WHERE ?1 = '' OR CAST(u.id AS TEXT) LIKE ?2 OR u.username LIKE ?2 OR u.first_name LIKE ?2
        ORDER BY u.created_at DESC LIMIT 100`).bind(q, like).all();
    return json(results);
  }

  let m = path.match(/^\/users\/(\d+)\/grant$/);
  if (m && method === 'POST') {
    const id = Number(m[1]);
    const user = await getUser(db, id);
    const plan = body.plan_id != null ? await getPlan(db, Number(body.plan_id)) : null;
    if (!user || !plan) return json({ error: 'user or plan not found' }, 404);
    await grantStatement(db, id, plan, 'days' in body ? intOrNull(body.days) : undefined, 'searches' in body ? intOrNull(body.searches) : undefined).run();
    await audit(db, 'grant', { user: id, plan: plan.id, days: body.days, searches: body.searches });
    return json({ ok: true });
  }

  m = path.match(/^\/users\/(\d+)\/block$/);
  if (m && method === 'POST') {
    await db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').bind(body.blocked ? 1 : 0, Number(m[1])).run();
    await audit(db, body.blocked ? 'block' : 'unblock', { user: Number(m[1]) });
    return json({ ok: true });
  }

  if (path === '/plans' && method === 'GET') return json((await db.prepare('SELECT * FROM plans ORDER BY id').all()).results);
  if (path === '/plans' && method === 'POST') {
    const name = String(body.name ?? '').trim();
    if (!name) return json({ error: 'name is required' }, 400);
    const r = await db.prepare('INSERT INTO plans (name, is_paid, duration_days, max_searches, price) VALUES (?,?,?,?,?)')
      .bind(name, body.is_paid ? 1 : 0, intOrNull(body.duration_days) ?? null, intOrNull(body.max_searches) ?? null, intOrNull(body.price) ?? null).run();
    await audit(db, 'plan_create', { name });
    return json({ ok: true, id: r.meta.last_row_id });
  }

  if (path === '/settings' && method === 'GET') {
    const raw = await rawSettings(db);
    return json(Object.fromEntries(SETTING_KEYS.map((k) => [k, raw[k] ?? DEFAULTS[k]])));
  }
  if (path === '/settings' && method === 'PUT') {
    const stmts: D1PreparedStatement[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (!(SETTING_KEYS as readonly string[]).includes(k)) return json({ error: `unknown setting ${k}` }, 400);
      const err = validateSetting(k, String(v));
      if (err) return json({ error: err }, 400);
      stmts.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v)));
    }
    if (stmts.length) await db.batch(stmts);
    await audit(db, 'settings', Object.keys(body));
    return json({ ok: true });
  }

  // Connectivity check: Divar (through the forwarder if configured) + a dump of what the parser sees.
  if (path === '/spike' && method === 'GET') {
    const s = await loadSettings(db);
    const cat = s.categories[0];
    const out: Record<string, unknown> = { via: env.DIVAR_PROXY_URL ? 'forwarder' : 'direct', category: cat };
    const search = await searchTokens(env, s.cityIds, cat.slug);
    out.search = { ok: search.ok, status: search.status, tokens: search.tokens.length, topKeys: Object.keys(search.body ?? {}) };
    if (!search.ok) out.search = { ...(out.search as object), bodySample: JSON.stringify(search.body)?.slice(0, 300) };
    if (search.tokens[0]) {
      const d = await fetchDetail(env, search.tokens[0]);
      out.detail = {
        ok: d.ok, status: d.status, topKeys: Object.keys(d.json ?? {}),
        rows: collectRows(d.json).slice(0, 80).map((r) => [r.label, r.value ?? null, r.disabled ?? false]),
        ad: d.ok ? normalizeAd(search.tokens[0], d.json, cat) : null,
      };
    }
    return json(out);
  }

  // Inspect any public listing/list page through the same fetch path the crawler uses.
  if (path === '/probe' && method === 'GET') {
    const target = url.searchParams.get('url') ?? '';
    if (!/^https?:\/\//.test(target)) return json({ error: 'url must start with http:// or https://' }, 400);
    const page = await fetchHtml(env, target, url.searchParams.get('proxy') !== '0');
    const out: Record<string, unknown> = { via: env.DIVAR_PROXY_URL ? 'forwarder' : 'direct', status: page.status, bytes: page.html.length };
    if (page.ok) {
      const detail = pageToDetail(page.html);
      out.title = detail.share.title;
      out.jsonBlobs = detail.json.length;
      out.rows = collectRows(detail).slice(0, 80).map((r) => [r.label, r.value ?? null]);
      const pattern = url.searchParams.get('pattern');
      if (pattern) {
        try { out.matchedLinks = extractLinks(page.html, target, new RegExp(pattern)).slice(0, 20); }
        catch { out.matchedLinks = 'invalid pattern'; }
      } else {
        out.sampleLinks = extractLinks(page.html, target, /./).slice(0, 25);
      }
      const deal = url.searchParams.get('deal') === 'rent' ? 'rent' : 'buy';
      out.ad = siteAd(page.html, target, 'probe', { id: 'probe', lists: [], linkPattern: '.', priceUnit: url.searchParams.get('unit') === 'rial' ? 'rial' : 'toman' }, { deal, property: 'apartment' });
    }
    return json(out);
  }

  if (path === '/telegram/setup' && method === 'POST') {
    const hook = `${url.origin}/telegram`;
    const set = await tg(env, 'setWebhook', { url: hook, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] });
    const cmds = await tg(env, 'setMyCommands', { commands: [
      { command: 'search', description: 'جستجوی جدید' }, { command: 'mysearches', description: 'جستجوهای من' },
      { command: 'status', description: 'وضعیت اشتراک' }, { command: 'help', description: 'راهنما' },
    ] });
    return json({ webhook: hook, setWebhook: set.ok ? 'ok' : set.description, setMyCommands: cmds.ok ? 'ok' : cmds.description });
  }

  return json({ error: 'not found' }, 404);
}
