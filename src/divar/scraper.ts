import { Env, FilterRule, ParsedDivarAd } from '../types';
import { extractIntFromPersian, normalizePersianText, parseDescriptionNLP } from '../engine/scorer';

const DIVAR_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Origin': 'https://divar.ir',
  'Referer': 'https://divar.ir/'
};

export interface DivarSearchResponse {
  tokens: string[];
  nextCursorDate: string | null;
  searchUid: string | null;
}

export async function searchDivarPostList(
  rule: FilterRule,
  env: Env,
  pagination?: { lastPostDate: string; page: number; searchUid?: string }
): Promise<DivarSearchResponse> {
  const T = Math.min(Math.max(rule.tolerance_pct || 0.15, 0.0), 0.25);
  let cityIds: string[] = ['1'];
  let districts: string[] = [];

  try { cityIds = JSON.parse(rule.city_ids_json || '["1"]'); } catch {}
  try { districts = JSON.parse(rule.districts_json || '[]'); } catch {}

  const formData: Record<string, any> = {
    category: { str: { value: rule.divar_category_slug || 'apartment-sell' } },
    sort: { str: { value: 'sort_date' } }
  };

  if (districts.length > 0) {
    formData.districts = { repeated_string: { value: districts } };
  }

  // Expand numeric bounds by ±tolerance so Pass 2 can score tolerance matches
  if (rule.deal_type === 'BUY' && (rule.min_budget > 0 || rule.max_budget > 0)) {
    const minP = rule.min_budget > 0 ? String(Math.floor(rule.min_budget * (1 - T))) : undefined;
    const maxP = rule.max_budget > 0 ? String(Math.ceil(rule.max_budget * (1 + T))) : undefined;
    formData.price = { number_range: { ...(minP ? { minimum: minP } : {}), ...(maxP ? { maximum: maxP } : {}) } };
  } else if (rule.deal_type === 'RENT') {
    if (rule.min_budget > 0 || rule.max_budget > 0) {
      const maxC = rule.max_budget > 0 ? String(Math.ceil(rule.max_budget * (1 + T))) : undefined;
      formData.credit = { number_range: { ...(maxC ? { maximum: maxC } : {}) } };
    }
    if (rule.max_rent > 0) {
      const maxR = String(Math.ceil(rule.max_rent * (1 + T)));
      formData.rent = { number_range: { maximum: maxR } };
    }
  }

  if (rule.min_area > 0 || rule.max_area > 0) {
    const minS = rule.min_area > 0 ? String(Math.floor(rule.min_area * (1 - T))) : undefined;
    const maxS = rule.max_area > 0 ? String(Math.ceil(rule.max_area * (1 + T))) : undefined;
    formData.size = { number_range: { ...(minS ? { minimum: minS } : {}), ...(maxS ? { maximum: maxS } : {}) } };
  }

  const payload: Record<string, any> = {
    city_ids: cityIds,
    source_view: 'CATEGORY',
    disable_recommendation: true,
    form_data: { data: formData }
  };

  if (pagination && pagination.lastPostDate) {
    payload.pagination_data = {
      '@type': 'type.googleapis.com/post_list.PaginationData',
      last_post_date: pagination.lastPostDate,
      page: pagination.page,
      layer_page: pagination.page,
      search_uid: pagination.searchUid || ''
    };
  }

  const baseUrl = env.DIVAR_PROXY_URL || 'https://api.divar.ir';
  const res = await fetch(`${baseUrl}/v8/postlist/w/search`, {
    method: 'POST',
    headers: DIVAR_HEADERS,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Divar search failed with HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const widgets: any[] = data?.list_widgets || [];
  const tokens: string[] = [];

  for (const w of widgets) {
    if (w?.widget_type === 'POST_ROW') {
      const token = w?.data?.action?.payload?.token || w?.data?.token;
      if (token && typeof token === 'string') {
        tokens.push(token);
      }
    }
  }

  const nextCursorDate = data?.pagination?.data?.last_post_date || null;
  const searchUid = data?.pagination?.data?.search_uid || null;

  return { tokens, nextCursorDate, searchUid };
}

export async function fetchDivarPostDetail(
  token: string,
  dealType: 'BUY' | 'RENT',
  env: Env
): Promise<ParsedDivarAd | null> {
  const baseUrl = env.DIVAR_PROXY_URL || 'https://api.divar.ir';
  const res = await fetch(`${baseUrl}/v8/posts-v2/web/${token}`, {
    method: 'GET',
    headers: DIVAR_HEADERS
  });

  if (!res.ok) return null;
  const raw: any = await res.json();

  const sections: any[] = raw?.sections || [];
  let title = raw?.share?.title || raw?.seo?.title || 'آگهی ملک';
  let description = raw?.share?.description || '';
  const cityPersian = raw?.web_info?.city_persian || 'تهران';
  const districtPersian = raw?.web_info?.district_persian || '';
  let totalPrice = 0;
  let pricePerM2 = 0;
  let credit = 0;
  let rent = 0;
  let isConvertible = false;
  let area = 0;
  let bedrooms: number | null = null;
  let buildYear: number | null = null;
  let floorNumber: number | null = null;
  let floorText = '';
  let primaryPhotoUrl: string | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;

  const widgetSpecs: ParsedDivarAd['specs'] = {};

  for (const sec of sections) {
    const widgets: any[] = sec?.widgets || [];
    for (const w of widgets) {
      const wType = w?.widget_type;
      const wData = w?.data || {};

      if (wType === 'LEGEND_TITLE_ROW' && wData.title) {
        title = wData.title;
      } else if (wType === 'DESCRIPTION_ROW' && wData.text) {
        description += '\n' + wData.text;
      } else if (wType === 'IMAGE_CAROUSEL' || wType === 'IMAGE_SLIDER_ROW') {
        const items = wData.items || [];
        if (items.length > 0 && !primaryPhotoUrl) {
          primaryPhotoUrl = items[0]?.image?.url || items[0]?.image_url || null;
        }
      } else if (wType === 'MAP_ROW') {
        latitude = wData?.location?.exact_data?.point?.latitude || wData?.location?.fuzzy_data?.point?.latitude || null;
        longitude = wData?.location?.exact_data?.point?.longitude || wData?.location?.fuzzy_data?.point?.longitude || null;
      } else if (wType === 'GROUP_INFO_ROW' || wType === 'GROUP_FEATURE_ROW') {
        const items: any[] = wData.items || [];
        for (const item of items) {
          const k = normalizePersianText(item.title);
          const v = normalizePersianText(item.value);
          if (k.includes('متراژ')) area = extractIntFromPersian(v);
          else if (k.includes('ساخت')) buildYear = extractIntFromPersian(v);
          else if (k.includes('اتاق')) bedrooms = v.includes('بدون') ? 0 : extractIntFromPersian(v);
          else if (k.includes('پارکینگ')) widgetSpecs.parking = !item.available ? false : !v.includes('ندارد');
          else if (k.includes('آسانسور')) widgetSpecs.elevator = !item.available ? false : !v.includes('ندارد');
          else if (k.includes('انباری')) widgetSpecs.storage = !item.available ? false : !v.includes('ندارد');
          else if (k.includes('بالکن')) widgetSpecs.balcony = !item.available ? false : !v.includes('ندارد');
        }
      } else if (wType === 'UNEXPANDABLE_ROW' || wType === 'EXPANDABLE_ROW') {
        const k = normalizePersianText(wData.title);
        const v = normalizePersianText(wData.value);

        if (k.includes('قیمت کل')) totalPrice = extractIntFromPersian(v);
        else if (k.includes('قیمت هر متر')) pricePerM2 = extractIntFromPersian(v);
        else if (k.includes('ودیعه')) credit = extractIntFromPersian(v);
        else if (k.includes('اجاره')) rent = v.includes('رایگان') || v.includes('کامل') ? 0 : extractIntFromPersian(v);
        else if (k.includes('تبدیل')) isConvertible = true;
        else if (k.includes('متراژ') && !area) area = extractIntFromPersian(v);
        else if (k.includes('طبقه')) {
          floorText = v;
          floorNumber = v.includes('همکف') ? 0 : extractIntFromPersian(v);
        } else if (k.includes('جهت ساختمان')) {
          if (v.includes('شمالی')) widgetSpecs.direction = 'NORTH';
          else if (v.includes('جنوبی')) widgetSpecs.direction = 'SOUTH';
          else if (v.includes('شرقی') || v.includes('غربی')) widgetSpecs.direction = 'EAST_WEST';
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
        }
      }
    }
  }

  if (totalPrice > 0 && area > 0 && pricePerM2 === 0) {
    pricePerM2 = Math.round(totalPrice / area);
  }

  // Merge structured KEY_VALUE specs with Persian NLP fallback from description
  const nlpSpecs = parseDescriptionNLP(description);
  const mergedSpecs: ParsedDivarAd['specs'] = {
    parking: widgetSpecs.parking ?? nlpSpecs.parking,
    elevator: widgetSpecs.elevator ?? nlpSpecs.elevator,
    storage: widgetSpecs.storage ?? nlpSpecs.storage,
    balcony: widgetSpecs.balcony ?? nlpSpecs.balcony,
    skeleton: widgetSpecs.skeleton ?? nlpSpecs.skeleton,
    direction: widgetSpecs.direction ?? nlpSpecs.direction,
    cabinet: widgetSpecs.cabinet ?? nlpSpecs.cabinet,
    cooling: (widgetSpecs.cooling && widgetSpecs.cooling.length > 0) ? widgetSpecs.cooling : nlpSpecs.cooling,
    heating: (widgetSpecs.heating && widgetSpecs.heating.length > 0) ? widgetSpecs.heating : nlpSpecs.heating
  };

  return {
    token,
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
    bedrooms,
    buildYear,
    floorNumber,
    floorText,
    primaryPhotoUrl,
    latitude,
    longitude,
    postTimestamp: Math.floor(Date.now() / 1000),
    specs: mergedSpecs
  };
}
