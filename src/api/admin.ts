import { Env, FilterRule } from '../types';
import { fetchDivarPostDetail } from '../divar/scraper';
import { evaluateAdMatch } from '../engine/scorer';
import { buildTelegramCardPayload } from '../telegram/cardBuilder';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data'
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  });
}

export async function handleAdminApi(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!env.ADMIN_MASTER_TOKEN || token !== env.ADMIN_MASTER_TOKEN) {
    return jsonResponse({ error: 'Unauthorized: Invalid ADMIN_MASTER_TOKEN' }, 401);
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 1. GET /api/admin/overview
  if (path === '/api/admin/overview' && request.method === 'GET') {
    const [subsCount, chCount, rulesRows, sentToday] = await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'ACTIVE'`),
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM channels WHERE is_enabled = 1`),
      env.DB.prepare(
        `SELECT r.*, c.chat_id, s.phase, s.backfill_target_count, s.backfill_dispatched_count
         FROM filter_rules r
         LEFT JOIN channels c ON r.channel_id = c.id
         LEFT JOIN sync_state s ON r.id = s.rule_id
         ORDER BY r.created_at DESC`
      ),
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM sent_ads WHERE status = 'SENT' AND sent_at >= unixepoch() - 86400`)
    ]);

    const rules = (rulesRows.results || []) as any[];
    const backfillRules = rules.filter((r) => r.phase === 'BACKFILL').length;
    const liveRules = rules.filter((r) => r.phase === 'LIVE').length;

    return jsonResponse({
      overview: {
        activeSubscriptions: (subsCount.results?.[0] as any)?.cnt || 0,
        activeChannels: (chCount.results?.[0] as any)?.cnt || 0,
        backfillRules,
        liveRules,
        adsSentToday: (sentToday.results?.[0] as any)?.cnt || 0
      },
      rules
    });
  }

  // 2. GET & POST /api/admin/rules
  if (path === '/api/admin/rules' && request.method === 'POST') {
    const body: any = await request.json();
    const chatId: string = (body.channel_chat_id || '@somechannel').trim();
    const channelId = `ch_${chatId.replace(/[^a-zA-Z0-9]/g, '')}`;
    const ruleId = `rule_${Date.now()}`;
    const ownerId = Number(body.owner_user_id) || 1000000;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (telegram_id, role) VALUES (?, 'SUPERADMIN') ON CONFLICT(telegram_id) DO NOTHING`
      ).bind(ownerId),
      env.DB.prepare(
        `INSERT INTO channels (id, owner_user_id, chat_id, title, bot_is_admin, can_post_messages, is_enabled)
         VALUES (?, ?, ?, ?, 1, 1, 1)
         ON CONFLICT(chat_id) DO UPDATE SET is_enabled=1`
      ).bind(channelId, ownerId, chatId, chatId),
      env.DB.prepare(
        `INSERT INTO filter_rules (
          id, channel_id, owner_user_id, name, is_active,
          city_ids_json, districts_json, deal_type, property_type, divar_category_slug,
          min_budget, max_budget, min_rent, max_rent, min_area, max_area,
          tolerance_pct, min_match_score, stage2_filters_json
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        ruleId,
        channelId,
        ownerId,
        body.name || 'فیلتر جدید',
        JSON.stringify(body.city_ids || ['1']),
        JSON.stringify(body.districts || []),
        body.deal_type || 'BUY',
        body.property_type || 'APARTMENT',
        body.divar_category_slug || 'apartment-sell',
        Number(body.min_budget) || 0,
        Number(body.max_budget) || 0,
        Number(body.min_rent) || 0,
        Number(body.max_rent) || 0,
        Number(body.min_area) || 0,
        Number(body.max_area) || 0,
        Number(body.tolerance_pct) || 0.15,
        Number(body.min_match_score) || 65,
        JSON.stringify(body.stage2_filters || {})
      ),
      env.DB.prepare(
        `INSERT INTO sync_state (rule_id, phase, backfill_target_count) VALUES (?, 'BACKFILL', ?)`
      ).bind(ruleId, Number(body.backfill_target_count) ?? 30)
    ]);

    return jsonResponse({ ok: true, rule_id: ruleId });
  }

  // 3. POST /api/admin/subscriptions (Grant manual access or plan to user)
  if (path === '/api/admin/subscriptions' && request.method === 'POST') {
    const body: any = await request.json();
    const userId = Number(body.telegram_id);
    const planId = body.plan_id || 'PRO_MONTH';
    const durationDays = Number(body.duration_days) || 30;
    const now = Math.floor(Date.now() / 1000);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (telegram_id, role) VALUES (?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET role=excluded.role`
      ).bind(userId, body.role || 'USER'),
      env.DB.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, starts_at, expires_at, max_total_searches)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`
      ).bind(`sub_${userId}_${now}`, userId, planId, now, now + durationDays * 86400, body.max_total_searches || null)
    ]);

    return jsonResponse({ ok: true, user_id: userId, plan_id: planId });
  }

  // 4. POST /api/admin/test-score (Live Divar Ad Simulator)
  if (path === '/api/admin/test-score' && request.method === 'POST') {
    const body: any = await request.json();
    const postToken: string = (body.token || '').trim();
    const ruleRow: any = body.rule_id
      ? await env.DB.prepare(`SELECT * FROM filter_rules WHERE id = ?`).bind(body.rule_id).first()
      : null;

    const mockRule: FilterRule = ruleRow || {
      id: 'sim_rule',
      channel_id: 'sim_ch',
      owner_user_id: 1,
      name: 'شبیه‌ساز',
      is_active: 1,
      city_ids_json: '["1"]',
      districts_json: '[]',
      deal_type: 'BUY',
      property_type: 'APARTMENT',
      divar_category_slug: 'apartment-sell',
      min_budget: 0,
      max_budget: Number(body.max_budget) || 12000000000,
      min_rent: 0,
      max_rent: 0,
      allow_rahn_conversion: 1,
      max_price_per_m2: 0,
      min_area: Number(body.min_area) || 85,
      max_area: Number(body.max_area) || 140,
      tolerance_pct: 0.15,
      min_match_score: 65,
      stage2_filters_json: JSON.stringify({ parking: true, elevator: true, storage: true })
    };

    const ad = await fetchDivarPostDetail(postToken, mockRule.deal_type, env);
    if (!ad) {
      return jsonResponse({ error: 'Ad token not found or unreachable on Divar' }, 404);
    }

    const matchResult = evaluateAdMatch(ad, mockRule);
    const cardPreview = buildTelegramCardPayload(ad, matchResult, mockRule, '@preview_channel', false);

    return jsonResponse({ ad, matchResult, cardPreview });
  }

  return jsonResponse({ error: 'Route not found' }, 404);
}
