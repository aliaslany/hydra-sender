import type { Env } from './env.ts';
import { proxiedFetch } from './http.ts';

const SEARCH_URL = 'https://api.divar.ir/v8/postlist/w/search';
const detailUrl = (token: string) => `https://api.divar.ir/v8/posts-v2/web/${token}`;

const BASE_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  origin: 'https://divar.ir',
  referer: 'https://divar.ir/',
};

async function divarFetch(env: Env, url: string, init: RequestInit = {}): Promise<Response> {
  return proxiedFetch(env, url, { ...init, headers: { ...BASE_HEADERS, ...(init.headers as Record<string, string> | undefined) } });
}

async function readJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}

export function extractTokens(body: any): string[] {
  const widgets: any[] = body?.list_widgets ?? body?.widget_list ?? [];
  const out = new Set<string>();
  for (const w of widgets) if (typeof w?.data?.token === 'string') out.add(w.data.token);
  return [...out];
}

export interface SearchResult { ok: boolean; status: number; tokens: string[]; body: any }

/** Newest ads for a category. One subrequest. */
export async function searchTokens(env: Env, cityIds: string[], slug: string): Promise<SearchResult> {
  const res = await divarFetch(env, SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      city_ids: cityIds,
      source_view: 'FILTER',
      disable_recommendation: false,
      search_data: {
        form_data: { data: { category: { str: { value: slug } }, sort: { str: { value: 'sort_date' } } } },
      },
    }),
  });
  const body = await readJson(res);
  return { ok: res.ok, status: res.status, tokens: res.ok ? extractTokens(body) : [], body };
}

export interface DetailResult { ok: boolean; status: number; json: any }

/** One ad's full details. One subrequest. */
export async function fetchDetail(env: Env, token: string): Promise<DetailResult> {
  const res = await divarFetch(env, detailUrl(token));
  return { ok: res.ok, status: res.status, json: res.ok ? await readJson(res) : null };
}
