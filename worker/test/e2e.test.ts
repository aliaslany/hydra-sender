// End-to-end check of crawl -> match -> outbox -> drain and the search wizard,
// using an in-memory SQLite as a stand-in for D1 and a mocked fetch for Divar/Telegram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { fakeD1 } from './fake-d1.ts';
import { crawl, drain } from '../src/jobs.ts';
import { handleUpdate } from '../src/bot.ts';

const detail = {
  share: { title: 'آپارتمان ۸۵ متری ونک' },
  sections: [{ widgets: [
    { data: { items: [{ title: 'متراژ', value: '۸۵' }, { title: 'ساخت', value: '۱۳۹۸' }, { title: 'اتاق', value: '۲' }] } },
    { data: { title: 'قیمت کل', value: '۲٬۵۰۰٬۰۰۰٬۰۰۰ تومان' } },
    { data: { title: 'پارکینگ' } },
    { data: { image_url: 'https://s100.divarcdn.com/static/a.jpg' } },
  ] }],
};

const tgCalls: { method: string; body: any }[] = [];
const divarCalls: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/postlist/w/search')) {
    divarCalls.push('search');
    const slug = JSON.parse(init.body).search_data.form_data.data.category.str.value;
    return j({ list_widgets: slug === 'buy-apartment' ? [{ data: { token: 'AAA' } }, { data: { token: 'BBB' } }] : [] });
  }
  if (url.endsWith('/web/AAA')) { divarCalls.push('AAA'); return j(detail); }
  if (url.endsWith('/web/BBB')) { divarCalls.push('BBB'); return j({}, 404); }
  const m = url.match(/api\.telegram\.org\/bot[^/]+\/(\w+)/);
  if (m) { tgCalls.push({ method: m[1], body: JSON.parse(init.body) }); return j({ ok: true, result: {} }); }
  throw new Error('unexpected fetch ' + url);
}) as any;

const mkEnv = (DB: any) => ({ DB, BOT_TOKEN: 'x', WEBHOOK_SECRET: 's', ADMIN_TOKEN: 'a', ASSETS: {} as any });
const now = () => Math.floor(Date.now() / 1000);

test('crawl -> match -> drain delivers once, only to matching and entitled users', async () => {
  const DB = fakeD1(); const env = mkEnv(DB); const raw = DB.raw as DatabaseSync;
  const crit = (c: object) => JSON.stringify(c);
  raw.exec(`INSERT INTO users (id, chat_id, plan_id, expires_at) VALUES (1, 11, 1, NULL), (2, 22, 1, ${now() - 10}), (3, 33, 1, NULL), (4, 44, NULL, NULL)`);
  const ins = raw.prepare("INSERT INTO searches (user_id, deal, property, criteria) VALUES (?, 'buy', 'apartment', ?)");
  ins.run(1, crit({ total: { min: 2e9, max: 2.6e9 }, area: { min: 80, max: 100 }, flags: { parking: true } })); // matches
  ins.run(2, crit({ total: { max: 2.6e9 } }));                                                                   // expired plan
  ins.run(3, crit({ total: { max: 1e9 } }));                                                                     // too cheap, outside tolerance
  ins.run(4, crit({}));                                                                                          // no plan

  await crawl(env as any);
  const ads = raw.prepare('SELECT token, status, title, total, per_m2, parking FROM ads ORDER BY token').all() as any[];
  assert.deepEqual(ads.map((a) => [a.token, a.status]), [['AAA', 'ok'], ['BBB', 'failed']]);
  assert.equal(ads[0].total, 2500000000); assert.equal(ads[0].parking, 1);
  const out = raw.prepare('SELECT user_id, score, status FROM outbox').all() as any[];
  assert.equal(out.length, 1); assert.equal(out[0].user_id, 1); assert.equal(out[0].score, 100);

  await drain(env as any);
  const photo = tgCalls.filter((c) => c.method === 'sendPhoto');
  assert.equal(photo.length, 1); assert.equal(photo[0].body.chat_id, 11);
  assert.ok(photo[0].body.caption.includes('https://divar.ir/v/AAA'));
  assert.ok(photo[0].body.caption.includes('۱۰۰٪'));
  assert.equal((raw.prepare("SELECT status FROM outbox").get() as any).status, 'sent');

  const before = divarCalls.length;
  await crawl(env as any);                                   // second run: nothing new to fetch or send
  assert.equal(divarCalls.slice(before).join(','), 'search,search'); // one search per category, no detail fetches
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM outbox').get() as any).n, 1);
});

test('wizard: /start grants default plan, steps through to a saved search', async () => {
  const DB = fakeD1(); const env = mkEnv(DB) as any; const raw = DB.raw as DatabaseSync;
  tgCalls.length = 0;
  const from = { id: 7, first_name: 'علی' };
  const msg = (text: string) => handleUpdate(env, { message: { text, from, chat: { id: 70, type: 'private' } } });
  const cb = (data: string) => handleUpdate(env, { callback_query: { id: 'q', data, from, message: { chat: { id: 70 }, message_id: 1 } } });

  await msg('/start');
  let u = raw.prepare('SELECT plan_id, searches_remaining, expires_at FROM users WHERE id = 7').get() as any;
  assert.equal(u.plan_id, 1); assert.equal(u.searches_remaining, 2); assert.ok(u.expires_at > now());

  await msg('/search');
  await cb('w:deal:0');                 // buy
  await cb('w:property:0');             // apartment
  await msg('۲ میلیارد تا ۳ میلیارد');  // total budget
  await cb('w:perM2:s');                // skip price per m2
  await msg('۸۰-۱۲۰');                  // area
  await cb('w:more:0');                 // more details
  await cb('w:parking:0');              // parking required
  for (const id of ['storage', 'elevator', 'year']) await cb(`w:${id}:s`);
  await cb('w:orientation:0');          // north
  await cb('w:storage:s');              // stale button from an earlier step is ignored
  for (const id of ['structure', 'cabinet', 'cooling', 'heating', 'floor', 'rooms', 'balcony']) await cb(`w:${id}:s`);

  const s = raw.prepare('SELECT deal, property, criteria FROM searches WHERE user_id = 7').get() as any;
  assert.equal(s.deal, 'buy'); assert.equal(s.property, 'apartment');
  assert.deepEqual(JSON.parse(s.criteria), {
    total: { min: 2e9, max: 3e9 }, area: { min: 80, max: 120 }, flags: { parking: true }, attrs: { orientation: 'شمالی' },
  });
  u = raw.prepare('SELECT searches_remaining, wizard FROM users WHERE id = 7').get() as any;
  assert.equal(u.searches_remaining, 1); assert.equal(u.wizard, null);
  assert.ok(tgCalls.some((c) => c.method === 'sendMessage' && String(c.body.text).includes('جستجو ثبت شد')));

  // quota exhausted -> /search is refused with an explanation
  raw.exec('UPDATE users SET searches_remaining = 0 WHERE id = 7');
  tgCalls.length = 0;
  await msg('/search');
  assert.ok(String(tgCalls.at(-1)!.body.text).includes('سهمیه'));
  assert.equal((raw.prepare('SELECT wizard FROM users WHERE id = 7').get() as any).wizard, null);
});
