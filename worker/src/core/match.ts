import type { Ad, Criteria, MatchResult, Range, FlagKey, AttrKey, RangeKey } from './types.ts';
import { MAX_TOLERANCE } from './types.ts';

// Hard ranges: outside tolerance => ad excluded. Inside tolerance => partial credit.
const HARD: Record<string, number> = { total: 25, perM2: 10, deposit: 20, rent: 20, area: 20 };
// Soft ranges: a miss only costs points.
const SOFT: Record<string, number> = { rooms: 6, floor: 4, year: 4 };
const FLAG_W = 5;
const ATTR_W = 4;

const AD_FIELD: Record<RangeKey, keyof Ad> = {
  total: 'total', perM2: 'perM2', deposit: 'deposit', rent: 'rent',
  area: 'area', floor: 'floor', year: 'year', rooms: 'rooms',
};

type Part = { weight: number; earned: number } | 'excluded' | null;

function hasBounds(r?: Range): r is Range {
  return !!r && (r.min != null || r.max != null);
}

function rangePart(v: number | undefined, r: Range | undefined, weight: number, tol: number, hard: boolean): Part {
  if (!hasBounds(r)) return null;           // user did not ask
  if (v == null) return null;               // ad does not say
  let d = 0;
  if (r.min != null && r.min > 0 && v < r.min) d = (r.min - v) / r.min;
  if (r.max != null && r.max > 0 && v > r.max) d = (v - r.max) / r.max;
  if (d === 0) return { weight, earned: weight };
  if (!hard) return { weight, earned: 0 };
  if (d > tol) return 'excluded';
  return { weight, earned: weight * (1 - 0.5 * (d / tol)) }; // 100% inside range -> 50% at the tolerance edge
}

function norm(s: string): string {
  return s.replace(/[\u200c\u200f\u064b-\u065f]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
}

export function clampTolerance(t: number): number {
  if (!Number.isFinite(t) || t < 0) return 0;
  return Math.min(t, MAX_TOLERANCE);
}

export function scoreAd(ad: Ad, c: Criteria, tolerance: number): MatchResult {
  const tol = clampTolerance(tolerance);
  let asked = 0, checked = 0, weight = 0, earned = 0;

  const take = (p: Part, wasAsked: boolean): boolean => {
    if (wasAsked) asked++;
    if (p === 'excluded') return false;
    if (p) { checked++; weight += p.weight; earned += p.earned; }
    return true;
  };

  for (const key of Object.keys(AD_FIELD) as RangeKey[]) {
    const r = c[key];
    const hard = key in HARD;
    const w = hard ? HARD[key] : SOFT[key];
    const v = ad[AD_FIELD[key]] as number | undefined;
    if (!take(rangePart(v, r, w, tol, hard), hasBounds(r))) return { ok: false, score: null, checked, asked };
  }

  for (const k of Object.keys(c.flags ?? {}) as FlagKey[]) {
    if (!c.flags![k]) continue;
    const v = ad[k];
    take(v == null ? null : { weight: FLAG_W, earned: v ? FLAG_W : 0 }, true);
  }

  for (const k of Object.keys(c.attrs ?? {}) as AttrKey[]) {
    const want = c.attrs![k];
    if (!want) continue;
    const have = ad[k];
    take(have == null ? null : { weight: ATTR_W, earned: norm(have).includes(norm(want)) ? ATTR_W : 0 }, true);
  }

  const score = weight === 0 ? null : Math.round((earned / weight) * 100);
  return { ok: true, score, checked, asked };
}
