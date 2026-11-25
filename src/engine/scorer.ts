import { FilterRule, MatchResult, ParsedDivarAd, Stage2Filters } from '../types';
import { isPointInPolygon, parsePolygonJson } from './geo';

const PERSIAN_ARABIC_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

export function normalizePersianText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/[۰-۹٠-٩]/g, (d) => PERSIAN_ARABIC_DIGITS[d] || d)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCityKey(name: string | undefined | null): string {
  return normalizePersianText(name)
    .replace(/آ/g, 'ا')
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

export const CITY_PERSIAN_BY_ID: Record<string, string> = {
  '1': 'تهران',
  '2': 'مشهد',
  '3': 'کرج',
  '4': 'شیراز',
  '5': 'اصفهان',
  '6': 'تبریز',
  '7': 'اهواز',
  '8': 'قم',
  '11': 'رشت',
  '24': 'گرگان',
  '25': 'ساری',
  '823': 'علی آباد کتول'
};

export function normalizeStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
}

export function extractIntFromPersian(input: string | undefined | null): number {
  const norm = normalizePersianText(input).replace(/[,٬]/g, '');
  const match = norm.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export function parseDescriptionNLP(description: string): ParsedDivarAd['specs'] {
  const norm = normalizePersianText(description);
  const extracted: ParsedDivarAd['specs'] = {};

  // 1. Skeleton Type (نوع اسکلت)
  if (/(اسکلت\s*بتن|سازه\s*بتن|بتن\s*آرمه|بتنی)/.test(norm)) {
    extracted.skeleton = 'CONCRETE';
  } else if (/(اسکلت\s*فلز|سازه\s*فلز|فلزی|تیرآهن)/.test(norm)) {
    extracted.skeleton = 'STEEL';
  }

  // 2. Building Direction (جهت ساختمان)
  const bStart = '(?:^|[\\s،,.\\-/()])';
  const bEnd = '(?=$|[\\s،,.\\-/()])';
  if (/(دو\s*کله|دو\s*نبش|شمالی\s*و?\s*جنوبی)/.test(norm)) {
    extracted.direction = 'DUAL';
  } else if (new RegExp(`${bStart}شمالی${bEnd}`).test(norm)) {
    extracted.direction = 'NORTH';
  } else if (new RegExp(`${bStart}جنوبی${bEnd}`).test(norm)) {
    extracted.direction = 'SOUTH';
  } else if (/(شرقی|غربی)/.test(norm)) {
    extracted.direction = 'EAST_WEST';
  }

  // 3. Cabinet Type (نوع کابینت)
  if (/(های\s*گلاس|هایگلاس|high\s*glass)/i.test(norm)) {
    extracted.cabinet = 'HIGH_GLOSS';
  } else if (/(ممبران|وکیوم|کلاسیک|نئوکلاسیک|چوب)/.test(norm)) {
    extracted.cabinet = 'MEMBRANE_WOOD';
  } else if (/(ام\s*دی\s*اف|mdf)/i.test(norm)) {
    extracted.cabinet = 'MDF';
  } else if (/کابینت\s*فلز/.test(norm)) {
    extracted.cabinet = 'METAL';
  }

  // 4. Cooling System (سیستم سرمایش)
  const cooling: string[] = [];
  if (/(داکت\s*اسپلیت|داکت\s*اسپیلت)/.test(norm)) cooling.push('DUCT_SPLIT');
  if (/(کولر\s*گازی|اسپلیت|اسپیلت)/.test(norm) && !cooling.includes('DUCT_SPLIT')) cooling.push('SPLIT_AC');
  if (/چیلر/.test(norm)) cooling.push('CHILLER');
  if (/کولر\s*آبی/.test(norm)) cooling.push('WATER_COOLER');
  if (cooling.length > 0) extracted.cooling = cooling;

  // 5. Heating System (سیستم گرمایش)
  const heating: string[] = [];
  if (/گرمایش\s*از\s*کف/.test(norm)) heating.push('FLOOR_HEATING');
  if (/(پکیج|شوفاژ)/.test(norm)) heating.push('PACKAGE_RADIATOR');
  if (/(فن\s*کویل|چیلر|داکت\s*اسپلیت)/.test(norm)) heating.push('FAN_COIL_DUCT');
  if (/(موتور\s*خانه|مرکزی)/.test(norm)) heating.push('CENTRAL_ENGINE');
  if (heating.length > 0) extracted.heating = heating;

  // 6. Negation-aware Amenity Fallback
  const amenities: Array<['parking' | 'elevator' | 'storage' | 'balcony', string]> = [
    ['parking', 'پارکینگ'],
    ['elevator', 'آسانسور'],
    ['storage', 'انباری'],
    ['balcony', '(?:بالکن|تراس)']
  ];
  for (const [key, pattern] of amenities) {
    const negRegex = new RegExp(`(بدون|فاقد|ندارد)\\s+${pattern}|${pattern}\\s+ندارد`);
    const posRegex = new RegExp(`(?:^|[\\s،,.])(?:دارای|با|فول)(?:\\s+[^\\n،.]{0,20})?\\s+${pattern}(?=$|[\\s،,.])|${bStart}${pattern}\\s+(?:سندی|مزاحم|اختصاصی|دارد)(?=$|[\\s،,.])`);
    if (negRegex.test(norm)) {
      extracted[key] = false;
    } else if (posRegex.test(norm)) {
      extracted[key] = true;
    }
  }

  return extracted;
}

export type NormalizedPropertyCategory = 'APARTMENT' | 'VILLA_LAND' | 'OLD_HOUSE' | 'COMMERCIAL';

const PROXIMITY_COMMERCIAL_RE = /(?:نزدیک(?:\s+به)?|دسترسی(?:\s+به|\s+عالی\s+به)?|روبروی|رو\s+به\s+روی|مجاور|کنار|جنب|پشت)\s+(?:مراکز\s+)?(?:مغازه|تجاری|اداری|بازار)/g;

/**
 * Classifies a listing into a normalized property category using structured category metadata
 * first, then title, and finally proximity-filtered description fallback.
 */
export function inferPropertyCategory(
  title: string,
  description: string,
  categorySlug?: string
): { propertyCategory: NormalizedPropertyCategory; propertyTypeFa: string } {
  const catNorm = normalizePersianText(categorySlug || '').toLowerCase();
  const titleNorm = normalizePersianText(title).toLowerCase();
  const descClean = normalizePersianText(description).toLowerCase().replace(PROXIMITY_COMMERCIAL_RE, ' ');

  const isResidentialCat = /(residential|مسکونی|آپارتمان|ویلا|خانه)/.test(catNorm) &&
    !/(commercial|office|shop|store|تجاری|اداری|مغازه)/.test(catNorm);

  const classifyCommercialText = (text: string): { propertyCategory: NormalizedPropertyCategory; propertyTypeFa: string } | null => {
    if (/(commercial|shop|office|store|industrial|suite|تجاری|اداری|مغازه|صنعتی|کارگاه|سوله|غرفه|پاساژ|دفتر\s*کار|مطب)/.test(text)) {
      return {
        propertyCategory: 'COMMERCIAL',
        propertyTypeFa: /(مغازه|shop|غرفه)/.test(text) ? 'مغازه' : 'تجاری خدماتی'
      };
    }
    return null;
  };

  const classifyResidentialText = (text: string): { propertyCategory: NormalizedPropertyCategory; propertyTypeFa: string } | null => {
    if (/(apartment|presell|آپارتمان|پنت\s*هاوس|سوئیت|مسکن\s*مهر)/.test(text)) {
      return { propertyCategory: 'APARTMENT', propertyTypeFa: 'آپارتمان مسکونی' };
    }
    if (/(villa|house-villa|ویلایی|باغ\s*ویلا|خانه\s*ویلایی|خانه\s*و?\s*ویلا|ویلا\s*باغ|دوبلکس|تریبلکس|ویلا)/.test(text)) {
      return { propertyCategory: 'VILLA_LAND', propertyTypeFa: 'ویلایی' };
    }
    if (/(plot|old|land|کلنگی|زمین|باغ|کشاورزی|شالیزار|مزرعه|مستغلات|چهاردیواری)/.test(text)) {
      return { propertyCategory: 'OLD_HOUSE', propertyTypeFa: 'زمین / کلنگی' };
    }
    return null;
  };

  // 1. Structured category / breadcrumb takes top precedence
  if (catNorm) {
    const commCat = classifyCommercialText(catNorm);
    if (commCat) return commCat;
    const resCat = classifyResidentialText(catNorm);
    if (resCat) return resCat;
  }

  // 2. Listing title is next most reliable
  const commTitle = !isResidentialCat ? classifyCommercialText(titleNorm) : null;
  if (commTitle) return commTitle;
  const resTitle = classifyResidentialText(titleNorm);
  if (resTitle) return resTitle;

  // 3. Description fallback (stripping proximity phrases like "نزدیک مغازه")
  const commDesc = !isResidentialCat ? classifyCommercialText(descClean) : null;
  if (commDesc) return commDesc;
  const resDesc = classifyResidentialText(descClean);
  if (resDesc) return resDesc;

  return { propertyCategory: 'APARTMENT', propertyTypeFa: 'آپارتمان مسکونی' };
}

export function doesPropertyCategoryMatch(
  adCategory: NormalizedPropertyCategory,
  rulePropertyType: FilterRule['property_type']
): boolean {
  switch (rulePropertyType) {
    case 'ALL_RESIDENTIAL':
      return adCategory !== 'COMMERCIAL';
    case 'COMMERCIAL':
      return adCategory === 'COMMERCIAL';
    case 'APARTMENT':
      return adCategory === 'APARTMENT';
    case 'VILLA_LAND':
      return adCategory === 'VILLA_LAND' || adCategory === 'OLD_HOUSE';
    case 'OLD_HOUSE':
      return adCategory === 'OLD_HOUSE';
    default:
      return true;
  }
}

export function parseExtendedAttributesNLP(description: string, title: string, categorySlug?: string): Partial<ParsedDivarAd> {
  const norm = normalizePersianText(`${title} ${description}`);
  const attrs: Partial<ParsedDivarAd> = {};

  // 1. Property Type & Normalized Category
  const inferredCat = inferPropertyCategory(title, description, categorySlug);
  attrs.propertyCategory = inferredCat.propertyCategory;
  attrs.propertyTypeFa = inferredCat.propertyTypeFa;

  // 2. Units Per Floor
  const unitsKeyMatch = norm.match(/تعداد\s*واحد\s*(?:در\s*طبقه)?\s*[:：]?\s*(\d+)/);
  if (/تک\s*واحدی/.test(norm) || unitsKeyMatch?.[1] === '1') attrs.unitsPerFloor = 'تک واحدی';
  else if (/2\s*واحدی|دو\s*واحدی/.test(norm) || unitsKeyMatch?.[1] === '2') attrs.unitsPerFloor = '۲ واحدی';
  else if (/3\s*واحدی|سه\s*واحدی/.test(norm) || unitsKeyMatch?.[1] === '3') attrs.unitsPerFloor = '۳ واحدی';
  else if (/4\s*واحدی|چهار\s*واحدی/.test(norm) || unitsKeyMatch?.[1] === '4') attrs.unitsPerFloor = '۴ واحدی';
  else if (unitsKeyMatch?.[1]) attrs.unitsPerFloor = `${unitsKeyMatch[1]} واحدی`;

  // 3. Deed Status (وضعیت سند)
  if (/تک\s*برگ/.test(norm)) attrs.deedStatus = 'تک‌برگ';
  else if (/شش\s*دانگ/.test(norm)) attrs.deedStatus = 'شش‌دانگ';
  else if (/قولنامه/.test(norm)) attrs.deedStatus = 'قولنامه‌ای با کد رهگیری';
  else if (/وکالتی/.test(norm)) attrs.deedStatus = 'وکالتی محضری';
  else if (/سند\s*دار|دارای\s*سند|سند\s*رسمی|سند\s*آزاد/.test(norm)) attrs.deedStatus = 'دارای سند رسمی';
  else if (/سند\s*شورایی/.test(norm)) attrs.deedStatus = 'سند شورایی';
  else if (/سند\s*مشاع/.test(norm)) attrs.deedStatus = 'سند مشاع';

  // 4. Facade (نوع نما)
  if (/نما\s*رومی/.test(norm)) attrs.buildingFacade = 'سنگ رومی کلاسیک';
  else if (/نما\s*سنگ|سنگ\s*تراورتن/.test(norm)) attrs.buildingFacade = 'سنگ تراورتن';
  else if (/کامپوزیت/.test(norm)) attrs.buildingFacade = 'کامپوزیت مدرن';
  else if (/آجر\s*نما/.test(norm)) attrs.buildingFacade = 'آجر نسوز مدرن';

  // 5. Flooring (کف‌پوش)
  if (/پارکت|لمینت/.test(norm)) attrs.flooring = 'پارکت / لمینت';
  else if (/سرامیک/.test(norm)) attrs.flooring = 'سرامیک درجه یک';
  else if (/سنگ/.test(norm)) attrs.flooring = 'سنگ مرمر';
  else if (/موزائیک/.test(norm)) attrs.flooring = 'موزائیک';

  // 6. Evacuation Status (وضعیت تخلیه)
  if (/تخلیه\s*فوری|آماده\s*تحویل/.test(norm)) attrs.evacuationStatus = 'تخلیه فوری';
  else if (/در\s*دست\s*مستاجر|مستاجر\s*دارد/.test(norm)) attrs.evacuationStatus = 'در دست مستاجر (موعد مشخص)';
  else if (/تخلیه/.test(norm)) attrs.evacuationStatus = 'تخلیه شده';

  // 7. Entrance / Yard
  if (/درب\s*مجزا|راه\s*جدا|ورودی\s*مستقل/.test(norm)) attrs.entrance = 'مجزا و اختصاصی';
  if (/حیاط\s*مستقل|حیاط\s*اختصاصی/.test(norm)) attrs.yard = 'دارد (مستقل)';
  else if (/حیاط/.test(norm)) attrs.yard = 'دارد (مشاع)';

  // 8. Closet
  if (/کمد\s*دیواری/.test(norm)) attrs.closet = 'دارد (تمام اتاق‌ها)';

  // 9. Loan Status
  if (/دارای\s*وام|وام\s*دارد|وام\s*مسکن/.test(norm)) attrs.loanStatus = 'دارد (قابلیت انتقال)';
  else if (/بدون\s*وام|تسویه/.test(norm)) attrs.loanStatus = 'بدون وام (آماده انتقال قطعی)';
  else if (/قابلیت\s*دریافت\s*وام|امکان\s*وام/.test(norm)) attrs.loanStatus = 'قابلیت دریافت حداکثر وام مسکن';

  return attrs;
}

export function inferDealType(
  categoryText: string,
  totalPrice: number,
  credit: number,
  rent: number,
  fallback: 'BUY' | 'RENT'
): 'BUY' | 'RENT' {
  const norm = normalizePersianText(categoryText).toLowerCase();
  if (/(rent|اجاره|رهن|کرایه)/.test(norm)) return 'RENT';
  if (/(sell|buy|presell|plot-old|خرید|فروش|پیش\s*فروش)/.test(norm)) return 'BUY';
  if ((credit > 0 || rent > 0) && totalPrice === 0) return 'RENT';
  if (totalPrice > 0 && credit === 0 && rent === 0) return 'BUY';
  return fallback;
}

export function computeEquivalentRahn(creditToman: number, rentToman: number): number {
  return Math.round(creditToman + rentToman / 0.03);
}

/**
 * Computes a tight structural fingerprint for cross-source deduplication (Divar <-> Sheypoor).
 * Returns null if core dimensions (price, area, city) are missing so incomplete listings don't collide.
 */
export function computeAdFingerprint(ad: ParsedDivarAd): string | null {
  const effectivePrice = ad.dealType === 'BUY'
    ? (ad.totalPrice || 0)
    : computeEquivalentRahn(ad.credit || 0, ad.rent || 0);
  if (effectivePrice <= 0 || !ad.area || ad.area <= 0) return null;

  const cityKey = normalizeCityKey(ad.cityPersian || '');
  if (!cityKey) return null;

  const priceStep = ad.dealType === 'BUY' ? 10_000_000 : 1_000_000;
  const priceBucket = Math.round(effectivePrice / priceStep);
  const areaExact = Math.round(ad.area);
  const beds = ad.bedrooms !== null && ad.bedrooms !== undefined ? String(ad.bedrooms) : 'x';
  const buildYear = ad.buildYear !== null && ad.buildYear !== undefined ? String(ad.buildYear) : 'x';
  const floor = ad.floorNumber !== null && ad.floorNumber !== undefined ? String(ad.floorNumber) : 'x';
  return `${ad.dealType}:${cityKey}:${priceBucket}:${areaExact}:${beds}:${buildYear}:${floor}`;
}

export function parseNormalizedDistricts(districtsJson?: string | null): { named: string[]; hasRawEntries: boolean } {
  try {
    const raw: unknown = JSON.parse(districtsJson || '[]');
    if (!Array.isArray(raw) || raw.length === 0) {
      return { named: [], hasRawEntries: false };
    }
    const named = raw
      .map((d) => normalizeCityKey(String(d)))
      .filter((d) => Boolean(d) && !/^\d+$/.test(d));
    return { named, hasRawEntries: true };
  } catch {
    return { named: [], hasRawEntries: false };
  }
}

export function doesDistrictMatch(
  adDistrict: string | undefined | null,
  adTitle: string | undefined | null,
  namedDistricts: string[]
): boolean {
  if (namedDistricts.length === 0) return true;
  const distNorm = normalizeCityKey(adDistrict || '');
  if (distNorm) {
    return namedDistricts.some((d) => distNorm === d || distNorm.includes(d) || d.includes(distNorm));
  }
  const titleNorm = normalizeCityKey(adTitle || '');
  return titleNorm ? namedDistricts.some((d) => titleNorm.includes(d)) : false;
}

function rejectMatch(reason: string, budgetDeviationPct = 0): MatchResult {
  return {
    eligible: false,
    score: 0,
    budgetScore: 0,
    areaScore: 0,
    specsScore: 0,
    budgetDeviationPct,
    areaDeviationPct: 0,
    reasons: [reason]
  };
}

export function evaluateAdMatch(ad: ParsedDivarAd, rule: FilterRule): MatchResult {
  const reasons: string[] = [];

  // ==========================================
  // Check -2: Deal Type Enforcement (BUY vs RENT)
  // ==========================================
  if (ad.dealType && rule.deal_type && ad.dealType !== rule.deal_type) {
    return rejectMatch(
      `نوع معامله آگهی (${ad.dealType === 'RENT' ? 'رهن و اجاره' : 'خرید و فروش'}) با فیلتر مطابقت ندارد`
    );
  }

  // ==========================================
  // Check -1: Property Category Enforcement (guards mixed-category feeds like Sheypoor c=43603)
  // ==========================================
  if (rule.property_type) {
    const adCategory = ad.propertyCategory || inferPropertyCategory(ad.title || '', ad.description || '').propertyCategory;
    if (!doesPropertyCategoryMatch(adCategory, rule.property_type)) {
      return rejectMatch(
        `نوع ملک آگهی (${ad.propertyTypeFa || adCategory}) با فیلتر (${rule.property_type}) مطابقت ندارد`
      );
    }
  }

  // ==========================================
  // Check 0: Strict City Match Enforcement (guards Sheypoor VIP/neighboring city bleed)
  // ==========================================
  if (ad.cityPersian) {
    try {
      const ruleCitiesRaw: string[] = JSON.parse(rule.city_ids_json || '[]');
      const allowedNormalized = ruleCitiesRaw
        .map((c) => CITY_PERSIAN_BY_ID[c] || c)
        .filter((c) => !/^\d+$/.test(c))
        .map((c) => normalizeCityKey(c))
        .filter(Boolean);

      if (allowedNormalized.length > 0) {
        const adCityNorm = normalizeCityKey(ad.cityPersian);
        const matchesCity = allowedNormalized.some(
          (allowed) => adCityNorm === allowed || adCityNorm.includes(allowed) || allowed.includes(adCityNorm)
        );
        if (!matchesCity) {
          return rejectMatch(`شهر آگهی (${ad.cityPersian}) با شهر انتخاب‌شده در فیلتر مطابقت ندارد`);
        }
      }
    } catch {}
  }

  // ==========================================
  // Check 0B: District Filter Enforcement (guards whole-city feeds such as Sheypoor)
  // ==========================================
  const districtFilter = parseNormalizedDistricts(rule.districts_json);
  if (districtFilter.named.length > 0 && !doesDistrictMatch(ad.districtPersian, ad.title, districtFilter.named)) {
    return rejectMatch(
      ad.districtPersian
        ? `محله آگهی (${ad.districtPersian}) با محله‌های انتخاب‌شده در فیلتر مطابقت ندارد`
        : 'محله آگهی با محله‌های انتخاب‌شده در فیلتر مطابقت ندارد'
    );
  }

  // ==========================================
  // Check 1: Exclude Real Estate Agency / Broker Ads
  // ==========================================
  if (rule.exclude_agency !== 0) {
    const normTitle = normalizePersianText(ad.title);
    const normDesc = normalizePersianText(ad.description);
    const combined = `${normTitle} ${normDesc}`;

    let negativeWords = [
      'املاک',
      'مشاور',
      'مشاورین',
      'مشاوران',
      'بنگاه',
      'دپارتمان',
      'دفتر املاک',
      'همکار',
      'همکاران',
      'کمیسیون',
      'آژانس املاک',
      'کارگزاری'
    ];

    try {
      if (rule.negative_keywords_json) {
        const customWords = JSON.parse(rule.negative_keywords_json);
        if (Array.isArray(customWords) && customWords.length > 0) {
          negativeWords = customWords;
        }
      }
    } catch {}

    const matchedWord = negativeWords.find((w) => {
      const clean = normalizePersianText(w).trim();
      if (!clean) return false;
      return combined.includes(clean);
    });

    if (matchedWord || ad.businessType === 'real_estate') {
      return {
        eligible: false,
        score: 0,
        budgetScore: 0,
        areaScore: 0,
        specsScore: 0,
        budgetDeviationPct: 0,
        areaDeviationPct: 0,
        reasons: [`شناسایی به عنوان آگهی مشاور/املاک (کلمه: ${matchedWord || 'نوع کسب‌وکار'})`]
      };
    }
  }

  // ==========================================
  // Check 2: Geo-Fencing / Polygon Boundary Filter
  // ==========================================
  if (rule.geo_polygon_json) {
    const polygon = parsePolygonJson(rule.geo_polygon_json);
    if (polygon.length >= 3) {
      if (ad.latitude !== null && ad.longitude !== null) {
        const inside = isPointInPolygon([ad.latitude, ad.longitude], polygon);
        if (!inside) {
          return {
            eligible: false,
            score: 0,
            budgetScore: 0,
            areaScore: 0,
            specsScore: 0,
            budgetDeviationPct: 0,
            areaDeviationPct: 0,
            reasons: ['موقعیت ملک خارج از محدوده خط‌کشی‌شده نقشه است']
          };
        }
      }
      // If ad has no latitude/longitude coordinates on Divar, it is preserved based on city/district
    }
  }

  // ==========================================
  // Check 3: Max Post Age (e.g. 24 hours / 1 day)
  // ==========================================
  const maxAgeHours = Number(rule.max_post_age_hours) || 24;
  if (maxAgeHours > 0 && ad.postTimestamp > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const ageSeconds = nowSec - ad.postTimestamp;
    if (ageSeconds > maxAgeHours * 3600) {
      return {
        eligible: false,
        score: 0,
        budgetScore: 0,
        areaScore: 0,
        specsScore: 0,
        budgetDeviationPct: 0,
        areaDeviationPct: 0,
        reasons: [`آگهی قدیمی‌تر از سقف مجاز (${maxAgeHours} ساعت گذشته) است`]
      };
    }
  }

  const T = Math.min(Math.max(rule.tolerance_pct || 0.15, 0.0), 0.25);

  // ==========================================
  // 1. Evaluate Budget (35 points max)
  // ==========================================
  let effectivePrice = ad.dealType === 'BUY' ? ad.totalPrice : ad.credit;
  let effectiveMaxBudget = rule.max_budget || 0;
  let effectiveMinBudget = rule.min_budget || 0;

  if (ad.dealType === 'RENT' && rule.allow_rahn_conversion === 1 && (rule.max_rent > 0 || ad.rent > 0)) {
    effectivePrice = computeEquivalentRahn(ad.credit, ad.rent);
    effectiveMaxBudget = computeEquivalentRahn(rule.max_budget || 0, rule.max_rent || 0);
  }

  if (ad.dealType === 'BUY' && rule.max_price_per_m2 > 0 && ad.pricePerM2 > rule.max_price_per_m2 * (1 + T)) {
    return {
      eligible: false,
      score: 0,
      budgetScore: 0,
      areaScore: 0,
      specsScore: 0,
      budgetDeviationPct: 1,
      areaDeviationPct: 0,
      reasons: ['قیمت هر متر مربع خارج از سقف مجاز + تلورانس است']
    };
  }

  let budgetScore = 35.0;
  let budgetDeviationPct = 0;

  if (effectiveMaxBudget > 0 && effectivePrice > 0) {
    const hardCeiling = effectiveMaxBudget * (1 + T);
    const hardFloor = effectiveMinBudget * (1 - T);

    if (effectivePrice > hardCeiling || (effectiveMinBudget > 0 && effectivePrice < hardFloor)) {
      return {
        eligible: false,
        score: 0,
        budgetScore: 0,
        areaScore: 0,
        specsScore: 0,
        budgetDeviationPct: (effectivePrice - effectiveMaxBudget) / effectiveMaxBudget,
        areaDeviationPct: 0,
        reasons: ['بودجه خارج از بازه تلورانس است']
      };
    }

    if (effectivePrice > effectiveMaxBudget) {
      budgetDeviationPct = (effectivePrice - effectiveMaxBudget) / effectiveMaxBudget;
      const ratio = T > 0 ? (effectivePrice - effectiveMaxBudget) / (effectiveMaxBudget * T) : 1;
      budgetScore = 35.0 * (1 - 0.6 * Math.min(ratio, 1));
      reasons.push(`بودجه در بازه تلورانس (+${Math.round(budgetDeviationPct * 100)}٪)`);
    } else if (effectiveMinBudget > 0 && effectivePrice < effectiveMinBudget) {
      budgetDeviationPct = (effectivePrice - effectiveMinBudget) / effectiveMinBudget;
      const ratio = T > 0 ? (effectiveMinBudget - effectivePrice) / (effectiveMinBudget * T) : 1;
      budgetScore = 35.0 * (1 - 0.4 * Math.min(ratio, 1));
    }
  }

  // ==========================================
  // 2. Evaluate Area (25 points max)
  // ==========================================
  let areaScore = 25.0;
  let areaDeviationPct = 0;
  if (ad.area > 0 && (rule.min_area > 0 || rule.max_area > 0)) {
    const minArea = rule.min_area || 0;
    const maxArea = rule.max_area || 999999;
    const hardMinArea = minArea * (1 - T);
    const hardMaxArea = maxArea * (1 + T);

    if (ad.area < hardMinArea || ad.area > hardMaxArea) {
      return {
        eligible: false,
        score: 0,
        budgetScore,
        areaScore: 0,
        specsScore: 0,
        budgetDeviationPct,
        areaDeviationPct: minArea > 0 ? (ad.area - minArea) / minArea : 0,
        reasons: ['متراژ خارج از بازه تلورانس است']
      };
    }

    if (minArea > 0 && ad.area < minArea) {
      areaDeviationPct = (ad.area - minArea) / minArea;
      const ratio = T > 0 ? (minArea - ad.area) / (minArea * T) : 1;
      areaScore = 25.0 * (1 - 0.6 * Math.min(ratio, 1));
      reasons.push(`متراژ در بازه تلورانس (${Math.round(areaDeviationPct * 100)}٪)`);
    } else if (rule.max_area > 0 && ad.area > maxArea) {
      areaDeviationPct = (ad.area - maxArea) / maxArea;
      const ratio = T > 0 ? (ad.area - maxArea) / (maxArea * T) : 1;
      areaScore = 25.0 * (1 - 0.6 * Math.min(ratio, 1));
    }
  }

  // ==========================================
  // 3. Evaluate Stage 2 Specifications (40 points max)
  // ==========================================
  let s2: Stage2Filters = {};
  try {
    s2 = JSON.parse(rule.stage2_filters_json || '{}');
  } catch {
    s2 = {};
  }

  let activeWeight = 0;
  let earnedWeight = 0;

  const checkBoolSpec = (reqVal: boolean | undefined, actualVal: boolean | undefined, weight: number, label: string) => {
    if (reqVal !== true) return;
    activeWeight += weight;
    if (actualVal === true) {
      earnedWeight += weight;
    } else if (actualVal === undefined) {
      earnedWeight += weight * 0.5;
    } else {
      reasons.push(`فاقد ${label}`);
    }
  };

  checkBoolSpec(s2.parking, ad.specs.parking, 8.0, 'پارکینگ');
  checkBoolSpec(s2.elevator, ad.specs.elevator, 8.0, 'آسانسور');
  checkBoolSpec(s2.storage, ad.specs.storage, 4.0, 'انباری');
  checkBoolSpec(s2.balcony, ad.specs.balcony, 2.0, 'بالکن');

  if (s2.min_build_year && s2.min_build_year > 0) {
    activeWeight += 5.0;
    if (ad.buildYear && ad.buildYear >= s2.min_build_year) {
      earnedWeight += 5.0;
    } else if (!ad.buildYear) {
      earnedWeight += 2.5;
    }
  }

  if (s2.bedrooms && s2.bedrooms.length > 0) {
    activeWeight += 4.0;
    if (ad.bedrooms !== null && s2.bedrooms.includes(ad.bedrooms)) {
      earnedWeight += 4.0;
    } else if (ad.bedrooms === null) {
      earnedWeight += 2.0;
    }
  }

  if (s2.floor_range && s2.floor_range.length === 2) {
    activeWeight += 3.0;
    if (ad.floorNumber !== null && ad.floorNumber >= s2.floor_range[0] && ad.floorNumber <= s2.floor_range[1]) {
      earnedWeight += 3.0;
    } else if (ad.floorNumber === null) {
      earnedWeight += 1.5;
    }
  }

  const skelFilter = normalizeStringArray(s2.skeleton);
  if (skelFilter.length > 0) {
    activeWeight += 2.0;
    if (ad.specs.skeleton && skelFilter.includes(ad.specs.skeleton)) {
      earnedWeight += 2.0;
    } else if (!ad.specs.skeleton) {
      earnedWeight += 1.0;
    }
  }

  const dirFilter = normalizeStringArray(s2.direction);
  if (dirFilter.length > 0) {
    activeWeight += 2.0;
    if (ad.specs.direction && dirFilter.includes(ad.specs.direction)) {
      earnedWeight += 2.0;
    } else if (!ad.specs.direction) {
      earnedWeight += 1.0;
    }
  }

  const cabFilter = normalizeStringArray(s2.cabinet);
  if (cabFilter.length > 0) {
    activeWeight += 1.0;
    if (ad.specs.cabinet && cabFilter.includes(ad.specs.cabinet)) {
      earnedWeight += 1.0;
    } else if (!ad.specs.cabinet) {
      earnedWeight += 0.5;
    }
  }

  const coolFilter = normalizeStringArray(s2.cooling);
  if (coolFilter.length > 0) {
    activeWeight += 0.5;
    if (ad.specs.cooling && ad.specs.cooling.some((c) => coolFilter.includes(c))) {
      earnedWeight += 0.5;
    } else if (!ad.specs.cooling) {
      earnedWeight += 0.25;
    }
  }

  const heatFilter = normalizeStringArray(s2.heating);
  if (heatFilter.length > 0) {
    activeWeight += 0.5;
    if (ad.specs.heating && ad.specs.heating.some((h) => heatFilter.includes(h))) {
      earnedWeight += 0.5;
    } else if (!ad.specs.heating) {
      earnedWeight += 0.25;
    }
  }

  const specsScore = activeWeight > 0 ? 40.0 * (earnedWeight / activeWeight) : 40.0;
  const totalScore = Math.round(budgetScore + areaScore + specsScore);

  return {
    eligible: totalScore >= (rule.min_match_score || 65),
    score: totalScore,
    budgetScore: Math.round(budgetScore * 10) / 10,
    areaScore: Math.round(areaScore * 10) / 10,
    specsScore: Math.round(specsScore * 10) / 10,
    budgetDeviationPct,
    areaDeviationPct,
    reasons
  };
}
