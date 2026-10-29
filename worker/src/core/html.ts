// Small regex-based HTML helpers (no DOM in Workers). Pure functions, unit-tested.
import { norm, type Row } from './normalize.ts';

const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&zwnj;': '\u200c' };

export function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|zwnj);/g, (m) => ENT[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Absolute, de-duplicated hrefs that match `pattern`, in page order. */
export function extractLinks(html: string, base: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let u: string;
    try { u = new URL(m[1].replace(/&amp;/g, '&'), base).toString(); } catch { continue; }
    if (seen.has(u) || !pattern.test(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** JSON-LD and Next.js __NEXT_DATA__ style blobs embedded in <script type="application/...json">. */
export function extractJsonBlobs(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1])); } catch { /* ignore malformed blob */ }
  }
  return out;
}

export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) out.title = stripTags(t[1]);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = m[0].match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    const val = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (key && val != null && !(key in out)) out[key] = stripTags(val);
  }
  return out;
}

/** label/value pairs from tables, definition lists, two-span list items and "label: value" text. */
export function extractHtmlRows(html: string, limit = 400): Row[] {
  const rows: Row[] = [];
  const push = (a: string, b: string) => {
    const label = norm(stripTags(a)).replace(/[:：]\s*$/, '');
    const value = stripTags(b);
    if (label && label.length <= 40 && rows.length < limit) rows.push({ label, value: value || undefined });
  };
  // Tables: closing </td>/</tr> tags are optional in HTML, so cells end at the next cell/row/table boundary.
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)(?=<tr[\s>]|<\/tr>|<\/table>|$)/gi)) {
    const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)(?=<\/t[hd]>|<t[hd][\s>]|$)/gi)];
    if (cells.length >= 2) push(cells[0][1], cells[1][1]);
  }
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) push(m[1], m[2]);
  for (const m of html.matchAll(/<li[^>]*>\s*<(?:span|div|p|strong|b|label)[^>]*>([^<]{1,40})<\/(?:span|div|p|strong|b|label)>\s*<(?:span|div|p|strong|b|a)[^>]*>([^<]{1,80})</gi)) push(m[1], m[2]);
  for (const m of html.matchAll(/>\s*([^<>:：]{2,30})[:：]\s*([^<>]{1,80})</g)) push(m[1], m[2]);
  return rows;
}
