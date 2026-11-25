import { ChannelBranding, Env, FilterRule } from '../types';
import { fetchDivarPostDetail, searchDivarPostList } from '../divar/scraper';
import { fetchSheypoorPostDetail, resolveSheypoorCitySlugs, searchSheypoorPostList } from '../sheypoor/scraper';
import { computeAdFingerprint, evaluateAdMatch } from '../engine/scorer';
import { buildTelegramCardPayload } from '../telegram/cardBuilder';

const MAX_SUBREQUESTS_PER_TICK = 42; // Safe headroom under Cloudflare Workers Free Plan's 50 cap
const MAX_AUTO_PAUSE_ERRORS = 15;
const DEDUP_WINDOW_SECONDS = 72 * 3600;
const SKIPPED_RETENTION_SECONDS = 14 * 86400;

export interface TaggedCandidateToken {
  source: 'divar' | 'sheypoor';
  token: string;
}

/**
 * Interleaves Divar and Sheypoor candidate tokens fairly [d0, s0, d1, s1, ...]
 * so neither source starves the other when subrequest budgets cut a tick short.
 */
export function interleaveSourceTokens(divarTokens: string[], spTokens: string[]): TaggedCandidateToken[] {
  const result: TaggedCandidateToken[] = [];
  const maxLen = Math.max(divarTokens.length, spTokens.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < divarTokens.length) result.push({ source: 'divar', token: divarTokens[i] });
    if (i < spTokens.length) result.push({ source: 'sheypoor', token: spTokens[i] });
  }
  return result;
}

/**
 * Determines whether a BACKFILL rule may safely transition to LIVE.
 * Requires no scraper errors and no mid-page budget truncation on either source.
 */
export function shouldTransitionBackfillToLive(params: {
  isBackfill: boolean;
  newQueuedTotal: number;
  backfillTargetCount: number;
  sourceErrorsCount: number;
  divarRemainingUnprocessed: boolean;
  sheypoorRemainingUnprocessed: boolean;
  nextDivarCursor: string | null;
  sheypoorHasMore: boolean;
}): boolean {
  if (!params.isBackfill) return false;
  if (params.newQueuedTotal >= params.backfillTargetCount) return true;
  if (params.sourceErrorsCount > 0) return false;
  if (params.divarRemainingUnprocessed || params.sheypoorRemainingUnprocessed) return false;
  return !params.nextDivarCursor && !params.sheypoorHasMore;
}

interface SubrequestBudget {
  used: number;
  readonly max: number;
}

function parseRuleBranding(row: any): ChannelBranding {
  let hashtags: string[] = [];
  try {
    const parsed = JSON.parse(row.brand_hashtags_json || '[]');
    if (Array.isArray(parsed)) hashtags = parsed.map(String);
  } catch {}
  return {
    chat_id: row.chat_id,
    title: row.channel_title,
    contact_mobile: row.contact_mobile,
    contact_phone: row.contact_phone,
    office_address: row.office_address,
    brand_hashtags: hashtags
  };
}

async function fetchExistingTokensSet(
  db: D1Database,
  ruleId: string,
  tokens: string[]
): Promise<Set<string>> {
  const seen = new Set<string>();
  if (tokens.length === 0) return seen;

  // Batch in chunks of 40 to stay well within SQLite bind parameter limits
  for (let i = 0; i < tokens.length; i += 40) {
    const slice = tokens.slice(i, i + 40);
    const placeholders = slice.map(() => '?').join(',');
    const res = await db
      .prepare(`SELECT post_token FROM sent_ads WHERE rule_id = ? AND post_token IN (${placeholders})`)
      .bind(ruleId, ...slice)
      .all();
    for (const row of (res.results || []) as any[]) {
      if (row?.post_token) seen.add(String(row.post_token));
    }
  }
  return seen;
}

function isTelegramMediaError(desc: string): boolean {
  const lower = desc.toLowerCase();
  return (
    lower.includes('webpage_media_empty') ||
    lower.includes('wrong type of the web page content') ||
    lower.includes('image_process_failed') ||
    lower.includes('failed to send message #') ||
    lower.includes('wrong file identifier') ||
    lower.includes('media_empty') ||
    lower.includes('webpage_curl_failed')
  );
}

async function callTelegramMethod(
  env: Env,
  method: string,
  body: Record<string, any>,
  budget: SubrequestBudget
): Promise<{ ok: boolean; status: number; json: any }> {
  budget.used++;
  const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const tgJson: any = await tgRes.json().catch(() => ({}));
  return { ok: tgRes.ok && tgJson?.ok === true, status: tgRes.status, json: tgJson };
}

async function dispatchTelegramWithFallback(
  env: Env,
  payload: { method: string; body: Record<string, any> },
  followupButtons: boolean,
  budget: SubrequestBudget
): Promise<{ ok: boolean; rateLimited?: boolean; retryAfter?: number; msgId?: number; error?: string }> {
  const replyMarkup = payload.body?.reply_markup;
  const primaryBody = { ...payload.body };
  if (payload.method === 'sendMediaGroup') {
    delete primaryBody.reply_markup;
  }

  let res = await callTelegramMethod(env, payload.method, primaryBody, budget);
  if (res.status === 429 || res.json?.error_code === 429) {
    return { ok: false, rateLimited: true, retryAfter: res.json?.parameters?.retry_after || 5 };
  }

  // Fallback 1: sendMediaGroup media rejection -> single sendPhoto with primary caption/keyboard
  if (!res.ok && payload.method === 'sendMediaGroup') {
    const errDesc = String(res.json?.description || `HTTP ${res.status}`);
    if (isTelegramMediaError(errDesc) && Array.isArray(payload.body?.media) && payload.body.media.length > 0 && budget.used < budget.max) {
      const firstMedia = payload.body.media[0];
      res = await callTelegramMethod(env, 'sendPhoto', {
        chat_id: payload.body.chat_id,
        photo: firstMedia.media,
        caption: firstMedia.caption || '',
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      }, budget);
      if (res.status === 429 || res.json?.error_code === 429) {
        return { ok: false, rateLimited: true, retryAfter: res.json?.parameters?.retry_after || 5 };
      }

      // Fallback 2: if single photo still fails media check -> plain HTML sendMessage
      const photoErr = String(res.json?.description || '');
      if (!res.ok && isTelegramMediaError(photoErr) && budget.used < budget.max) {
        res = await callTelegramMethod(env, 'sendMessage', {
          chat_id: payload.body.chat_id,
          text: firstMedia.caption || '',
          parse_mode: 'HTML',
          disable_web_page_preview: false,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        }, budget);
      }
    }
  } else if (!res.ok && payload.method === 'sendPhoto') {
    const errDesc = String(res.json?.description || `HTTP ${res.status}`);
    if (isTelegramMediaError(errDesc) && budget.used < budget.max) {
      res = await callTelegramMethod(env, 'sendMessage', {
        chat_id: payload.body.chat_id,
        text: payload.body.caption || '',
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      }, budget);
    }
  }

  if (res.status === 429 || res.json?.error_code === 429) {
    return { ok: false, rateLimited: true, retryAfter: res.json?.parameters?.retry_after || 5 };
  }

  if (!res.ok) {
    return { ok: false, error: String(res.json?.description || `HTTP ${res.status}`) };
  }

  const msgId = Array.isArray(res.json.result)
    ? (res.json.result[0]?.message_id || 0)
    : (res.json.result?.message_id || 0);

  if (followupButtons && payload.method === 'sendMediaGroup' && replyMarkup?.inline_keyboard?.length > 0 && budget.used < budget.max) {
    try {
      await callTelegramMethod(env, 'sendMessage', {
        chat_id: payload.body.chat_id,
        text: '📎 دسترسی سریع و راه‌های ارتباطی:',
        reply_markup: replyMarkup
      }, budget);
    } catch (_) {}
  }

  return { ok: true, msgId };
}

async function drainOutboundQueue(env: Env, nowSec: number, budget: SubrequestBudget): Promise<void> {
  const maxPerChannelPerMin = parseInt(env.MAX_CHANNEL_MSGS_PER_MIN || '15', 10);
  const fetchLimit = Math.min(maxPerChannelPerMin, 10);

  const queuedRows = await env.DB.prepare(
    `SELECT sa.rule_id, sa.channel_id, sa.post_token, sa.card_payload_json,
            r.owner_user_id, COALESCE(r.album_followup_buttons, 0) as album_followup_buttons,
            c.last_sent_at, c.sent_count_current_minute, c.minute_window_start
     FROM sent_ads sa
     JOIN filter_rules r ON sa.rule_id = r.id
     JOIN channels c ON sa.channel_id = c.id
     WHERE sa.status = 'QUEUED'
     ORDER BY sa.discovered_at ASC
     LIMIT ?`
  ).bind(fetchLimit).all();

  const items = (queuedRows.results || []) as any[];
  const channelCounters = new Map<string, { windowStart: number; count: number; lastSentAt: number }>();

  for (let i = 0; i < items.length; i++) {
    if (budget.used >= budget.max) break;
    const item = items[i];

    // Enforce per-channel rate tracking using channels table state
    let chState = channelCounters.get(item.channel_id);
    if (!chState) {
      const winStart = Number(item.minute_window_start) || 0;
      const inCurrentWindow = nowSec - winStart < 60;
      chState = {
        windowStart: inCurrentWindow ? winStart : nowSec,
        count: inCurrentWindow ? (Number(item.sent_count_current_minute) || 0) : 0,
        lastSentAt: Number(item.last_sent_at) || 0
      };
      channelCounters.set(item.channel_id, chState);
    }

    if (chState.count >= maxPerChannelPerMin) {
      continue; // Channel hit 1-minute quota; keep remaining ads in QUEUED for next cron tick
    }

    try {
      const payload = JSON.parse(item.card_payload_json);
      const outcome = await dispatchTelegramWithFallback(
        env,
        payload,
        Number(item.album_followup_buttons) === 1,
        budget
      );

      if (outcome.rateLimited) {
        console.warn(`Telegram rate limited (${outcome.retryAfter}s). Remaining ads kept in QUEUED status.`);
        break;
      }

      const sentNow = Math.floor(Date.now() / 1000);
      if (outcome.ok) {
        chState.count += 1;
        chState.lastSentAt = sentNow;

        const batchStmts: D1PreparedStatement[] = [
          env.DB.prepare(
            `UPDATE sent_ads SET status = 'SENT', telegram_message_id = ?, sent_at = ?, last_error_msg = NULL WHERE rule_id = ? AND post_token = ?`
          ).bind(outcome.msgId || 0, sentNow, item.rule_id, item.post_token),
          env.DB.prepare(
            `UPDATE sync_state SET backfill_dispatched_count = backfill_dispatched_count + 1 WHERE rule_id = ?`
          ).bind(item.rule_id),
          env.DB.prepare(
            `UPDATE channels SET last_sent_at = ?, sent_count_current_minute = ?, minute_window_start = ? WHERE id = ?`
          ).bind(chState.lastSentAt, chState.count, chState.windowStart, item.channel_id)
        ];

        if (item.owner_user_id) {
          batchStmts.push(
            env.DB.prepare(
              `UPDATE subscriptions SET searches_used_today = searches_used_today + 1, total_ads_sent = total_ads_sent + 1
               WHERE id = (
                 SELECT id FROM subscriptions
                 WHERE user_id = ? AND status = 'ACTIVE' AND expires_at >= ?
                 ORDER BY expires_at DESC
                 LIMIT 1
               )`
            ).bind(item.owner_user_id, sentNow)
          );
        }
        await env.DB.batch(batchStmts);
      } else {
        const errDesc = outcome.error || 'Unknown Telegram error';
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE sent_ads SET status = 'FAILED', last_error_msg = ? WHERE rule_id = ? AND post_token = ?`
          ).bind(errDesc.slice(0, 250), item.rule_id, item.post_token),
          env.DB.prepare(
            `INSERT INTO system_logs (level, component, rule_id, message, meta_json) VALUES ('ERROR', 'TELEGRAM', ?, ?, ?)`
          ).bind(
            item.rule_id,
            `Telegram post failed: ${errDesc}`,
            JSON.stringify({ chat_id: payload?.body?.chat_id, token: item.post_token, error: errDesc })
          )
        ]);
      }
    } catch (err: any) {
      const msg = String(err?.message || err || 'Dispatch exception').slice(0, 250);
      await env.DB.prepare(
        `UPDATE sent_ads SET status = 'FAILED', last_error_msg = ? WHERE rule_id = ? AND post_token = ?`
      ).bind(msg, item.rule_id, item.post_token).run();
    }

    // Gentle pacing only if another item remains and next item targets the same channel
    if (i < items.length - 1 && items[i + 1].channel_id === item.channel_id && budget.used < budget.max) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

export async function runScheduledTick(env: Env): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: env.DEFAULT_TIMEZONE || 'Asia/Tehran' }).format(new Date());
  const budget: SubrequestBudget = { used: 0, max: MAX_SUBREQUESTS_PER_TICK };

  // 1. Reset daily search quotas on Tehran midnight boundary & expire elapsed subscriptions
  await env.DB.batch([
    env.DB.prepare(`UPDATE subscriptions SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at < ?`).bind(nowSec),
    env.DB.prepare(
      `UPDATE subscriptions SET searches_used_today = 0, last_quota_reset_day = ?
       WHERE status = 'ACTIVE' AND last_quota_reset_day != ?`
    ).bind(tehranDay, tehranDay)
  ]);

  // 2. Prioritize draining outbound QUEUED items so approved ads never starve behind scrapers
  await drainOutboundQueue(env, nowSec, budget);

  // 3. Select up to 2 active rules eligible for polling within remaining subrequest budget
  if (budget.used >= budget.max - 2) return;

  const activeRulesRes = await env.DB.prepare(
    `SELECT r.*, c.chat_id, c.title as channel_title,
            c.contact_mobile, c.contact_phone, c.office_address, c.brand_hashtags_json,
            s.phase, s.backfill_target_count, s.backfill_queued_count,
            s.pagination_cursor_date, s.pagination_page, COALESCE(s.sheypoor_page, 1) as sheypoor_page,
            s.search_uid, s.last_watermark_timestamp, COALESCE(s.consecutive_errors, 0) as consecutive_errors,
            sub.id as sub_id,
            COALESCE(sub.searches_used_today, 0) as searches_used_today,
            COALESCE(sub.total_ads_sent, 0) as total_ads_sent,
            sub.max_total_searches,
            COALESCE(p.daily_ad_quota, 50) as daily_ad_quota
     FROM filter_rules r
     JOIN users u ON r.owner_user_id = u.telegram_id
     JOIN channels c ON r.channel_id = c.id
     JOIN sync_state s ON r.id = s.rule_id
     JOIN subscriptions sub ON sub.id = (
       SELECT s2.id FROM subscriptions s2
       WHERE s2.user_id = r.owner_user_id
         AND s2.status = 'ACTIVE'
         AND s2.expires_at >= ?
       ORDER BY s2.expires_at DESC
       LIMIT 1
     )
     JOIN plans p ON sub.plan_id = p.id
     WHERE r.is_active = 1
       AND COALESCE(u.is_banned, 0) = 0
       AND c.is_enabled = 1
       AND s.phase IN ('BACKFILL', 'LIVE')
       AND COALESCE(s.is_auto_paused, 0) = 0
       AND COALESCE(s.next_retry_at, 0) <= ?
     ORDER BY s.last_polled_at ASC
     LIMIT 2`
  ).bind(nowSec, nowSec).all();

  const rules = (activeRulesRes.results || []) as any[];

  for (const row of rules) {
    if (budget.used >= budget.max) break;
    if (row.searches_used_today >= row.daily_ad_quota) continue;
    if (row.max_total_searches && row.total_ads_sent >= row.max_total_searches) continue;

    const batchStatements: D1PreparedStatement[] = [];
    const sourceErrors: string[] = [];

    try {
      const isBackfill = row.phase === 'BACKFILL';
      const useDivar = row.source_divar !== 0;
      const useSheypoor = row.source_sheypoor !== 0;
      const branding = parseRuleBranding(row);

      let divarTokens: string[] = [];
      let spTokens: string[] = [];
      const curDivarPage = Number(row.pagination_page) || 1;
      const curSpPage = Number(row.sheypoor_page) || 1;
      let nextDivarCursor: string | null = row.pagination_cursor_date ?? null;
      let nextDivarPage = curDivarPage;
      let searchUid: string | null = row.search_uid ?? null;
      let nextSheypoorPage = curSpPage;
      let sheypoorHasMore = false;
      let divarSucceeded = !useDivar;
      let sheypoorSucceeded = !useSheypoor;

      // A. Fetch Divar candidates with isolated pagination
      if (useDivar && budget.used < budget.max) {
        try {
          const validCursor = row.pagination_cursor_date && !String(row.pagination_cursor_date).startsWith('sp_') && curDivarPage <= 50;
          const divarPagination = isBackfill && validCursor
            ? { lastPostDate: row.pagination_cursor_date, page: curDivarPage, searchUid: row.search_uid }
            : undefined;

          budget.used++;
          const searchRes = await searchDivarPostList(row as FilterRule, env, divarPagination);
          divarTokens = isBackfill ? [...searchRes.tokens].reverse() : searchRes.tokens;
          nextDivarCursor = searchRes.nextCursorDate;
          nextDivarPage = isBackfill ? curDivarPage + 1 : 1;
          searchUid = searchRes.searchUid;
          divarSucceeded = true;
        } catch (de: any) {
          const errMsg = String(de?.message || de || 'Divar error');
          sourceErrors.push(errMsg);
          batchStatements.push(
            env.DB.prepare(
              `INSERT INTO system_logs (level, component, rule_id, message) VALUES ('WARN', 'DIVAR_SCRAPER', ?, ?)`
            ).bind(row.id, errMsg.slice(0, 300))
          );
        }
      }

      // B. Fetch Sheypoor candidates across all configured supported cities with independent pagination
      if (useSheypoor && budget.used < budget.max) {
        try {
          const spPage = isBackfill ? curSpPage : 1;
          const citySlugs = resolveSheypoorCitySlugs(row as FilterRule);
          const mergedSpTokens: string[] = [];
          let cityLoopIncomplete = false;

          for (const citySlug of citySlugs) {
            if (budget.used >= budget.max) {
              cityLoopIncomplete = true;
              break;
            }
            budget.used++;
            const spRes = await searchSheypoorPostList(row as FilterRule, env, { page: spPage, citySlug });
            for (const tok of spRes.tokens) {
              if (!mergedSpTokens.includes(tok)) mergedSpTokens.push(tok);
            }
            if (spRes.nextCursorDate) sheypoorHasMore = true;
          }

          if (cityLoopIncomplete) sheypoorHasMore = true;
          spTokens = isBackfill ? [...mergedSpTokens].reverse() : mergedSpTokens;
          nextSheypoorPage = isBackfill && !cityLoopIncomplete && sheypoorHasMore ? spPage + 1 : (isBackfill ? curSpPage : 1);
          sheypoorSucceeded = true;
        } catch (se: any) {
          const errMsg = String(se?.message || se || 'Sheypoor error');
          sourceErrors.push(errMsg);
          batchStatements.push(
            env.DB.prepare(
              `INSERT INTO system_logs (level, component, rule_id, message) VALUES ('WARN', 'SHEYPOOR_SCRAPER', ?, ?)`
            ).bind(row.id, errMsg.slice(0, 300))
          );
        }
      }

      if (!divarSucceeded && !sheypoorSucceeded) {
        throw new Error(sourceErrors.join(' | ') || 'All enabled scrapers failed');
      }

      // Interleave Divar and Sheypoor tokens so neither starves under tight subrequest budgets
      const candidateItems = interleaveSourceTokens(divarTokens, spTokens);
      const seenTokens = await fetchExistingTokensSet(env.DB, row.id, candidateItems.map((x) => x.token));
      const queuedFingerprintsThisTick = new Map<string, 'divar' | 'sheypoor'>();

      let queuedThisRule = 0;
      let divarRemainingUnprocessed = false;
      let sheypoorRemainingUnprocessed = false;

      for (let idx = 0; idx < candidateItems.length; idx++) {
        const item = candidateItems[idx];
        if (seenTokens.has(item.token)) continue;
        if (budget.used >= budget.max) {
          for (let j = idx; j < candidateItems.length; j++) {
            if (seenTokens.has(candidateItems[j].token)) continue;
            if (candidateItems[j].source === 'divar') divarRemainingUnprocessed = true;
            else sheypoorRemainingUnprocessed = true;
          }
          break;
        }
        seenTokens.add(item.token);

        budget.used++;
        const ad = item.source === 'sheypoor'
          ? await fetchSheypoorPostDetail(item.token, row.deal_type, env)
          : await fetchDivarPostDetail(item.token, row.deal_type, env);
        if (!ad) continue;

        const evalRes = evaluateAdMatch(ad, row as FilterRule);
        const fingerprint = computeAdFingerprint(ad);

        if (evalRes.eligible) {
          // Strict cross-source deduplication only (suppresses Divar <-> Sheypoor duplicates on same channel)
          if (fingerprint) {
            const oppositeSource: 'divar' | 'sheypoor' = item.source === 'sheypoor' ? 'divar' : 'sheypoor';
            const oppositeTokenSql = item.source === 'sheypoor'
              ? `post_token NOT LIKE 'sp_%'`
              : `post_token LIKE 'sp_%'`;
            const inTickDup = queuedFingerprintsThisTick.get(fingerprint) === oppositeSource;
            const dup = !inTickDup
              ? await env.DB.prepare(
                  `SELECT 1 FROM sent_ads
                   WHERE channel_id = ?
                     AND fingerprint = ?
                     AND ${oppositeTokenSql}
                     AND status IN ('QUEUED', 'SENT')
                     AND discovered_at >= ?
                   LIMIT 1`
                ).bind(row.channel_id, fingerprint, nowSec - DEDUP_WINDOW_SECONDS).first()
              : null;
            if (inTickDup || dup) {
              batchStatements.push(
                env.DB.prepare(
                  `INSERT OR IGNORE INTO sent_ads (rule_id, channel_id, post_token, match_score, status, fingerprint, last_error_msg, discovered_at)
                   VALUES (?, ?, ?, ?, 'SKIPPED', ?, ?, ?)`
                ).bind(row.id, row.channel_id, item.token, evalRes.score, fingerprint, 'Duplicate cross-source property', nowSec)
              );
              continue;
            }
            queuedFingerprintsThisTick.set(fingerprint, item.source);
          }

          const cardPayload = buildTelegramCardPayload(ad, evalRes, row as FilterRule, row.chat_id, isBackfill, branding);
          batchStatements.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO sent_ads (rule_id, channel_id, post_token, match_score, status, card_payload_json, fingerprint, discovered_at)
               VALUES (?, ?, ?, ?, 'QUEUED', ?, ?, ?)`
            ).bind(row.id, row.channel_id, item.token, evalRes.score, JSON.stringify(cardPayload), fingerprint, nowSec)
          );
          queuedThisRule++;
          if (isBackfill && (row.backfill_queued_count + queuedThisRule) >= row.backfill_target_count) {
            break;
          }
        } else {
          batchStatements.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO sent_ads (rule_id, channel_id, post_token, match_score, status, fingerprint, discovered_at)
               VALUES (?, ?, ?, ?, 'SKIPPED', ?, ?)`
            ).bind(row.id, row.channel_id, item.token, evalRes.score, fingerprint, nowSec)
          );
        }
      }

      if (isBackfill && divarRemainingUnprocessed) {
        nextDivarCursor = row.pagination_cursor_date ?? null;
        nextDivarPage = curDivarPage;
      }
      if (isBackfill && sheypoorRemainingUnprocessed) {
        nextSheypoorPage = curSpPage;
      }

      const newQueuedTotal = Number(row.backfill_queued_count) + queuedThisRule;
      const shouldTransitionToLive = shouldTransitionBackfillToLive({
        isBackfill,
        newQueuedTotal,
        backfillTargetCount: Number(row.backfill_target_count),
        sourceErrorsCount: sourceErrors.length,
        divarRemainingUnprocessed,
        sheypoorRemainingUnprocessed,
        nextDivarCursor: useDivar ? nextDivarCursor : null,
        sheypoorHasMore: useSheypoor ? sheypoorHasMore : false
      });
      const nextPhase = isBackfill ? (shouldTransitionToLive ? 'LIVE' : 'BACKFILL') : 'LIVE';

      batchStatements.push(
        env.DB.prepare(
          `UPDATE sync_state
           SET phase = ?,
               backfill_queued_count = ?,
               pagination_cursor_date = ?,
               pagination_page = ?,
               sheypoor_page = ?,
               search_uid = ?,
               last_watermark_timestamp = ?,
               last_polled_at = ?,
               consecutive_errors = 0,
               last_error_msg = ?,
               next_retry_at = 0,
               is_auto_paused = 0
           WHERE rule_id = ?`
        ).bind(
          nextPhase,
          newQueuedTotal,
          nextPhase === 'LIVE' ? null : nextDivarCursor,
          nextPhase === 'LIVE' ? 1 : nextDivarPage,
          nextPhase === 'LIVE' ? 1 : nextSheypoorPage,
          nextPhase === 'LIVE' ? null : searchUid,
          nowSec,
          nowSec,
          sourceErrors.length > 0 ? sourceErrors[0].slice(0, 250) : null,
          row.id
        )
      );

      if (batchStatements.length > 0) {
        await env.DB.batch(batchStatements);
      }
    } catch (err: any) {
      const nextErrCount = (Number(row.consecutive_errors) || 0) + 1;
      const errMsg = String(err?.message || err || 'Unknown error').slice(0, 300);
      const backoffSec = Math.min(3600, 60 * Math.pow(2, Math.min(nextErrCount - 1, 6)));
      const autoPause = nextErrCount >= MAX_AUTO_PAUSE_ERRORS ? 1 : 0;

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE sync_state
           SET consecutive_errors = ?,
               last_error_msg = ?,
               last_polled_at = ?,
               next_retry_at = ?,
               is_auto_paused = ?,
               phase = CASE WHEN ? = 1 THEN 'ERROR' ELSE phase END
           WHERE rule_id = ?`
        ).bind(nextErrCount, errMsg, nowSec, nowSec + backoffSec, autoPause, autoPause, row.id),
        env.DB.prepare(
          `INSERT INTO system_logs (level, component, rule_id, message) VALUES ('ERROR', 'SCHEDULER', ?, ?)`
        ).bind(row.id, autoPause ? `Rule auto-paused after ${nextErrCount} errors: ${errMsg}` : errMsg)
      ]);
    }
  }

  // 4. Lightweight periodic retention prune (once/hour window)
  if (nowSec % 3600 < 90) {
    try {
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM sent_ads WHERE status = 'SKIPPED' AND discovered_at < ?`).bind(nowSec - SKIPPED_RETENTION_SECONDS),
        env.DB.prepare(`DELETE FROM system_logs WHERE id NOT IN (SELECT id FROM system_logs ORDER BY id DESC LIMIT 500)`)
      ]);
    } catch (_) {}
  }
}
