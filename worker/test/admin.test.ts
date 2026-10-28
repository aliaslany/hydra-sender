import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin } from '../src/admin.ts';
import { fakeD1 } from './fake-d1.ts';

const DB = fakeD1();
const env: any = { DB, ADMIN_TOKEN: 'secret', BOT_TOKEN: 'x', WEBHOOK_SECRET: 'w' };
const call = async (path: string, method = 'GET', body?: unknown, token = 'secret') => {
  const res = await handleAdmin(new Request('https://bot.test/api/admin' + path, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json() as any };
};

test('admin API requires the token', async () => {
  assert.equal((await call('/stats', 'GET', undefined, 'wrong')).status, 401);
  assert.equal((await call('/stats')).status, 200);
});

test('plans, grant, block, user search', async () => {
  DB.raw.exec("INSERT INTO users (id, chat_id, first_name, username) VALUES (5, 50, 'مریم', 'maryam')");
  const plan = await call('/plans', 'POST', { name: 'ماهانه', is_paid: true, duration_days: 30, max_searches: 10, price: 500000 });
  assert.equal(plan.status, 200);

  let g = await call('/users/5/grant', 'POST', { plan_id: plan.data.id });
  assert.equal(g.status, 200);
  let u = (await call('/users?q=maryam')).data[0];
  assert.equal(u.plan_name, 'ماهانه'); assert.equal(u.searches_remaining, 10); assert.ok(u.expires_at > Date.now() / 1000);

  await call('/users/5/grant', 'POST', { plan_id: plan.data.id, days: null, searches: 3 }); // unlimited time, 3 searches
  u = (await call('/users?q=5')).data[0];
  assert.equal(u.expires_at, null); assert.equal(u.searches_remaining, 3);

  await call('/users/5/block', 'POST', { blocked: true });
  assert.equal((await call('/users')).data[0].is_blocked, 1);
  assert.equal((await call('/users/99/grant', 'POST', { plan_id: plan.data.id })).status, 404);
});

test('settings are validated and persisted', async () => {
  assert.equal((await call('/settings', 'PUT', { tolerance: '0.5' })).status, 400);
  assert.equal((await call('/settings', 'PUT', { categories: '[{"slug":"x","deal":"sell","property":"apartment"}]' })).status, 400);
  assert.equal((await call('/settings', 'PUT', { nope: '1' })).status, 400);
  assert.equal((await call('/settings', 'PUT', { tolerance: '0.12', city_ids: '1,3', support_contact: '@admin' })).status, 200);
  const s = (await call('/settings')).data;
  assert.equal(s.tolerance, '0.12'); assert.equal(s.city_ids, '1,3'); assert.equal(s.min_score, '60');
  assert.equal((await call('/stats')).data.users, 1);
});
