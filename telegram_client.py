"""Telegram bot setup and message formatting/sending."""
import html

import telegram

import config
from hashtags import generate_hashtags
from text_utils import (
    TELEGRAM_CAPTION_LIMIT,
    TELEGRAM_MESSAGE_LIMIT,
    split_text_into_chunks,
)

bot = None
if config.BOT_TOKEN:
    req_proxy = telegram.request.HTTPXRequest(
        proxy_url=config.PROXY_URL,
        connect_timeout=30,
        read_timeout=30,
        write_timeout=30,
        pool_timeout=30,
    )
    bot = telegram.Bot(token=config.BOT_TOKEN, request=req_proxy)


def build_message_text(ad) -> str:
    text = f"🗄 <b>{html.escape(ad.title)}</b>" + "\n"

    location_line = ad.posted_in or ad.district
    if location_line:
        text += f"📌 محل آگهی : <i>{html.escape(location_line)}</i>" + "\n"

    _price = f"{ad.price:,} تومان" if ad.price else "توافقی"
    text += f"💰 قیمت : {_price}" + "\n"

    if ad.features:
        text += "\n📋 <b>مشخصات</b> :\n"
        for label, value in ad.features:
            text += f"🔸 {html.escape(label)}: {html.escape(value)}\n"

    text += f"\n📄 توضیحات :\n{html.escape(ad.description)}"

    hashtags = generate_hashtags(ad)
    if hashtags:
        text += "\n\n" + " ".join(f"#{tag}" for tag in hashtags)

    text += config.FOOTER_TEXT
    return text


def build_short_caption(ad) -> str:
    """A short teaser used as the photo/album caption when the full text
    would exceed Telegram's 1024-char caption limit. The full text still
    goes out right after, as a separate message."""
    _price = f"{ad.price:,} تومان" if ad.price else "توافقی"
    return (
        f"🗄 <b>{html.escape(ad.title)}</b>\n"
        f"💰 قیمت : {_price}\n\n"
        "(توضیحات کامل در پیام بعدی 👇)"
    )


def build_plain_message_text(ad) -> str:
    """Build a portable text-only version for non-Telegram APIs."""
    text = "🗄 {}\n".format(ad.title)

    location_line = ad.posted_in or ad.district
    if location_line:
        text += "📌 محل آگهی : {}\n".format(location_line)

    price = "{:,} تومان".format(ad.price) if ad.price else "توافقی"
    text += "💰 قیمت : {}\n".format(price)

    if ad.features:
        text += "\n📋 مشخصات :\n"
        for label, value in ad.features:
            text += "🔸 {}: {}\n".format(label, value)

    text += "\n📄 توضیحات :\n{}".format(ad.description)

    hashtags = generate_hashtags(ad)
    if hashtags:
        text += "\n\n" + " ".join("#{}".format(tag) for tag in hashtags)

    return text + config.FOOTER_TEXT


async def _send_text_chunks(text: str):
    for chunk in split_text_into_chunks(text, TELEGRAM_MESSAGE_LIMIT):
        await bot.send_message(
            text=chunk, chat_id=config.BOT_CHATID, parse_mode="HTML"
        )


async def send_telegram_message(ad):
    if bot is None or not config.BOT_CHATID:
        raise RuntimeError("Telegram is not configured.")

    text = build_message_text(ad)
    fits_as_caption = len(text) <= TELEGRAM_CAPTION_LIMIT

    if ad.images:
        caption = text if fits_as_caption else build_short_caption(ad)

        if len(ad.images) == 1:
            await bot.send_photo(
                caption=caption,
                photo=ad.images[0],
                chat_id=config.BOT_CHATID,
                parse_mode="HTML",
            )
        else:
            media_list = [telegram.InputMediaPhoto(img) for img in ad.images[:10]]
            try:
                await bot.send_media_group(
                    caption=caption,
                    media=media_list,
                    chat_id=config.BOT_CHATID,
                    parse_mode="HTML",
                )
            except telegram.error.BadRequest as e:
                print("Error sending photos :", e)
                # Still deliver the text below rather than losing the ad.
                fits_as_caption = False

        if not fits_as_caption:
            await _send_text_chunks(text)
    else:
        await _send_text_chunks(text)
