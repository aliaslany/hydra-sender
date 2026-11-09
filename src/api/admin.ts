import { Env, FilterRule } from '../types';
import { fetchDivarPostDetail } from '../divar/scraper';
import { evaluateAdMatch } from '../engine/scorer';
import { buildTelegramCardPayload } from '../telegram/cardBuilder';
import { runScheduledTick } from '../cron/scheduler';

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
    const [subsCount, chCount, rulesRows, sentToday, recentSentRows] = await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'ACTIVE'`),
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM channels WHERE is_enabled = 1`),
      env.DB.prepare(
        `SELECT r.*, c.chat_id, s.phase, s.backfill_target_count, s.backfill_dispatched_count, s.consecutive_errors, s.last_error_msg, s.last_polled_at
         FROM filter_rules r
         LEFT JOIN channels c ON r.channel_id = c.id
         LEFT JOIN sync_state s ON r.id = s.rule_id
         ORDER BY r.created_at DESC`
      ),
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM sent_ads WHERE status = 'SENT' AND sent_at >= unixepoch() - 86400`),
      env.DB.prepare(
        `SELECT sa.rule_id, sa.post_token, sa.match_score, sa.status, sa.sent_at, r.name as rule_name, c.chat_id
         FROM sent_ads sa
         JOIN filter_rules r ON sa.rule_id = r.id
         JOIN channels c ON sa.channel_id = c.id
         ORDER BY sa.discovered_at DESC
         LIMIT 10`
      )
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
      rules,
      recentSent: recentSentRows.results || []
    });
  }

  // 2. GET & POST /api/admin/rules
  if (path === '/api/admin/rules' && request.method === 'GET') {
    const res = await env.DB.prepare(
      `SELECT r.*, c.chat_id, s.phase, s.backfill_target_count, s.backfill_dispatched_count, s.consecutive_errors, s.last_error_msg
       FROM filter_rules r
       LEFT JOIN channels c ON r.channel_id = c.id
       LEFT JOIN sync_state s ON r.id = s.rule_id
       ORDER BY r.created_at DESC`
    ).all();
    return jsonResponse({ rules: res.results || [] });
  }

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

  // Edit Rule: PUT /api/admin/rules/:id
  const matchRuleId = path.match(/^\/api\/admin\/rules\/([^\/]+)$/);
  if (matchRuleId && request.method === 'PUT') {
    const ruleId = matchRuleId[1];
    const body: any = await request.json();
    await env.DB.prepare(
      `UPDATE filter_rules SET
        name = ?,
        divar_category_slug = ?,
        deal_type = ?,
        property_type = ?,
        city_ids_json = ?,
        districts_json = ?,
        min_budget = ?,
        max_budget = ?,
        min_rent = ?,
        max_rent = ?,
        min_area = ?,
        max_area = ?,
        tolerance_pct = ?,
        min_match_score = ?,
        stage2_filters_json = ?,
        updated_at = unixepoch()
      WHERE id = ?`
    ).bind(
      body.name,
      body.divar_category_slug || 'apartment-sell',
      body.deal_type || 'BUY',
      body.property_type || 'APARTMENT',
      JSON.stringify(body.city_ids || ['1']),
      JSON.stringify(body.districts || []),
      Number(body.min_budget) || 0,
      Number(body.max_budget) || 0,
      Number(body.min_rent) || 0,
      Number(body.max_rent) || 0,
      Number(body.min_area) || 0,
      Number(body.max_area) || 0,
      Number(body.tolerance_pct) || 0.15,
      Number(body.min_match_score) || 65,
      JSON.stringify(body.stage2_filters || {}),
      ruleId
    ).run();

    if (body.reset_backfill === true) {
      await env.DB.prepare(
        `UPDATE sync_state SET phase = 'BACKFILL', backfill_queued_count = 0, backfill_dispatched_count = 0, pagination_cursor_date = null WHERE rule_id = ?`
      ).bind(ruleId).run();
    }

    return jsonResponse({ ok: true, rule_id: ruleId });
  }

  // Delete Rule: DELETE /api/admin/rules/:id
  if (matchRuleId && request.method === 'DELETE') {
    const ruleId = matchRuleId[1];
    await env.DB.prepare(`DELETE FROM filter_rules WHERE id = ?`).bind(ruleId).run();
    return jsonResponse({ ok: true, deleted_rule_id: ruleId });
  }

  // Toggle Rule Status: POST /api/admin/rules/:id/toggle
  const matchRuleToggle = path.match(/^\/api\/admin\/rules\/([^\/]+)\/toggle$/);
  if (matchRuleToggle && request.method === 'POST') {
    const ruleId = matchRuleToggle[1];
    await env.DB.prepare(`UPDATE filter_rules SET is_active = (CASE WHEN is_active = 1 THEN 0 ELSE 1 END) WHERE id = ?`).bind(ruleId).run();
    const updated: any = await env.DB.prepare(`SELECT is_active FROM filter_rules WHERE id = ?`).bind(ruleId).first();
    return jsonResponse({ ok: true, rule_id: ruleId, is_active: updated?.is_active });
  }

  // 3. Channels Management: GET & POST & DELETE /api/admin/channels
  if (path === '/api/admin/channels' && request.method === 'GET') {
    const res = await env.DB.prepare(
      `SELECT c.*, u.username as owner_username, u.full_name as owner_name,
              COUNT(r.id) as rule_count
       FROM channels c
       LEFT JOIN users u ON c.owner_user_id = u.telegram_id
       LEFT JOIN filter_rules r ON c.id = r.channel_id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    ).all();
    return jsonResponse({ channels: res.results || [] });
  }

  if (path === '/api/admin/channels' && request.method === 'POST') {
    const body: any = await request.json();
    const chatId: string = (body.chat_id || '').trim();
    if (!chatId) return jsonResponse({ error: 'chat_id is required' }, 400);
    const channelId = `ch_${chatId.replace(/[^a-zA-Z0-9]/g, '')}`;
    const ownerId = Number(body.owner_user_id) || 1000000;

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (telegram_id, role) VALUES (?, 'SUPERADMIN') ON CONFLICT(telegram_id) DO NOTHING`).bind(ownerId),
      env.DB.prepare(
        `INSERT INTO channels (id, owner_user_id, chat_id, title, bot_is_admin, can_post_messages, is_enabled)
         VALUES (?, ?, ?, ?, 1, 1, 1)
         ON CONFLICT(chat_id) DO UPDATE SET is_enabled=1, title=excluded.title`
      ).bind(channelId, ownerId, chatId, body.title || chatId)
    ]);
    return jsonResponse({ ok: true, channel_id: channelId });
  }

  const matchChannelToggle = path.match(/^\/api\/admin\/channels\/([^\/]+)\/toggle$/);
  if (matchChannelToggle && request.method === 'POST') {
    const chId = matchChannelToggle[1];
    await env.DB.prepare(`UPDATE channels SET is_enabled = (CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END) WHERE id = ?`).bind(chId).run();
    const updated: any = await env.DB.prepare(`SELECT is_enabled FROM channels WHERE id = ?`).bind(chId).first();
    return jsonResponse({ ok: true, channel_id: chId, is_enabled: updated?.is_enabled });
  }

  const matchChannelDelete = path.match(/^\/api\/admin\/channels\/([^\/]+)$/);
  if (matchChannelDelete && request.method === 'DELETE') {
    const chId = matchChannelDelete[1];
    await env.DB.prepare(`DELETE FROM channels WHERE id = ?`).bind(chId).run();
    return jsonResponse({ ok: true, deleted_channel_id: chId });
  }

  // 4. Subscriptions & Users Management: GET & POST /api/admin/subscriptions
  if (path === '/api/admin/subscriptions' && request.method === 'GET') {
    const [usersRes, plansRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT u.*, s.id as sub_id, s.plan_id, s.status as sub_status, s.starts_at, s.expires_at,
                s.searches_used_today, s.total_ads_sent, p.name_fa as plan_name, p.daily_ad_quota
         FROM users u
         LEFT JOIN subscriptions s ON u.telegram_id = s.user_id AND s.status = 'ACTIVE'
         LEFT JOIN plans p ON s.plan_id = p.id
         ORDER BY u.created_at DESC`
      ),
      env.DB.prepare(`SELECT * FROM plans WHERE is_active = 1 ORDER BY price_toman ASC`)
    ]);
    return jsonResponse({
      users: usersRes.results || [],
      plans: plansRes.results || []
    });
  }

  if (path === '/api/admin/subscriptions' && request.method === 'POST') {
    const body: any = await request.json();
    const userId = Number(body.telegram_id);
    if (!userId) return jsonResponse({ error: 'telegram_id is required' }, 400);
    const planId = body.plan_id || 'PRO_MONTH';
    const durationDays = Number(body.duration_days) || 30;
    const now = Math.floor(Date.now() / 1000);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (telegram_id, username, full_name, role) VALUES (?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET role=excluded.role`
      ).bind(userId, body.username || null, body.full_name || 'کاربر', body.role || 'USER'),
      env.DB.prepare(
        `UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = ? AND status = 'ACTIVE'`
      ).bind(userId),
      env.DB.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, starts_at, expires_at, max_total_searches)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`
      ).bind(`sub_${userId}_${now}`, userId, planId, now, now + durationDays * 86400, body.max_total_searches || null)
    ]);

    return jsonResponse({ ok: true, user_id: userId, plan_id: planId });
  }

  // Toggle Ban User: POST /api/admin/users/:id/toggle-ban
  const matchUserBan = path.match(/^\/api\/admin\/users\/([^\/]+)\/toggle-ban$/);
  if (matchUserBan && request.method === 'POST') {
    const userId = Number(matchUserBan[1]);
    await env.DB.prepare(`UPDATE users SET is_banned = (CASE WHEN is_banned = 1 THEN 0 ELSE 1 END) WHERE telegram_id = ?`).bind(userId).run();
    const updated: any = await env.DB.prepare(`SELECT is_banned FROM users WHERE telegram_id = ?`).bind(userId).first();
    return jsonResponse({ ok: true, user_id: userId, is_banned: updated?.is_banned });
  }

  // 5. POST /api/admin/test-score (Live Divar Ad Simulator)
  if (path === '/api/admin/test-score' && request.method === 'POST') {
    const body: any = await request.json();
    const postToken: string = (body.token || '').trim();
    if (!postToken) return jsonResponse({ error: 'Token is required' }, 400);

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
      deal_type: body.deal_type || 'BUY',
      property_type: body.property_type || 'APARTMENT',
      divar_category_slug: body.divar_category_slug || 'apartment-sell',
      min_budget: Number(body.min_budget) || 0,
      max_budget: Number(body.max_budget) || 12000000000,
      min_rent: Number(body.min_rent) || 0,
      max_rent: Number(body.max_rent) || 0,
      allow_rahn_conversion: 1,
      max_price_per_m2: Number(body.max_price_per_m2) || 0,
      min_area: Number(body.min_area) || 85,
      max_area: Number(body.max_area) || 140,
      tolerance_pct: Number(body.tolerance_pct) || 0.15,
      min_match_score: Number(body.min_match_score) || 65,
      stage2_filters_json: JSON.stringify(body.stage2_filters || { parking: true, elevator: true, storage: true })
    };

    const ad = await fetchDivarPostDetail(postToken, mockRule.deal_type, env);
    if (!ad) {
      return jsonResponse({ error: 'آگهی در دیوار یافت نشد یا دسترسی مسدود است' }, 404);
    }

    const matchResult = evaluateAdMatch(ad, mockRule);
    const cardPreview = buildTelegramCardPayload(ad, matchResult, mockRule, body.channel_id || '@preview_channel', false);

    return jsonResponse({ ad, matchResult, cardPreview });
  }

  return jsonResponse({ error: 'Route not found' }, 404);
}
