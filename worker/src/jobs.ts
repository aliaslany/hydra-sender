import type { Env } from './env.ts';
import type { Ad, Criteria } from './core/types.ts';
import { scoreAd } from './core/match.ts';
import { sendCard } from './telegram.ts';
import { buildFeeds } from './feeds.ts';
import {
  loadSettings, insertAdStatement, failedAdStatement, rowToAd, ADS_COLS, type Settings,
} from './db.ts';
import { nowSec } from './util.ts';

// Free plan: 50 external subrequests per invocation. Divar + Telegram calls count, D1 calls do not.

async function unseen(db: D1Database, tokens: string[]): Promise<string[]> {
  if (!tokens.length) return [];
  const { results } = await db
    .prepare(`SELECT token FROM ads WHERE token IN (${tokens.map(() => '?').join(',')})`)
    .bind(...tokens)
    .all<{ token: string }>();
  const seen = new Set(results.map((r) => r.token));
  return tokens.filter((t) => !seen.has(t));
}

interface Candidate { id: number; user_id: number; chat_id: number; criteria: string }

async function candidates(db: D1Database, cat: { deal: string; property: string }): Promise<Candidate[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.user_id, u.chat_id, s.criteria
         FROM searches s JOIN users u ON u.id = s.user_id
        WHERE s.is_active = 1 AND s.deal = ? AND s.property = ?
          AND u.is_blocked = 0 AND u.bot_stopped = 0 AND u.plan_id IS NOT NULL
          AND (u.expires_at IS NULL OR u.expires_at > ?)
        LIMIT 1000`,
    )
    .bind(cat.deal, cat.property, nowSec())
    .all<Candidate>();
  return results;
}

function matchStatements(db: D1Database, ads: Ad[], cands: Candidate[], s: Settings) {
  const stmts: D1PreparedStatement[] = [];
  for (const ad of ads) {
    for (const c of cands) {
      let criteria: Criteria;
      try { criteria = JSON.parse(c.criteria); } catch { continue; }
      const m = scoreAd(ad, criteria, s.tolerance);
      if (!m.ok || (m.score != null && m.score < s.minScore)) continue;
      stmts.push(
        db
          .prepare(
            'INSERT OR IGNORE INTO outbox (user_id, chat_id, search_id, ad_token, score, checked, asked) VALUES (?,?,?,?,?,?,?)',
          )
          .bind(c.user_id, c.chat_id, c.id, ad.token, m.score, m.checked, m.asked),
      );
    }
  }
  return stmts;
}

/** Every 5 minutes: fetch newest ads from every source, store them, queue matching notifications. */
export async function crawl(env: Env): Promise<void> {
  const s = await loadSettings(env.DB);
  const feeds = buildFeeds(env, s);
  if (!feeds.length) return;
  let budget = s.crawlBudget;
  // Rotate the starting feed so every source gets budget over time.
  const start = Math.floor(Date.now() / 300_000) % feeds.length;

  for (let k = 0; k < feeds.length && budget > 1; k++) {
    const feed = feeds[(start + k) % feeds.length];
    const found = await feed.list();
    budget--;
    if (!found.ok) { console.warn('list failed', feed.label, found.status); continue; }

    const fresh = await unseen(env.DB, found.tokens);
    const ads: Ad[] = [];
    const stmts: D1PreparedStatement[] = [];
    let loaded = 0;
    for (const token of fresh) {
      if (budget <= 0 || loaded >= feed.maxDetails) break;
      const d = await feed.load(token);
      budget--; loaded++;
      if (d.ok) {
        ads.push(d.ad);
        stmts.push(insertAdStatement(env.DB, d.ad));
      } else if ([404, 410, 422].includes(d.status)) {
        stmts.push(failedAdStatement(env.DB, token));   // deleted or unparseable: never retry
      } else {
        console.warn('load failed', feed.label, token, d.status);
        break;                                          // blocked/rate-limited: try again next run
      }
    }
    if (ads.length) stmts.push(...matchStatements(env.DB, ads, await candidates(env.DB, feed), s));
    for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  }
}

interface OutRow extends Record<string, unknown> { oid: number; user_id: number; chat_id: number; score: number | null; checked: number; asked: number }

/** Every minute: send pending notifications (rate-limited to stay inside the free subrequest budget). */
export async function drain(env: Env): Promise<void> {
  const s = await loadSettings(env.DB);
  const { results } = await env.DB
    .prepare(
      `SELECT o.id AS oid, o.user_id, o.chat_id, o.score, o.checked, o.asked, ${ADS_COLS.map((c) => 'a.' + c).join(', ')}
         FROM outbox o JOIN ads a ON a.token = o.ad_token
        WHERE o.status = 'pending' ORDER BY o.id LIMIT ?`,
    )
    .bind(s.drainBatch)
    .all<OutRow>();

  const stmts: D1PreparedStatement[] = [];
  for (const r of results) {
    const res = await sendCard(env, r.chat_id, rowToAd(r), { score: r.score, checked: r.checked, asked: r.asked });
    if (res.ok) {
      stmts.push(env.DB.prepare("UPDATE outbox SET status='sent', sent_at=? WHERE id=?").bind(nowSec(), r.oid));
    } else if (res.status === 429) {
      break;                                            // Telegram asked us to slow down; retry next minute
    } else if (res.status === 403) {
      stmts.push(env.DB.prepare("UPDATE outbox SET status='failed', last_error='bot blocked' WHERE id=?").bind(r.oid));
      stmts.push(env.DB.prepare('UPDATE users SET bot_stopped = 1 WHERE id = ?').bind(r.user_id));
    } else {
      stmts.push(
        env.DB
          .prepare(
            "UPDATE outbox SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END WHERE id = ?",
          )
          .bind((res.description ?? `http ${res.status}`).slice(0, 200), r.oid),
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);

  const d = new Date();
  if (d.getUTCHours() === 3 && d.getUTCMinutes() === 0) await prune(env, s.retentionDays);
}

async function prune(env: Env, retentionDays: number): Promise<void> {
  const now = nowSec();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM outbox WHERE status != 'pending' AND created_at < ?").bind(now - 14 * 86400),
    env.DB
      .prepare("DELETE FROM ads WHERE first_seen < ? AND token NOT IN (SELECT ad_token FROM outbox WHERE status = 'pending')")
      .bind(now - retentionDays * 86400),
    env.DB.prepare('DELETE FROM audit_log WHERE at < ?').bind(now - 90 * 86400),
  ]);
}
