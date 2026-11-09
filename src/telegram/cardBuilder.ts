import { FilterRule, MatchResult, ParsedDivarAd } from '../types';

export function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatToman(amount: number): string {
  if (!amount || amount <= 0) return 'توافقی';
  if (amount >= 1_000_000_000) {
    const billions = (amount / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `${billions} میلیارد`;
  }
  if (amount >= 1_000_000) {
    const millions = Math.round(amount / 1_000_000);
    return `${millions.toLocaleString('fa-IR')} میلیون`;
  }
  return amount.toLocaleString('fa-IR');
}

export function formatPriceExactFa(amount: number): string {
  if (!amount || amount <= 0) return 'توافقی';
  return amount.toLocaleString('fa-IR') + ' تومان';
}

export function sanitizeHashtag(str: string | undefined | null): string {
  if (!str) return '';
  return str.trim().replace(/[\s\-،,]+/g, '_').replace(/[^\u0600-\u06FFa-zA-Z0-9_]/g, '');
}

export function formatSkeletonFa(val?: string): string {
  if (val === 'CONCRETE') return 'بتنی';
  if (val === 'STEEL') return 'فلزی';
  return 'نامشخص';
}

export function formatDirectionFa(val?: string): string {
  if (val === 'NORTH') return 'شمالی';
  if (val === 'SOUTH') return 'جنوبی';
  if (val === 'DUAL') return 'دو نبش / دو کله';
  if (val === 'EAST_WEST') return 'شرقی / غربی';
  return 'نامشخص';
}

export function formatCabinetFa(val?: string): string {
  if (val === 'HIGH_GLOSS') return 'های‌گلاس';
  if (val === 'MEMBRANE_WOOD') return 'ممبران / چوب';
  if (val === 'MDF') return 'MDF';
  if (val === 'METAL') return 'فلزی';
  return 'MDF';
}

export function formatHvacFa(cooling?: string[], heating?: string[]): string {
  const parts: string[] = [];
  if (heating && heating.length > 0) {
    if (heating.includes('FLOOR_HEATING')) parts.push('گرمایش از کف');
    else if (heating.includes('PACKAGE_RADIATOR')) parts.push('پکیج و رادیاتور');
    else if (heating.includes('CENTRAL_ENGINE')) parts.push('موتورخانه');
  }
  if (cooling && cooling.length > 0) {
    if (cooling.includes('DUCT_SPLIT')) parts.push('داکت اسپلیت');
    else if (cooling.includes('SPLIT_AC')) parts.push('کولر گازی');
    else if (cooling.includes('WATER_COOLER')) parts.push('کولر آبی');
  }
  if (parts.length > 0) return parts.join(' / ');
  return 'پکیج و رادیاتور / اسپلیت';
}

export function buildTelegramCardPayload(
  ad: ParsedDivarAd,
  evalResult: MatchResult,
  rule: FilterRule,
  chatId: string,
  isBackfill: boolean
): { method: 'sendPhoto' | 'sendMessage'; body: Record<string, any> } {
  const score = evalResult.score;
  const isRent = ad.dealType === 'RENT';

  const amenityText = (val: boolean | undefined, trueTxt = 'دارد', falseTxt = 'ندارد') => {
    if (val === true) return trueTxt;
    if (val === false) return falseTxt;
    return 'دارد';
  };

  const district = ad.districtPersian && ad.districtPersian !== 'نامشخص' ? ad.districtPersian : 'مرکز شهر';
  const locationText = `${ad.cityPersian || 'علی‌آباد کتول'}، ${district}`;

  let captionLines: string[] = [];

  if (isRent) {
    // ----------------- RENT TEMPLATE -----------------
    const propType = ad.propertyTypeFa || 'آپارتمان مسکونی';
    const bedText = ad.bedrooms !== null && ad.bedrooms !== undefined ? (ad.bedrooms === 0 ? 'بدون خواب' : `${ad.bedrooms} خواب`) : '۲ خواب';
    const floorInfo = ad.floorText ? ad.floorText : (ad.floorNumber !== null ? `طبقه ${ad.floorNumber}` : 'طبقه ۱');
    const unitsInfo = ad.unitsPerFloor || 'تک واحدی';
    const buildYearText = ad.buildYear ? `سال ${ad.buildYear}` : 'نوساز';
    const evacText = ad.evacuationStatus || 'تخلیه فوری';
    const tenantsText = ad.maxTenants || 'خانواده / بدون محدودیت';

    const hvac = formatHvacFa(ad.specs.cooling, ad.specs.heating);
    const cabinet = formatCabinetFa(ad.specs.cabinet);
    const flooring = ad.flooring || 'سرامیک';

    // Truncate description smartly for photo caption budget
    const cleanDesc = (ad.description || '')
      .replace(/\r?\n+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    const shortDesc = cleanDesc.length > 90 ? cleanDesc.slice(0, 87) + '...' : (cleanDesc || 'ملک با موقعیت عالی و دسترسی مناسب');

    const rahnFormatted = formatPriceExactFa(ad.credit);
    const rentFormatted = ad.rent > 0 ? formatPriceExactFa(ad.rent) : 'رهن کامل';
    const tabdil = ad.isConvertible ? 'دارد (قابل تبدیل)' : 'ندارد';

    const districtTag = sanitizeHashtag(district);
    const propTag = sanitizeHashtag(propType);
    const bedTag = sanitizeHashtag(bedText);

    captionLines = [
      `🏠 <b>[نوع ملک: ${escapeHtml(propType)}]</b>`,
      `📋 <b>مشخصات اصلی:</b>`,
      `• موقعیت: ${escapeHtml(locationText)}`,
      `• زیربنا: ${ad.area || '—'} متر مربع`,
      `• طبقه: ${escapeHtml(floorInfo)} | واحد: ${escapeHtml(unitsInfo)}`,
      `• تعداد خواب: ${escapeHtml(bedText)} | سال ساخت: ${escapeHtml(buildYearText)}`,
      `• وضعیت تخلیه: ${escapeHtml(evacText)}`,
      `• نفرات: ${escapeHtml(tenantsText)}`,
      ``,
      `✨ <b>امکانات و تجهیزات:</b>`,
      `• ورودی: ${escapeHtml(ad.entrance || 'مشترک')} | حیاط: ${escapeHtml(ad.yard || 'مشاع')}`,
      `• پارکینگ: ${amenityText(ad.specs.parking)} | آسانسور: ${amenityText(ad.specs.elevator)} | انباری: ${amenityText(ad.specs.storage)} | بالکن: ${amenityText(ad.specs.balcony)}`,
      `• گرمایش/سرمایش: ${escapeHtml(hvac)}`,
      `• کابینت: ${escapeHtml(cabinet)} | کف: ${escapeHtml(flooring)}`,
      `• کمد دیواری: ${escapeHtml(ad.closet || 'دارد')} | انشعابات: مستقل`,
      ``,
      `📄 <b>توضیحات تکمیلی:</b>`,
      `<i>${escapeHtml(shortDesc)}</i>`,
      ``,
      `💰 <b>شرایط رهن و اجاره:</b>`,
      `• مبلغ رهن: <b>${rahnFormatted}</b>`,
      `• مبلغ اجاره: <b>${rentFormatted}</b>`,
      `• قابلیت تبدیل: ${tabdil}`,
      ``,
      `🏷 #${sanitizeHashtag(ad.cityPersian || 'علی_آباد_کتول')}${districtTag ? ' #' + districtTag : ''} #اجاره #رهن_و_اجاره #${propTag} #${bedTag} #املاک_امیران #علی_آباد_ملک`,
      ``,
      `📞 <b>ارتباط با ما:</b>`,
      `📱 همراه: 09922434338`,
      `☎️ تلفن دفتر: 01734241371`,
      `📍 آدرس دفتر: علی‌آباد کتول، خیابان پاسداران (کمربندی قدیم)، نبش پاسداران ۸، املاک امیران`,
      `🔗 عضویت در کانال: @aliabadmelk`
    ];
  } else {
    // ----------------- SALE TEMPLATE -----------------
    const propType = ad.propertyTypeFa || 'آپارتمان مسکونی';
    const bedText = ad.bedrooms !== null && ad.bedrooms !== undefined ? (ad.bedrooms === 0 ? 'بدون خواب' : `${ad.bedrooms} خواب`) : '۲ خواب';
    const floorInfo = ad.floorText ? ad.floorText : (ad.floorNumber !== null ? `طبقه ${ad.floorNumber}` : 'طبقه ۱');
    const unitsInfo = ad.unitsPerFloor || 'تک واحدی';
    const buildYearText = ad.buildYear ? `${ad.buildYear}` : 'نوساز / کلید نخورده';
    const deedText = ad.deedStatus || 'تک‌برگ / شش‌دانگ';

    const directionText = formatDirectionFa(ad.specs.direction);
    const facadeText = ad.buildingFacade || 'سنگ نما';
    const flooring = ad.flooring || 'سرامیک';
    const skeletonText = formatSkeletonFa(ad.specs.skeleton);
    const hvac = formatHvacFa(ad.specs.cooling, ad.specs.heating);
    const cabinet = formatCabinetFa(ad.specs.cabinet);
    const loanText = ad.loanStatus || 'بدون وام / قابلیت دریافت وام';

    const cleanDesc = (ad.description || '')
      .replace(/\r?\n+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    const shortDesc = cleanDesc.length > 90 ? cleanDesc.slice(0, 87) + '...' : (cleanDesc || 'فرصت عالی جهت سرمایه‌گذاری و سکونت');

    const totalPriceText = formatPriceExactFa(ad.totalPrice);
    const pricePerM2Text = ad.pricePerM2 > 0 ? formatPriceExactFa(ad.pricePerM2) : 'توافقی';

    const districtTag = sanitizeHashtag(district);
    const propTag = sanitizeHashtag(propType);
    const bedTag = sanitizeHashtag(bedText);

    captionLines = [
      `🏠 <b>[نوع ملک: ${escapeHtml(propType)}]</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `📋 <b>مشخصات اصلی:</b>`,
      `• موقعیت: ${escapeHtml(locationText)}`,
      `• زیربنا: ${ad.area || '—'} متر مربع${ad.landArea ? ` | متراژ زمین: ${ad.landArea} متر` : ''}`,
      `• طبقه: ${escapeHtml(floorInfo)} | واحد: ${escapeHtml(unitsInfo)}`,
      `• تعداد خواب: ${escapeHtml(bedText)} | سال ساخت: ${escapeHtml(buildYearText)}`,
      `• وضعیت سند: ${escapeHtml(deedText)}`,
      ``,
      `✨ <b>مشخصات مهندسی و امکانات:</b>`,
      `• جهت: ${escapeHtml(directionText)} | نما: ${escapeHtml(facadeText)}`,
      `• اسکلت: ${escapeHtml(skeletonText)} | کف: ${escapeHtml(flooring)}`,
      `• تاسیسات: ${escapeHtml(hvac)}`,
      `• کابینت: ${escapeHtml(cabinet)} | انشعابات: مستقل`,
      `• پارکینگ: ${amenityText(ad.specs.parking)} | آسانسور: ${amenityText(ad.specs.elevator)} | انباری: ${amenityText(ad.specs.storage)} | بالکن: ${amenityText(ad.specs.balcony)}`,
      `• وضعیت وام: ${escapeHtml(loanText)}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📄 <b>توضیحات تکمیلی:</b>`,
      `<i>${escapeHtml(shortDesc)}</i>`,
      `━━━━━━━━━━━━━━━━━━`,
      `💰 <b>شرایط قیمت:</b>`,
      `• قیمت کل: <b>${totalPriceText}</b>`,
      `• قیمت هر متر: <b>${pricePerM2Text}</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `🏷 #${sanitizeHashtag(ad.cityPersian || 'علی_آباد_کتول')}${districtTag ? ' #' + districtTag : ''} #فروش #${propTag} #${bedTag} #املاک_امیران #علی_آباد_ملک`,
      `━━━━━━━━━━━━━━━━━━`,
      `📞 <b>ارتباط با ما:</b>`,
      `📱 همراه: 09922434338`,
      `☎️ تلفن دفتر: 01734241371`,
      `📍 آدرس دفتر: علی‌آباد کتول، خیابان پاسداران (کمربندی قدیم)، نبش پاسداران ۸، املاک امیران`,
      `🔗 عضویت در کانال: @aliabadmelk`
    ];
  }

  // Ensure total length strictly adheres to Telegram photo caption limit (1024 characters)
  let caption = captionLines.join('\n');
  if (caption.length > 1020) {
    // If oversized, drop or truncate the supplementary description line
    caption = captionLines
      .filter((line) => !line.startsWith('<i>'))
      .join('\n')
      .slice(0, 1018);
  }

  const divarUrl = `https://divar.ir/v/${ad.token}`;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '🔗 مشاهده آگهی در دیوار', url: divarUrl },
        ...(ad.latitude && ad.longitude
          ? [{ text: '🗺 موقعیت روی نقشه', url: `https://maps.google.com/?q=${ad.latitude},${ad.longitude}` }]
          : [])
      ],
      [
        { text: `📊 درصد تطابق: ${score}٪`, callback_data: `score_info:${rule.id}:${ad.token}:${score}` }
      ]
    ]
  };

  if (ad.primaryPhotoUrl) {
    return {
      method: 'sendPhoto',
      body: {
        chat_id: chatId,
        photo: ad.primaryPhotoUrl,
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      }
    };
  }

  return {
    method: 'sendMessage',
    body: {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: replyMarkup
    }
  };
}
