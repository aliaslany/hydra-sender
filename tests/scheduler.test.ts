import { afterEach, describe, expect, it, vi } from 'vitest';
import { interleaveSourceTokens, runScheduledTick, shouldTransitionBackfillToLive } from '../src/cron/scheduler';
import { Env } from '../src/types';

describe('Scheduler Helpers & Orchestration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('interleaves Divar and Sheypoor tokens cleanly so neither starves under tight subrequest limits', () => {
    expect(interleaveSourceTokens(['d1', 'd2', 'd3'], ['sp_1'])).toEqual([
      { source: 'divar', token: 'd1' },
      { source: 'sheypoor', token: 'sp_1' },
      { source: 'divar', token: 'd2' },
      { source: 'divar', token: 'd3' }
    ]);
  });

  it('prevents premature BACKFILL -> LIVE transition when a source errors or page processing truncates', () => {
    expect(
      shouldTransitionBackfillToLive({
        isBackfill: true,
        newQueuedTotal: 5,
        backfillTargetCount: 30,
        sourceErrorsCount: 1,
        divarRemainingUnprocessed: false,
        sheypoorRemainingUnprocessed: false,
        nextDivarCursor: null,
        sheypoorHasMore: false
      })
    ).toBe(false);

    expect(
      shouldTransitionBackfillToLive({
        isBackfill: true,
        newQueuedTotal: 5,
        backfillTargetCount: 30,
        sourceErrorsCount: 0,
        divarRemainingUnprocessed: true,
        sheypoorRemainingUnprocessed: false,
        nextDivarCursor: null,
        sheypoorHasMore: false
      })
    ).toBe(false);

    expect(
      shouldTransitionBackfillToLive({
        isBackfill: true,
        newQueuedTotal: 5,
        backfillTargetCount: 30,
        sourceErrorsCount: 0,
        divarRemainingUnprocessed: false,
        sheypoorRemainingUnprocessed: false,
        nextDivarCursor: null,
        sheypoorHasMore: false
      })
    ).toBe(true);
  });

  it('gates polling on single active non-expired unbanned subscription and checks opposite-source-only dedup', async () => {
    const executedSql: Array<{ sql: string; binds: any[] }> = [];

    const mockDb = {
      prepare(sql: string) {
        let currentBinds: any[] = [];
        const stmt: any = {
          bind(...args: any[]) {
            currentBinds = args;
            return stmt;
          },
          async first() {
            executedSql.push({ sql, binds: currentBinds });
            if (sql.includes('FROM sent_ads') && sql.includes('post_token LIKE')) {
              return null;
            }
            return null;
          },
          async all() {
            executedSql.push({ sql, binds: currentBinds });
            if (sql.includes('FROM filter_rules r')) {
              return {
                results: [
                  {
                    id: 'rule_1',
                    channel_id: 'ch_1',
                    owner_user_id: 1000000,
                    name: 'Aliabad',
                    is_active: 1,
                    city_ids_json: '["823"]',
                    districts_json: '[]',
                    deal_type: 'BUY',
                    property_type: 'ALL_RESIDENTIAL',
                    divar_category_slug: 'buy-residential',
                    min_budget: 0,
                    max_budget: 6_000_000_000,
                    min_rent: 0,
                    max_rent: 0,
                    allow_rahn_conversion: 1,
                    max_price_per_m2: 0,
                    min_area: 75,
                    max_area: 250,
                    tolerance_pct: 0.15,
                    min_match_score: 65,
                    stage2_filters_json: '{}',
                    exclude_agency: 1,
                    max_post_age_hours: 24,
                    source_divar: 1,
                    source_sheypoor: 0,
                    chat_id: '@aliabadmelk',
                    channel_title: 'Aliabad Melk',
                    phase: 'BACKFILL',
                    backfill_target_count: 30,
                    backfill_queued_count: 0,
                    pagination_cursor_date: null,
                    pagination_page: 1,
                    sheypoor_page: 1,
                    consecutive_errors: 0,
                    searches_used_today: 0,
                    total_ads_sent: 0,
                    daily_ad_quota: 1000
                  }
                ]
              };
            }
            return { results: [] };
          },
          async run() {
            executedSql.push({ sql, binds: currentBinds });
            return { success: true };
          }
        };
        return stmt;
      },
      async batch(stmts: any[]) {
        for (const s of stmts) {
          if (typeof s.run === 'function') await s.run();
        }
        return [];
      }
    } as unknown as D1Database;

    const fakeTimestamp = new Date(Date.now() - 600_000).toISOString();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/v8/postlist/w/search')) {
        return {
          ok: true,
          json: async () => ({
            list_widgets: [{ widget_type: 'POST_ROW', data: { action: { payload: { token: 'divar_tok_1' } } } }],
            pagination: { data: { last_post_date: null } }
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          share: { title: 'آپارتمان ۱۰۰ متری', description: 'سند تک برگ' },
          web_info: { city_persian: 'علی‌آباد کتول', category_slug_persian: 'فروش آپارتمان', created_at: fakeTimestamp },
          sections: [
            {
              section_name: 'LIST_DATA',
              widgets: [
                { widget_type: 'GROUP_INFO_ROW', data: { items: [{ title: 'متراژ', value: '100' }, { title: 'ساخت', value: '1398' }, { title: 'اتاق', value: '2' }] } },
                { widget_type: 'UNEXPANDABLE_ROW', data: { title: 'قیمت کل', value: '4500000000' } }
              ]
            }
          ]
        })
      };
    }));

    await runScheduledTick({
      DB: mockDb,
      BOT_TOKEN: 'test-token',
      DEFAULT_TIMEZONE: 'Asia/Tehran'
    } as unknown as Env);

    const activeRuleQuery = executedSql.find((q) => q.sql.includes('FROM filter_rules r'));
    expect(activeRuleQuery).toBeDefined();
    expect(activeRuleQuery!.sql).toContain('JOIN subscriptions sub ON sub.id =');
    expect(activeRuleQuery!.sql).toContain('ORDER BY s2.expires_at DESC');
    expect(activeRuleQuery!.sql).toContain('COALESCE(u.is_banned, 0) = 0');

    const dedupQuery = executedSql.find((q) => q.sql.includes('AND fingerprint = ?'));
    expect(dedupQuery).toBeDefined();
    expect(dedupQuery!.sql).toContain("post_token LIKE 'sp_%'");
  });
});
