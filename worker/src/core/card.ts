import type { Ad } from './types.ts';

const FA = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (s: string | number): string => String(s).replace(/\d/g, (d) => FA[+d]);

export function faNum(n: number): string {
  return fa(Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
}

function trim(n: number): string {
  return fa((Math.round(n * 100) / 100).toString().replace('.', '٫'));
}

export function fmtMoney(n?: number): string {
  if (n == null) return 'نامشخص';
  if (n >= 1e9) return `${trim(n / 1e9)} میلیارد تومان`;
  if (n >= 1e6) return `${trim(n / 1e6)} میلیون تومان`;
  return `${faNum(n)} تومان`;
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface CardMatch { score: number | null; checked: number; asked: number }

export function renderCard(ad: Ad, m: CardMatch): string {
  const lines: string[] = [];
  const title = ad.title.length > 120 ? ad.title.slice(0, 117) + '…' : ad.title;
  lines.push(`🏠 <a href="${esc(ad.url)}">${esc(title)}</a>`);
  if (ad.district) lines.push(`📍 ${esc(ad.district)}`);

  if (ad.deal === 'buy') {
    lines.push(`💰 قیمت کل: ${fmtMoney(ad.total)}`);
    lines.push(`📐 قیمت هر متر: ${fmtMoney(ad.perM2)}`);
  } else {
    lines.push(`💰 ودیعه: ${fmtMoney(ad.deposit)}`);
    lines.push(`🔁 اجارهٔ ماهانه: ${fmtMoney(ad.rent)}`);
  }

  const parts: string[] = [];
  if (ad.area != null) parts.push(`${fa(ad.area)} متر`);
  if (ad.rooms != null) parts.push(`${fa(ad.rooms)} خواب`);
  if (ad.parking != null) parts.push(ad.parking ? 'پارکینگ' : 'بدون پارکینگ');
  if (ad.floor != null) parts.push(`طبقه ${fa(ad.floor)}`);
  if (ad.year != null) parts.push(`ساخت ${fa(ad.year)}`);
  if (parts.length) lines.push(`📋 ${parts.join(' | ')}`);

  lines.push(
    m.score == null
      ? '🎯 تطابق: قابل محاسبه نیست'
      : `🎯 تطابق: ${fa(m.score)}٪ (${fa(m.checked)} از ${fa(m.asked)} معیار قابل سنجش)`,
  );

  const portal = ad.url.includes('sheypoor.com')
    ? 'شیپور'
    : ad.url.includes('ariamarz.com')
    ? 'آریامرز'
    : 'دیوار';
  lines.push(`🔗 <a href="${esc(ad.url)}">مشاهده آگهی مستقیم در ${portal}</a>`);

  return lines.join('\n');
}
