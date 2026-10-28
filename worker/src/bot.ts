import type { Env } from './env.ts';
import type { Criteria, Deal, PropertyType, Range, RangeKey, FlagKey, AttrKey } from './core/types.ts';
import { entitlement } from './core/access.ts';
import { parseRange } from './core/range.ts';
import { fa, faNum, fmtMoney, esc } from './core/card.ts';
import { tg, sendText } from './telegram.ts';
import { ensureUser, getUser, loadSettings, type Settings, type UserRow } from './db.ts';
import { nowSec } from './util.ts';

const DEAL_LABEL: Record<Deal, string> = { buy: 'خرید و فروش', rent: 'رهن و اجاره' };
const PROP_LABEL: Record<PropertyType, string> = {
  apartment: 'آپارتمان', villa: 'ویلا و خانه', old: 'کلنگی', land: 'زمین', commercial: 'تجاری', office: 'اداری',
};

const MENU: Record<string, string> = {
  '🔎 جستجوی جدید': '/search', '📋 جستجوهای من': '/mysearches', '👤 وضعیت اشتراک': '/status', 'ℹ️ راهنما': '/help',
};
const MENU_KB = {
  keyboard: [['🔎 جستجوی جدید', '📋 جستجوهای من'], ['👤 وضعیت اشتراک', 'ℹ️ راهنما']],
  resize_keyboard: true,
};

// ---- wizard definition (data-driven; stage 1 = key/financial filters, stage 2 = details) ------------

interface Wizard { step: string; deal?: Deal; property?: PropertyType; criteria: Criteria; finish?: boolean }
interface Step {
  id: string;
  ask: string;
  kind: 'choice' | 'range';
  skippable?: boolean;
  example?: string;
  when?: (w: Wizard) => boolean;
  options?: (w: Wizard, s: Settings) => [string, string][];
  apply: (w: Wizard, v: any) => void;
}

const isBuy = (w: Wizard) => w.deal === 'buy';
const isRent = (w: Wizard) => w.deal === 'rent';

const rangeStep = (id: string, key: RangeKey, ask: string, example: string, when?: Step['when']): Step => ({
  id, kind: 'range', ask, example, when, skippable: true, apply: (w, v: Range) => { w.criteria[key] = v; },
});
const flagStep = (id: string, key: FlagKey, ask: string): Step => ({
  id, kind: 'choice', ask, skippable: true, options: () => [['✅ حتماً داشته باشد', '1']],
  apply: (w, v) => { if (v === '1') (w.criteria.flags ??= {})[key] = true; },
});
const attrStep = (id: string, key: AttrKey, ask: string, opts: string[]): Step => ({
  id, kind: 'choice', ask, skippable: true, options: () => opts.map((o) => [o, o] as [string, string]),
  apply: (w, v) => { (w.criteria.attrs ??= {})[key] = v; },
});

const STEPS: Step[] = [
  {
    id: 'deal', kind: 'choice', ask: 'نوع معامله را انتخاب کنید:',
    options: (_w, s) => [...new Set(s.categories.map((c) => c.deal))].map((d) => [DEAL_LABEL[d], d] as [string, string]),
    apply: (w, v) => { w.deal = v; },
  },
  {
    id: 'property', kind: 'choice', ask: 'نوع ملک را انتخاب کنید:',
    options: (w, s) => s.categories.filter((c) => c.deal === w.deal).map((c) => [PROP_LABEL[c.property], c.property] as [string, string]),
    apply: (w, v) => { w.property = v; },
  },
  rangeStep('total', 'total', 'بودجهٔ کل (تومان) را بنویسید.', 'مثال: ۲ میلیارد تا ۳ میلیارد', isBuy),
  rangeStep('perM2', 'perM2', 'قیمت هر متر مربع (تومان)؟', 'مثال: ۴۰ میلیون تا ۵۵ میلیون', isBuy),
  rangeStep('deposit', 'deposit', 'ودیعه (رهن) به تومان؟', 'مثال: ۲۰۰ میلیون تا ۵۰۰ میلیون', isRent),
  rangeStep('rent', 'rent', 'اجارهٔ ماهانه (تومان)؟', 'مثال: ۵ میلیون تا ۱۰ میلیون', isRent),
  rangeStep('area', 'area', 'متراژ (متر مربع)؟', 'مثال: ۸۰-۱۲۰ یا ۸۰- (حداقل ۸۰)'),
  {
    id: 'more', kind: 'choice', ask: 'مشخصات دقیق‌تر هم اضافه کنیم؟',
    options: () => [['➕ بله، مشخصات بیشتر', 'more'], ['✅ ثبت جستجو', 'done']],
    apply: (w, v) => { if (v === 'done') w.finish = true; },
  },
  flagStep('parking', 'parking', 'پارکینگ'),
  flagStep('storage', 'storage', 'انباری'),
  flagStep('elevator', 'elevator', 'آسانسور'),
  rangeStep('year', 'year', 'سال ساخت (شمسی)؟', 'مثال: ۱۳۹۵- (حداقل ۱۳۹۵)'),
  attrStep('orientation', 'orientation', 'جهت ساختمان', ['شمالی', 'جنوبی']),
  attrStep('structure', 'structure', 'نوع اسکلت', ['بتنی', 'فلزی']),
  attrStep('cabinet', 'cabinet', 'نوع کابینت', ['ام‌دی‌اف', 'هایگلاس', 'چوب', 'فلزی']),
  attrStep('cooling', 'cooling', 'سیستم سرمایش', ['کولر آبی', 'اسپلیت', 'فن‌کوئل']),
  attrStep('heating', 'heating', 'سیستم گرمایش', ['شوفاژ', 'پکیج', 'بخاری']),
  rangeStep('floor', 'floor', 'طبقه؟', 'مثال: ۱-۴'),
  rangeStep('rooms', 'rooms', 'تعداد خواب؟', 'مثال: ۲-۳ یا ۲'),
  flagStep('balcony', 'balcony', 'بالکن'),
];

// ---- helpers --------------------------------------------------------------------------------------

const saveWizard = (env: Env, userId: number, w: Wizard | null) =>
  env.DB.prepare('UPDATE users SET wizard = ? WHERE id = ?').bind(w ? JSON.stringify(w) : null, userId).run();

function parseWizard(u: UserRow): Wizard | null {
  if (!u.wizard) return null;
  try { return JSON.parse(u.wizard); } catch { return null; }
}

function fmtRange(r: Range, f: (n: number) => string): string {
  if (r.min != null && r.max != null) return r.min === r.max ? `حدود ${f(r.min)}` : `${f(r.min)} تا ${f(r.max)}`;
  if (r.min != null) return `از ${f(r.min)}`;
  return `تا ${f(r.max!)}`;
}

export function describe(deal: Deal, property: PropertyType, c: Criteria): string {
  const L = [`<b>${DEAL_LABEL[deal]} — ${PROP_LABEL[property]}</b>`];
  const money: [RangeKey, string][] = [['total', 'بودجه'], ['perM2', 'قیمت هر متر'], ['deposit', 'ودیعه'], ['rent', 'اجارهٔ ماهانه']];
  for (const [k, label] of money) if (c[k]) L.push(`${label}: ${fmtRange(c[k]!, fmtMoney)}`);
  const plain: [RangeKey, string, string][] = [['area', 'متراژ', ' متر'], ['year', 'سال ساخت', ''], ['floor', 'طبقه', ''], ['rooms', 'خواب', '']];
  for (const [k, label, unit] of plain) if (c[k]) L.push(`${label}: ${fmtRange(c[k]!, (n) => fa(n) + unit)}`);
  const flags: Record<FlagKey, string> = { parking: 'پارکینگ', storage: 'انباری', elevator: 'آسانسور', balcony: 'بالکن' };
  for (const k of Object.keys(c.flags ?? {}) as FlagKey[]) L.push(`✅ ${flags[k]}`);
  const attrs: Record<AttrKey, string> = { orientation: 'جهت', structure: 'اسکلت', cabinet: 'کابینت', cooling: 'سرمایش', heating: 'گرمایش' };
  for (const k of Object.keys(c.attrs ?? {}) as AttrKey[]) L.push(`${attrs[k]}: ${esc(c.attrs![k]!)}`);
  return L.join('\n');
}

function keyboard(step: Step, w: Wizard, s: Settings) {
  const rows: { text: string; callback_data: string }[][] = [];
  if (step.kind === 'choice') {
    const opts = step.options!(w, s);
    for (let i = 0; i < opts.length; i += 2) {
      rows.push(opts.slice(i, i + 2).map((o, j) => ({ text: o[0], callback_data: `w:${step.id}:${i + j}` })));
    }
  }
  const tail = [{ text: '❌ انصراف', callback_data: 'w:x:x' }];
  if (step.skippable) tail.unshift({ text: '⏭ مهم نیست', callback_data: `w:${step.id}:s` });
  rows.push(tail);
  return { inline_keyboard: rows };
}

async function ask(env: Env, s: Settings, chatId: number, w: Wizard) {
  const step = STEPS.find((x) => x.id === w.step)!;
  const hint = step.example ? `\n<i>${step.example}</i>` : '';
  await sendText(env, chatId, `${step.ask}${hint}`, { reply_markup: keyboard(step, w, s) });
}

async function advance(env: Env, s: Settings, user: UserRow, w: Wizard, fromId: string | null) {
  let i = fromId ? STEPS.findIndex((x) => x.id === fromId) + 1 : 0;
  while (i < STEPS.length && STEPS[i].when && !STEPS[i].when!(w)) i++;
  if (w.finish || i >= STEPS.length) return finalize(env, s, user, w);
  w.step = STEPS[i].id;
  await saveWizard(env, user.id, w);
  await ask(env, s, user.chat_id, w);
}

function denyText(reason: string, s: Settings): string {
  const contact = s.supportContact ? `\nبرای فعال‌سازی یا تمدید: ${esc(s.supportContact)}` : '';
  switch (reason) {
    case 'quota': return `سهمیهٔ جستجوی شما تمام شده است.${contact}`;
    case 'expired': return `اشتراک شما منقضی شده است.${contact}`;
    case 'blocked': return 'دسترسی شما غیرفعال شده است.';
    default: return `هنوز اشتراکی برای شما فعال نشده است.${contact}`;
  }
}

async function finalize(env: Env, s: Settings, user: UserRow, w: Wizard) {
  const fresh = (await getUser(env.DB, user.id))!;          // re-check: access may have changed mid-wizard
  const e = entitlement(fresh, nowSec());
  if (!e.canCreate) {
    await saveWizard(env, user.id, null);
    return void (await sendText(env, user.chat_id, denyText((e as any).reason, s)));
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO searches (user_id, deal, property, criteria) VALUES (?,?,?,?)')
      .bind(user.id, w.deal, w.property, JSON.stringify(w.criteria)),
    env.DB.prepare(
      'UPDATE users SET wizard = NULL, searches_remaining = CASE WHEN searches_remaining IS NULL THEN NULL ELSE searches_remaining - 1 END WHERE id = ?',
    ).bind(user.id),
  ]);
  const tol = fa(Math.round(s.tolerance * 100));
  await sendText(
    env, user.chat_id,
    `✅ جستجو ثبت شد:\n\n${describe(w.deal!, w.property!, w.criteria)}\n\nتا ${tol}٪ تلورانس روی بودجه و متراژ اعمال می‌شود. آگهی‌های تازه‌ای که مطابقت داشته باشند برایتان ارسال می‌شود.`,
    { reply_markup: MENU_KB },
  );
}

async function startSearch(env: Env, s: Settings, user: UserRow) {
  const e = entitlement(user, nowSec());
  if (!e.canCreate) return void (await sendText(env, user.chat_id, denyText((e as any).reason, s)));
  const w: Wizard = { step: 'deal', criteria: {} };
  await saveWizard(env, user.id, w);
  await ask(env, s, user.chat_id, w);
}

async function status(env: Env, s: Settings, user: UserRow) {
  const e = entitlement(user, nowSec());
  const lines = [`وضعیت اشتراک: ${e.active ? '✅ فعال' : '⛔ غیرفعال'}`];
  if (user.expires_at != null) lines.push(`انقضا: ${fa(Math.max(0, Math.ceil((user.expires_at - nowSec()) / 86400)))} روز دیگر`);
  if (user.searches_remaining != null) lines.push(`جستجوی باقی‌مانده: ${faNum(user.searches_remaining)}`);
  if (!e.canCreate) lines.push('', denyText((e as any).reason, s));
  await sendText(env, user.chat_id, lines.join('\n'));
}

async function mySearches(env: Env, user: UserRow) {
  const { results } = await env.DB
    .prepare('SELECT id, deal, property, criteria, is_active FROM searches WHERE user_id = ? ORDER BY id DESC LIMIT 10')
    .bind(user.id).all<{ id: number; deal: Deal; property: PropertyType; criteria: string; is_active: number }>();
  if (!results.length) return void (await sendText(env, user.chat_id, 'هنوز جستجویی ثبت نکرده‌اید. «🔎 جستجوی جدید» را بزنید.'));
  for (const r of results) {
    await sendText(env, user.chat_id, `${r.is_active ? '🟢' : '⏸'} #${fa(r.id)}\n${describe(r.deal, r.property, JSON.parse(r.criteria))}`, {
      reply_markup: { inline_keyboard: [[
        { text: r.is_active ? '⏸ توقف' : '▶️ ادامه', callback_data: `s:t:${r.id}` },
        { text: '🗑 حذف', callback_data: `s:d:${r.id}` },
      ]] },
    });
  }
}

const HELP = [
  'با این ربات آگهی‌های تازهٔ املاک دیوار را بر اساس نیاز شما فیلتر و امتیازدهی می‌کنیم.',
  '',
  '🔎 جستجوی جدید: نوع معامله، ملک، بودجه و متراژ را مشخص کنید (و در صورت تمایل امکانات دقیق‌تر).',
  '📋 جستجوهای من: توقف، ادامه یا حذف جستجوها.',
  '👤 وضعیت اشتراک: زمان و سهمیهٔ باقی‌مانده.',
].join('\n');

// ---- update handlers ------------------------------------------------------------------------------

export async function handleUpdate(env: Env, u: any): Promise<void> {
  const s = await loadSettings(env.DB);
  if (u.callback_query) return onCallback(env, s, u.callback_query);
  const m = u.message;
  if (m?.text && m.chat?.type === 'private' && m.from) return onMessage(env, s, m);
}

async function onMessage(env: Env, s: Settings, m: any) {
  const user = await ensureUser(env.DB, s, m.from, m.chat.id);
  if (user.is_blocked) return;
  const raw = String(m.text).trim();
  const text = MENU[raw] ?? raw;
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : '';

  switch (cmd) {
    case '/start': return void (await sendText(env, user.chat_id, `سلام ${esc(m.from.first_name ?? '')} 👋\n\n${HELP}`, { reply_markup: MENU_KB }));
    case '/help': return void (await sendText(env, user.chat_id, HELP, { reply_markup: MENU_KB }));
    case '/search': return startSearch(env, s, user);
    case '/mysearches': return mySearches(env, user);
    case '/status': return status(env, s, user);
    case '/cancel': await saveWizard(env, user.id, null); return void (await sendText(env, user.chat_id, 'لغو شد.', { reply_markup: MENU_KB }));
  }

  const w = parseWizard(user);
  const step = w && STEPS.find((x) => x.id === w.step);
  if (!w || !step || step.kind !== 'range') return void (await sendText(env, user.chat_id, 'از منوی پایین یکی را انتخاب کنید.', { reply_markup: MENU_KB }));

  const r = parseRange(raw);
  if (!r) return void (await sendText(env, user.chat_id, `فرمت درست نیست.\n<i>${step.example ?? ''}</i>`));
  step.apply(w, r);
  await advance(env, s, user, w, step.id);
}

async function onCallback(env: Env, s: Settings, q: any) {
  const answer = (text?: string) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text });
  const user = await ensureUser(env.DB, s, q.from, q.message?.chat?.id ?? q.from.id);
  if (user.is_blocked) return void (await answer());
  const [kind, a, b] = String(q.data ?? '').split(':');

  if (kind === 's') {                                          // manage saved searches
    const id = Number(b);
    const own = await env.DB.prepare('SELECT id, deal, property, criteria, is_active FROM searches WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>();
    if (!own) return void (await answer('پیدا نشد'));
    const edit = (text: string, kb?: unknown) =>
      tg(env, 'editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text, parse_mode: 'HTML', reply_markup: kb ?? { inline_keyboard: [] } });
    if (a === 'd') {
      await env.DB.prepare('DELETE FROM searches WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      await answer('حذف شد');
      return void (await edit(`🗑 جستجوی #${fa(id)} حذف شد.`));
    }
    const active = own.is_active ? 0 : 1;
    await env.DB.prepare('UPDATE searches SET is_active = ? WHERE id = ?').bind(active, id).run();
    await answer(active ? 'ادامه یافت' : 'متوقف شد');
    return void (await edit(`${active ? '🟢' : '⏸'} #${fa(id)}\n${describe(own.deal, own.property, JSON.parse(own.criteria))}`, {
      inline_keyboard: [[{ text: active ? '⏸ توقف' : '▶️ ادامه', callback_data: `s:t:${id}` }, { text: '🗑 حذف', callback_data: `s:d:${id}` }]],
    }));
  }

  if (kind !== 'w') return void (await answer());
  if (a === 'x') {
    await saveWizard(env, user.id, null);
    await answer('لغو شد');
    return void (await sendText(env, user.chat_id, 'لغو شد.', { reply_markup: MENU_KB }));
  }
  const w = parseWizard(user);
  const step = STEPS.find((x) => x.id === a);
  if (!w || !step || w.step !== step.id) return void (await answer('این مرحله منقضی شده است. /search'));
  await answer();

  if (b !== 's') {
    const opts = step.kind === 'choice' ? step.options!(w, s) : [];
    const picked = opts[Number(b)];
    if (!picked) return;
    step.apply(w, picked[1]);
  } else if (!step.skippable) {
    return;
  }
  await advance(env, s, user, w, step.id);
}
