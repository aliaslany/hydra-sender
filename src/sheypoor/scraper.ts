import { Env, FilterRule, ParsedDivarAd } from '../types';
import { extractIntFromPersian, normalizePersianText, parseDescriptionNLP, parseExtendedAttributesNLP } from '../engine/scorer';

export const SHEYPOOR_HEADERS: Record<string, string> = {
  'Accept': 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
  'Referer': 'https://www.sheypoor.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin'
};

export const SHEYPOOR_CITY_MAP: Record<string, string> = {
  '823': 'ali-abad-katul',
  'علی‌آباد کتول': 'ali-abad-katul',
  'علی اباد کتول': 'ali-abad-katul',
  '1': 'tehran',
  'تهران': 'tehran',
  '24': 'gorgan',
  'گرگان': 'gorgan',
  '25': 'sari',
  'ساری': 'sari',
  '2': 'mashhad',
  'مشهد': 'mashhad',
  '3': 'karaj',
  'کرج': 'karaj',
  '4': 'shiraz',
  'شیراز': 'shiraz',
  '5': 'isfahan',
  'اصفهان': 'isfahan',
  '6': 'tabriz',
  'تبریز': 'tabriz',
  '7': 'ahvaz',
  'اهواز': 'ahvaz',
  '8': 'qom',
  'قم': 'qom',
  '11': 'rasht',
  'رشت': 'rasht'
};

export function resolveSheypoorCitySlug(rule: FilterRule): string {
  try {
    const cityIds: string[] = JSON.parse(rule.city_ids_json || '["823"]');
    if (cityIds.length > 0 && SHEYPOOR_CITY_MAP[cityIds[0]]) {
      return SHEYPOOR_CITY_MAP[cityIds[0]];
    }
  } catch (_) {}
  return 'ali-abad-katul';
}

function parseSheypoorRelativeTime(text?: string): number | null {
  if (!text) return null;
  const now = Math.floor(Date.now() / 1000);
  const norm = normalizePersianText(text);

  if (norm.includes('لحظاتی پیش') || norm.includes('دقایقی پیش') || norm.includes('چند ثانیه پیش')) {
    return now - 300;
  }
  if (norm.includes('یک ربع پیش')) {
    return now - 900;
  }
  if (norm.includes('نیم ساعت پیش')) {
    return now - 1800;
  }
  const hourMatch = norm.match(/(\d+)\s*ساعت\s*پیش/);
  if (hourMatch) {
    return now - parseInt(hourMatch[1], 10) * 3600;
  }
  if (norm.includes('پریروز')) {
    return now - 2 * 86400;
  }
  if (norm.includes('دیروز')) {
    return now - 86400;
  }
  const dayMatch = norm.match(/(\d+)\s*روز\s*پیش/);
  if (dayMatch) {
    return now - parseInt(dayMatch[1], 10) * 86400;
  }
  const weekMatch = norm.match(/(\d+)\s*هفته\s*پیش/);
  if (weekMatch) {
    return now - parseInt(weekMatch[1], 10) * 7 * 86400;
  }
  const monthMatch = norm.match(/(\d+)\s*ماه\s*پیش/);
  if (monthMatch) {
    return now - parseInt(monthMatch[1], 10) * 30 * 86400;
  }
  return null;
}

export async function searchSheypoorPostList(
  rule: FilterRule,
  env: Env,
  pagination?: { page?: number }
): Promise<{ tokens: string[]; nextCursorDate: string | null; searchUid: string | null }> {
  const baseUrl = env.SHEYPOOR_PROXY_URL || 'https://www.sheypoor.com';
  const citySlug = resolveSheypoorCitySlug(rule);
  const page = pagination?.page || 1;
  const T = rule.tolerance_pct || 0.15;

  const params = new URLSearchParams();
  params.set('p', String(page));
  params.set('c', '43603'); // Sheypoor Real Estate Category ID

  if (rule.deal_type === 'BUY' && (rule.min_budget > 0 || rule.max_budget > 0)) {
    if (rule.min_budget > 0) {
      params.set('mnp', String(Math.floor(rule.min_budget * (1 - T))));
    }
    if (rule.max_budget > 0) {
      params.set('mxp', String(Math.ceil(rule.max_budget * (1 + T))));
    }
  } else if (rule.deal_type === 'RENT') {
    if (rule.max_budget > 0) {
      params.set('mxp', String(Math.ceil(rule.max_budget * (1 + T))));
    }
  }

  const endpoint = `${baseUrl}/api/v10.0.0/search/${citySlug}/real-estate?${params.toString()}`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: SHEYPOOR_HEADERS
  });

  if (!res.ok) {
    throw new Error(`Sheypoor search failed with HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const rawList: any[] = data?.data || [];
  const tokens: string[] = [];

  for (const block of rawList) {
    // Only process genuine local 'normal' listings (skip paidEngagement cross-city promos, vip, special, banner, activeShop)
    if (block?.type !== 'normal') continue;
    const id = block?.id;
    if (id && block?.attributes) {
      const token = `sp_${id}`;
      if (!tokens.includes(token)) {
        tokens.push(token);
      }
    }
  }

  const normalCount = Number(data?.meta?.normal_count) || 0;
  const hasMore = tokens.length > 0 && normalCount > page * 24;
  const nextCursorDate = hasMore ? String(page + 1) : null;

  return { tokens, nextCursorDate, searchUid: null };
}

export async function fetchSheypoorPostDetail(
  tokenOrId: string,
  dealType: 'BUY' | 'RENT',
  env: Env
): Promise<ParsedDivarAd | null> {
  const cleanId = String(tokenOrId).replace(/^sp_/, '').trim();
  if (!cleanId || !/^\d+$/.test(cleanId)) {
    return null;
  }

  const baseUrl = env.SHEYPOOR_PROXY_URL || 'https://www.sheypoor.com';
  const url = `${baseUrl}/api/v10.0.0/listings/${cleanId}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: SHEYPOOR_HEADERS
  });

  if (!res.ok) return null;
  const raw: any = await res.json();
  const attr: any = raw?.data?.attributes;
  if (!attr) return null;

  const title = String(attr.title || 'آگهی ملک شیپور').trim();
  const rawDesc = String(attr.description || '')
    .replace(/<span[^>]*>.*?<\/span>/gs, '')
    .replace(/<[^>]+>/g, '\n')
    .trim();
  const description = rawDesc;

  // Location & Breadcrumbs
  let cityPersian = '';
  let districtPersian = '';
  const breadcrumbs: any[] = attr.breadcrumbs || [];
  const knownCities = ['علی‌آباد کتول', 'علی آباد کتول', 'تهران', 'گرگان', 'ساری', 'مشهد', 'کرج', 'شیراز', 'اصفهان', 'تبریز', 'اهواز', 'قم', 'رشت', 'بابل', 'آمل', 'گنبد کاووس', 'کردکوی', 'آزادشهر'];
  for (const b of breadcrumbs) {
    const t = normalizePersianText(String(b.title || ''));
    const matched = knownCities.find((c) => t.includes(normalizePersianText(c)));
    if (matched) {
      cityPersian = matched === 'علی آباد کتول' ? 'علی‌آباد کتول' : matched;
      break;
    }
  }

  const locStr = String(attr.location || '').trim();
  if (locStr) {
    const parts = locStr.split(/[،,]+/).map((p) => p.trim()).filter(Boolean);
    if (!cityPersian && parts.length >= 2) {
      cityPersian = parts[parts.length - 2];
    } else if (!cityPersian && parts.length === 1) {
      cityPersian = parts[0];
    }
    if (parts.length > 1) {
      const candidateDistrict = parts[parts.length - 1];
      if (candidateDistrict && normalizePersianText(candidateDistrict) !== normalizePersianText(cityPersian)) {
        districtPersian = candidateDistrict;
      }
    }
  }
  if (!cityPersian && breadcrumbs.length >= 3 && breadcrumbs[2]?.title) {
    cityPersian = String(breadcrumbs[2].title).trim();
  }
  if (!cityPersian) {
    cityPersian = 'علی‌آباد کتول';
  }

  // Pricing
  let totalPrice = 0;
  let pricePerM2 = 0;
  let credit = 0;
  let rent = 0;
  let isConvertible = false;

  const priceData = attr.price;
  if (Array.isArray(priceData)) {
    for (const p of priceData) {
      const label = normalizePersianText(p?.label || '');
      const amount = extractIntFromPersian(String(p?.amount ?? p?.value ?? '0'));
      if (label.includes('رهن') || label.includes('ودیعه')) {
        credit = amount;
      } else if (label.includes('اجاره')) {
        rent = amount;
      } else if (label.includes('قیمت') || label.includes('کل') || (!label && amount > 0)) {
        totalPrice = amount;
      }
    }
  } else if (priceData && typeof priceData === 'object') {
    const amount = extractIntFromPersian(String(priceData.amount ?? priceData.value ?? '0'));
    totalPrice = amount;
  } else if (typeof priceData === 'number' || typeof priceData === 'string') {
    totalPrice = extractIntFromPersian(String(priceData));
  }

  // Specifications
  let area = 0;
  let landArea: number | null = null;
  let bedrooms: number | null = null;
  let buildYear: number | null = null;
  let floorNumber: number | null = null;
  let floorText = '';
  let unitsPerFloor: string | null = null;
  let deedStatus: string | null = null;
  let flooring: string | null = null;
  let buildingFacade: string | null = null;
  let evacuationStatus: string | null = null;
  let loanStatus: string | null = null;

  const widgetSpecs: ParsedDivarAd['specs'] = {};
  const fullAttrs: any[] = attr.attributes || attr.fullAttributes || [];

  for (const f of fullAttrs) {
    const k = normalizePersianText(f?.key || f?.title || '');
    const v = normalizePersianText(f?.value || '');

    if (k.includes('متراژ زمین') || k.includes('مساحت زمین')) {
      landArea = extractIntFromPersian(v);
    } else if (k.includes('متراژ') || k.includes('زیربنا')) {
      area = extractIntFromPersian(v);
    } else if (k.includes('اتاق') || k.includes('خواب')) {
      bedrooms = v.includes('بدون') ? 0 : extractIntFromPersian(v);
    } else if (k.includes('ساخت') || k.includes('سن بنا')) {
      if (k.includes('سن بنا') || v.includes('سال')) {
        if (v.includes('نوساز')) {
          buildYear = 1404;
        } else {
          const age = extractIntFromPersian(v);
          if (age >= 0 && age < 100) buildYear = 1404 - age;
        }
      } else {
        buildYear = extractIntFromPersian(v);
      }
    } else if (k.includes('طبقه')) {
      floorText = v;
      floorNumber = v.includes('همکف') ? 0 : extractIntFromPersian(v);
    } else if (k.includes('واحد در طبقه') || k.includes('تعداد واحد')) {
      unitsPerFloor = v;
    } else if (k.includes('پارکینگ')) {
      widgetSpecs.parking = v.includes('ندارد') ? false : (v.includes('دارد') || v.includes('بله') || v.length > 0);
    } else if (k.includes('آسانسور')) {
      widgetSpecs.elevator = v.includes('ندارد') ? false : (v.includes('دارد') || v.includes('بله') || v.length > 0);
    } else if (k.includes('انباری')) {
      widgetSpecs.storage = v.includes('ندارد') ? false : (v.includes('دارد') || v.includes('بله') || v.length > 0);
    } else if (k.includes('بالکن') || k.includes('تراس')) {
      widgetSpecs.balcony = v.includes('ندارد') ? false : (v.includes('دارد') || v.includes('بله') || v.length > 0);
    } else if (k.includes('سند')) {
      deedStatus = v;
    } else if (k.includes('نما')) {
      buildingFacade = v;
    } else if (k.includes('کف')) {
      flooring = v;
    } else if (k.includes('جهت')) {
      if (v.includes('شمالی')) widgetSpecs.direction = 'NORTH';
      else if (v.includes('جنوبی')) widgetSpecs.direction = 'SOUTH';
      else if (v.includes('شرقی') || v.includes('غربی')) widgetSpecs.direction = 'EAST_WEST';
      else if (v.includes('دو کله') || v.includes('دو نبش')) widgetSpecs.direction = 'DUAL';
    } else if (k.includes('کابینت')) {
      if (v.includes('های گلاس') || v.includes('هایگلاس')) widgetSpecs.cabinet = 'HIGH_GLOSS';
      else if (v.includes('ممبران') || v.includes('چوب')) widgetSpecs.cabinet = 'MEMBRANE_WOOD';
      else if (v.includes('ام دی اف') || v.toLowerCase().includes('mdf')) widgetSpecs.cabinet = 'MDF';
      else if (v.includes('فلزی')) widgetSpecs.cabinet = 'METAL';
    } else if (k.includes('سرمایش')) {
      widgetSpecs.cooling = [];
      if (v.includes('داکت')) widgetSpecs.cooling.push('DUCT_SPLIT');
      if (v.includes('گازی') || v.includes('اسپلیت')) widgetSpecs.cooling.push('SPLIT_AC');
      if (v.includes('چیلر')) widgetSpecs.cooling.push('CHILLER');
      if (v.includes('آبی')) widgetSpecs.cooling.push('WATER_COOLER');
    } else if (k.includes('گرمایش')) {
      widgetSpecs.heating = [];
      if (v.includes('از کف')) widgetSpecs.heating.push('FLOOR_HEATING');
      if (v.includes('شوفاژ') || v.includes('پکیج')) widgetSpecs.heating.push('PACKAGE_RADIATOR');
      if (v.includes('فن کویل')) widgetSpecs.heating.push('FAN_COIL_DUCT');
      if (v.includes('موتورخانه')) widgetSpecs.heating.push('CENTRAL_ENGINE');
    } else if (k.includes('وام')) {
      loanStatus = v;
    } else if (k.includes('سکونت') || k.includes('تخلیه')) {
      evacuationStatus = v;
    }
  }

  if (totalPrice > 0 && area > 0 && pricePerM2 === 0) {
    pricePerM2 = Math.round(totalPrice / area);
  }

  // Geo Coordinates
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (attr.geo?.latitude && attr.geo?.longitude) {
    latitude = Number(attr.geo.latitude) || null;
    longitude = Number(attr.geo.longitude) || null;
  }

  // Photos
  const imageUrls: string[] = [];
  const rawImages: any[] = attr.images || [];
  for (const img of rawImages) {
    const src = img?.source?.full || img?.source?.desktop || img?.source?.mobile || img?.url;
    if (src && typeof src === 'string' && !imageUrls.includes(src)) {
      imageUrls.push(src);
    }
  }

  // Seller Type / Agency
  const isShop = attr.isShopProfile === true;
  const hasConsultant = !!attr.consultant;
  const businessType: 'personal' | 'real_estate' = (isShop || hasConsultant) ? 'real_estate' : 'personal';

  // Timestamp (Sheypoor returns addedAt in local Tehran time without TZ suffix)
  let postTimestamp = Math.floor(Date.now() / 1000);
  if (attr.addedAt) {
    const rawTime = String(attr.addedAt).trim();
    const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(rawTime);
    const isoCandidate = hasTz ? rawTime : `${rawTime.replace(' ', 'T')}+03:30`;
    const parsed = Date.parse(isoCandidate);
    if (!isNaN(parsed)) postTimestamp = Math.floor(parsed / 1000);
  } else if (attr.timePassedLabel) {
    const parsed = parseSheypoorRelativeTime(attr.timePassedLabel);
    if (parsed) postTimestamp = parsed;
  }

  // Category Slug (prefer explicit slug, fallback to breadcrumb category text e.g. خرید و فروش ویلا)
  const crumbCat = breadcrumbs.length >= 4 ? String(breadcrumbs[3]?.title || '') : '';
  const categorySlug = `${attr.category_slug || attr.category || ''} ${crumbCat}`.trim() || 'real-estate';

  // Merge with NLP fallback from description
  const nlpSpecs = parseDescriptionNLP(description);
  const extendedAttrs = parseExtendedAttributesNLP(description, title, categorySlug);

  const mergedSpecs: ParsedDivarAd['specs'] = {
    parking: widgetSpecs.parking ?? nlpSpecs.parking,
    elevator: widgetSpecs.elevator ?? nlpSpecs.elevator,
    storage: widgetSpecs.storage ?? nlpSpecs.storage,
    balcony: widgetSpecs.balcony ?? nlpSpecs.balcony,
    skeleton: widgetSpecs.skeleton ?? nlpSpecs.skeleton,
    direction: widgetSpecs.direction ?? nlpSpecs.direction,
    cabinet: widgetSpecs.cabinet ?? nlpSpecs.cabinet,
    cooling: widgetSpecs.cooling && widgetSpecs.cooling.length > 0 ? widgetSpecs.cooling : nlpSpecs.cooling,
    heating: widgetSpecs.heating && widgetSpecs.heating.length > 0 ? widgetSpecs.heating : nlpSpecs.heating
  };

  const sheypoorUrl = attr.url || `https://www.sheypoor.com/v/${cleanId}`;

  return {
    token: `sp_${cleanId}`,
    source: 'sheypoor',
    url: sheypoorUrl,
    title,
    description,
    cityPersian,
    districtPersian,
    dealType,
    totalPrice,
    pricePerM2,
    credit,
    rent,
    isConvertible,
    area,
    landArea,
    bedrooms,
    buildYear,
    floorNumber,
    floorText,
    unitsPerFloor: unitsPerFloor ?? extendedAttrs.unitsPerFloor ?? null,
    primaryPhotoUrl: imageUrls.length > 0 ? imageUrls[0] : null,
    imageUrls,
    latitude,
    longitude,
    postTimestamp,
    businessType,
    specs: mergedSpecs,
    ...extendedAttrs,
    ...(deedStatus ? { deedStatus } : {}),
    ...(flooring ? { flooring } : {}),
    ...(buildingFacade ? { buildingFacade } : {}),
    ...(evacuationStatus ? { evacuationStatus } : {}),
    ...(loanStatus ? { loanStatus } : {}),
    ...(landArea ? { landArea } : {})
  };
}
