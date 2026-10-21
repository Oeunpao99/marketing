"""YouTube — OAuth connect (Google sign-in) and publishing videos / Shorts via
the YouTube Data API v3.

Setup: a Google Cloud project with "YouTube Data API v3" and "YouTube Analytics
API" enabled; Google Auth Platform → an OAuth client (Web application) whose
authorized redirect URIs include ``YOUTUBE_REDIRECT_URI`` exactly
("<this backend>/api/views/oauth/youtube/callback" — Google allows
http://localhost for local dev); the scopes below on the consent screen's Data
Access. Put ``YOUTUBE_CLIENT_ID`` / ``YOUTUBE_CLIENT_SECRET`` /
``YOUTUBE_REDIRECT_URI`` in ``.env``.

Until Google audits the project (YouTube API Services audit), every video it
uploads is locked to Private, only the consent screen's test users can
connect, and the daily quota (10,000 units; an upload costs 1,600) allows
about six uploads a day across the app.

Flow:
  1. ``authorize_url()`` — the person signs in with Google and picks the
     account / Brand Account whose channel we'll post to (offline access, so we
     get a refresh token).
  2. ``exchange_code()`` -> access + refresh tokens.
  3. ``my_channel()`` -> that account's YouTube channel (id, name, @handle).
  4. ``upload_video()`` — a resumable upload: the metadata first, then the
     file. A vertical clip up to 3 minutes is shown as a Short by YouTube.
  5. ``video_insights()`` — views / likes / comments (Data API statistics).
"""

from __future__ import annotations

import time
from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]
_REFRESH_SKEW_SECONDS = 120
TITLE_MAX = 100  # YouTube's limit, in characters
DESCRIPTION_MAX = 4900  # 5,000 bytes on YouTube — kept under for Khmer's multi-byte letters
SHORT_MAX_SECONDS = 180


class YouTubeError(RuntimeError):
    pass


def configured() -> bool:
    s = get_settings()
    return bool(s.youtube_client_id and s.youtube_client_secret and s.youtube_redirect_uri)


def _conf() -> tuple[str, str, str]:
    s = get_settings()
    if not configured():
        raise YouTubeError(
            "YouTube is not set up on the server yet (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / "
            "YOUTUBE_REDIRECT_URI missing)."
        )
    return s.youtube_client_id, s.youtube_client_secret, s.youtube_redirect_uri


def _explain(resp: httpx.Response) -> str:
    """Google's own reason, in one line (its errors nest the message)."""
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:300] or f"HTTP {resp.status_code}"
    err = body.get("error")
    if isinstance(err, dict):
        reason = ((err.get("errors") or [{}])[0] or {}).get("reason", "")
        return f"{err.get('message') or reason or 'error'}" + (f" ({reason})" if reason and reason not in str(err.get("message")) else "")
    return body.get("error_description") or str(err or body)[:300]


def _friendly(resp: httpx.Response) -> str:
    """The reasons people actually hit, said plainly."""
    text = _explain(resp)
    if "quotaExceeded" in text or "quota" in text.lower():
        return "YouTube's daily upload limit for the app is used up — it resets at midnight Pacific time. Try again tomorrow."
    if "youtubeSignupRequired" in text:
        return "This Google account has no YouTube channel yet — create one on youtube.com, then connect again."
    if "uploadLimitExceeded" in text:
        return "This YouTube channel has reached its own daily upload limit — try again tomorrow."
    return text


def authorize_url(state: str) -> str:
    client_id, _secret, redirect_uri = _conf()
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "state": state,
        # offline + consent: Google gives a refresh token (also on a reconnect)
        "access_type": "offline",
        "prompt": "consent select_account",
        "include_granted_scopes": "true",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def _token_fields(data: dict) -> dict:
    out = {
        "access_token": data.get("access_token", ""),
        "expires_at": time.time() + int(data.get("expires_in") or 3600),
        "scope": data.get("scope", ""),
    }
    if data.get("refresh_token"):  # only on the first grant (and with prompt=consent)
        out["refresh_token"] = data["refresh_token"]
    return out


def _token_request(form: dict) -> dict:
    client_id, secret, redirect_uri = _conf()
    try:
        resp = httpx.post(TOKEN_URL, data={"client_id": client_id, "client_secret": secret, **form}, timeout=30.0)
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach Google: {exc}") from exc
    if resp.status_code >= 400:
        reason = _explain(resp)
        if "invalid_grant" in reason:
            raise YouTubeError("The YouTube connection was revoked or expired — reconnect this channel.")
        raise YouTubeError(f"Google refused the sign-in: {reason}")
    data = resp.json()
    if not data.get("access_token"):
        raise YouTubeError("Google did not return an access token.")
    return data


def exchange_code(code: str) -> dict:
    """Trade the callback's ``code`` for tokens: {access_token, refresh_token, expires_at, scope}."""
    _client, _secret, redirect_uri = _conf()
    tokens = _token_fields(_token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}))
    if not tokens.get("refresh_token"):
        raise YouTubeError("Google didn't give us offline access — remove Smart Marketing from your Google account's third-party access, then connect again.")
    missing = [s.rsplit("/", 1)[-1] for s in SCOPES[:2] if s not in tokens["scope"]]
    if missing:
        raise YouTubeError(f"Please tick every permission on Google's screen (missing: {', '.join(missing)}) and connect again.")
    return tokens


def ensure_access_token(config: dict) -> tuple[str, dict | None]:
    """A live access token for this channel, refreshing first when it's near expiry.
    Returns (token, updated_config) — updated_config is None when nothing changed,
    else the caller saves it onto the channel."""
    token = config.get("access_token")
    if token and float(config.get("expires_at") or 0) - time.time() > _REFRESH_SKEW_SECONDS:
        return token, None
    refresh = config.get("refresh_token")
    if not refresh:
        raise YouTubeError("YouTube connection expired — reconnect this channel.")
    fresh = _token_fields(_token_request({"grant_type": "refresh_token", "refresh_token": refresh}))
    return fresh["access_token"], {**config, **fresh}


def _get(access_token: str, path: str, params: dict) -> dict:
    try:
        resp = httpx.get(f"{API}/{path}", params=params, headers={"Authorization": f"Bearer {access_token}"}, timeout=30.0)
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach YouTube: {exc}") from exc
    if resp.status_code >= 400:
        raise YouTubeError(_friendly(resp))
    return resp.json()


def my_channel(access_token: str) -> dict:
    """The signed-in account's channel: {channel_id, title, handle, thumbnail, subscribers}."""
    data = _get(access_token, "channels", {"part": "snippet,statistics", "mine": "true"})
    items = data.get("items") or []
    if not items:
        raise YouTubeError("This Google account has no YouTube channel yet — create one on youtube.com, then connect again.")
    ch = items[0]
    sn = ch.get("snippet") or {}
    st = ch.get("statistics") or {}
    return {
        "channel_id": ch.get("id", ""),
        "title": sn.get("title", ""),
        "handle": sn.get("customUrl", ""),  # "@sokhacoffee"
        "thumbnail": ((sn.get("thumbnails") or {}).get("default") or {}).get("url", ""),
        "subscribers": int(st.get("subscriberCount") or 0) if not st.get("hiddenSubscriberCount") else None,
    }


def title_for(title: str, caption: str) -> str:
    """The video's title: the post's own, else the caption's first line — at
    most 100 characters, without the angle brackets YouTube refuses."""
    text = (title or "").strip() or next((ln.strip() for ln in (caption or "").splitlines() if ln.strip()), "") or "New video"
    text = text.replace("<", "").replace(">", "")
    return text if len(text) <= TITLE_MAX else text[: TITLE_MAX - 1].rstrip() + "…"


def upload_video(access_token: str, data: bytes, title: str, description: str, short: bool = False, privacy: str = "public") -> str:
    """Upload one video (resumable: the metadata, then the bytes in one go).
    Returns the new video's id. ``short``: a vertical clip ≤ 3 min — #Shorts is
    added to the description so YouTube files it with the Shorts."""
    description = (description or "").replace("<", "").replace(">", "")
    if short and "#shorts" not in description.lower():
        description = f"{description.rstrip()}\n\n#Shorts".strip()
    meta = {
        "snippet": {"title": title, "description": description[:DESCRIPTION_MAX], "categoryId": "22"},  # People & Blogs
        "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
    }
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        start = httpx.post(
            UPLOAD_URL,
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={**headers, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*", "X-Upload-Content-Length": str(len(data))},
            json=meta,
            timeout=30.0,
        )
        if start.status_code >= 400:
            raise YouTubeError(_friendly(start))
        session = start.headers.get("Location")
        if not session:
            raise YouTubeError("YouTube didn't open an upload session — try again.")
        done = httpx.put(session, content=data, headers={**headers, "Content-Type": "video/*"}, timeout=600.0)
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach YouTube: {exc}") from exc
    if done.status_code >= 400:
        raise YouTubeError(_friendly(done))
    video_id = (done.json() or {}).get("id")
    if not video_id:
        raise YouTubeError("YouTube took the upload but returned no video id.")
    return video_id


THUMB_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
THUMB_MAX_BYTES = 2 * 1024 * 1024  # YouTube's limit


def thumbnail_jpeg(data: bytes) -> bytes:
    """Any picture → a 1280×720 JPEG under 2 MB, as YouTube wants (centre-cropped
    to 16:9, so a square or tall picture still fills the frame)."""
    import io

    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageOps.fit(img, (1280, 720), method=Image.LANCZOS, centering=(0.5, 0.45))
    for quality in (90, 82, 74, 66):
        out = io.BytesIO()
        img.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
        if out.tell() <= THUMB_MAX_BYTES:
            return out.getvalue()
    return out.getvalue()


def set_thumbnail(access_token: str, video_id: str, image: bytes) -> None:
    """Put a custom thumbnail on an uploaded video. YouTube allows it only on
    channels with a verified phone number (youtube.com/verify)."""
    try:
        resp = httpx.post(
            THUMB_URL,
            params={"videoId": video_id},
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "image/jpeg"},
            content=thumbnail_jpeg(image),
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach YouTube: {exc}") from exc
    if resp.status_code >= 400:
        text = _explain(resp)
        if resp.status_code == 403 or "permission" in text.lower():
            raise YouTubeError(
                "YouTube allows custom thumbnails only on verified channels — verify the channel's phone number at youtube.com/verify, then set it in YouTube Studio."
            )
        raise YouTubeError(text)


def video_url(video_id: str, short: bool = False) -> str:
    return f"https://www.youtube.com/shorts/{video_id}" if short else f"https://youtu.be/{video_id}"


_REJECTED = {
    "duplicate": "YouTube says this video was already uploaded.",
    "copyright": "YouTube rejected it over copyright.",
    "claim": "YouTube rejected it — a copyright claim.",
    "inappropriate": "YouTube rejected it as inappropriate.",
    "length": "YouTube rejected it — the video is too long for this account.",
    "termsOfUse": "YouTube rejected it — it breaks the terms of use.",
    "trademark": "YouTube rejected it over a trademark.",
    "legal": "YouTube rejected it for a legal reason.",
    "uploaderAccountClosed": "The YouTube account is closed.",
    "uploaderAccountSuspended": "The YouTube account is suspended.",
}
_FAILED = {
    "codec": "YouTube couldn't read the video's format.",
    "conversion": "YouTube couldn't convert the video.",
    "emptyFile": "The uploaded file was empty.",
    "invalidFile": "YouTube says the file isn't a valid video.",
    "tooSmall": "The video is too small for YouTube.",
    "uploadAborted": "The upload was interrupted.",
}


def video_state(access_token: str, video_id: str) -> dict:
    """Has YouTube finished with an uploaded video?  {"state": ..., "why": ...}
    state: "ready" (processed — it's up) · "processing" (still working on it —
    longer videos take minutes) · "failed" (rejected / couldn't be processed —
    why says in plain words) · "missing" (YouTube has no such video).
    Costs 1 quota unit."""
    data = _get(access_token, "videos", {"part": "status,processingDetails", "id": video_id})
    items = data.get("items") or []
    if not items:
        return {"state": "missing", "why": "YouTube has no video with this id — it may have been deleted."}
    st = items[0].get("status") or {}
    pd = items[0].get("processingDetails") or {}
    upload = st.get("uploadStatus", "")
    proc = pd.get("processingStatus", "")
    if upload == "rejected":
        return {"state": "failed", "why": _REJECTED.get(st.get("rejectionReason", ""), "YouTube rejected the video.")}
    if upload == "failed" or proc in ("failed", "terminated"):
        return {"state": "failed", "why": _FAILED.get(st.get("failureReason", ""), "YouTube couldn't process the video.")}
    if upload == "deleted":
        return {"state": "failed", "why": "The video was deleted on YouTube."}
    if upload == "processed" and proc in ("", "succeeded"):
        return {"state": "ready", "why": ""}
    return {"state": "processing", "why": ""}


def video_insights(access_token: str, video_id: str) -> dict:
    """views / likes / comments for one video, and whether it's still private."""
    data = _get(access_token, "videos", {"part": "statistics,status", "id": video_id})
    items = data.get("items") or []
    if not items:
        return {"status": "unavailable", "note": "YouTube has no video with this id — it may have been deleted.", "metrics": {}}
    v = items[0]
    st = v.get("statistics") or {}
    privacy = (v.get("status") or {}).get("privacyStatus", "")
    out = {
        "status": "ok",
        "metrics": {
            "views": int(st.get("viewCount") or 0),
            "likes": int(st.get("likeCount") or 0),
            "comments": int(st.get("commentCount") or 0),
        },
        "note": "",
    }
    if privacy == "private":
        out["note"] = "This video is Private on YouTube — until Google approves the app, uploads stay private. Make it Public in YouTube Studio."
    return out
