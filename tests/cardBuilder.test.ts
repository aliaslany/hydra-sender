import { describe, expect, it } from 'vitest';
import { buildTelegramCardPayload } from '../src/telegram/cardBuilder';
import { FilterRule, MatchResult, ParsedDivarAd } from '../src/types';

const baseRule: FilterRule = {
  id: 'rule_1',
  channel_id: 'ch_1',
  owner_user_id: 1,
  name: 'فیلتر تست',
  is_active: 1,
  city_ids_json: '["823"]',
  districts_json: '[]',
  deal_type: 'BUY',
  property_type: 'VILLA_LAND',
  divar_category_slug: 'buy-residential',
  min_budget: 0,
  max_budget: 6_000_000_000,
  min_rent: 0,
  max_rent: 0,
  allow_rahn_conversion: 1,
  max_price_per_m2: 0,
  min_area: 75,
  max_area: 250,
  tolerance_pct: 0.15,
  min_match_score: 65,
  stage2_filters_json: '{}',
  show_btn_divar: 1,
  show_btn_map: 1,
  show_btn_score: 1,
  show_btn_contact: 1
};

const passMatch: MatchResult = {
  eligible: true,
  score: 92,
  budgetScore: 35,
  areaScore: 25,
  specsScore: 32,
  budgetDeviationPct: 0,
  areaDeviationPct: 0,
  reasons: []
};

describe('Telegram Card Builder', () => {
  it('omits unspecified fields instead of fabricating defaults', () => {
    const minimalAd: ParsedDivarAd = {
      token: 'ga8nrg72',
      source: 'divar',
      title: 'ویلایی <دل باز>',
      description: '',
      cityPersian: 'علی‌آباد کتول',
      districtPersian: '',
      dealType: 'BUY',
      propertyTypeFa: 'ویلایی',
      totalPrice: 4_950_000_000,
      pricePerM2: 0,
      credit: 0,
      rent: 0,
      isConvertible: false,
      area: 90,
      bedrooms: 1,
      buildYear: 1380,
      floorNumber: null,
      floorText: '',
      primaryPhotoUrl: 'https://s100.divarcdn.com/photo1.jpg',
      imageUrls: ['https://s100.divarcdn.com/photo1.jpg'],
      latitude: 36.91,
      longitude: 54.86,
      postTimestamp: Math.floor(Date.now() / 1000),
      specs: {}
    };

    const payload = buildTelegramCardPayload(minimalAd, passMatch, baseRule, '@aliabadmelk', false);
    expect(payload.method).toBe('sendPhoto');
    expect(payload.body.caption).not.toContain('نامشخص');
    expect(payload.body.caption).not.toContain('سرامیک');
    expect(payload.body.caption).toContain('#دیوار');
    expect(payload.body.reply_markup.inline_keyboard[0][0].text).toContain('دیوار');
  });

  it('builds Sheypoor albums cleanly within Telegram 1024-char caption budget using custom branding', () => {
    const spAd: ParsedDivarAd = {
      token: 'sp_467976255',
      source: 'sheypoor',
      url: 'https://www.sheypoor.com/v/test-467976255.html',
      title: 'آپارتمان لوکس',
      description: 'شرح کامل '.repeat(30),
      cityPersian: 'گرگان',
      districtPersian: 'عدالت',
      dealType: 'BUY',
      propertyTypeFa: 'آپارتمان مسکونی',
      totalPrice: 5_000_000_000,
      pricePerM2: 50_000_000,
      credit: 0,
      rent: 0,
      isConvertible: false,
      area: 100,
      bedrooms: 2,
      buildYear: 1402,
      floorNumber: 3,
      floorText: 'طبقه ۳',
      primaryPhotoUrl: 'https://cdn.sheypoor.com/1.jpg',
      imageUrls: ['https://cdn.sheypoor.com/1.jpg', 'https://cdn.sheypoor.com/2.jpg'],
      latitude: 36.84,
      longitude: 54.43,
      postTimestamp: Math.floor(Date.now() / 1000),
      specs: { parking: true, elevator: true }
    };

    const payload = buildTelegramCardPayload(spAd, passMatch, baseRule, '@gorgan_test', false, {
      chat_id: '@gorgan_test',
      contact_mobile: '09111112222',
      office_address: 'گرگان، خیابان عدالت',
      brand_hashtags: ['#گرگان_ملک']
    });

    expect(payload.method).toBe('sendMediaGroup');
    const firstCaption: string = payload.body.media[0].caption;
    expect(firstCaption.length).toBeLessThanOrEqual(1024);
    expect(firstCaption).toContain('#شیپور');
    expect(firstCaption).toContain('#گرگان_ملک');
    expect(firstCaption).toContain('09111112222');
    expect(firstCaption).not.toContain('09922434338');
    expect(firstCaption).toContain('https://www.sheypoor.com/v/test-467976255.html');
  });
});
