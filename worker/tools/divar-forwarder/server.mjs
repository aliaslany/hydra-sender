// Minimal forwarder for the Cloudflare Worker (Workers cannot use HTTP/SOCKS proxies).
// Run it on a host that can reach api.divar.ir, behind HTTPS (Caddy/nginx/Cloudflare Tunnel).
//   SECRET=change-me PORT=8787 ALLOWED_HOSTS=api.divar.ir,www.sheypoor.com node server.mjs
// Worker settings: DIVAR_PROXY_URL=https://your-host/forward  DIVAR_PROXY_SECRET=change-me
import http from 'node:http';

const SECRET = process.env.SECRET;
const PORT = Number(process.env.PORT ?? 8787);
// Comma-separated hostnames the Worker may reach through this relay.
const ALLOWED = (process.env.ALLOWED_HOSTS ?? 'api.divar.ir').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const PASS = ['content-type', 'accept', 'accept-language', 'user-agent', 'origin', 'referer'];

if (!SECRET) { console.error('Set SECRET'); process.exit(1); }

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/forward' || req.headers['x-proxy-secret'] !== SECRET) { res.writeHead(403).end('forbidden'); return; }
    const target = new URL(u.searchParams.get('url') ?? '');
    if (target.protocol !== 'https:' || !ALLOWED.includes(target.hostname.toLowerCase())) { res.writeHead(400).end('host not allowed'); return; }

    const headers = Object.fromEntries(PASS.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const upstream = await fetch(target, {
      method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.writeHead(502).end('upstream error');
  }
}).listen(PORT, () => console.log(`divar-forwarder on :${PORT}`));
