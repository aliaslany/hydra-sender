import type { Ad, Deal, PropertyType, SiteConfig } from './core/types.ts';
import { MAX_TOLERANCE } from './core/types.ts';
import { nowSec } from './util.ts';

export interface CategoryDef { slug: string; deal: Deal; property: PropertyType }

export interface Settings {
  cityIds: string[];
  categories: CategoryDef[];
  sites: SiteConfig[];     // extra HTML sources (Sheypoor, Aryamarz, Amlak Mall, ...)
  tolerance: number;
  minScore: number;
  crawlBudget: number;   // max external subrequests per crawl run (Free plan hard limit is 50)
  drainBatch: number;    // max notifications per minute (each may cost up to 2 subrequests)
  defaultPlanId: number | null;
  supportContact: string;
  retentionDays: number;
}

// Slugs follow divar.ir/s/<city>/<slug> URLs. Verify them with /api/admin/spike.
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { slug: 'buy-apartment', deal: 'buy', property: 'apartment' },
  { slug: 'rent-apartment', deal: 'rent', property: 'apartment' },
];

export const DEFAULT_SITES: SiteConfig[] = [
  {
    id: 'sheypoor',
    enabled: true,
    linkPattern: 'https://www\\.sheypoor\\.com/v/.*-\\d+\\.html',
    idPattern: '-(\\d+)\\.html',
    lists: [
      { url: 'https://www.sheypoor.com/s/iran/houses-apartments-for-sale', deal: 'buy', property: 'apartment' },
      { url: 'https://www.sheypoor.com/s/iran/house-apartment-for-rent', deal: 'rent', property: 'apartment' },
    ],
    priceUnit: 'toman',
    maxDetails: 2,
  },
  {
    id: 'ariamarz',
    enabled: true,
    linkPattern: 'https://www\\.ariamarz\\.com/(?:buy|rent)-(?:apartment|villa)/[^"\'\\s]+',
    idPattern: '(\\d+)$',
    lists: [
      { url: 'https://www.ariamarz.com/buy-apartment/tehran', deal: 'buy', property: 'apartment' },
      { url: 'https://www.ariamarz.com/rent-apartment/tehran', deal: 'rent', property: 'apartment' },
    ],
    priceUnit: 'toman',
    maxDetails: 2,
  },
];

export const SETTING_KEYS = [
  'city_ids', 'categories', 'sites', 'tolerance', 'min_score', 'crawl_budget', 'drain_batch',
  'default_plan_id', 'support_contact', 'retention_days',
] as const;

export async function rawSettings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

const num = (v: string | undefined, d: number): number => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};

export async function loadSettings(db: D1Database): Promise<Settings> {
  const r = await rawSettings(db);
  let categories = DEFAULT_CATEGORIES;
  try { if (r.categories) categories = JSON.parse(r.categories); } catch { /* keep defaults */ }
  let sites: SiteConfig[] = [];
  try { if (r.sites) sites = JSON.parse(r.sites); } catch { /* ignore */ }
  const plan = r.default_plan_id ? Number(r.default_plan_id) : NaN;
  return {
    cityIds: (r.city_ids ?? '1').split(',').map((x) => x.trim()).filter(Boolean),
    categories,
    sites: Array.isArray(sites) ? sites : [],
    tolerance: Math.min(num(r.tolerance, 0.1), MAX_TOLERANCE),
    minScore: num(r.min_score, 60),
    crawlBudget: Math.min(num(r.crawl_budget, 40), 45),
    drainBatch: Math.min(num(r.drain_batch, 20), 24),
    defaultPlanId: Number.isFinite(plan) ? plan : null,
    supportContact: r.support_contact ?? '',
    retentionDays: num(r.retention_days, 30),
  };
}

export async function audit(db: D1Database, action: string, detail?: unknown): Promise<void> {
  await db.prepare('INSERT INTO audit_log (action, detail) VALUES (?, ?)').bind(action, detail == null ? null : JSON.stringify(detail)).run();
}

// ---- users & plans ----------------------------------------------------------

export interface UserRow {
  id: number; chat_id: number; username: string | null; first_name: string | null;
  is_blocked: number; bot_stopped: number; plan_id: number | null;
  expires_at: number | null; searches_remaining: number | null; wizard: string | null; created_at: number;
}
export interface PlanRow { id: number; name: string; is_paid: number; duration_days: number | null; max_searches: number | null; price: number | null }

export const getUser = (db: D1Database, id: number) =>
  db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();

export const getPlan = (db: D1Database, id: number) =>
  db.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first<PlanRow>();

/** Gives a user a plan; days/searches override the plan's defaults when provided. */
export function grantStatement(db: D1Database, userId: number, plan: PlanRow, days?: number | null, searches?: number | null) {
  const d = days !== undefined ? days : plan.duration_days;
  const s = searches !== undefined ? searches : plan.max_searches;
  return db
    .prepare('UPDATE users SET plan_id = ?, expires_at = ?, searches_remaining = ? WHERE id = ?')
    .bind(plan.id, d == null ? null : nowSec() + d * 86400, s ?? null, userId);
}

export async function ensureUser(
  db: D1Database, s: Settings, from: { id: number; username?: string; first_name?: string }, chatId: number,
): Promise<UserRow> {
  const existing = await getUser(db, from.id);
  if (existing) {
    await db.prepare('UPDATE users SET chat_id = ?, username = ?, first_name = ?, bot_stopped = 0 WHERE id = ?')
      .bind(chatId, from.username ?? null, from.first_name ?? null, from.id).run();
    return { ...existing, chat_id: chatId, bot_stopped: 0 };
  }
  await db.prepare('INSERT INTO users (id, chat_id, username, first_name) VALUES (?, ?, ?, ?)')
    .bind(from.id, chatId, from.username ?? null, from.first_name ?? null).run();
  if (s.defaultPlanId != null) {
    const plan = await getPlan(db, s.defaultPlanId);
    if (plan) await grantStatement(db, from.id, plan).run();
  }
  return (await getUser(db, from.id))!;
}

// ---- ads ---------------------------------------------------------------------

export const ADS_COLS = [
  'token', 'deal', 'property', 'title', 'url', 'image', 'district', 'total', 'per_m2', 'deposit', 'rent',
  'area', 'rooms', 'floor', 'year', 'parking', 'storage', 'elevator', 'balcony',
  'orientation', 'structure', 'cabinet', 'cooling', 'heating',
] as const;

const b = (v: boolean | undefined) => (v == null ? null : v ? 1 : 0);

export function insertAdStatement(db: D1Database, ad: Ad) {
  const vals = [
    ad.token, ad.deal, ad.property, ad.title, ad.url, ad.image ?? null, ad.district ?? null,
    ad.total ?? null, ad.perM2 ?? null, ad.deposit ?? null, ad.rent ?? null,
    ad.area ?? null, ad.rooms ?? null, ad.floor ?? null, ad.year ?? null,
    b(ad.parking), b(ad.storage), b(ad.elevator), b(ad.balcony),
    ad.orientation ?? null, ad.structure ?? null, ad.cabinet ?? null, ad.cooling ?? null, ad.heating ?? null,
  ];
  return db
    .prepare(`INSERT OR IGNORE INTO ads (${ADS_COLS.join(',')}) VALUES (${ADS_COLS.map(() => '?').join(',')})`)
    .bind(...vals);
}

export const failedAdStatement = (db: D1Database, token: string) =>
  db.prepare("INSERT OR IGNORE INTO ads (token, status) VALUES (?, 'failed')").bind(token);

const n = (v: unknown) => (v == null ? undefined : (v as number));
const t = (v: unknown) => (v == null ? undefined : (v as string));
const f = (v: unknown) => (v == null ? undefined : v === 1);

export function rowToAd(r: Record<string, unknown>): Ad {
  return {
    token: r.token as string, deal: r.deal as Deal, property: r.property as PropertyType,
    title: (r.title as string) ?? '', url: (r.url as string) ?? '',
    image: t(r.image), district: t(r.district),
    total: n(r.total), perM2: n(r.per_m2), deposit: n(r.deposit), rent: n(r.rent),
    area: n(r.area), rooms: n(r.rooms), floor: n(r.floor), year: n(r.year),
    parking: f(r.parking), storage: f(r.storage), elevator: f(r.elevator), balcony: f(r.balcony),
    orientation: t(r.orientation), structure: t(r.structure), cabinet: t(r.cabinet),
    cooling: t(r.cooling), heating: t(r.heating),
  };
}
