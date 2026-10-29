import type { Range } from './types.ts';
import { parseNum, toEnDigits } from './normalize.ts';

/** "80-120", "۲ میلیارد تا ۳ میلیارد", "80-" (min only), "-120" (max only), "90" (about 90). */
export function parseRange(input: string): Range | null {
  const s = toEnDigits(input).replace(/[–—]/g, '-').replace(/\s+تا\s+/g, '-').trim();
  if (!s) return null;
  if (!s.includes('-')) {
    const n = parseNum(s);
    return n == null ? null : { min: n, max: n };
  }
  const [a, b] = s.split('-', 2).map((x) => x.trim());
  const min = a ? parseNum(a) : undefined;
  const max = b ? parseNum(b) : undefined;
  if ((a && min == null) || (b && max == null)) return null;
  if (min == null && max == null) return null;
  if (min != null && max != null && min > max) return { min: max, max: min };
  const r: Range = {};
  if (min != null) r.min = min;
  if (max != null) r.max = max;
  return r;
}
