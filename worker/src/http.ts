import type { Env } from './env.ts';

/**
 * Workers cannot use an HTTP/SOCKS proxy, so requests go through the forwarder
 * (tools/divar-forwarder) when DIVAR_PROXY_URL is set; otherwise they go direct.
 */
export async function proxiedFetch(env: Env, url: string, init: RequestInit = {}, useProxy = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (useProxy && env.DIVAR_PROXY_URL) {
    if (env.DIVAR_PROXY_SECRET) headers.set('x-proxy-secret', env.DIVAR_PROXY_SECRET);
    return fetch(`${env.DIVAR_PROXY_URL}?url=${encodeURIComponent(url)}`, { ...init, headers });
  }
  return fetch(url, { ...init, headers });
}

const HTML_HEADERS = {
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'fa-IR,fa;q=0.9,en;q=0.5',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};
const MAX_HTML = 600_000; // keep CPU in check on the free plan

export async function fetchHtml(env: Env, url: string, useProxy = true): Promise<{ ok: boolean; status: number; html: string }> {
  const res = await proxiedFetch(env, url, { headers: HTML_HEADERS }, useProxy);
  const html = res.ok ? (await res.text()).slice(0, MAX_HTML) : '';
  return { ok: res.ok, status: res.status, html };
}
