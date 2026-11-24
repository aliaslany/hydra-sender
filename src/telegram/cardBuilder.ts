import { ChannelBranding, FilterRule, MatchResult, ParsedDivarAd } from '../types';

export const DEFAULT_ALIABAD_BRANDING: ChannelBranding = {
  chat_id: '@aliabadmelk',
  contact_mobile: '09922434338',
  contact_phone: '01734241371',
  office_address: 'علی‌آباد کتول، خیابان پاسداران (کمربندی قدیم)، نبش پاسداران ۸، املاک امیران',
  brand_hashtags: ['#املاک_امیران', '#علی_آباد_ملک']
};

export function resolveChannelBranding(chatId: string, branding?: ChannelBranding | null): ChannelBranding {
  if (branding && (branding.contact_mobile || branding.contact_phone || branding.office_address || (branding.brand_hashtags && branding.brand_hashtags.length > 0))) {
    return {
      chat_id: branding.chat_id || chatId,
      contact_mobile: branding.contact_mobile || '',
      contact_phone: branding.contact_phone || '',
      office_address: branding.office_address || '',
      brand_hashtags: branding.brand_hashtags || []
    };
  }
  if (!chatId || chatId === '@aliabadmelk' || chatId === '@preview_channel') {
    return { ...DEFAULT_ALIABAD_BRANDING, chat_id: chatId || '@aliabadmelk' };
  }
  return { chat_id: chatId, brand_hashtags: [] };
}

function buildContactFooterLines(resolved: ChannelBranding): string[] {
  const lines: string[] = [];
  const hasContact = resolved.contact_mobile || resolved.contact_phone || resolved.office_address;
  if (hasContact) {
    lines.push(`━━━━━━━━━━━━━━━━━━`, `📞 <b>ارتباط با ما:</b>`);
    if (resolved.contact_mobile) lines.push(`📱 همراه: ${escapeHtml(resolved.contact_mobile)}`);
    if (resolved.contact_phone) lines.push(`☎️ تلفن دفتر: ${escapeHtml(resolved.contact_phone)}`);
    if (resolved.office_address) lines.push(`📍 آدرس دفتر: ${escapeHtml(resolved.office_address)}`);
  } else {
    lines.push(`━━━━━━━━━━━━━━━━━━`);
  }
  lines.push(`🔗 عضویت در کانال: ${escapeHtml(resolved.chat_id)}`);
  return lines;
}

function trimCaptionSafely(lines: string[], extraSuffix = '', maxLen = 1020): string {
  const base = lines.join('\n');
  const full = extraSuffix ? `${base}\n${extraSuffix}` : base;
  if (full.length <= maxLen) return full;

  // Step 1: Drop optional <i>description</i> block and its divider
  const withoutDesc: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('📄') && lines[i + 1]?.startsWith('<i>')) {
      if (withoutDesc[withoutDesc.length - 1]?.startsWith('━━━')) withoutDesc.pop();
      i++;
      continue;
    }
    withoutDesc.push(lines[i]);
  }
  const reduced = extraSuffix ? `${withoutDesc.join('\n')}\n${extraSuffix}` : withoutDesc.join('\n');
  if (reduced.length <= maxLen) return reduced;

  // Step 2: Trim plain-text lines cleanly (never breaking HTML open/close tags)
  const trimmedBody = withoutDesc.join('\n').slice(0, Math.max(0, maxLen - extraSuffix.length - 4));
  const lastNewline = trimmedBody.lastIndexOf('\n');
  const safeBody = lastNewline > 200 ? trimmedBody.slice(0, lastNewline) : trimmedBody;
  return extraSuffix ? `${safeBody}\n${extraSuffix}` : safeBody;
}

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

export function formatSkeletonFa(val?: string): string | null {
  if (val === 'CONCRETE') return 'بتنی';
  if (val === 'STEEL') return 'فلزی';
  return null;
}

export function formatDirectionFa(val?: string): string | null {
  if (val === 'NORTH') return 'شمالی';
  if (val === 'SOUTH') return 'جنوبی';
  if (val === 'DUAL') return 'دو نبش / دو کله';
  if (val === 'EAST_WEST') return 'شرقی / غربی';
  return null;
}

export function formatCabinetFa(val?: string): string | null {
  if (val === 'HIGH_GLOSS') return 'های‌گلاس';
  if (val === 'MEMBRANE_WOOD') return 'ممبران / چوب';
  if (val === 'MDF') return 'MDF';
  if (val === 'METAL') return 'فلزی';
  return null;
}

export function formatHvacFa(cooling?: string[], heating?: string[]): string | null {
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
    else if (cooling.includes('CHILLER')) parts.push('چیلر');
  }
  if (parts.length > 0) return parts.join(' / ');
  return null;
}

export function buildTelegramCardPayload(
  ad: ParsedDivarAd,
  evalResult: MatchResult,
  rule: FilterRule,
  chatId: string,
  _isBackfill: boolean,
  branding?: ChannelBranding | null
): { method: 'sendMediaGroup' | 'sendPhoto' | 'sendMessage'; body: Record<string, any> } {
  const score = evalResult.score;
  const isRent = ad.dealType === 'RENT';
  const resolvedBranding = resolveChannelBranding(chatId, branding);

  const district = ad.districtPersian && ad.districtPersian !== 'نامشخص' ? ad.districtPersian.trim() : '';
  const locationText = district ? `${ad.cityPersian || 'علی‌آباد کتول'}، ${district}` : (ad.cityPersian || 'علی‌آباد کتول');

  let captionLines: string[] = [];

  if (isRent) {
    // ----------------- RENT TEMPLATE -----------------
    const propType = ad.propertyTypeFa || 'آپارتمان مسکونی';
    const bedText = ad.bedrooms !== null && ad.bedrooms !== undefined
      ? (ad.bedrooms === 0 ? 'بدون خواب' : `${ad.bedrooms} خواب`)
      : null;
    const floorInfo = ad.floorText ? ad.floorText : (ad.floorNumber !== null && ad.floorNumber !== undefined ? `طبقه ${ad.floorNumber}` : null);
    const unitsInfo = ad.unitsPerFloor || null;
    const buildYearText = ad.buildYear ? `سال ساخت ${ad.buildYear}` : null;

    const mainSpecs: string[] = [];
    mainSpecs.push(`• موقعیت: ${escapeHtml(locationText)}`);

    if (ad.area > 0 && ad.landArea && ad.landArea > 0) {
      mainSpecs.push(`• زیربنا: ${ad.area} متر مربع | متراژ زمین: ${ad.landArea} متر مربع`);
    } else if (ad.area > 0) {
      mainSpecs.push(`• زیربنا: ${ad.area} متر مربع`);
    } else if (ad.landArea && ad.landArea > 0) {
      mainSpecs.push(`• متراژ زمین: ${ad.landArea} متر مربع`);
    }

    if (floorInfo && unitsInfo) {
      mainSpecs.push(`• طبقه: ${escapeHtml(floorInfo)} | واحد: ${escapeHtml(unitsInfo)}`);
    } else if (floorInfo) {
      mainSpecs.push(`• طبقه: ${escapeHtml(floorInfo)}`);
    } else if (unitsInfo) {
      mainSpecs.push(`• واحد: ${escapeHtml(unitsInfo)}`);
    }

    if (bedText && buildYearText) {
      mainSpecs.push(`• تعداد خواب: ${escapeHtml(bedText)} | ${escapeHtml(buildYearText)}`);
    } else if (bedText) {
      mainSpecs.push(`• تعداد خواب: ${escapeHtml(bedText)}`);
    } else if (buildYearText) {
      mainSpecs.push(`• ${escapeHtml(buildYearText)}`);
    }

    if (ad.evacuationStatus) {
      mainSpecs.push(`• وضعیت تخلیه: ${escapeHtml(ad.evacuationStatus)}`);
    }
    if (ad.maxTenants) {
      mainSpecs.push(`• نفرات: ${escapeHtml(ad.maxTenants)}`);
    }

    // Dynamic engineering & amenities
    const engineeringLines: string[] = [];

    if (ad.entrance && ad.yard) {
      engineeringLines.push(`• ورودی: ${escapeHtml(ad.entrance)} | حیاط: ${escapeHtml(ad.yard)}`);
    } else if (ad.yard) {
      engineeringLines.push(`• حیاط: ${escapeHtml(ad.yard)}`);
    } else if (ad.entrance) {
      engineeringLines.push(`• ورودی: ${escapeHtml(ad.entrance)}`);
    }

    const amenityParts: string[] = [];
    if (ad.specs.parking === true) amenityParts.push('پارکینگ: دارد');
    else if (ad.specs.parking === false) amenityParts.push('پارکینگ: ندارد');

    if (ad.specs.elevator === true) amenityParts.push('آسانسور: دارد');
    else if (ad.specs.elevator === false) amenityParts.push('آسانسور: ندارد');

    if (ad.specs.storage === true) amenityParts.push('انباری: دارد');
    else if (ad.specs.storage === false) amenityParts.push('انباری: ندارد');

    if (ad.specs.balcony === true) amenityParts.push('بالکن: دارد');
    else if (ad.specs.balcony === false) amenityParts.push('بالکن: ندارد');

    if (amenityParts.length > 0) {
      engineeringLines.push(`• ${amenityParts.join(' | ')}`);
    }

    const hvac = formatHvacFa(ad.specs.cooling, ad.specs.heating);
    if (hvac) {
      engineeringLines.push(`• تاسیسات: ${escapeHtml(hvac)}`);
    }

    const cabinet = formatCabinetFa(ad.specs.cabinet);
    const flooringText = ad.flooring || null;
    if (cabinet && flooringText) {
      engineeringLines.push(`• کابینت: ${escapeHtml(cabinet)} | کف: ${escapeHtml(flooringText)}`);
    } else if (cabinet) {
      engineeringLines.push(`• کابینت: ${escapeHtml(cabinet)}`);
    } else if (flooringText) {
      engineeringLines.push(`• کف: ${escapeHtml(flooringText)}`);
    }

    if (ad.closet) {
      engineeringLines.push(`• کمد دیواری: ${escapeHtml(ad.closet)}`);
    }

    // Truncate description smartly for photo caption budget
    const cleanDesc = (ad.description || '')
      .replace(/\r?\n+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();

    const rahnFormatted = formatPriceExactFa(ad.credit);
    const rentFormatted = ad.rent > 0 ? formatPriceExactFa(ad.rent) : 'رهن کامل';

    const tags: string[] = [];
    tags.push(`#${sanitizeHashtag(ad.cityPersian || 'علی_آباد_کتول')}`);
    if (district) tags.push(`#${sanitizeHashtag(district)}`);
    tags.push('#اجاره', '#رهن_و_اجاره');
    if (propType) tags.push(`#${sanitizeHashtag(propType)}`);
    if (bedText) tags.push(`#${sanitizeHashtag(bedText)}`);
    for (const bt of resolvedBranding.brand_hashtags || []) {
      const cleanTag = bt.startsWith('#') ? bt : `#${bt}`;
      if (!tags.includes(cleanTag)) tags.push(cleanTag);
    }
    tags.push(ad.source === 'sheypoor' || ad.token.startsWith('sp_') ? '#شیپور' : '#دیوار');

    captionLines = [
      `🏠 <b>[نوع ملک: ${escapeHtml(propType)}]</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `📋 <b>مشخصات اصلی:</b>`,
      ...mainSpecs
    ];

    if (engineeringLines.length > 0) {
      captionLines.push(
        `━━━━━━━━━━━━━━━━━━`,
        `✨ <b>مشخصات و امکانات:</b>`,
        ...engineeringLines
      );
    }

    if (cleanDesc.length > 0) {
      const shortDesc = cleanDesc.length > 120 ? cleanDesc.slice(0, 117) + '...' : cleanDesc;
      captionLines.push(
        `━━━━━━━━━━━━━━━━━━`,
        `📄 <b>توضیحات آگهی:</b>`,
        `<i>${escapeHtml(shortDesc)}</i>`
      );
    }

    captionLines.push(
      `━━━━━━━━━━━━━━━━━━`,
      `💰 <b>شرایط رهن و اجاره:</b>`,
      `• مبلغ رهن: <b>${rahnFormatted}</b>`,
      `• مبلغ اجاره: <b>${rentFormatted}</b>`
    );
    if (ad.isConvertible) {
      captionLines.push(`• قابلیت تبدیل: دارد (قابل تبدیل)`);
    }

    captionLines.push(
      `━━━━━━━━━━━━━━━━━━`,
      `🏷 ${tags.join(' ')}`,
      ...buildContactFooterLines(resolvedBranding)
    );
  } else {
    // ----------------- SALE TEMPLATE -----------------
    const propType = ad.propertyTypeFa || 'ملک مسکونی';
    const bedText = ad.bedrooms !== null && ad.bedrooms !== undefined
      ? (ad.bedrooms === 0 ? 'بدون خواب' : `${ad.bedrooms} خواب`)
      : null;
    const floorInfo = ad.floorText ? ad.floorText : (ad.floorNumber !== null && ad.floorNumber !== undefined ? `طبقه ${ad.floorNumber}` : null);
    const unitsInfo = ad.unitsPerFloor || null;
    const buildYearText = ad.buildYear ? `سال ساخت ${ad.buildYear}` : null;

    const mainSpecs: string[] = [];
    mainSpecs.push(`• موقعیت: ${escapeHtml(locationText)}`);

    if (ad.area > 0 && ad.landArea && ad.landArea > 0) {
      mainSpecs.push(`• زیربنا: ${ad.area} متر مربع | متراژ زمین: ${ad.landArea} متر مربع`);
    } else if (ad.area > 0) {
      mainSpecs.push(`• زیربنا: ${ad.area} متر مربع`);
    } else if (ad.landArea && ad.landArea > 0) {
      mainSpecs.push(`• متراژ زمین: ${ad.landArea} متر مربع`);
    }

    if (floorInfo && unitsInfo) {
      mainSpecs.push(`• طبقه: ${escapeHtml(floorInfo)} | واحد: ${escapeHtml(unitsInfo)}`);
    } else if (floorInfo) {
      mainSpecs.push(`• طبقه: ${escapeHtml(floorInfo)}`);
    } else if (unitsInfo) {
      mainSpecs.push(`• واحد: ${escapeHtml(unitsInfo)}`);
    }

    if (bedText && buildYearText) {
      mainSpecs.push(`• تعداد خواب: ${escapeHtml(bedText)} | ${escapeHtml(buildYearText)}`);
    } else if (bedText) {
      mainSpecs.push(`• تعداد خواب: ${escapeHtml(bedText)}`);
    } else if (buildYearText) {
      mainSpecs.push(`• ${escapeHtml(buildYearText)}`);
    }

    if (ad.deedStatus) {
      mainSpecs.push(`• وضعیت سند: ${escapeHtml(ad.deedStatus)}`);
    }

    // Dynamic engineering & amenities
    const engineeringLines: string[] = [];

    const amenityParts: string[] = [];
    if (ad.specs.parking === true) amenityParts.push('پارکینگ: دارد');
    else if (ad.specs.parking === false) amenityParts.push('پارکینگ: ندارد');

    if (ad.specs.elevator === true) amenityParts.push('آسانسور: دارد');
    else if (ad.specs.elevator === false) amenityParts.push('آسانسور: ندارد');

    if (ad.specs.storage === true) amenityParts.push('انباری: دارد');
    else if (ad.specs.storage === false) amenityParts.push('انباری: ندارد');

    if (ad.specs.balcony === true) amenityParts.push('بالکن: دارد');
    else if (ad.specs.balcony === false) amenityParts.push('بالکن: ندارد');

    if (amenityParts.length > 0) {
      engineeringLines.push(`• ${amenityParts.join(' | ')}`);
    }

    const directionText = formatDirectionFa(ad.specs.direction);
    const facadeText = ad.buildingFacade || null;
    if (directionText && facadeText) {
      engineeringLines.push(`• جهت: ${escapeHtml(directionText)} | نما: ${escapeHtml(facadeText)}`);
    } else if (directionText) {
      engineeringLines.push(`• جهت: ${escapeHtml(directionText)}`);
    } else if (facadeText) {
      engineeringLines.push(`• نما: ${escapeHtml(facadeText)}`);
    }

    const skeletonText = formatSkeletonFa(ad.specs.skeleton);
    const flooringText = ad.flooring || null;
    if (skeletonText && flooringText) {
      engineeringLines.push(`• اسکلت: ${escapeHtml(skeletonText)} | کف: ${escapeHtml(flooringText)}`);
    } else if (skeletonText) {
      engineeringLines.push(`• اسکلت: ${escapeHtml(skeletonText)}`);
    } else if (flooringText) {
      engineeringLines.push(`• کف: ${escapeHtml(flooringText)}`);
    }

    const hvac = formatHvacFa(ad.specs.cooling, ad.specs.heating);
    if (hvac) {
      engineeringLines.push(`• تاسیسات: ${escapeHtml(hvac)}`);
    }

    const cabinet = formatCabinetFa(ad.specs.cabinet);
    const closet = ad.closet || null;
    if (cabinet && closet) {
      engineeringLines.push(`• کابینت: ${escapeHtml(cabinet)} | کمد دیواری: ${escapeHtml(closet)}`);
    } else if (cabinet) {
      engineeringLines.push(`• کابینت: ${escapeHtml(cabinet)}`);
    } else if (closet) {
      engineeringLines.push(`• کمد دیواری: ${escapeHtml(closet)}`);
    }

    if (ad.entrance && ad.yard) {
      engineeringLines.push(`• ورودی: ${escapeHtml(ad.entrance)} | حیاط: ${escapeHtml(ad.yard)}`);
    } else if (ad.yard) {
      engineeringLines.push(`• حیاط: ${escapeHtml(ad.yard)}`);
    } else if (ad.entrance) {
      engineeringLines.push(`• ورودی: ${escapeHtml(ad.entrance)}`);
    }

    if (ad.loanStatus) {
      engineeringLines.push(`• وضعیت وام: ${escapeHtml(ad.loanStatus)}`);
    }

    const cleanDesc = (ad.description || '')
      .replace(/\r?\n+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();

    const totalPriceText = formatPriceExactFa(ad.totalPrice);
    const pricePerM2Text = ad.pricePerM2 > 0 ? formatPriceExactFa(ad.pricePerM2) : null;

    const tags: string[] = [];
    tags.push(`#${sanitizeHashtag(ad.cityPersian || 'علی_آباد_کتول')}`);
    if (district) tags.push(`#${sanitizeHashtag(district)}`);
    tags.push('#فروش');
    if (propType) tags.push(`#${sanitizeHashtag(propType)}`);
    if (bedText) tags.push(`#${sanitizeHashtag(bedText)}`);
    for (const bt of resolvedBranding.brand_hashtags || []) {
      const cleanTag = bt.startsWith('#') ? bt : `#${bt}`;
      if (!tags.includes(cleanTag)) tags.push(cleanTag);
    }
    tags.push(ad.source === 'sheypoor' || ad.token.startsWith('sp_') ? '#شیپور' : '#دیوار');

    captionLines = [
      `🏠 <b>[نوع ملک: ${escapeHtml(propType)}]</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `📋 <b>مشخصات اصلی:</b>`,
      ...mainSpecs
    ];

    if (engineeringLines.length > 0) {
      captionLines.push(
        `━━━━━━━━━━━━━━━━━━`,
        `✨ <b>مشخصات مهندسی و امکانات:</b>`,
        ...engineeringLines
      );
    }

    if (cleanDesc.length > 0) {
      const shortDesc = cleanDesc.length > 120 ? cleanDesc.slice(0, 117) + '...' : cleanDesc;
      captionLines.push(
        `━━━━━━━━━━━━━━━━━━`,
        `📄 <b>توضیحات آگهی:</b>`,
        `<i>${escapeHtml(shortDesc)}</i>`
      );
    }

    captionLines.push(
      `━━━━━━━━━━━━━━━━━━`,
      `💰 <b>شرایط قیمت:</b>`,
      `• قیمت کل: <b>${totalPriceText}</b>`
    );
    if (pricePerM2Text) {
      captionLines.push(`• قیمت هر متر: <b>${pricePerM2Text}</b>`);
    }

    captionLines.push(
      `━━━━━━━━━━━━━━━━━━`,
      `🏷 ${tags.join(' ')}`,
      ...buildContactFooterLines(resolvedBranding)
    );
  }

  const showBtnDivar = rule.show_btn_divar !== 0;
  const showBtnMap = rule.show_btn_map !== 0;
  const showBtnScore = rule.show_btn_score !== 0;
  const showBtnContact = rule.show_btn_contact !== 0;

  const isSheypoor = ad.source === 'sheypoor' || ad.token.startsWith('sp_');
  const sourceLabelFa = isSheypoor ? 'شیپور' : 'دیوار';
  const cleanSpId = ad.token.replace(/^sp_/, '');
  const sourceUrl = isSheypoor
    ? (ad.url || `https://www.sheypoor.com/v/${cleanSpId}`)
    : (ad.url || `https://divar.ir/v/${ad.token}`);

  const caption = trimCaptionSafely(captionLines, '', 1020);
  const inlineKeyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];

  // Row 1: Source (Divar / Sheypoor) and/or Map
  const row1: Array<{ text: string; url?: string; callback_data?: string }> = [];
  if (showBtnDivar) {
    row1.push({ text: `🔗 مشاهده آگهی در ${sourceLabelFa}`, url: sourceUrl });
  }
  if (showBtnMap && ad.latitude && ad.longitude) {
    row1.push({ text: '🗺 موقعیت روی نقشه', url: `https://maps.google.com/?q=${ad.latitude},${ad.longitude}` });
  }
  if (row1.length > 0) {
    inlineKeyboard.push(row1);
  }

  // Row 2: Score and/or Contact
  const row2: Array<{ text: string; url?: string; callback_data?: string }> = [];
  if (showBtnScore) {
    row2.push({ text: `📊 درصد تطابق: ${score}٪`, callback_data: `score_info:${rule.id}:${ad.token}:${score}` });
  }
  if (showBtnContact) {
    row2.push({ text: '📞 تماس با ما', callback_data: `contact_info:${ad.token}` });
  }
  if (row2.length > 0) {
    inlineKeyboard.push(row2);
  }

  const replyMarkup = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined;

  // If multiple images are present, send as an album (sendMediaGroup)
  const albumUrls = (ad.imageUrls && ad.imageUrls.length > 0)
    ? ad.imageUrls
    : (ad.primaryPhotoUrl ? [ad.primaryPhotoUrl] : []);

  if (albumUrls.length > 1) {
    const albumLinks: string[] = [];
    if (showBtnDivar) albumLinks.push(`🔗 <a href="${sourceUrl}">مشاهده در ${sourceLabelFa}</a>`);
    if (showBtnMap && ad.latitude && ad.longitude) {
      albumLinks.push(`🗺 <a href="https://maps.google.com/?q=${ad.latitude},${ad.longitude}">موقعیت روی نقشه</a>`);
    }
    if (showBtnScore) albumLinks.push(`📊 تطابق: <b>${score}٪</b>`);
    const albumSuffix = albumLinks.join('  |  ');
    const albumCaption = trimCaptionSafely(captionLines, albumSuffix, 1020);

    const media = albumUrls.slice(0, 10).map((url, idx) => {
      const item: Record<string, any> = {
        type: 'photo',
        media: url
      };
      if (idx === 0) {
        item.caption = albumCaption;
        item.parse_mode = 'HTML';
      }
      return item;
    });

    return {
      method: 'sendMediaGroup',
      body: {
        chat_id: chatId,
        media,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      }
    };
  }

  if (albumUrls.length === 1) {
    return {
      method: 'sendPhoto',
      body: {
        chat_id: chatId,
        photo: albumUrls[0],
        caption,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
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
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    }
  };
}
