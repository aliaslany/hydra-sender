"""Send new Divar ads to every configured messenger platform."""
import asyncio

import requests

import config
from telegram_client import build_plain_message_text, send_telegram_message


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


def _post_json(name: str, url: str, payload: dict) -> bool:
    try:
        response = requests.post(
            url,
            json=payload,
            timeout=config.MESSENGER_REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print("Failed to send to {}: {}".format(name, error))
        return False

    try:
        response_data = response.json()
    except ValueError:
        response_data = None

    if isinstance(response_data, dict) and response_data.get("ok") is False:
        print("Failed to send to {}: {}".format(name, response_data))
        return False

    return True


def _send_http_message(name: str, url: str, chat_id: str, text: str) -> bool:
    if not _post_json(name, url, {"chat_id": chat_id, "text": text}):
        return False
    print("Sent ad to {}.".format(name))
    return True


def _send_bale_ad(ad, text: str) -> bool:
    base_url = config.BALE_API_BASE_URL.rstrip("/")
    send_message_url = "{}/bot{}/sendMessage".format(base_url, config.BALE_BOT_TOKEN)

    if ad.images:
        send_photo_url = "{}/bot{}/sendPhoto".format(base_url, config.BALE_BOT_TOKEN)
        photo_sent = _post_json(
            "Bale photo",
            send_photo_url,
            {"chat_id": config.BALE_CHATID, "photo": ad.images[0]},
        )
        if not photo_sent:
            return False

    return _send_http_message("Bale", send_message_url, config.BALE_CHATID, text)


async def send_ad(ad, destinations: list[str]) -> dict[str, bool]:
    """Deliver an ad to selected destinations and report each outcome."""
    outcomes = {}
    text = build_plain_message_text(ad)

    for destination in destinations:
        try:
            if destination == "telegram":
                await send_telegram_message(ad)
                outcomes[destination] = True
            elif destination == "bale":
                outcomes[destination] = await asyncio.to_thread(
                    _send_bale_ad,
                    ad,
                    text,
                )
            elif destination == "rubika":
                outcomes[destination] = await asyncio.to_thread(
                    _send_http_message,
                    "Rubika",
                    "{}/{}/sendMessage".format(
                        config.RUBIKA_API_BASE_URL.rstrip("/"), config.RUBIKA_BOT_TOKEN
                    ),
                    config.RUBIKA_CHATID,
                    text,
                )
            elif destination == "eitaa":
                outcomes[destination] = await asyncio.to_thread(
                    _send_http_message,
                    "Eitaa",
                    "{}/{}/sendMessage".format(
                        config.EITAA_API_BASE_URL.rstrip("/"), config.EITAA_TOKEN
                    ),
                    config.EITAA_CHATID,
                    text,
                )
        except Exception as error:
            print("Failed to send to {}: {}".format(destination, error))
            outcomes[destination] = False

    return outcomes
