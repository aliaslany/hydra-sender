import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAd } from '../src/core/match.ts';
import type { Ad } from '../src/core/types.ts';

const base: Ad = { token: 't', title: 'x', url: 'u', deal: 'buy', property: 'apartment' };

test('inside range scores 100', () => {
  const r = scoreAd({ ...base, total: 2e9, area: 90 }, { total: { min: 1.5e9, max: 2.5e9 }, area: { min: 80, max: 100 } }, 0.1);
  assert.equal(r.ok, true); assert.equal(r.score, 100); assert.equal(r.checked, 2);
});

test('inside tolerance gets partial credit, beyond tolerance is excluded', () => {
  const c = { total: { max: 2e9 } };
  const near = scoreAd({ ...base, total: 2.1e9 }, c, 0.1);     // 5% over
  assert.equal(near.ok, true);
  assert.ok(near.score! > 50 && near.score! < 100);
  assert.equal(scoreAd({ ...base, total: 2.4e9 }, c, 0.1).ok, false); // 20% over
});

test('tolerance is capped at 15%', () => {
  assert.equal(scoreAd({ ...base, total: 2.5e9 }, { total: { max: 2e9 } }, 0.9).ok, false); // 25% over
  assert.equal(scoreAd({ ...base, total: 2.28e9 }, { total: { max: 2e9 } }, 0.9).ok, true);  // 14% over
});

test('unknown ad values are not counted against the ad', () => {
  const r = scoreAd({ ...base, total: 2e9 }, { total: { max: 2.5e9 }, flags: { parking: true }, attrs: { orientation: 'شمالی' } }, 0.1);
  assert.equal(r.asked, 3); assert.equal(r.checked, 1); assert.equal(r.score, 100);
});

test('soft criteria lower the score but never exclude', () => {
  const r = scoreAd({ ...base, total: 2e9, parking: false, floor: 9 }, { total: { max: 2e9 }, flags: { parking: true }, floor: { min: 1, max: 3 } }, 0.1);
  assert.equal(r.ok, true); assert.ok(r.score! < 100);
});

test('nothing measurable gives null score', () => {
  const r = scoreAd(base, { total: { max: 1e9 } }, 0.1);
  assert.equal(r.ok, true); assert.equal(r.score, null);
});

test('attribute matching ignores ZWNJ/case variants', () => {
  const r = scoreAd({ ...base, cooling: 'کولر\u200cگازی' }, { attrs: { cooling: 'کولرگازی' } }, 0.1);
  assert.equal(r.score, 100);
});
