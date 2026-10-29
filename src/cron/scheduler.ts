import { Env, FilterRule } from '../types';
import { fetchDivarPostDetail, searchDivarPostList } from '../divar/scraper';
import { evaluateAdMatch } from '../engine/scorer';
import { buildTelegramCardPayload } from '../telegram/cardBuilder';

export async function runScheduledTick(env: Env): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: env.DEFAULT_TIMEZONE || 'Asia/Tehran' }).format(new Date());

  // 1. Reset daily search quotas on Tehran midnight boundary & expire elapsed subscriptions
  await env.DB.batch([
    env.DB.prepare(`UPDATE subscriptions SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at < ?`).bind(nowSec),
    env.DB.prepare(
      `UPDATE subscriptions SET searches_used_today = 0, last_quota_reset_day = ?
       WHERE status = 'ACTIVE' AND last_quota_reset_day != ?`
    ).bind(tehranDay, tehranDay)
  ]);

  // 2. Select up to 2 active rules per minute (keeps external subrequests <= 37 on Free Plan)
  const activeRulesRes = await env.DB.prepare(
    `SELECT r.*, c.chat_id, s.phase, s.backfill_target_count, s.backfill_queued_count,
            s.pagination_cursor_date, s.pagination_page, s.search_uid, s.last_watermark_timestamp,
            sub.id as sub_id, sub.searches_used_today, sub.total_ads_sent, sub.max_total_searches,
            p.daily_ad_quota
     FROM filter_rules r
     JOIN channels c ON r.channel_id = c.id
     JOIN sync_state s ON r.id = s.rule_id
     JOIN subscriptions sub ON r.owner_user_id = sub.user_id AND sub.status = 'ACTIVE'
     JOIN plans p ON sub.plan_id = p.id
     WHERE r.is_active = 1 AND c.is_enabled = 1 AND s.phase IN ('BACKFILL', 'LIVE')
     ORDER BY s.last_polled_at ASC
     LIMIT 2`
  ).all();

  const rules = (activeRulesRes.results || []) as any[];
  let detailFetchesUsed = 0;
  const MAX_DETAIL_FETCHES_PER_TICK = 20;

  for (const row of rules) {
    if (row.searches_used_today >= row.daily_ad_quota) continue;
    if (row.max_total_searches && row.total_ads_sent >= row.max_total_searches) continue;

    try {
      const isBackfill = row.phase === 'BACKFILL';
      const pagination = isBackfill && row.pagination_cursor_date
        ? { lastPostDate: row.pagination_cursor_date, page: Number(row.pagination_page) || 1, searchUid: row.search_uid }
        : undefined;

      const searchRes = await searchDivarPostList(row as FilterRule, env, pagination);
      const candidateTokens = isBackfill ? [...searchRes.tokens].reverse() : searchRes.tokens;

      let queuedThisRule = 0;
      const batchStatements: D1PreparedStatement[] = [];

      for (const token of candidateTokens) {
        if (detailFetchesUsed >= MAX_DETAIL_FETCHES_PER_TICK) break;

        const existing = await env.DB.prepare(
          `SELECT status FROM sent_ads WHERE rule_id = ? AND post_token = ?`
        ).bind(row.id, token).first();

        if (existing) {
          if (!isBackfill) break; // In LIVE mode, stop as soon as we hit an already-seen token
          continue;
        }

        detailFetchesUsed++;
        const ad = await fetchDivarPostDetail(token, row.deal_type, env);
        if (!ad) continue;

        const evalRes = evaluateAdMatch(ad, row as FilterRule);
        if (evalRes.eligible) {
          const cardPayload = buildTelegramCardPayload(ad, evalRes, row as FilterRule, row.chat_id, isBackfill);
          batchStatements.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO sent_ads (rule_id, channel_id, post_token, match_score, status, card_payload_json, discovered_at)
               VALUES (?, ?, ?, ?, 'QUEUED', ?, ?)`
            ).bind(row.id, row.channel_id, token, evalRes.score, JSON.stringify(cardPayload), nowSec)
          );
          queuedThisRule++;
          if (isBackfill && (row.backfill_queued_count + queuedThisRule) >= row.backfill_target_count) {
            break;
          }
        } else {
          batchStatements.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO sent_ads (rule_id, channel_id, post_token, match_score, status, discovered_at)
               VALUES (?, ?, ?, ?, 'SKIPPED', ?)`
            ).bind(row.id, row.channel_id, token, evalRes.score, nowSec)
          );
        }
      }

      // Transition BACKFILL -> LIVE once backfill target is reached or no further pages exist
      const newQueuedTotal = Number(row.backfill_queued_count) + queuedThisRule;
      const shouldTransitionToLive = isBackfill && (newQueuedTotal >= Number(row.backfill_target_count) || !searchRes.nextCursorDate);

      batchStatements.push(
        env.DB.prepare(
          `UPDATE sync_state
           SET phase = ?,
               backfill_queued_count = ?,
               pagination_cursor_date = ?,
               pagination_page = ?,
               search_uid = ?,
               last_watermark_timestamp = ?,
               last_polled_at = ?,
               consecutive_errors = 0
           WHERE rule_id = ?`
        ).bind(
          shouldTransitionToLive ? 'LIVE' : row.phase,
          newQueuedTotal,
          shouldTransitionToLive ? null : searchRes.nextCursorDate,
          shouldTransitionToLive ? 1 : (Number(row.pagination_page) || 1) + 1,
          searchRes.searchUid,
          nowSec,
          nowSec,
          row.id
        )
      );

      if (batchStatements.length > 0) {
        await env.DB.batch(batchStatements);
      }
    } catch (err: any) {
      await env.DB.prepare(
        `UPDATE sync_state SET consecutive_errors = consecutive_errors + 1, last_error_msg = ?, last_polled_at = ? WHERE rule_id = ?`
      ).bind(String(err?.message || err), nowSec, row.id).run();
    }
  }

  // 3. Drain Outbound Queue (Rate-limited to max 15 messages/min per channel, 3.5s spacing)
  const maxMsgs = parseInt(env.MAX_CHANNEL_MSGS_PER_MIN || '15', 10);
  const queuedRows = await env.DB.prepare(
    `SELECT sa.rule_id, sa.channel_id, sa.post_token, sa.card_payload_json, r.owner_user_id
     FROM sent_ads sa
     JOIN filter_rules r ON sa.rule_id = r.id
     WHERE sa.status = 'QUEUED'
     ORDER BY sa.discovered_at ASC
     LIMIT ?`
  ).bind(maxMsgs).all();

  const items = (queuedRows.results || []) as any[];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const payload = JSON.parse(item.card_payload_json);
      const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${payload.method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body)
      });
      const tgJson: any = await tgRes.json();

      if (tgRes.ok && tgJson.ok) {
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE sent_ads SET status = 'SENT', telegram_message_id = ?, sent_at = ? WHERE rule_id = ? AND post_token = ?`
          ).bind(tgJson.result?.message_id || 0, Math.floor(Date.now() / 1000), item.rule_id, item.post_token),
          env.DB.prepare(
            `UPDATE subscriptions SET searches_used_today = searches_used_today + 1, total_ads_sent = total_ads_sent + 1
             WHERE user_id = ? AND status = 'ACTIVE'`
          ).bind(item.owner_user_id),
          env.DB.prepare(
            `UPDATE sync_state SET backfill_dispatched_count = backfill_dispatched_count + 1 WHERE rule_id = ?`
          ).bind(item.rule_id)
        ]);
      } else {
        await env.DB.prepare(
          `UPDATE sent_ads SET status = 'FAILED' WHERE rule_id = ? AND post_token = ?`
        ).bind(item.rule_id, item.post_token).run();
      }
    } catch {
      await env.DB.prepare(
        `UPDATE sent_ads SET status = 'FAILED' WHERE rule_id = ? AND post_token = ?`
      ).bind(item.rule_id, item.post_token).run();
    }

    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 3500));
    }
  }
}
