"""Facebook Pages + Instagram — OAuth connect (Facebook Login) and publishing
via the Meta Graph API.

Setup: create an app at https://developers.facebook.com, add the "Facebook
Login for Business" product, and register ``META_REDIRECT_URI`` (must be a
static https url — for local dev, tunnel this backend and point the tunnel's
callback there) as a valid OAuth redirect. Put ``META_APP_ID`` /
``META_APP_SECRET`` / ``META_REDIRECT_URI`` in ``.env``. While the app is in
Development mode you can only post to Pages your own Meta account
administers — posting to a client's Page needs them added as a tester, or App
Review for ``pages_manage_posts`` / ``instagram_content_publish``.

Facebook Pages accept a direct byte upload (this module posts bytes straight
to Graph). Instagram's Content Publishing API does not — it always fetches
the media from a public url, so Instagram posting needs ``PUBLIC_BASE_URL``
set to this backend's own public https address.

Flow (see ``app/views.py``'s ``/oauth/meta/*`` endpoints):
  1. ``authorize_url()`` — the user logs into Facebook and picks which Pages
     to grant the app.
  2. ``exchange_code()`` -> short-lived user token -> ``long_lived_token()``
     -> a ~60 day user token.
  3. ``list_pages()`` — every Page the user manages, each with its own
     (effectively non-expiring, per Meta) Page access token and linked
     Instagram Business Account if any.
  4. The user picks one Page (and optionally its Instagram) in the UI; the
     confirm endpoint stores that Page's token on the brand's Channel(s).
"""

from __future__ import annotations

import time
import uuid
from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTH_HOST = "https://www.facebook.com"
GRAPH_HOST = "https://graph.facebook.com"

# business_management: Meta requires it for Instagram-with-Facebook-login, and
# without it Pages owned by a Business portfolio can be missing from /me/accounts.
# Every scope here must also be added to the app (Use cases → Customize →
# Permissions), or Facebook's dialog reports it as an "Invalid Scope".
SCOPES = (
    "pages_show_list,pages_read_engagement,pages_manage_posts,"
    "pages_manage_metadata,instagram_basic,instagram_content_publish,"
    "business_management"
)

# In-memory holding pen between the OAuth callback and the "pick a Page"
# confirm step. Raw Page tokens live only here and in the database — never in
# a url or the browser. Single-process app, so plain process memory is fine;
# it's lost (harmlessly — the user just reconnects) on a restart.
_PENDING_TTL_SECONDS = 600
_pending: dict[str, dict] = {}


class MetaError(RuntimeError):
    pass


def _conf() -> tuple[str, str, str, str]:
    s = get_settings()
    if not s.meta_app_id or not s.meta_app_secret or not s.meta_redirect_uri:
        raise MetaError(
            "Facebook/Instagram is not configured (META_APP_ID / META_APP_SECRET / "
            "META_REDIRECT_URI missing)."
        )
    return s.meta_app_id, s.meta_app_secret, s.meta_redirect_uri, s.meta_graph_version


def _explain(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error") or {}
        if isinstance(err, dict):
            return err.get("message") or err.get("type") or resp.text[:300]
        return str(err)[:300]
    except ValueError:
        return resp.text[:300] or f"HTTP {resp.status_code}"


def authorize_url(state: str) -> str:
    app_id, _secret, redirect_uri, version = _conf()
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "response_type": "code",
        "scope": SCOPES,
    }
    return f"{AUTH_HOST}/{version}/dialog/oauth?{urlencode(params)}"


def exchange_code(code: str) -> str:
    """Trade an OAuth code for a short-lived user access token."""
    app_id, secret, redirect_uri, version = _conf()
    try:
        resp = httpx.get(
            f"{GRAPH_HOST}/{version}/oauth/access_token",
            params={
                "client_id": app_id,
                "redirect_uri": redirect_uri,
                "client_secret": secret,
                "code": code,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Facebook: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Facebook rejected the code: {_explain(resp)}")
    token = resp.json().get("access_token")
    if not token:
        raise MetaError("Facebook did not return an access token.")
    return token


def long_lived_token(short_token: str) -> str:
    app_id, secret, _redirect, version = _conf()
    try:
        resp = httpx.get(
            f"{GRAPH_HOST}/{version}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": secret,
                "fb_exchange_token": short_token,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Facebook: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Could not get a long-lived token: {_explain(resp)}")
    token = resp.json().get("access_token")
    if not token:
        raise MetaError("Facebook did not return a long-lived token.")
    return token


def list_pages(user_token: str) -> list[dict]:
    """Every Page this user manages, with its own Page token + linked IG account."""
    _app_id, _secret, _redirect, version = _conf()
    try:
        resp = httpx.get(
            f"{GRAPH_HOST}/{version}/me/accounts",
            params={
                "fields": "id,name,access_token,instagram_business_account{id,username}",
                "access_token": user_token,
                "limit": 100,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Facebook: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Could not list Pages: {_explain(resp)}")
    out = []
    for row in resp.json().get("data") or []:
        ig = row.get("instagram_business_account") or {}
        out.append(
            {
                "id": row["id"],
                "name": row.get("name") or row["id"],
                "access_token": row.get("access_token"),
                "ig_user_id": ig.get("id"),
                "ig_username": ig.get("username"),
            }
        )
    return out


def stash_pending(brand_id: int, intent: str, pages: list[dict]) -> str:
    """Hold a fetched Page list server-side; returns the opaque id the
    frontend uses to fetch and later confirm — raw tokens never leave here."""
    pending_id = uuid.uuid4().hex
    _pending[pending_id] = {
        "brand_id": brand_id,
        "intent": intent,
        "pages": pages,
        "expires": time.time() + _PENDING_TTL_SECONDS,
    }
    _gc_pending()
    return pending_id


def _gc_pending() -> None:
    now = time.time()
    for key in [k for k, v in _pending.items() if v["expires"] < now]:
        _pending.pop(key, None)


def peek_pending(pending_id: str) -> dict | None:
    _gc_pending()
    return _pending.get(pending_id)


def pop_pending(pending_id: str) -> dict | None:
    _gc_pending()
    return _pending.pop(pending_id, None)


def publish_to_page(
    token: str, page_id: str, caption: str, media: bytes | None, kind: str | None
) -> str:
    """Post to a Facebook Page — text-only feed post, or a photo/video upload."""
    _app_id, _secret, _redirect, version = _conf()
    if media is None:
        url = f"{GRAPH_HOST}/{version}/{page_id}/feed"
        data = {"message": caption, "access_token": token}
        files = None
    elif kind == "image":
        url = f"{GRAPH_HOST}/{version}/{page_id}/photos"
        data = {"caption": caption, "access_token": token}
        files = {"source": ("media.jpg", media)}
    else:
        url = f"{GRAPH_HOST}/{version}/{page_id}/videos"
        data = {"description": caption, "access_token": token}
        files = {"source": ("media.mp4", media)}
    try:
        resp = httpx.post(url, data=data, files=files, timeout=180.0)
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Facebook: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Facebook rejected the post: {_explain(resp)}")
    body = resp.json()
    return body.get("post_id") or body.get("id") or ""


_IG_POLL_TRIES = 20
_IG_POLL_DELAY = 3.0


def publish_to_instagram(token: str, ig_user_id: str, caption: str, media_url: str, kind: str) -> str:
    """Create a media container from a public url, wait it out if it's a
    video, then publish it. Returns the published media id."""
    _app_id, _secret, _redirect, version = _conf()
    params = {"access_token": token, "caption": caption}
    if kind == "image":
        params["image_url"] = media_url
    else:
        params["video_url"] = media_url
        params["media_type"] = "REELS"
    try:
        resp = httpx.post(f"{GRAPH_HOST}/{version}/{ig_user_id}/media", data=params, timeout=60.0)
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Instagram: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Instagram rejected the post: {_explain(resp)}")
    creation_id = resp.json().get("id")
    if not creation_id:
        raise MetaError("Instagram did not return a container id.")

    if kind != "image":
        for _ in range(_IG_POLL_TRIES):
            try:
                status_resp = httpx.get(
                    f"{GRAPH_HOST}/{version}/{creation_id}",
                    params={"fields": "status_code", "access_token": token},
                    timeout=30.0,
                )
            except httpx.HTTPError as exc:
                raise MetaError(f"Could not reach Instagram: {exc}") from exc
            status = (status_resp.json() or {}).get("status_code")
            if status == "FINISHED":
                break
            if status in {"ERROR", "EXPIRED"}:
                raise MetaError(f"Instagram could not process the video (status: {status}).")
            time.sleep(_IG_POLL_DELAY)
        else:
            raise MetaError("Instagram is still processing the video — try publishing again shortly.")

    try:
        pub_resp = httpx.post(
            f"{GRAPH_HOST}/{version}/{ig_user_id}/media_publish",
            data={"creation_id": creation_id, "access_token": token},
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Instagram: {exc}") from exc
    if pub_resp.status_code >= 400:
        raise MetaError(f"Instagram rejected the publish: {_explain(pub_resp)}")
    return pub_resp.json().get("id") or ""


# ── insights — per-post numbers for the Insights page ────────────────────
def page_post_insights(token: str, post_id: str) -> dict:
    """Likes / comments / shares for one Facebook Page post (or the video
    node when it was posted as a video — same fields apply)."""
    _app_id, _secret, _redirect, version = _conf()
    try:
        resp = httpx.get(
            f"{GRAPH_HOST}/{version}/{post_id}",
            params={
                "fields": "likes.summary(true).limit(0),comments.summary(true).limit(0),"
                "shares,permalink_url",
                "access_token": token,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Facebook: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Could not read that post's numbers: {_explain(resp)}")
    body = resp.json()
    return {
        "likes": (body.get("likes") or {}).get("summary", {}).get("total_count", 0),
        "comments": (body.get("comments") or {}).get("summary", {}).get("total_count", 0),
        "shares": (body.get("shares") or {}).get("count", 0),
        "url": body.get("permalink_url"),
    }


def instagram_media_insights(token: str, media_id: str) -> dict:
    """Likes / comments for one Instagram media item."""
    _app_id, _secret, _redirect, version = _conf()
    try:
        resp = httpx.get(
            f"{GRAPH_HOST}/{version}/{media_id}",
            params={"fields": "like_count,comments_count,permalink", "access_token": token},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Instagram: {exc}") from exc
    if resp.status_code >= 400:
        raise MetaError(f"Could not read that post's numbers: {_explain(resp)}")
    body = resp.json()
    return {
        "likes": body.get("like_count", 0),
        "comments": body.get("comments_count", 0),
        "url": body.get("permalink"),
    }
