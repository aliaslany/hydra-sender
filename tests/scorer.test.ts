import { describe, expect, it } from 'vitest';
import {
  computeAdFingerprint,
  evaluateAdMatch,
  normalizePersianText,
  parseDescriptionNLP,
  parseExtendedAttributesNLP
} from '../src/engine/scorer';
import { FilterRule, ParsedDivarAd } from '../src/types';

function makeRule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    id: 'rule_test',
    channel_id: 'ch_test',
    owner_user_id: 1,
    name: 'Test Rule',
    is_active: 1,
    city_ids_json: '["823"]',
    districts_json: '[]',
    deal_type: 'BUY',
    property_type: 'ALL_RESIDENTIAL',
    divar_category_slug: 'buy-residential',
    min_budget: 0,
    max_budget: 6_000_000_000,
    min_rent: 0,
    max_rent: 0,
    allow_rahn_conversion: 1,
    max_price_per_m2: 0,
    min_area: 75,
    max_area: 200,
    tolerance_pct: 0.15,
    min_match_score: 65,
    stage2_filters_json: '{}',
    exclude_agency: 1,
    max_post_age_hours: 24,
    ...overrides
  };
}

function makeAd(overrides: Partial<ParsedDivarAd> = {}): ParsedDivarAd {
  return {
    token: 'testToken1',
    source: 'divar',
    title: 'ویلایی خوش نقشه',
    description: 'سند تک برگ، آماده انتقال',
    cityPersian: 'علی‌آباد کتول',
    districtPersian: 'مرکز شهر',
    dealType: 'BUY',
    totalPrice: 4_800_000_000,
    pricePerM2: 48_000_000,
    credit: 0,
    rent: 0,
    isConvertible: false,
    area: 100,
    bedrooms: 2,
    buildYear: 1398,
    floorNumber: 1,
    floorText: 'طبقه ۱',
    primaryPhotoUrl: null,
    imageUrls: [],
    latitude: 36.9025,
    longitude: 54.8558,
    postTimestamp: Math.floor(Date.now() / 1000) - 600,
    businessType: 'personal',
    specs: { parking: true, elevator: true, storage: true },
    ...overrides
  };
}

describe('Scorer & Persian NLP Engine', () => {
  it('normalizes Persian/Arabic digits and zero-width non-joiners', () => {
    expect(normalizePersianText('متراژ ۱۲۰ متر  ي ك')).toBe('متراژ 120 متر ی ک');
  });

  it('respects negation phrases and Persian word boundaries in description NLP', () => {
    const specs = parseDescriptionNLP('ملک شمالی بدون پارکینگ و آسانسور ندارد ولی دارای انباری اختصاصی و کابینت MDF و پکیج');
    expect(specs.direction).toBe('NORTH');
    expect(specs.parking).toBe(false);
    expect(specs.elevator).toBe(false);
    expect(specs.storage).toBe(true);
    expect(specs.cabinet).toBe('MDF');
    expect(specs.heating).toContain('PACKAGE_RADIATOR');
  });

  it('parses numeric unitsPerFloor lines such as تعداد واحد در طبقه: 2', () => {
    const ext = parseExtendedAttributesNLP('تعداد واحد در طبقه: 2\nکف سرامیک\nسند تک برگ', 'آپارتمان');
    expect(ext.unitsPerFloor).toBe('۲ واحدی');
    expect(ext.flooring).toBe('سرامیک درجه یک');
    expect(ext.deedStatus).toBe('تک‌برگ');
  });

  it('enforces city matching against Sheypoor cross-city leaks', () => {
    const rule = makeRule({ city_ids_json: '["823"]' });
    const sariAd = makeAd({ token: 'sp_467976255', source: 'sheypoor', cityPersian: 'ساری' });
    const aliabadAd = makeAd({ cityPersian: 'علی آباد کتول' });

    const resSari = evaluateAdMatch(sariAd, rule);
    expect(resSari.eligible).toBe(false);
    expect(resSari.reasons[0]).toContain('ساری');

    const resAliabad = evaluateAdMatch(aliabadAd, rule);
    expect(resAliabad.eligible).toBe(true);
  });

  it('supports both legacy string and normalized array values for Stage-2 skeleton/direction', () => {
    const ad = makeAd({ specs: { parking: true, skeleton: 'CONCRETE', direction: 'NORTH' } });
    const ruleString = makeRule({ stage2_filters_json: JSON.stringify({ skeleton: 'CONCRETE', direction: 'NORTH' }) });
    const ruleArray = makeRule({ stage2_filters_json: JSON.stringify({ skeleton: ['CONCRETE'], direction: ['NORTH'] }) });

    expect(evaluateAdMatch(ad, ruleString).score).toBe(100);
    expect(evaluateAdMatch(ad, ruleArray).score).toBe(100);
  });

  it('rejects real estate agency keywords when exclude_agency is enabled', () => {
    const rule = makeRule({ exclude_agency: 1 });
    const brokerAd = makeAd({ description: 'تماس با املاک نیلی جهت بازدید' });
    const res = evaluateAdMatch(brokerAd, rule);
    expect(res.eligible).toBe(false);
    expect(res.reasons[0]).toContain('املاک');
  });

  it('produces identical fingerprints for tight matching Divar and Sheypoor listings and separates distinct units', () => {
    const divarAd = makeAd({ source: 'divar', totalPrice: 4_800_000_000, area: 100, bedrooms: 2, buildYear: 1398, floorNumber: 1 });
    const sheypoorAd = makeAd({
      token: 'sp_999',
      source: 'sheypoor',
      cityPersian: 'علی آباد کتول',
      totalPrice: 4_802_000_000,
      area: 100,
      bedrooms: 2,
      buildYear: 1398,
      floorNumber: 1
    });
    const otherAreaAd = makeAd({ token: 'otherArea', totalPrice: 4_800_000_000, area: 102, bedrooms: 2, buildYear: 1398, floorNumber: 1 });
    const otherYearAd = makeAd({ token: 'otherYear', totalPrice: 4_800_000_000, area: 100, bedrooms: 2, buildYear: 1403, floorNumber: 1 });

    const fp1 = computeAdFingerprint(divarAd);
    const fp2 = computeAdFingerprint(sheypoorAd);
    expect(fp1).not.toBeNull();
    expect(fp1).toBe(fp2);
    expect(computeAdFingerprint(otherAreaAd)).not.toBe(fp1);
    expect(computeAdFingerprint(otherYearAd)).not.toBe(fp1);
  });

  it('rejects mismatched deal_type (RENT ad evaluated against BUY rule)', () => {
    const buyRule = makeRule({ deal_type: 'BUY', max_budget: 6_000_000_000 });
    const rentAd = makeAd({
      token: 'sp_rent_1',
      source: 'sheypoor',
      dealType: 'RENT',
      totalPrice: 0,
      credit: 400_000_000,
      rent: 5_000_000
    });
    const res = evaluateAdMatch(rentAd, buyRule);
    expect(res.eligible).toBe(false);
    expect(res.reasons[0]).toContain('نوع معامله');
  });

  it('rejects COMMERCIAL ads from residential rules while allowing apartments near shops', () => {
    const resRule = makeRule({ property_type: 'ALL_RESIDENTIAL' });
    const commercialAd = makeAd({
      title: 'فروش مغازه تجاری بر اصلی',
      description: 'دارای سند تک برگ تجاری',
      propertyCategory: 'COMMERCIAL',
      propertyTypeFa: 'مغازه'
    });
    expect(evaluateAdMatch(commercialAd, resRule).eligible).toBe(false);

    const aptRule = makeRule({ property_type: 'APARTMENT' });
    const parsedNearShops = parseExtendedAttributesNLP('واحد دلباز نزدیک مغازه و مراکز تجاری، کف سرامیک', 'آپارتمان ۱۰۰ متری', 'apartment-sell');
    const aptNearShops = makeAd({
      title: 'آپارتمان ۱۰۰ متری',
      description: 'واحد دلباز نزدیک مغازه و مراکز تجاری، کف سرامیک',
      ...parsedNearShops
    });
    expect(aptNearShops.propertyCategory).toBe('APARTMENT');
    expect(evaluateAdMatch(aptNearShops, aptRule).eligible).toBe(true);
  });

  it('enforces districts_json when named neighborhoods are configured', () => {
    const rule = makeRule({ districts_json: '["خیابان فرهنگ", "مرکز شهر"]' });
    const insideAd = makeAd({ districtPersian: 'خیابان فرهنگ' });
    const outsideAd = makeAd({ districtPersian: 'کمربندی غربی', title: 'آپارتمان ۱۰۰ متری' });
    expect(evaluateAdMatch(insideAd, rule).eligible).toBe(true);
    const outRes = evaluateAdMatch(outsideAd, rule);
    expect(outRes.eligible).toBe(false);
    expect(outRes.reasons[0]).toContain('محله');
  });
});
