import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, normalizeAd } from '../src/core/normalize.ts';
import { renderCard, fmtMoney } from '../src/core/card.ts';

test('parseNum handles Persian digits, separators and words', () => {
  assert.equal(parseNum('۲٬۵۰۰٬۰۰۰ تومان'), 2500000);
  assert.equal(parseNum('۲ میلیارد و ۵۰۰ میلیون'), 2500000000);
  assert.equal(parseNum('۱٫۵ میلیارد'), 1500000000);
  assert.equal(parseNum('۸۵ متر'), 85);
  assert.equal(parseNum('۳ از ۵'), 3);
  assert.equal(parseNum('بدون عدد'), undefined);
});

const detail = {
  share: { title: 'آپارتمان ۸۵ متری' },
  seo: { web_info: { district_persian: 'ونک' } },
  sections: [{ widgets: [
    { data: { items: [{ title: 'متراژ', value: '۸۵' }, { title: 'ساخت', value: '۱۳۹۸' }, { title: 'اتاق', value: '۲' }] } },
    { data: { title: 'قیمت کل', value: '۲٬۵۰۰٬۰۰۰٬۰۰۰ تومان' } },
    { data: { title: 'طبقه', value: '۳ از ۵' } },
    { data: { title: 'پارکینگ', disabled: false } },
    { data: { title: 'انباری', disabled: true } },
    { data: { title: 'آسانسور', value: 'ندارد' } },
    { data: { image_url: 'https://s100.divarcdn.com/static/photo/a.jpg' } },
  ] }],
};

test('normalizeAd maps labels, flags and derives price per m2', () => {
  const ad = normalizeAd('TOK', detail, { deal: 'buy', property: 'apartment' });
  assert.equal(ad.title, 'آپارتمان ۸۵ متری');
  assert.equal(ad.area, 85); assert.equal(ad.year, 1398); assert.equal(ad.rooms, 2);
  assert.equal(ad.total, 2500000000); assert.equal(ad.perM2, Math.round(2500000000 / 85));
  assert.equal(ad.floor, 3);
  assert.equal(ad.parking, true); assert.equal(ad.storage, false); assert.equal(ad.elevator, false);
  assert.equal(ad.district, 'ونک');
  assert.ok(ad.image?.endsWith('a.jpg'));
});

test('rent ads read deposit and monthly rent only', () => {
  const ad = normalizeAd('R', { sections: [{ title: 'ودیعه', value: '۵۰۰٬۰۰۰٬۰۰۰' }, { title: 'اجارهٔ ماهانه', value: '۱۵٬۰۰۰٬۰۰۰' }] }, { deal: 'rent', property: 'apartment' });
  assert.equal(ad.deposit, 500000000); assert.equal(ad.rent, 15000000); assert.equal(ad.total, undefined);
});

test('card formatting', () => {
  assert.equal(fmtMoney(2500000000), '۲٫۵ میلیارد تومان');
  const ad = normalizeAd('TOK', detail, { deal: 'buy', property: 'apartment' });
  const card = renderCard(ad, { score: 92, checked: 3, asked: 4 });
  assert.ok(card.includes('https://divar.ir/v/TOK'));
  assert.ok(card.includes('۹۲٪'));
});

import { parseRange } from '../src/core/range.ts';
import { entitlement } from '../src/core/access.ts';

test('parseRange variants', () => {
  assert.deepEqual(parseRange('۸۰-۱۲۰'), { min: 80, max: 120 });
  assert.deepEqual(parseRange('۲ میلیارد تا ۳ میلیارد'), { min: 2e9, max: 3e9 });
  assert.deepEqual(parseRange('۸۰-'), { min: 80 });
  assert.deepEqual(parseRange('-۱۲۰'), { max: 120 });
  assert.deepEqual(parseRange('۹۰'), { min: 90, max: 90 });
  assert.deepEqual(parseRange('120-80'), { min: 80, max: 120 });
  assert.equal(parseRange('abc'), null);
  assert.equal(parseRange('۸۰-xyz'), null);
});

test('entitlement rules', () => {
  const f = { plan_id: 1, expires_at: null, searches_remaining: null, is_blocked: 0 };
  assert.equal(entitlement(f, 100).canCreate, true);
  assert.equal((entitlement({ ...f, plan_id: null }, 100) as any).reason, 'no_plan');
  assert.equal((entitlement({ ...f, expires_at: 50 }, 100) as any).reason, 'expired');
  assert.equal((entitlement({ ...f, searches_remaining: 0 }, 100) as any).reason, 'quota');
  assert.equal((entitlement({ ...f, is_blocked: 1 }, 100) as any).reason, 'blocked');
  assert.equal(entitlement({ ...f, expires_at: 500, searches_remaining: 2 }, 100).canCreate, true);
});
