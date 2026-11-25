import { Env } from '../types';
import { resolveChannelBranding } from './cardBuilder';

async function tgApi(env: Env, method: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function buildWizardStage2Keyboard(draft: any) {
  const s2 = draft.stage2 || {};
  const skel: string[] = Array.isArray(s2.skeleton) ? s2.skeleton : [];
  const dir: string[] = Array.isArray(s2.direction) ? s2.direction : [];
  const cityId = (Array.isArray(draft.city_ids) && draft.city_ids[0]) || '823';
  const useDivar = draft.source_divar !== 0;
  const useSheypoor = draft.source_sheypoor !== 0;

  return {
    inline_keyboard: [
      [
        { text: `${s2.parking ? '✅' : '⬜'} پارکینگ`, callback_data: 'wiz_s2_toggle:parking' },
        { text: `${s2.elevator ? '✅' : '⬜'} آسانسور`, callback_data: 'wiz_s2_toggle:elevator' },
        { text: `${s2.storage ? '✅' : '⬜'} انباری`, callback_data: 'wiz_s2_toggle:storage' }
      ],
      [
        { text: `${skel.includes('CONCRETE') ? '✅' : '⬜'} اسکلت بتنی`, callback_data: 'wiz_s2_skel:CONCRETE' },
        { text: `${dir.includes('NORTH') ? '✅' : '⬜'} شمالی`, callback_data: 'wiz_s2_dir:NORTH' },
        { text: `${dir.includes('SOUTH') ? '✅' : '⬜'} جنوبی`, callback_data: 'wiz_s2_dir:SOUTH' }
      ],
      [
        { text: `📍 شهر: ${cityId === '1' ? 'تهران' : (cityId === '24' ? 'گرگان' : 'علی‌آباد کتول')}`, callback_data: 'wiz_cycle_city' },
        { text: `${useDivar ? '✅' : '⬜'} دیوار`, callback_data: 'wiz_src_toggle:divar' },
        { text: `${useSheypoor ? '✅' : '⬜'} شیپور`, callback_data: 'wiz_src_toggle:sheypoor' }
      ],
      [
        { text: '➡️ تایید مشخصات و انتخاب تعداد آگهی اولیه (Backfill)', callback_data: 'wiz_backfill_step' }
      ]
    ]
  };
}

function isSuperAdmin(telegramId: number, env: Env): boolean {
  const ids = (env.SUPERADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return ids.includes(telegramId);
}

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized webhook secret', { status: 401 });
  }

  const update: any = await request.json();

  // 1. Auto-detect when bot is promoted to Administrator in @somechannel
  if (update.my_chat_member) {
    const mcm = update.my_chat_member;
    const chat = mcm.chat;
    const fromUser = mcm.from;
    const newStatus = mcm.new_chat_member?.status;
    const canPost = mcm.new_chat_member?.can_post_messages === true;

    if ((chat.type === 'channel' || chat.type === 'supergroup') && newStatus === 'administrator' && canPost) {
      const chatId = chat.username ? `@${chat.username}` : String(chat.id);
      const channelId = `ch_${Math.abs(chat.id)}`;

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO users (telegram_id, username, full_name, role) VALUES (?, ?, ?, ?)
           ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, updated_at=unixepoch()`
        ).bind(fromUser.id, fromUser.username || null, fromUser.first_name || 'User', isSuperAdmin(fromUser.id, env) ? 'SUPERADMIN' : 'USER'),
        env.DB.prepare(
          `INSERT INTO channels (id, owner_user_id, chat_id, title, bot_is_admin, can_post_messages, is_enabled, last_verified_at)
           VALUES (?, ?, ?, ?, 1, 1, 1, unixepoch())
           ON CONFLICT(chat_id) DO UPDATE SET bot_is_admin=1, can_post_messages=1, title=excluded.title, last_verified_at=unixepoch()`
        ).bind(channelId, fromUser.id, chatId, chat.title || chatId)
      ]);

      await tgApi(env, 'sendMessage', {
        chat_id: fromUser.id,
        text: `✅ کانال <b>${chat.title || chatId}</b> (<code>${chatId}</code>) با موفقیت متصل و دسترسی ادمین تایید شد!\n\nهم‌اکنون می‌توانید فیلترهای دو مرحله‌ای دیوار را برای این کانال تنظیم کنید:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎯 تنظیم فیلتر برای این کانال', callback_data: `wiz_start:${channelId}` }]
          ]
        }
      });
    }
    return new Response('OK');
  }

  // 2. Handle Inline Keyboard Callback Queries (7-Step Wizard & Score Info)
  if (update.callback_query) {
    const cb = update.callback_query;
    const fromId = cb.from.id;
    const chatId = cb.message?.chat?.id;
    const msgId = cb.message?.message_id;
    const data: string = cb.data || '';

    if (data.startsWith('score_info:')) {
      const parts = data.split(':');
      const score = parts[3] || '—';
      await tgApi(env, 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: `🎯 امتیاز تطابق این فایل: ${score}٪\n(محاسبه شده بر اساس ۳۵ امتیاز بودجه، ۲۵ امتیاز متراژ و ۴۰ امتیاز مشخصات مرحله دوم و تلورانس)`,
        show_alert: true
      });
      return new Response('OK');
    }

    if (data.startsWith('contact_info:') || data === 'contact_info') {
      const adToken = data.includes(':') ? data.split(':')[1] : '';
      const msgChatUsername = cb.message?.chat?.username ? `@${cb.message.chat.username}` : (cb.message?.chat?.id ? String(cb.message.chat.id) : '');
      let chRow: any = null;
      if (msgChatUsername) {
        chRow = await env.DB.prepare(`SELECT * FROM channels WHERE chat_id = ?`).bind(msgChatUsername).first();
      }
      if (!chRow && adToken) {
        chRow = await env.DB.prepare(
          `SELECT c.* FROM sent_ads sa JOIN channels c ON sa.channel_id = c.id WHERE sa.post_token = ? LIMIT 1`
        ).bind(adToken).first();
      }
      const branding = resolveChannelBranding(chRow?.chat_id || msgChatUsername || '@aliabadmelk', chRow ? {
        chat_id: chRow.chat_id,
        contact_mobile: chRow.contact_mobile,
        contact_phone: chRow.contact_phone,
        office_address: chRow.office_address
      } : null);

      const lines = ['📞 اطلاعات تماس و مشاوره:'];
      if (branding.contact_mobile) lines.push(`📱 همراه: ${branding.contact_mobile}`);
      if (branding.contact_phone) lines.push(`☎️ دفتر: ${branding.contact_phone}`);
      if (branding.office_address) lines.push(`📍 ${branding.office_address}`);
      lines.push(`🔗 کانال تلگرام: ${branding.chat_id}`);

      await tgApi(env, 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: lines.join('\n').slice(0, 195),
        show_alert: true
      });
      return new Response('OK');
    }

    const userRow: any = await env.DB.prepare(`SELECT * FROM users WHERE telegram_id = ?`).bind(fromId).first();
    const draft: any = userRow?.wizard_draft_json ? JSON.parse(userRow.wizard_draft_json) : {};

    if (data.startsWith('wiz_start:')) {
      const channelId = data.split(':')[1];
      const nextDraft = {
        channel_id: channelId,
        city_ids: ['823'],
        source_divar: 1,
        source_sheypoor: 1,
        stage2: { parking: true, elevator: true, storage: true }
      };
      await env.DB.prepare(`UPDATE users SET wizard_state = 'WIZ_STAGE1_CATEGORY', wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(nextDraft), fromId).run();

      await tgApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `<b>مرحله ۱ از ۵: انتخاب نوع معامله و ملک</b>\nلطفاً دسته‌بندی مورد نظر خود را انتخاب کنید:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏢 فروش آپارتمان', callback_data: 'wiz_cat:apartment-sell:BUY:APARTMENT' }],
            [{ text: '🔑 اجاره آپارتمان', callback_data: 'wiz_cat:apartment-rent:RENT:APARTMENT' }],
            [{ text: '🏡 فروش ویلایی و مسکونی', callback_data: 'wiz_cat:buy-residential:BUY:ALL_RESIDENTIAL' }],
            [{ text: '🏪 فروش اداری و تجاری', callback_data: 'wiz_cat:buy-commercial-property:BUY:COMMERCIAL' }]
          ]
        }
      });
      return new Response('OK');
    }

    if (data.startsWith('wiz_cat:')) {
      const [, slug, dealType, propType] = data.split(':');
      draft.divar_category_slug = slug;
      draft.deal_type = dealType;
      draft.property_type = propType;
      await env.DB.prepare(`UPDATE users SET wizard_state = 'WIZ_STAGE1_TOLERANCE', wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();

      await tgApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `<b>مرحله ۲ از ۵: تنظیم درصد تلورانس بودجه و متراژ</b>\nچند درصد تلورانس روی سقف بودجه و متراژ اعمال شود؟`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '۱۰٪ تلورانس', callback_data: 'wiz_tol:0.10' },
              { text: '۱۲٪ تلورانس', callback_data: 'wiz_tol:0.12' },
              { text: '۱۵٪ تلورانس (پیشنهادی)', callback_data: 'wiz_tol:0.15' }
            ]
          ]
        }
      });
      return new Response('OK');
    }

    if (data.startsWith('wiz_tol:')) {
      draft.tolerance_pct = parseFloat(data.split(':')[1]);
      await env.DB.prepare(`UPDATE users SET wizard_state = 'WIZ_STAGE2_SPECS', wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();

      await tgApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `<b>مرحله ۳ از ۵: مشخصات، شهر و منابع دریافت آگهی</b>\nامکانات، شهر و سامانه‌های (دیوار/شیپور) مورد نظر را انتخاب کرده و سپس دکمه ادامه را بزنید:`,
        parse_mode: 'HTML',
        reply_markup: buildWizardStage2Keyboard(draft)
      });
      return new Response('OK');
    }

    if (data.startsWith('wiz_s2_toggle:')) {
      const key = data.split(':')[1];
      draft.stage2 = draft.stage2 || {};
      draft.stage2[key] = !draft.stage2[key];
      await env.DB.prepare(`UPDATE users SET wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();
      await tgApi(env, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: buildWizardStage2Keyboard(draft)
      });
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `بروزرسانی شد.` });
      return new Response('OK');
    }

    if (data.startsWith('wiz_s2_skel:')) {
      const val = data.split(':')[1];
      draft.stage2 = draft.stage2 || {};
      const curr: string[] = Array.isArray(draft.stage2.skeleton) ? draft.stage2.skeleton : [];
      draft.stage2.skeleton = curr.includes(val) ? curr.filter((x) => x !== val) : [...curr, val];
      await env.DB.prepare(`UPDATE users SET wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();
      await tgApi(env, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: buildWizardStage2Keyboard(draft)
      });
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `اسکلت بروزرسانی شد.` });
      return new Response('OK');
    }

    if (data.startsWith('wiz_s2_dir:')) {
      const val = data.split(':')[1];
      draft.stage2 = draft.stage2 || {};
      const curr: string[] = Array.isArray(draft.stage2.direction) ? draft.stage2.direction : [];
      draft.stage2.direction = curr.includes(val) ? curr.filter((x) => x !== val) : [...curr, val];
      await env.DB.prepare(`UPDATE users SET wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();
      await tgApi(env, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: buildWizardStage2Keyboard(draft)
      });
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `جهت ساختمان بروزرسانی شد.` });
      return new Response('OK');
    }

    if (data === 'wiz_cycle_city') {
      const cities = ['823', '24', '1'];
      const curr = (Array.isArray(draft.city_ids) && draft.city_ids[0]) || '823';
      const next = cities[(cities.indexOf(curr) + 1) % cities.length];
      draft.city_ids = [next];
      await env.DB.prepare(`UPDATE users SET wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();
      await tgApi(env, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: buildWizardStage2Keyboard(draft)
      });
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `شهر تغییر یافت.` });
      return new Response('OK');
    }

    if (data.startsWith('wiz_src_toggle:')) {
      const src = data.split(':')[1];
      if (src === 'divar') draft.source_divar = draft.source_divar === 0 ? 1 : 0;
      if (src === 'sheypoor') draft.source_sheypoor = draft.source_sheypoor === 0 ? 1 : 0;
      await env.DB.prepare(`UPDATE users SET wizard_draft_json = ? WHERE telegram_id = ?`)
        .bind(JSON.stringify(draft), fromId).run();
      await tgApi(env, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: buildWizardStage2Keyboard(draft)
      });
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `منابع دریافت بروزرسانی شد.` });
      return new Response('OK');
    }

    if (data === 'wiz_backfill_step') {
      await tgApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `<b>مرحله پایانی: شروع با آگهی‌های موجود (Backfill) + استریم لحظه‌ای (Live)</b>\nربات ابتدا چند آگهی موجود در دیوار را به کانال ارسال کند و سپس به ارسال آگهی‌های جدید ادامه دهد؟`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 ارسال ۲۰ آگهی موجود + استریم جدیدها', callback_data: 'wiz_finish:20' },
              { text: '🚀 ارسال ۳۰ آگهی موجود + استریم جدیدها', callback_data: 'wiz_finish:30' }
            ]
          ]
        }
      });
      return new Response('OK');
    }

    if (data.startsWith('wiz_finish:')) {
      const backfillCount = parseInt(data.split(':')[1], 10) || 30;
      const ruleId = `rule_${Date.now()}`;
      const channelId = draft.channel_id;

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO filter_rules (id, channel_id, owner_user_id, name, is_active, city_ids_json, deal_type, property_type, divar_category_slug, max_budget, min_area, max_area, tolerance_pct, min_match_score, stage2_filters_json, source_divar, source_sheypoor)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 65, ?, ?, ?)`
        ).bind(
          ruleId,
          channelId,
          fromId,
          `فیلتر هوشمند (${draft.divar_category_slug || 'apartment-sell'})`,
          JSON.stringify(Array.isArray(draft.city_ids) && draft.city_ids.length > 0 ? draft.city_ids : ['823']),
          draft.deal_type || 'BUY',
          draft.property_type || 'APARTMENT',
          draft.divar_category_slug || 'apartment-sell',
          draft.max_budget || 12000000000,
          draft.min_area || 80,
          draft.max_area || 150,
          draft.tolerance_pct || 0.15,
          JSON.stringify(draft.stage2 || {}),
          draft.source_divar !== undefined ? Number(draft.source_divar) : 1,
          draft.source_sheypoor !== undefined ? Number(draft.source_sheypoor) : 1
        ),
        env.DB.prepare(
          `INSERT INTO sync_state (rule_id, phase, backfill_target_count, backfill_queued_count, backfill_dispatched_count)
           VALUES (?, 'BACKFILL', ?, 0, 0)`
        ).bind(ruleId, backfillCount),
        env.DB.prepare(`UPDATE users SET wizard_state = 'IDLE', wizard_draft_json = '{}' WHERE telegram_id = ?`).bind(fromId)
      ]);

      await tgApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `✅ <b>فیلتر دو مرحله‌ای با موفقیت فعال شد!</b>\n\n🔹 <b>شناسه قانون:</b> <code>${ruleId}</code>\n🔹 <b>فاز فعلی:</b> <code>BACKFILL</code> (در حال استخراج ${backfillCount} آگهی موجود و سپس تغییر خودکار به حالت <code>LIVE</code>)\n🔹 <b>تلورانس:</b> ${Math.round((draft.tolerance_pct || 0.15) * 100)}٪`,
        parse_mode: 'HTML'
      });
      return new Response('OK');
    }

    return new Response('OK');
  }

  // 3. Handle Text Commands (/start, /admin, /addchannel @somechannel, /grant)
  const msg = update.message;
  if (!msg || !msg.text) return new Response('OK');

  const fromId: number = msg.from.id;
  const chatId: number = msg.chat.id;
  const text: string = msg.text.trim();
  const superAdmin = isSuperAdmin(fromId, env);

  // Upsert user and auto-grant FREE_TRIAL if new
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, username, full_name, role) VALUES (?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, updated_at=unixepoch()`
  ).bind(fromId, msg.from.username || null, msg.from.first_name || 'User', superAdmin ? 'SUPERADMIN' : 'USER').run();

  if (text === '/start' || text === '/admin') {
    const existingSub = await env.DB.prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE'`).bind(fromId).first();
    if (!existingSub) {
      const now = Math.floor(Date.now() / 1000);
      const planId = superAdmin ? 'AGENCY_VIP' : 'FREE_TRIAL';
      const days = superAdmin ? 365 : 3;
      await env.DB.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, starts_at, expires_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`
      ).bind(`sub_${fromId}_${now}`, fromId, planId, now, now + days * 86400).run();
    }

    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: `🏠 <b>به ربات هوشمند پایش املاک دیوار (Hydra-Sender v2) خوش آمدید!</b>\n\n` +
        `🔹 <b>قابلیت‌ها:</b>\n` +
        `• فیلتر دو مرحله‌ای (بودجه، متراژ، اسکلت، جهت، کابینت، سرمایش/گرمایش)\n` +
        `• اعمال تلورانس ۱۰٪ تا ۱۵٪ و محاسبه درصد تطابق (Match Score %)\n` +
        `• ارسال آگهی‌های موجود (Backfill) و ادامه خودکار با آگهی‌های جدید (Live)\n\n` +
        `📌 <b>برای اتصال کانال:</b>\nربات را در کانال خود ادمین کنید یا دستور زیر را بفرستید:\n<code>/addchannel @somechannel</code>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖥 باز کردن پنل مدیریت وب (Admin Dashboard)', url: 'https://hydra-bot.a77aslani.workers.dev/admin/' }]
        ]
      }
    });
    return new Response('OK');
  }

  if (text.startsWith('/addchannel')) {
    const parts = text.split(/\s+/);
    const targetChannel = parts[1];
    if (!targetChannel || (!targetChannel.startsWith('@') && !targetChannel.startsWith('-100'))) {
      await tgApi(env, 'sendMessage', {
        chat_id: chatId,
        text: `⚠️ لطفاً آیدی کانال را به صورت صحیح وارد کنید:\n<code>/addchannel @somechannel</code>`,
        parse_mode: 'HTML'
      });
      return new Response('OK');
    }

    // Verify bot is admin in @somechannel
    const meRes = await tgApi(env, 'getMe', {});
    const botUserId = meRes?.result?.id;
    const memberRes = await tgApi(env, 'getChatMember', { chat_id: targetChannel, user_id: botUserId });

    if (!memberRes?.ok || (memberRes.result?.status !== 'administrator' && memberRes.result?.status !== 'creator')) {
      await tgApi(env, 'sendMessage', {
        chat_id: chatId,
        text: `❌ ربات در کانال <code>${targetChannel}</code> ادمین نیست یا دسترسی ارسال پیام ندارد. ابتدا ربات را در کانال ادمین کرده و مجدداً تلاش کنید.`,
        parse_mode: 'HTML'
      });
      return new Response('OK');
    }

    const channelId = `ch_${targetChannel.replace(/[^a-zA-Z0-9]/g, '')}`;
    await env.DB.prepare(
      `INSERT INTO channels (id, owner_user_id, chat_id, title, bot_is_admin, can_post_messages, is_enabled, last_verified_at)
       VALUES (?, ?, ?, ?, 1, 1, 1, unixepoch())
       ON CONFLICT(chat_id) DO UPDATE SET owner_user_id=excluded.owner_user_id, bot_is_admin=1, can_post_messages=1, last_verified_at=unixepoch()`
    ).bind(channelId, fromId, targetChannel, targetChannel).run();

    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: `✅ کانال <code>${targetChannel}</code> تایید و ثبت شد! اکنون روی دکمه زیر کلیک کنید تا فیلترهای مرحله اول و دوم را تنظیم نمایید:`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎯 شروع ویزارد تنظیم فیلتر برای این کانال', callback_data: `wiz_start:${channelId}` }]
        ]
      }
    });
    return new Response('OK');
  }

  return new Response('OK');
}
