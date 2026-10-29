// Synthetic pages (NOT real Sheypoor/Aryamarz/Amlak Mall markup): they exercise the generic extraction path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { extractLinks, extractHtmlRows, extractJsonBlobs, metaTags, stripTags } from '../src/core/html.ts';
import { linkTokens, siteAd } from '../src/core/sitepage.ts';
import type { SiteConfig } from '../src/core/types.ts';
import { crawl, drain } from '../src/jobs.ts';
import { fakeD1 } from './fake-d1.ts';

const LIST = `<html><body>
  <a href="/v/apartment-85m-vanak-468031034.html">one</a>
  <a href="/v/apartment-60m-tajrish-468031035.html?x=1">two</a>
  <a href="/v/apartment-85m-vanak-468031034.html">dup</a>
  <a href="/about">about</a>
</body></html>`;

const detailHtml = (price: string) => `<html><head>
  <title>آپارتمان ۸۵ متری ونک | سایت</title>
  <meta property="og:title" content="آپارتمان ۸۵ متری ونک &amp; پارکینگ">
  <meta property="og:image" content="https://img.example.com/a/1.jpg?w=800">
  <script type="application/ld+json">{"@type":"Product","offers":{"price":${price}},"additionalProperty":[{"name":"پارکینگ","value":"دارد"}]}</script>
  </head><body>
  <table><tr><th>متراژ</th><td>۸۵ متر</td></tr><tr><th>سال ساخت</th><td>۱۳۹۸</td></tr><tr><th>تعداد اتاق</th><td>۲</tr></table>
  <ul><li><span>طبقه</span><span>۳ از ۵</span></li></ul>
  <p>انباری: ندارد</p>
</body></html>`;

const site: SiteConfig = {
  id: 'testsite', linkPattern: '/v/.*-\\d+\\.html', idPattern: '-(\\d+)\\.html',
  lists: [{ url: 'https://www.example.com/s/tehran/apartment-for-sale', deal: 'buy', property: 'apartment' }],
};

test('html helpers', () => {
  assert.equal(stripTags('a&nbsp;<b>b</b> &amp; c'), 'a b & c');
  assert.deepEqual(extractLinks(LIST, 'https://www.example.com/s/x', /\.html/).length, 2);
  assert.equal(metaTags(detailHtml('1'))['og:title'], 'آپارتمان ۸۵ متری ونک & پارکینگ');
  assert.equal(extractJsonBlobs(detailHtml('1')).length, 1);
  const rows = extractHtmlRows(detailHtml('1')).map((r) => [r.label, r.value]);
  assert.ok(rows.some((r) => r[0] === 'متراژ' && r[1] === '۸۵ متر'));
  assert.ok(rows.some((r) => r[0] === 'طبقه' && r[1] === '۳ از ۵'));
  assert.ok(rows.some((r) => r[0] === 'انباری' && r[1] === 'ندارد'));
});

test('linkTokens builds namespaced, de-duplicated tokens', () => {
  const t = linkTokens(LIST, site.lists[0].url, site);
  assert.deepEqual(t.map((x) => x.token), ['testsite:468031034', 'testsite:468031035']);
  assert.equal(t[0].url, 'https://www.example.com/v/apartment-85m-vanak-468031034.html');
});

test('siteAd reads table rows, list items, JSON-LD price and flags; rial prices are converted', () => {
  const ad = siteAd(detailHtml('25000000000'), 'https://x/v/1.html', 'testsite:1', { ...site, priceUnit: 'rial' }, { deal: 'buy', property: 'apartment' })!;
  assert.equal(ad.area, 85); assert.equal(ad.year, 1398); assert.equal(ad.rooms, 2); assert.equal(ad.floor, 3);
  assert.equal(ad.total, 2500000000);            // 25e9 rial -> 2.5e9 toman
  assert.equal(ad.parking, true); assert.equal(ad.storage, false);
  assert.ok(ad.image?.startsWith('https://img.example.com/a/1.jpg'));
  assert.equal(ad.url, 'https://x/v/1.html');
  assert.equal(siteAd('<html><body>captcha</body></html>', 'u', 't', site, { deal: 'buy', property: 'apartment' }), null);
});

test('crawl: a configured site feeds the same match -> outbox -> drain pipeline', async () => {
  const DB = fakeD1(); const raw = DB.raw as DatabaseSync;
  const env: any = { DB, BOT_TOKEN: 'x', ADMIN_TOKEN: 'a', WEBHOOK_SECRET: 's', ASSETS: {} };
  raw.exec("INSERT INTO settings (key, value) VALUES ('categories', '[]')");        // Divar off, only the site
  raw.prepare("INSERT INTO settings (key, value) VALUES ('sites', ?)").run(JSON.stringify([{ ...site, priceUnit: 'rial', maxDetails: 1 }]));
  raw.exec("INSERT INTO users (id, chat_id, plan_id) VALUES (1, 11, 1)");
  raw.prepare("INSERT INTO searches (user_id, deal, property, criteria) VALUES (1, 'buy', 'apartment', ?)")
    .run(JSON.stringify({ total: { min: 2e9, max: 3e9 }, area: { min: 80, max: 90 } }));

  const calls: string[] = []; const sent: any[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input); calls.push(url);
    const html = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
    if (url.endsWith('/apartment-for-sale')) return html(LIST);
    if (url.includes('468031034')) return html(detailHtml('25000000000'));
    if (url.includes('468031035')) return html(detailHtml('25000000000'));
    if (url.includes('api.telegram.org')) { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, result: {} })); }
    throw new Error('unexpected ' + url);
  }) as any;

  await crawl(env);
  assert.equal(calls.filter((u) => u.includes('.html')).length, 1);             // maxDetails = 1 per run
  assert.deepEqual((raw.prepare('SELECT token FROM ads').all() as any[]).map((r) => r.token), ['testsite:468031034']);
  await crawl(env);                                                             // next run picks up the second ad
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM ads WHERE status = 'ok'").get() as any).n, 2);

  await drain(env);
  assert.equal(sent.length, 2);
  assert.ok(String(sent[0].caption ?? sent[0].text).includes('https://www.example.com/v/'));
});

test('siteAd extracts real Sheypoor Schema.org Offer/Apartment JSON-LD correctly', () => {
  const sheypoorHtml = `<html><head>
    <title>66 متر آلاله شرقی روبه آفتاب | شیپور</title>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Offer",
      "url": "https://www.sheypoor.com/v/66-468686916.html",
      "name": "66 متر آلاله شرقی روبه آفتاب",
      "price": 1750000000,
      "priceCurrency": "toman",
      "itemOffered": {
        "@type": "Apartment",
        "floorSize": { "@type": "QuantitativeValue", "value": 66 },
        "numberOfRooms": "1",
        "address": { "addressRegion": "تهران", "addressLocality": "شهرزیبا" },
        "amenityFeature": [
          { "name": "Parking", "value": true },
          { "name": "Storage", "value": true },
          { "name": "Elevator", "value": false }
        ],
        "additionalProperty": [
          { "name": "Building age", "value": "20 years" },
          { "name": "Price per m² (toman)", "value": 26515000 }
        ]
      }
    }
    </script>
  </head><body></body></html>`;

  const sheypoorSite: SiteConfig = {
    id: 'sheypoor',
    linkPattern: '/v/.*\\.html',
    lists: [{ url: 'https://www.sheypoor.com/s/tehran/houses-apartments-for-sale', deal: 'buy', property: 'apartment' }],
  };

  const ad = siteAd(sheypoorHtml, 'https://www.sheypoor.com/v/66-468686916.html', 'sheypoor:468686916', sheypoorSite, { deal: 'buy', property: 'apartment' })!;
  assert.equal(ad.token, 'sheypoor:468686916');
  assert.equal(ad.area, 66);
  assert.equal(ad.rooms, 1);
  assert.equal(ad.total, 1750000000);
  assert.equal(ad.parking, true);
  assert.equal(ad.storage, true);
  assert.equal(ad.elevator, false);
  assert.equal(ad.district, 'شهرزیبا');
});

test('siteAd extracts Ariamarz SingleFamilyResidence JSON-LD correctly', () => {
  const ariamarzHtml = `<html><head>
    <title>آپارتمان ۱۰۰ متری در تهران | آریامرز</title>
    <script type="application/ld+json">
    {
      "@context": "http://schema.org",
      "@type": "SingleFamilyResidence",
      "name": "خانه و آپارتمان",
      "floorSize": { "@type": "QuantitativeValue", "value": "100" },
      "numberOfRooms": "2",
      "address": {
        "streetAddress": "فروش فوری آپارتمان ۱۰۰ متری",
        "addressLocality": "ایران",
        "addressRegion": "تهران"
      },
      "identifier": 33637983
    }
    </script>
  </head><body>
    <table><tr><th>قیمت کل</th><td>۴ میلیارد تومان</td></tr></table>
  </body></html>`;

  const ariamarzSite: SiteConfig = {
    id: 'ariamarz',
    linkPattern: '/buy-apartment/.*',
    lists: [{ url: 'https://www.ariamarz.com/buy-apartment/tehran', deal: 'buy', property: 'apartment' }],
  };

  const ad = siteAd(ariamarzHtml, 'https://www.ariamarz.com/buy-apartment/tehran-1', 'ariamarz:33637983', ariamarzSite, { deal: 'buy', property: 'apartment' })!;
  assert.equal(ad.token, 'ariamarz:33637983');
  assert.equal(ad.area, 100);
  assert.equal(ad.rooms, 2);
  assert.equal(ad.total, 4000000000);
  assert.equal(ad.district, 'ایران');
});
