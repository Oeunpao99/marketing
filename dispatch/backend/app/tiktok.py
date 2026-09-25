"""TikTok Content Posting API — OAuth connect + video upload/publish.

Setup: register an app at https://developers.tiktok.com, add the Content
Posting API product, request the ``video.upload`` and ``video.list`` scopes,
and register this backend's callback (``<TIKTOK_REDIRECT_URI>``, must be a
static https url) as a redirect URI on that app. Put ``TIKTOK_CLIENT_KEY`` /
``TIKTOK_CLIENT_SECRET`` / ``TIKTOK_REDIRECT_URI`` in ``.env`` — see
``app/views.py``'s ``/oauth/tiktok/*`` endpoints for the connect flow and
``app/publishers.py`` for where a scheduled post actually gets sent.

Two posting flows live here:

- **Upload** (``upload_video_draft``, ``/post/publish/inbox/video/init/``) —
  the default. Only needs ``video.upload`` scope, no audit. The video lands
  as a draft in the connected account's TikTok inbox; a person still has to
  open TikTok and tap Post to finish — the caption isn't carried over either
  (the Upload API has no field for it), so `Draft.body` prepared in this
  portal is copied by hand at that point.
- **Direct Post** (``publish_video_direct``, ``/post/publish/video/init/``) —
  auto-publishes with no human step, but needs the ``video.publish`` scope,
  which requires a separate TikTok audit. That audit's own guidelines say
  it's not meant for "a utility tool to help upload content to account(s)
  you or your team manages" — i.e. not meant for an internal tool. Set
  ``TIKTOK_REQUEST_DIRECT_POST=true`` (only after adding ``video.publish``
  under the app's Sandbox tab — see README.md) to request it on future
  connects; ``app/publishers.py`` automatically uses Direct Post instead of
  Upload for any channel whose granted token actually has that scope
  (checked live, not just because the setting is on), so already-connected
  Upload-only channels are unaffected either way.

This posts videos in a single chunk, which TikTok allows up to 64 MB — plenty
for the short AI-generated clips this portal renders. A much longer / heavier
upload would need real chunked upload, which isn't implemented here.

``video_insights()`` (used by the Insights page) needs ``video.list`` — a
channel connected before that scope was added needs reconnecting once. Note
an Upload-flow post shows no numbers until the connected account actually
finishes posting the draft from their TikTok inbox — nothing's public before
then; a Direct Post one shows numbers once TikTok finishes processing it (or
stays private/self-view if the app hasn't passed the audit yet).
"""

from __future__ import annotations

import time
from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
API_BASE = "https://open.tiktokapis.com/v2"
BASE_SCOPE = "video.upload,video.list"
DIRECT_POST_SCOPE = "video.publish"


def _scope() -> str:
    if get_settings().tiktok_request_direct_post:
        return f"{BASE_SCOPE},{DIRECT_POST_SCOPE}"
    return BASE_SCOPE


# TikTok's single-PUT upload path tops out at 64 MB per chunk.
MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024

# Refresh the access token if it's due to expire within this many seconds.
_REFRESH_SKEW_SECONDS = 60


class TikTokError(RuntimeError):
    pass


def _conf() -> tuple[str, str, str]:
    s = get_settings()
    if not s.tiktok_client_key or not s.tiktok_client_secret or not s.tiktok_redirect_uri:
        raise TikTokError(
            "TikTok is not configured (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / "
            "TIKTOK_REDIRECT_URI missing)."
        )
    return s.tiktok_client_key, s.tiktok_client_secret, s.tiktok_redirect_uri


def _explain(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error") or {}
        if isinstance(err, dict):
            return err.get("message") or err.get("code") or resp.text[:300]
        return str(err)[:300]
    except ValueError:
        return resp.text[:300] or f"HTTP {resp.status_code}"


def authorize_url(state: str) -> str:
    """The tiktok.com consent-screen url to send the user's browser to."""
    key, _secret, redirect_uri = _conf()
    params = {
        "client_key": key,
        "scope": _scope(),
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def _token_fields(data: dict) -> dict:
    # TikTok's token endpoint wraps errors in {"error": {...}} even on HTTP 200.
    err = data.get("error")
    if isinstance(err, dict) and err.get("code") not in (None, "ok"):
        raise TikTokError(err.get("message") or "TikTok token request failed.")
    if "access_token" not in data:
        raise TikTokError("TikTok did not return an access token.")
    now = time.time()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "open_id": data.get("open_id", ""),
        "scope": data.get("scope", ""),
        "expires_at": now + float(data.get("expires_in") or 0),
        "refresh_expires_at": now + float(data.get("refresh_expires_in") or 0),
    }


def _token_request(grant: dict) -> dict:
    key, secret, _redirect = _conf()
    try:
        resp = httpx.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"client_key": key, "client_secret": secret, **grant},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise TikTokError(f"Could not reach TikTok: {exc}") from exc
    if resp.status_code >= 400:
        raise TikTokError(f"TikTok rejected the request: {_explain(resp)}")
    return _token_fields(resp.json())


def exchange_code(code: str) -> dict:
    """Trade an OAuth ``code`` (from the callback) for an access/refresh token pair."""
    _key, _secret, redirect_uri = _conf()
    return _token_request(
        {"code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri}
    )


def refresh_access_token(refresh_token: str) -> dict:
    return _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})


def ensure_access_token(config: dict) -> tuple[str, dict | None]:
    """A live access token for this channel, refreshing first if it's near expiry.

    Returns ``(access_token, updated_config)`` — ``updated_config`` is ``None``
    when the existing token was still fresh, otherwise the caller should
    persist it onto the channel's ``config`` (it holds the new tokens).
    """
    token = config.get("access_token")
    expires_at = float(config.get("expires_at") or 0)
    if token and expires_at - time.time() > _REFRESH_SKEW_SECONDS:
        return token, None
    refresh = config.get("refresh_token")
    if not refresh:
        raise TikTokError("TikTok connection expired — reconnect this channel.")
    fresh = refresh_access_token(refresh)
    return fresh["access_token"], {**config, **fresh}


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


def _init_and_upload(access_token: str, url: str, body: dict, video: bytes) -> str:
    """Shared by Upload and Direct Post — both POST an ``.../init/`` body
    shaped around ``source_info`` and then PUT the raw bytes to the
    ``upload_url`` that comes back the same way. Returns ``publish_id``."""
    if len(video) > MAX_SINGLE_CHUNK_BYTES:
        raise TikTokError(
            f"Video is {len(video) / 1_048_576:.1f} MB; this integration only "
            f"handles single-chunk uploads up to {MAX_SINGLE_CHUNK_BYTES // 1_048_576} MB."
        )
    try:
        resp = httpx.post(url, headers=_headers(access_token), json=body, timeout=30.0)
    except httpx.HTTPError as exc:
        raise TikTokError(f"Could not reach TikTok: {exc}") from exc
    if resp.status_code >= 400:
        raise TikTokError(f"TikTok rejected the request: {_explain(resp)}")
    data = resp.json().get("data") or {}
    publish_id, upload_url = data.get("publish_id"), data.get("upload_url")
    if not publish_id or not upload_url:
        raise TikTokError("TikTok did not return an upload url.")

    try:
        put_resp = httpx.put(
            upload_url,
            headers={
                "Content-Type": "video/mp4",
                "Content-Length": str(len(video)),
                "Content-Range": f"bytes 0-{len(video) - 1}/{len(video)}",
            },
            content=video,
            timeout=180.0,
        )
    except httpx.HTTPError as exc:
        raise TikTokError(f"Could not upload the video to TikTok: {exc}") from exc
    if put_resp.status_code >= 400:
        raise TikTokError(f"TikTok rejected the upload: {put_resp.text[:300]}")
    return publish_id


def upload_video_draft(access_token: str, video: bytes) -> str:
    """Upload one video to the connected account's TikTok inbox as a draft;
    returns TikTok's ``publish_id``. No caption/title param — the Upload API
    has no field for it (see module docstring); a person adds it by hand when
    they finish the post from their TikTok inbox.
    """
    body = {
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": len(video),
            "chunk_size": len(video),
            "total_chunk_count": 1,
        },
    }
    return _init_and_upload(access_token, f"{API_BASE}/post/publish/inbox/video/init/", body, video)


def creator_info(access_token: str) -> dict:
    """The connected account's posting options — allowed privacy levels,
    whether comments/duet/stitch are disabled account-wide, max video
    length. Render this before letting someone pick Direct Post settings;
    TikTok requires it (``privacy_level`` must be one of the values this
    returns, not just any enum member)."""
    try:
        resp = httpx.post(
            f"{API_BASE}/post/publish/creator_info/query/",
            headers=_headers(access_token),
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise TikTokError(f"Could not reach TikTok: {exc}") from exc
    if resp.status_code >= 400:
        raise TikTokError(f"Could not read creator info: {_explain(resp)}")
    return resp.json().get("data") or {}


def publish_video_direct(
    access_token: str,
    video: bytes,
    title: str,
    privacy_level: str,
    disable_duet: bool = False,
    disable_comment: bool = False,
    disable_stitch: bool = False,
    brand_content_toggle: bool = False,
    brand_organic_toggle: bool = False,
    is_aigc: bool = True,
) -> str:
    """Direct Post — auto-publishes once the app has passed TikTok's audit;
    before that, TikTok still forces the result to private/self-view no
    matter what ``privacy_level`` says (that's TikTok's rule, not a bug
    here). Needs a token carrying the ``video.publish`` scope — see the
    module docstring for how a channel gets that. ``is_aigc`` defaults to
    True: this portal's videos are AI-generated, and TikTok's content
    disclosure policy expects that to be declared.
    """
    body = {
        "post_info": {
            "title": title[:2200],
            "privacy_level": privacy_level,
            "disable_duet": disable_duet,
            "disable_comment": disable_comment,
            "disable_stitch": disable_stitch,
            "brand_content_toggle": brand_content_toggle,
            "brand_organic_toggle": brand_organic_toggle,
            "is_aigc": is_aigc,
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": len(video),
            "chunk_size": len(video),
            "total_chunk_count": 1,
        },
    }
    return _init_and_upload(access_token, f"{API_BASE}/post/publish/video/init/", body, video)


def post_status(access_token: str, publish_id: str) -> dict:
    """Poll a publish's progress — status is one of PROCESSING_UPLOAD,
    PUBLISH_COMPLETE, FAILED, etc."""
    try:
        resp = httpx.post(
            f"{API_BASE}/post/publish/status/fetch/",
            headers=_headers(access_token),
            json={"publish_id": publish_id},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise TikTokError(f"Could not reach TikTok: {exc}") from exc
    if resp.status_code >= 400:
        raise TikTokError(f"Could not check TikTok status: {_explain(resp)}")
    return resp.json().get("data") or {}


def query_videos(access_token: str, video_ids: list[str]) -> list[dict]:
    """view/like/comment/share counts for up to 20 of this account's videos."""
    try:
        resp = httpx.post(
            f"{API_BASE}/video/query/",
            headers=_headers(access_token),
            params={"fields": "id,view_count,like_count,comment_count,share_count"},
            json={"filters": {"video_ids": video_ids[:20]}},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise TikTokError(f"Could not reach TikTok: {exc}") from exc
    if resp.status_code >= 400:
        raise TikTokError(f"Could not read video numbers: {_explain(resp)}")
    return (resp.json().get("data") or {}).get("videos") or []


def video_insights(access_token: str, publish_id: str) -> dict:
    """view/like/comment/share counts for one video, keyed off the
    ``publish_id`` returned by ``upload_video_draft()`` — resolves it to the
    real video id first. For an Upload-flow draft, TikTok's terminal success
    state is ``SEND_TO_USER_INBOX`` (not ``PUBLISH_COMPLETE``, which this API
    never reaches for an Upload-flow draft) — it means the file is sitting in
    the connected account's TikTok inbox, done on our end, waiting for a
    person to open TikTok and tap Post. There's nothing public (and no view
    /like counts) until they do."""
    status = post_status(access_token, publish_id)
    state = status.get("status")
    if state == "FAILED":
        return {"status": "unavailable", "note": status.get("fail_reason") or "Upload failed.", "metrics": {}}
    if state == "SEND_TO_USER_INBOX":
        return {
            "status": "waiting",
            "note": "Uploaded — waiting in the TikTok inbox for someone to open TikTok and tap Post.",
            "metrics": {},
        }
    if state != "PUBLISH_COMPLETE":
        return {"status": "processing", "note": "TikTok is still processing this video.", "metrics": {}}

    ids = status.get("publicaly_available_post_id") or []
    if not ids:
        # Published, but with no public id: it went out as "Only me" (private)
        # — the only visibility an unaudited app may use — and TikTok gives
        # apps stats for public videos only.
        return {
            "status": "unavailable",
            "note": "Posted privately (“Only me”) — TikTok only shares stats for public videos. "
            "Numbers appear once the video is public.",
            "metrics": {},
        }
    # TikTok returns this as a JSON number, but the Query Videos API's
    # video_ids filter requires strings — passing the raw number 400s.
    videos = query_videos(access_token, [str(ids[0])])
    if not videos:
        return {"status": "unavailable", "note": "TikTok has no data for this video yet.", "metrics": {}}
    v = videos[0]
    return {
        "status": "ok",
        "metrics": {
            "views": v.get("view_count", 0),
            "likes": v.get("like_count", 0),
            "comments": v.get("comment_count", 0),
            "shares": v.get("share_count", 0),
        },
    }
