"""Delivery adapters — turn a queued PostTarget into a real published post.

Only Telegram is wired to a live API. The other platforms are marked posted
without a network call unless ``SIMULATE_UNIMPLEMENTED_PLATFORMS=false``, in which
case they raise ``PublishError`` so nothing is silently "sent".
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.models import Channel, PostTarget, Video

TELEGRAM_API = "https://api.telegram.org"
TELEGRAM_TEXT_LIMIT = 4096
TELEGRAM_CAPTION_LIMIT = 1024


class PublishError(RuntimeError):
    """Raised when a target cannot be delivered."""


@dataclass
class PublishResult:
    external_id: str = ""
    detail: dict | None = None


def _telegram_call(token: str, method: str, params: dict) -> dict:
    try:
        resp = httpx.get(f"{TELEGRAM_API}/bot{token}/{method}", params=params, timeout=15.0)
    except httpx.HTTPError as exc:
        raise PublishError(f"Could not reach Telegram: {exc}") from exc
    ctype = resp.headers.get("content-type", "")
    data = resp.json() if ctype.startswith("application/json") else {}
    if not data.get("ok"):
        raise PublishError(f"Telegram: {data.get('description') or f'HTTP {resp.status_code}'}")
    return data.get("result", {})


def verify_telegram(bot_token: str, chat_id: str) -> dict:
    """Check the token is valid and the bot can see the chat. Raises PublishError."""
    if not bot_token:
        raise PublishError("A bot token is required.")
    if not chat_id:
        raise PublishError("A channel @username or numeric id is required.")
    bot = _telegram_call(bot_token, "getMe", {})
    chat = _telegram_call(bot_token, "getChat", {"chat_id": chat_id})
    return {
        "bot_username": bot.get("username"),
        "chat_title": chat.get("title") or chat.get("username"),
        "chat_type": chat.get("type"),
        "chat_id": chat.get("id"),
    }


def telegram_subscriber_count(bot_token: str, chat_id: str) -> int:
    """The channel's current member/subscriber count. Raises PublishError.

    This is the one number Telegram's Bot API gives cleanly — per-post views
    and reactions have no equivalent on-demand call (views only ever appear
    on a `Message` object the bot already has in hand; reactions only ever
    arrive as live update events the bot would have to sit and listen for),
    so neither is attempted here. See app/views.py's `_post_metrics`.
    """
    if not bot_token or not chat_id:
        raise PublishError("Missing bot token or channel id.")
    return int(_telegram_call(bot_token, "getChatMemberCount", {"chat_id": chat_id}))


def publish(target: PostTarget, channel: Channel, video: Video | None) -> PublishResult:
    slug = channel.platform.slug if channel.platform else ""
    if slug == "telegram":
        return _publish_telegram(target, channel, video)
    if slug == "tiktok" and (channel.config or {}).get("access_token"):
        return _publish_tiktok(target, channel, video)
    if slug == "facebook" and (channel.config or {}).get("access_token"):
        return _publish_facebook(target, channel, video)
    if slug == "instagram" and (channel.config or {}).get("access_token"):
        return _publish_instagram(target, channel, video)
    if get_settings().simulate_unimplemented_platforms:
        return PublishResult(detail={"simulated": True, "platform": slug})
    raise PublishError(f"No delivery integration for platform '{slug}'.")


def _publish_facebook(target: PostTarget, channel: Channel, video: Video | None) -> PublishResult:
    from app import meta
    from app.media import kind_for, read_media

    cfg = channel.config or {}
    token, page_id = cfg.get("access_token"), cfg.get("page_id")
    if not token or not page_id:
        raise PublishError("Facebook channel is missing its Page connection — reconnect it.")

    caption = target.caption or target.title or ""
    data = read_media(video.url) if video and video.url else None
    if video and video.url and data is None:
        raise PublishError("Could not read the media file to upload.")
    kind = kind_for(video.url, None) if video and video.url else None

    try:
        post_id = meta.publish_to_page(token, page_id, caption, data, kind)
    except meta.MetaError as exc:
        raise PublishError(str(exc)) from exc
    return PublishResult(external_id=post_id, detail={"platform": "facebook"})


def _publish_instagram(target: PostTarget, channel: Channel, video: Video | None) -> PublishResult:
    if video is None or not video.url:
        raise PublishError("This post has no image/video attached — Instagram requires one.")

    from app import meta
    from app.media import kind_for

    cfg = channel.config or {}
    token, ig_user_id = cfg.get("access_token"), cfg.get("ig_user_id")
    if not token or not ig_user_id:
        raise PublishError("Instagram channel is missing its account link — reconnect it.")

    base = get_settings().public_base_url.rstrip("/")
    if not base:
        raise PublishError(
            "Instagram publishing needs PUBLIC_BASE_URL set in .env — Instagram fetches "
            "media from a public url, it can't take a direct upload."
        )

    caption = target.caption or target.title or ""
    kind = kind_for(video.url, None)
    media_url = f"{base}{video.url}"
    try:
        media_id = meta.publish_to_instagram(token, ig_user_id, caption, media_url, kind)
    except meta.MetaError as exc:
        raise PublishError(str(exc)) from exc
    return PublishResult(external_id=media_id, detail={"platform": "instagram"})


def _publish_tiktok(target: PostTarget, channel: Channel, video: Video | None) -> PublishResult:
    if video is None or not video.url:
        raise PublishError("This post has no video attached — TikTok requires one.")

    from app import tiktok
    from app.media import kind_for, read_media

    if kind_for(video.url, None) != "video":
        raise PublishError(
            "TikTok only accepts video — this post has an image attached, not a video."
        )

    data = read_media(video.url)
    if data is None:
        raise PublishError("Could not read the video file to upload.")

    try:
        access_token, updated_config = tiktok.ensure_access_token(channel.config or {})
    except tiktok.TikTokError as exc:
        raise PublishError(str(exc)) from exc
    if updated_config is not None:
        # `channel` is attached to the caller's session — this rides its commit.
        channel.config = updated_config

    cfg = updated_config or channel.config or {}
    granted_scope = cfg.get("scope", "")
    # A channel can carry video.publish (Direct Post) and still prefer Upload
    # for now — e.g. Direct Post is only usable while the connected account
    # stays private pre-audit; toggle Channel.config["prefer_upload"] to
    # switch back without reconnecting (which would drop the video.publish
    # grant entirely).
    if "video.publish" in granted_scope.split(",") and not cfg.get("prefer_upload"):
        return _publish_tiktok_direct(target, access_token, data)

    try:
        publish_id = tiktok.upload_video_draft(access_token, data)
    except tiktok.TikTokError as exc:
        raise PublishError(str(exc)) from exc
    # Upload flow, not Direct Post (see app/tiktok.py) — this lands as a draft
    # in the connected account's TikTok inbox; a person still opens TikTok and
    # taps Post to actually publish it, adding the caption there by hand.
    return PublishResult(
        external_id=publish_id,
        detail={
            "platform": "tiktok",
            "publish_id": publish_id,
            "note": "Uploaded to TikTok as a draft — open TikTok to add the caption and post it.",
        },
    )


def _publish_tiktok_direct(target: PostTarget, access_token: str, data: bytes) -> PublishResult:
    """This channel's token actually carries ``video.publish`` (Sandbox
    testing, or a passed audit) — use Direct Post instead of Upload. Settings
    come from ``target.platform_options["tiktok"]``, chosen in the composer;
    defaults are the safe/conservative choice (private, nothing disabled, no
    branded-content claim) if that's missing."""
    from app import tiktok

    opts = (target.platform_options or {}).get("tiktok") or {}
    caption = target.caption or target.title or ""
    # Enforced here too, not just left to the composer picker: an unaudited
    # app's Direct Post calls are outright rejected for any privacy_level
    # other than SELF_ONLY (not just forced private) — TikTok's own
    # content-sharing-guidelines error if you send anything else.
    privacy_level = opts.get("privacy_level") or "SELF_ONLY"
    if not get_settings().tiktok_app_audited:
        privacy_level = "SELF_ONLY"
    try:
        publish_id = tiktok.publish_video_direct(
            access_token,
            data,
            caption,
            privacy_level=privacy_level,
            disable_duet=bool(opts.get("disable_duet", False)),
            disable_comment=bool(opts.get("disable_comment", False)),
            disable_stitch=bool(opts.get("disable_stitch", False)),
            brand_content_toggle=bool(opts.get("brand_content_toggle", False)),
            brand_organic_toggle=bool(opts.get("brand_organic_toggle", False)),
        )
    except tiktok.TikTokError as exc:
        raise PublishError(str(exc)) from exc
    return PublishResult(
        external_id=publish_id,
        detail={"platform": "tiktok", "publish_id": publish_id, "mode": "direct_post"},
    )


def _publish_telegram(
    target: PostTarget, channel: Channel, video: Video | None
) -> PublishResult:
    cfg = channel.config or {}
    token = cfg.get("bot_token") or get_settings().telegram_bot_token
    chat_id = cfg.get("chat_id") or channel.handle
    if not token:
        raise PublishError(
            "Telegram channel has no bot_token (set it in the channel config "
            "or TELEGRAM_BOT_TOKEN in .env)."
        )
    if not chat_id:
        raise PublishError("Telegram channel has no chat_id / @username.")

    parse_mode = cfg.get("parse_mode")  # e.g. "HTML" or "MarkdownV2"; optional
    caption = target.caption or target.title or ""
    asset_url = (video.url if video else "") or ""

    from app.media import kind_for, read_media

    # read_media checks the media_blobs table first, then the legacy on-disk
    # media/ folder — local_path_for() (disk-only) used to be called here
    # directly, which silently fell back to a text-only message for any
    # asset generated after storage moved into the database.
    is_remote = asset_url.startswith(("http://", "https://"))
    media_bytes = read_media(asset_url) if asset_url and not is_remote else None
    kind = kind_for(asset_url, None) if asset_url else "video"

    send_media = (media_bytes is not None or is_remote) and len(caption) <= TELEGRAM_CAPTION_LIMIT
    if send_media:
        method = "sendPhoto" if kind == "image" else "sendVideo"
        field = "photo" if kind == "image" else "video"
    else:
        method = "sendMessage"

    def _do_request() -> httpx.Response:
        base = {"chat_id": chat_id}
        if parse_mode:
            base["parse_mode"] = parse_mode
        endpoint = f"{TELEGRAM_API}/bot{token}/{method}"
        try:
            if send_media and media_bytes is not None:
                filename = asset_url.rsplit("/", 1)[-1] or "media"
                return httpx.post(
                    endpoint,
                    data={**base, "caption": caption},
                    files={field: (filename, media_bytes)},
                    timeout=120.0,
                )
            if send_media:
                return httpx.post(
                    endpoint, json={**base, field: asset_url, "caption": caption}, timeout=30.0
                )
            text = f"{caption}\n\n{asset_url}".strip() if is_remote else caption
            if len(text) > TELEGRAM_TEXT_LIMIT:
                raise PublishError(
                    f"Message is {len(text)} chars; Telegram allows {TELEGRAM_TEXT_LIMIT}."
                )
            return httpx.post(endpoint, json={**base, "text": text}, timeout=30.0)
        except httpx.HTTPError as exc:
            raise PublishError(f"Could not reach Telegram: {exc}") from exc

    resp = _do_request()

    ctype = resp.headers.get("content-type", "")
    data = resp.json() if ctype.startswith("application/json") else {}
    if not data.get("ok"):
        desc = data.get("description") or f"HTTP {resp.status_code}"
        raise PublishError(f"Telegram rejected the post: {desc}")

    message_id = str(data.get("result", {}).get("message_id", ""))
    return PublishResult(external_id=message_id, detail={"method": method})
