import type { Ad, Deal, PropertyType } from './types.ts';

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
}

/** Normalizes Persian/Arabic letter variants and strips ZWNJ, hamza marks, diacritics. */
export function norm(s: string): string {
  return s.replace(/[\u200c\u200f\u064b-\u065f]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
}

const MULT: Record<string, number> = { 'میلیارد': 1e9, 'میلیون': 1e6, 'هزار': 1e3 };

/** "۲٬۵۰۰٬۰۰۰ تومان" -> 2500000, "۲ میلیارد و ۵۰۰ میلیون" -> 2500000000, "۸۵ متر" -> 85 */
export function parseNum(input: unknown): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined;
  if (typeof input !== 'string') return undefined;
  const s = toEnDigits(input).replace(/٫/g, '.').replace(/[,٬،]/g, '');
  let sum = 0, found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|هزار)/g)) {
    sum += parseFloat(m[1]) * MULT[m[2]];
    found = true;
  }
  if (found) return Math.round(sum);
  const n = s.match(/\d+(?:\.\d+)?/);
  return n ? parseFloat(n[0]) : undefined;
}

const ROOM_WORDS: Record<string, number> = { 'بدون اتاق': 0, 'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5 };
function parseRooms(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseNum(v);
  if (n != null) return n;
  const nv = norm(v);
  for (const [w, k] of Object.entries(ROOM_WORDS)) if (nv.startsWith(w)) return k;
  return undefined;
}

export interface Row { label: string; value?: string; disabled?: boolean }

/** Collects every {title, value} pair anywhere in Divar's detail JSON or Schema.org (structure-independent). */
export function collectRows(node: unknown, out: Row[] = [], depth = 0): Row[] {
  if (node == null || depth > 14) return out;
  if (Array.isArray(node)) { for (const n of node) collectRows(n, out, depth + 1); return out; }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const label = [o.title, o.name, o.label, o.key].find((x) => typeof x === 'string') as string | undefined;
    if (label) {
      const raw = o.value ?? o.subtitle;
      const v = typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : undefined;
      out.push({ label: norm(label), value: v, disabled: o.disabled === true || o.enabled === false });
    }
    for (const k in o) {
      const val = o[k];
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        out.push({ label: norm(k), value: String(val) });
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        const innerVal = (val as any).value;
        if (typeof innerVal === 'string' || typeof innerVal === 'number' || typeof innerVal === 'boolean') {
          out.push({ label: norm(k), value: String(innerVal) });
        }
      }
      collectRows(o[k], out, depth + 1);
    }
  }
  return out;
}

function find(rows: Row[], labels: string[]): Row | undefined {
  const want = labels.map((l) => norm(l).toLowerCase());
  return rows.find((r) => want.includes(r.label.toLowerCase()));
}

function flag(rows: Row[], labels: string[]): boolean | undefined {
  const r = find(rows, labels);
  if (!r) return undefined;
  if (r.disabled) return false;
  if (r.value && /ندارد|نیست|false|no|^0$/i.test(norm(String(r.value)))) return false;
  if (r.value && /دارد|هست|true|yes|^1$/i.test(norm(String(r.value)))) return true;
  return true;
}

function text(rows: Row[], labels: string[]): string | undefined {
  const v = find(rows, labels)?.value;
  return v ? norm(v) : undefined;
}

function findImage(node: unknown, depth = 0): string | undefined {
  if (depth > 14 || node == null) return undefined;
  if (typeof node === 'string') return /^https?:\/\/\S+\.(?:jpe?g|webp|png)(?:\?\S*)?$/i.test(node) ? node : undefined;
  if (Array.isArray(node)) { for (const n of node) { const r = findImage(n, depth + 1); if (r) return r; } return undefined; }
  if (typeof node === 'object') {
    for (const k in node as object) { const r = findImage((node as Record<string, unknown>)[k], depth + 1); if (r) return r; }
  }
  return undefined;
}

function pickStr(obj: any, paths: string[][]): string | undefined {
  for (const p of paths) {
    let cur = obj;
    for (const k of p) cur = cur?.[k];
    if (typeof cur === 'string' && cur.trim()) return cur.trim();
  }
  return undefined;
}

export function normalizeAd(token: string, detail: unknown, hint: { deal: Deal; property: PropertyType }): Ad {
  const rows = collectRows(detail);
  const num = (labels: string[]) => parseNum(find(rows, labels)?.value);

  const ad: Ad = {
    token,
    deal: hint.deal,
    property: hint.property,
    title:
      pickStr(detail, [['share', 'title'], ['data', 'share', 'title'], ['seo', 'web_info', 'title'], ['seo', 'title']]) ??
      `آگهی ${token}`,
    url: `https://divar.ir/v/${token}`,
    image: findImage(detail),
    district:
      pickStr(detail, [['seo', 'web_info', 'district_persian']]) ??
      text(rows, ['addresslocality']) ??
      text(rows, ['addressregion', 'district']),
    area: num(['متراژ', 'متراژ زمین', 'زیربنا', 'متراژ بنا', 'floorsize', 'floor_size', 'area']),
    year: num(['ساخت', 'سال ساخت', 'building age', 'building_age', 'age']),
    rooms: parseRooms(find(rows, ['اتاق', 'تعداد اتاق', 'تعداد خواب', 'numberofrooms', 'number_of_rooms', 'rooms'])?.value),
    floor: num(['طبقه']),
    parking: flag(rows, ['پارکینگ', 'parking', 'has_parking']),
    storage: flag(rows, ['انباری', 'storage', 'has_storage']),
    elevator: flag(rows, ['آسانسور', 'elevator', 'has_elevator']),
    balcony: flag(rows, ['بالکن', 'balcony', 'has_balcony']),
    orientation: text(rows, ['جهت ساختمان', 'جهت', 'orientation']),
    structure: text(rows, ['نوع اسکلت', 'اسکلت', 'structure']),
    cabinet: text(rows, ['جنس کابینت', 'کابینت', 'cabinet']),
    cooling: text(rows, ['سرمایش', 'cooling']),
    heating: text(rows, ['گرمایش', 'heating']),
  };

  if (hint.deal === 'buy') {
    ad.total = num(['قیمت کل', 'قیمت', 'قیمت فروش', 'price']);
    ad.perM2 = num(['قیمت هر متر', 'قیمت هر متر مربع', 'price per m² (toman)', 'price_per_sqm']);
    if (ad.perM2 == null && ad.total && ad.area) ad.perM2 = Math.round(ad.total / ad.area);
  } else {
    ad.deposit = num(['ودیعه', 'رهن', 'مبلغ ودیعه', 'deposit']);
    ad.rent = num(['اجاره ماهانه', 'اجاره', 'اجاره‌ی ماهانه', 'rent']);
  }
  return ad;
}
