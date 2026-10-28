import type { Ad, Deal, PropertyType, SiteConfig } from './types.ts';
import { normalizeAd } from './normalize.ts';
import { extractHtmlRows, extractJsonBlobs, extractLinks, metaTags } from './html.ts';

const DEFAULT_ID = '([^/?#]+?)(?:\\.html)?(?:[?#].*)?$';

/** Ad links on a listing page -> stable tokens like "sheypoor:468031034". */
export function linkTokens(html: string, listUrl: string, site: SiteConfig): { token: string; url: string }[] {
  const links = extractLinks(html, listUrl, new RegExp(site.linkPattern));
  const idRe = new RegExp(site.idPattern ?? DEFAULT_ID);
  return links.map((url) => ({ token: `${site.id}:${url.match(idRe)?.[1] ?? url}`, url }));
}

function ldPrice(node: unknown, depth = 0): number | undefined {
  if (node == null || depth > 8 || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) { for (const n of node) { const r = ldPrice(n, depth + 1); if (r != null) return r; } return undefined; }
  const o = node as Record<string, any>;
  const offer = Array.isArray(o.offers) ? o.offers[0] : o.offers;
  const p = Number(offer?.price ?? (['Offer', 'Product'].includes(o['@type']) ? o.price : undefined));
  if (Number.isFinite(p) && p > 0) return p;
  for (const k in o) { const r = ldPrice(o[k], depth + 1); if (r != null) return r; }
  return undefined;
}

/** Turns a listing page into the same "detail" shape normalizeAd already understands. */
export function pageToDetail(html: string) {
  const meta = metaTags(html);
  const blobs = extractJsonBlobs(html);
  const htmlRows = extractHtmlRows(html).map((r) => ({ title: r.label, value: r.value }));
  const price = ldPrice(blobs);
  if (price != null) htmlRows.push({ title: 'قیمت کل', value: String(price) });
  return {
    share: { title: meta['og:title'] ?? meta.title },
    json: blobs,
    htmlRows,
    images: meta['og:image'] ? [meta['og:image']] : [],
  };
}

/** Returns null when the page has nothing that looks like a listing (blocked page, 404 template, ...). */
export function siteAd(html: string, url: string, token: string, site: SiteConfig, hint: { deal: Deal; property: PropertyType }): Ad | null {
  const ad = normalizeAd(token, pageToDetail(html), hint);
  ad.url = url;
  if (ad.area == null && ad.total == null && ad.deposit == null && ad.rent == null) return null;
  if (site.priceUnit === 'rial') {
    for (const k of ['total', 'perM2', 'deposit', 'rent'] as const) if (ad[k] != null) ad[k] = Math.round(ad[k]! / 10);
  }
  return ad;
}
