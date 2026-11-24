import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSheypoorPostDetail, resolveSheypoorCitySlug, searchSheypoorPostList } from '../src/sheypoor/scraper';
import { Env, FilterRule } from '../src/types';

const mockEnv = {} as Env;
const mockRule = {
  city_ids_json: '["823"]',
  deal_type: 'BUY',
  min_budget: 0,
  max_budget: 6_000_000_000,
  tolerance_pct: 0.15
} as FilterRule;

describe('Sheypoor Scraper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves city 823 to official ali-abad-katul Sheypoor slug', () => {
    expect(resolveSheypoorCitySlug(mockRule)).toBe('ali-abad-katul');
  });

  it('skips promoted paidEngagement, VIP, special, and banner blocks during search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { type: 'paidEngagement', id: '101', attributes: { title: 'Tehran Paid Ad' } },
          { type: 'special', items: [{ id: 111, attributes: { title: 'VIP Sari' } }] },
          { type: 'vip', items: [{ id: 222, attributes: { title: 'VIP Gorgan' } }] },
          { type: 'banner', id: 'ban1', attributes: {} },
          { type: 'normal', id: '333', attributes: { title: 'Normal Aliabad' } }
        ],
        meta: { normal_count: 1 }
      })
    }));

    const res = await searchSheypoorPostList(mockRule, mockEnv, { page: 1 });
    expect(res.tokens).toEqual(['sp_333']);
    expect(res.nextCursorDate).toBeNull();
  });

  it('extracts multi-word city/district, ندارد as false, سن بنا age, and breadcrumb property type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            title: 'خانه ویلایی',
            description: 'تعداد واحد در طبقه: 2',
            breadcrumbs: [
              { title: 'گلستان' },
              { title: 'علی آباد کتول' },
              { title: 'املاک' },
              { title: 'خرید و فروش ویلا' }
            ],
            location: 'گلستان، علی آباد کتول، خیابان فرهنگ',
            addedAt: '2026-11-24 20:52:39.5360',
            price: [{ label: 'قیمت کل', amount: '4500000000' }],
            attributes: [
              { key: 'متراژ', value: '120' },
              { key: 'تعداد اتاق', value: '2' },
              { key: 'پارکینگ', value: 'دارد' },
              { key: 'انباری', value: 'ندارد' },
              { key: 'سن بنا', value: '۲ سال' }
            ],
            images: [{ source: { desktop: 'https://cdn.sheypoor.com/a.webp' } }]
          }
        }
      })
    }));

    const ad = await fetchSheypoorPostDetail('sp_469549140', 'BUY', mockEnv);
    expect(ad).not.toBeNull();
    expect(ad!.cityPersian).toBe('علی‌آباد کتول');
    expect(ad!.districtPersian).toBe('خیابان فرهنگ');
    expect(ad!.propertyTypeFa).toBe('ویلایی');
    expect(ad!.totalPrice).toBe(4_500_000_000);
    expect(ad!.area).toBe(120);
    expect(ad!.buildYear).toBe(1402);
    expect(ad!.specs.parking).toBe(true);
    expect(ad!.specs.storage).toBe(false);
    expect(ad!.unitsPerFloor).toBe('۲ واحدی');
    expect(ad!.postTimestamp).toBe(Math.floor(Date.parse('2026-11-24T20:52:39.5360+03:30') / 1000));
  });
});
