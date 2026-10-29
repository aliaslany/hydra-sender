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
    return `${millions.toLocaleString('en-US')} میلیون`;
  }
  return amount.toLocaleString('en-US');
}

export function formatSkeletonFa(val?: string): string {
  if (val === 'CONCRETE') return 'بتنی';
  if (val === 'STEEL') return 'فلزی';
  return 'نامشخص';
}

export function formatDirectionFa(val?: string): string {
  if (val === 'NORTH') return 'شمالی';
  if (val === 'SOUTH') return 'جنوبی';
  if (val === 'DUAL') return 'دوکله';
  if (val === 'EAST_WEST') return 'شرقی/غربی';
  return 'نامشخص';
}

export function formatCabinetFa(val?: string): string {
  if (val === 'HIGH_GLOSS') return 'های‌گلاس';
  if (val === 'MEMBRANE_WOOD') return 'ممبران/چوب';
  if (val === 'MDF') return 'ام‌دی‌اف';
  if (val === 'METAL') return 'فلزی';
  return 'نامشخص';
}

export function formatCoolingFa(vals?: string[]): string {
  if (!vals || vals.length === 0) return '—';
  const map: Record<string, string> = {
    DUCT_SPLIT: 'داکت اسپلیت',
    SPLIT_AC: 'کولر گازی',
    CHILLER: 'چیلر',
    WATER_COOLER: 'کولر آبی'
  };
  return vals.map((v) => map[v] || v).join('، ');
}

export function formatHeatingFa(vals?: string[]): string {
  if (!vals || vals.length === 0) return '—';
  const map: Record<string, string> = {
    FLOOR_HEATING: 'گرمایش از کف',
    PACKAGE_RADIATOR: 'پکیج/شوفاژ',
    FAN_COIL_DUCT: 'فن‌کویل/داکت',
    CENTRAL_ENGINE: 'موتورخانه مرکزی'
  };
  return vals.map((v) => map[v] || v).join('، ');
}

export function sanitizeHashtag(str: string | undefined | null): string {
  if (!str) return 'املاک';
  return str.trim().replace(/[\s\-،,]+/g, '_').replace(/[^\u0600-\u06FFa-zA-Z0-9_]/g, '');
}

export function buildTelegramCardPayload(
  ad: ParsedDivarAd,
  evalResult: MatchResult,
  rule: FilterRule,
  chatId: string,
  isBackfill: boolean
): { method: 'sendPhoto' | 'sendMessage'; body: Record<string, any> } {
  const score = evalResult.score;
  const filledBlocks = Math.round(score / 10);
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(10 - filledBlocks);
  const scoreBadge = score >= 90 ? '🟢 تطابق عالی' : score >= 75 ? '🔵 تطابق بالا' : '🟡 تطابق مناسب';
  const phaseTag = isBackfill ? '🕓 <i>[آرشیو آگهی‌های موجود]</i>' : '⚡ <b>[آگهی جدید لحظه‌ای]</b>';

  const tolNotes: string[] = [];
  if (evalResult.budgetDeviationPct > 0) {
    tolNotes.push(`⚠️ ${Math.round(evalResult.budgetDeviationPct * 100)}٪ بالاتر از سقف بودجه (تلورانس)`);
  }
  if (evalResult.areaDeviationPct < 0) {
    tolNotes.push(`⚠️ ${Math.round(Math.abs(evalResult.areaDeviationPct) * 100)}٪ کمتر از کف متراژ (تلورانس)`);
  }

  const amenityIcon = (val: boolean | undefined) => (val === true ? '✅' : val === false ? '❌' : '❔');

  const captionLines = [
    `${scoreBadge}: <b>${score}٪</b> <code>[${progressBar}]</code> | ${phaseTag}`,
    `🏠 <b>${escapeHtml(ad.title)}</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `📍 <b>محدوده:</b> ${escapeHtml(ad.cityPersian)}، ${escapeHtml(ad.districtPersian || 'نامشخص')}`,
    ad.dealType === 'BUY'
      ? `💰 <b>قیمت کل:</b> ${formatToman(ad.totalPrice)} تومان\n📐 <b>قیمت هر متر:</b> ${formatToman(ad.pricePerM2)} تومان`
      : `💰 <b>ودیعه (رهن):</b> ${formatToman(ad.credit)} تومان\n💳 <b>اجاره ماهانه:</b> ${ad.rent > 0 ? formatToman(ad.rent) + ' تومان' : 'رهن کامل'}`,
    ...(tolNotes.length ? [`🔎 <i>${tolNotes.join(' | ')}</i>`] : []),
    `━━━━━━━━━━━━━━━━━━`,
    `📏 <b>متراژ:</b> ${ad.area} متر | 🛏 <b>اتاق:</b> ${ad.bedrooms ?? '—'} | 🏢 <b>طبقه:</b> ${escapeHtml(ad.floorText || '—')}`,
    `🏗 <b>سال ساخت:</b> ${ad.buildYear || '—'} | 🧱 <b>اسکلت:</b> ${formatSkeletonFa(ad.specs.skeleton)} | 🧭 <b>جهت:</b> ${formatDirectionFa(ad.specs.direction)}`,
    `🪵 <b>کابینت:</b> ${formatCabinetFa(ad.specs.cabinet)}`,
    `❄️ <b>سرمایش:</b> ${formatCoolingFa(ad.specs.cooling)} | 🔥 <b>گرمایش:</b> ${formatHeatingFa(ad.specs.heating)}`,
    `🚗 پارکینگ: ${amenityIcon(ad.specs.parking)} | 🛗 آسانسور: ${amenityIcon(ad.specs.elevator)} | 📦 انباری: ${amenityIcon(ad.specs.storage)} | 🌿 بالکن: ${amenityIcon(ad.specs.balcony)}`,
    `━━━━━━━━━━━━━━━━━━`,
    `#${sanitizeHashtag(ad.districtPersian)} #${ad.dealType === 'BUY' ? 'فروش_ملک' : 'رهن_اجاره'} #امتیاز_${score}`
  ];

  const caption = captionLines.join('\n').slice(0, 1020);
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
        { text: `📊 جزئیات امتیاز (${score}٪)`, callback_data: `score_info:${rule.id}:${ad.token}:${score}` }
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
