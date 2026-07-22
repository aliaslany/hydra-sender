"""Send new Divar ads to every configured messenger platform."""
import asyncio

import requests

import config
from telegram_client import (
    build_message_text,
    build_plain_message_text,
    build_short_caption,
    send_telegram_message,
)
from text_utils import (
    DEFAULT_MESSAGE_LIMIT,
    TELEGRAM_CAPTION_LIMIT,
    TELEGRAM_MESSAGE_LIMIT,
    split_text_into_chunks,
)


def enabled_messengers() -> list[str]:
    """Return configured messengers, in delivery order."""
    messengers = []
    if config.BOT_TOKEN and config.BOT_CHATID:
        messengers.append("telegram")
    if config.BALE_BOT_TOKEN and config.BALE_CHATID:
        messengers.append("bale")
    if config.RUBIKA_BOT_TOKEN and config.RUBIKA_CHATID:
        messengers.append("rubika")
    if config.EITAA_TOKEN and config.EITAA_CHATID:
        messengers.append("eitaa")
    return messengers


def _post_json(name: str, url: str, payload: dict) -> tuple[bool, dict | None]:
    try:
        response = requests.post(
            url,
            json=payload,
            timeout=config.MESSENGER_REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print("Failed to send to {}: {}".format(name, error))
        return False, None

    try:
        response_data = response.json()
    except ValueError:
        response_data = None

    if isinstance(response_data, dict) and response_data.get("ok") is False:
        print("Failed to send to {}: {}".format(name, response_data))
        return False, response_data

    return True, response_data


def _send_http_message(name: str, url: str, chat_id: str, text: str) -> bool:
    ok = True
    for chunk in split_text_into_chunks(text, DEFAULT_MESSAGE_LIMIT):
        sent, _ = _post_json(name, url, {"chat_id": chat_id, "text": chunk})
        ok = ok and sent
    if ok:
        print("Sent ad to {}.".format(name))
    return ok


def _download_image_bytes(url: str) -> bytes | None:
    try:
        response = requests.get(url, timeout=config.MESSENGER_REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.content
    except requests.RequestException as error:
        print("Failed to download ad image {}: {}".format(url, error))
        return None


# --- Bale -----------------------------------------------------------------


def _send_bale_ad(ad, html_text: str) -> bool:
    base_url = config.BALE_API_BASE_URL.rstrip("/")
    send_message_url = "{}/bot{}/sendMessage".format(base_url, config.BALE_BOT_TOKEN)

    fits_as_caption = len(html_text) <= TELEGRAM_CAPTION_LIMIT
    caption = html_text if fits_as_caption else build_short_caption(ad)

    if ad.images:
        send_photo_url = "{}/bot{}/sendPhoto".format(base_url, config.BALE_BOT_TOKEN)
        photo_sent, _ = _post_json(
            "Bale photo",
            send_photo_url,
            {
                "chat_id": config.BALE_CHATID,
                "photo": ad.images[0],
                "caption": caption,
                "parse_mode": "HTML",
            },
        )
        if not photo_sent:
            return False
        if fits_as_caption:
            print("Sent ad to Bale.")
            return True

    # No image, or caption was too long and needs the full text separately.
    ok = True
    for chunk in split_text_into_chunks(html_text, TELEGRAM_MESSAGE_LIMIT):
        sent, _ = _post_json(
            "Bale",
            send_message_url,
            {"chat_id": config.BALE_CHATID, "text": chunk, "parse_mode": "HTML"},
        )
        ok = ok and sent
    if ok:
        print("Sent ad to Bale.")
    return ok


# --- Rubika -----------------------------------------------------------------
# Rubika's Bot API can't attach a remote image URL directly - a file has to
# be uploaded to Rubika's own storage first (requestSendFile -> upload ->
# file_id), then sendFile references that file_id. This 3-step dance is why
# ads were arriving on Rubika with no image before.


def _rubika_upload_image(image_bytes: bytes) -> str | None:
    base_url = config.RUBIKA_API_BASE_URL.rstrip("/")

    ok, data = _post_json(
        "Rubika requestSendFile",
        "{}/{}/requestSendFile".format(base_url, config.RUBIKA_BOT_TOKEN),
        {"type": "Image"},
    )
    upload_url = (data or {}).get("data", {}).get("upload_url") or (data or {}).get(
        "upload_url"
    )
    if not ok or not upload_url:
        print("Rubika: could not obtain an upload URL.")
        return None

    try:
        response = requests.post(
            upload_url,
            files={"file": ("ad.jpg", image_bytes)},
            timeout=config.MESSENGER_REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        upload_data = response.json()
    except (requests.RequestException, ValueError) as error:
        print("Rubika: image upload failed: {}".format(error))
        return None

    file_id = (upload_data or {}).get("data", {}).get("file_id") or (
        upload_data or {}
    ).get("file_id")
    if not file_id:
        print("Rubika: upload response had no file_id: {}".format(upload_data))
        return None
    return file_id


def _send_rubika_ad(ad, plain_text: str) -> bool:
    base_url = config.RUBIKA_API_BASE_URL.rstrip("/")
    send_message_url = "{}/{}/sendMessage".format(base_url, config.RUBIKA_BOT_TOKEN)

    fits_as_caption = len(plain_text) <= DEFAULT_MESSAGE_LIMIT
    file_id = None

    if ad.images:
        image_bytes = _download_image_bytes(ad.images[0])
        if image_bytes:
            file_id = _rubika_upload_image(image_bytes)

    if file_id:
        send_file_url = "{}/{}/sendFile".format(base_url, config.RUBIKA_BOT_TOKEN)
        caption = plain_text if fits_as_caption else _short_plain_caption(ad)
        sent, _ = _post_json(
            "Rubika file",
            send_file_url,
            {"chat_id": config.RUBIKA_CHATID, "file_id": file_id, "text": caption},
        )
        if not sent:
            return False
        if fits_as_caption:
            print("Sent ad to Rubika.")
            return True
        # fall through to deliver the full text as follow-up message(s)
        return _send_http_message(
            "Rubika", send_message_url, config.RUBIKA_CHATID, plain_text
        )

    if ad.images:
        print("Rubika: sending text-only (image upload failed).")
    return _send_http_message(
        "Rubika", send_message_url, config.RUBIKA_CHATID, plain_text
    )


# --- Eitaa (via EitaaYar) ---------------------------------------------------
# Same story as Rubika: EitaaYar's sendFile wants the actual file bytes in
# the request body, not a URL, so we download from Divar and re-upload.


def _send_eitaa_ad(ad, plain_text: str) -> bool:
    base_url = config.EITAA_API_BASE_URL.rstrip("/")
    send_message_url = "{}/{}/sendMessage".format(base_url, config.EITAA_TOKEN)

    fits_as_caption = len(plain_text) <= DEFAULT_MESSAGE_LIMIT
    image_bytes = _download_image_bytes(ad.images[0]) if ad.images else None

    if image_bytes:
        send_file_url = "{}/{}/sendFile".format(base_url, config.EITAA_TOKEN)
        caption = plain_text if fits_as_caption else _short_plain_caption(ad)
        try:
            response = requests.post(
                send_file_url,
                data={"chat_id": config.EITAA_CHATID, "caption": caption},
                files={"file": ("ad.jpg", image_bytes)},
                timeout=config.MESSENGER_REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            sent = response.json().get("ok", True)
        except (requests.RequestException, ValueError) as error:
            print("Eitaa: file send failed: {}".format(error))
            sent = False

        if sent:
            if fits_as_caption:
                print("Sent ad to Eitaa.")
                return True
            return _send_http_message(
                "Eitaa", send_message_url, config.EITAA_CHATID, plain_text
            )
        print("Eitaa: falling back to text-only (image send failed).")

    return _send_http_message(
        "Eitaa", send_message_url, config.EITAA_CHATID, plain_text
    )


def _short_plain_caption(ad) -> str:
    price = "{:,} تومان".format(ad.price) if ad.price else "توافقی"
    return "🗄 {}\n💰 قیمت : {}\n\n(توضیحات کامل در پیام بعدی 👇)".format(
        ad.title, price
    )


async def send_ad(ad, destinations: list[str]) -> dict[str, bool]:
    """Deliver an ad to selected destinations and report each outcome."""
    outcomes = {}
    html_text = build_message_text(ad)
    plain_text = build_plain_message_text(ad)

    for destination in destinations:
        try:
            if destination == "telegram":
                await send_telegram_message(ad)
                outcomes[destination] = True
            elif destination == "bale":
                outcomes[destination] = await asyncio.to_thread(
                    _send_bale_ad, ad, html_text
                )
            elif destination == "rubika":
                outcomes[destination] = await asyncio.to_thread(
                    _send_rubika_ad, ad, plain_text
                )
            elif destination == "eitaa":
                outcomes[destination] = await asyncio.to_thread(
                    _send_eitaa_ad, ad, plain_text
                )
        except Exception as error:
            print("Failed to send to {}: {}".format(destination, error))
            outcomes[destination] = False

    return outcomes
