import type { Env } from './env.ts';
import type { Ad, Deal, PropertyType, SiteConfig } from './core/types.ts';
import { normalizeAd } from './core/normalize.ts';
import { linkTokens, siteAd } from './core/sitepage.ts';
import { searchTokens, fetchDetail } from './divar.ts';
import { fetchHtml } from './http.ts';
import type { Settings } from './db.ts';

export type LoadResult = { ok: true; ad: Ad } | { ok: false; status: number };

/** One crawlable source of new ads for a single deal/property pair. */
export interface Feed {
  label: string;
  deal: Deal;
  property: PropertyType;
  maxDetails: number;                       // detail fetches allowed per run
  list(): Promise<{ ok: boolean; status: number; tokens: string[] }>;   // 1 subrequest
  load(token: string): Promise<LoadResult>;                              // 1 subrequest
}

function divarFeeds(env: Env, s: Settings): Feed[] {
  return s.categories.map((cat) => ({
    label: `divar:${cat.slug}`, deal: cat.deal, property: cat.property, maxDetails: 100,
    async list() { const r = await searchTokens(env, s.cityIds, cat.slug); return { ok: r.ok, status: r.status, tokens: r.tokens }; },
    async load(token) {
      const d = await fetchDetail(env, token);
      return d.ok ? { ok: true, ad: normalizeAd(token, d.json, cat) } : { ok: false, status: d.status };
    },
  }));
}

function siteFeeds(env: Env, site: SiteConfig): Feed[] {
  const useProxy = site.useProxy !== false;
  return site.lists.map((list) => {
    const urls = new Map<string, string>();   // token -> ad url, filled by list()
    return {
      label: `${site.id}:${list.url}`, deal: list.deal, property: list.property, maxDetails: site.maxDetails ?? 3,
      async list() {
        const r = await fetchHtml(env, list.url, useProxy);
        if (!r.ok) return { ok: false, status: r.status, tokens: [] };
        const found = linkTokens(r.html, list.url, site).slice(0, 40);
        for (const f of found) urls.set(f.token, f.url);
        return { ok: true, status: r.status, tokens: found.map((f) => f.token) };
      },
      async load(token) {
        const url = urls.get(token);
        if (!url) return { ok: false, status: 404 };
        const r = await fetchHtml(env, url, useProxy);
        if (!r.ok) return { ok: false, status: r.status };
        const ad = siteAd(r.html, url, token, site, list);
        return ad ? { ok: true, ad } : { ok: false, status: 422 };   // 422 = fetched, but no listing data found
      },
    };
  });
}

export function buildFeeds(env: Env, s: Settings): Feed[] {
  return [
    ...divarFeeds(env, s),
    ...s.sites.filter((x) => x.enabled !== false).flatMap((x) => siteFeeds(env, x)),
  ];
}
