"""LinkedIn — OAuth connect (personal profile or Company Page) and publishing
via the LinkedIn Posts API.

Setup: create an app at https://www.linkedin.com/developers/apps, add the
"Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn"
products (both self-serve — auto-approved, no partner review) and register
``LINKEDIN_REDIRECT_URI`` (must be a static https url) as an authorized
redirect URL. Put ``LINKEDIN_CLIENT_ID`` / ``LINKEDIN_CLIENT_SECRET`` /
``LINKEDIN_REDIRECT_URI`` in ``.env`` — see ``app/views.py``'s
``/oauth/linkedin/*`` endpoints for the connect flow and
``app/publishers.py`` for where a scheduled post actually gets sent.

Two kinds of LinkedIn channel, from two LinkedIn apps:

- **profile** — the person's own feed (``urn:li:person:{sub}``), from the app
  above. Its tokens (~60 days) have no refresh flow — once one expires, the
  channel needs reconnecting.
- **page** — a Company Page the person administers
  (``urn:li:organization:{id}``), from a second app that has only the
  Community Management API (LinkedIn allows no other product beside it):
  ``LINKEDIN_PAGES_CLIENT_ID`` / ``LINKEDIN_PAGES_CLIENT_SECRET``, with the same
  callback url registered on it. After the sign-in the person picks which of
  their Pages to connect (like Facebook's Page picker); each becomes its own
  channel. Page posts are the only LinkedIn posts whose numbers apps can read
  (``post_stats``), and these tokens refresh when LinkedIn returns a refresh
  token.

Flow:
  1. ``authorize_url()`` — the person logs into LinkedIn and approves the app.
  2. ``exchange_code()`` -> access token.
  3. profile: ``fetch_member()`` -> the person's LinkedIn member id (``sub``)
     and display name, via the OpenID Connect userinfo endpoint.
     page: ``list_admin_pages()`` -> the Pages they administer, held by
     ``stash_pending()`` until they pick.
  4. ``publish_post()`` — text-only, or with one image/video attached
     (LinkedIn requires media to be uploaded via its own asset-registration
     step first, not a direct multipart post).
"""

from __future__ import annotations

import time
import uuid
from urllib.parse import quote, urlencode

import httpx

from app.config import get_settings

AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
API_BASE = "https://api.linkedin.com/rest"
SCOPES = "openid profile w_member_social"
# Refresh a Page token this long before it runs out.
_REFRESH_SKEW_SECONDS = 24 * 3600
# Page roles that may post for the Page.
_POSTING_ROLES = {"ADMINISTRATOR", "CONTENT_ADMINISTRATOR"}


class LinkedInError(RuntimeError):
    pass


def _conf(kind: str = "profile") -> tuple[str, str, str]:
    s = get_settings()
    if kind == "page":
        if not s.linkedin_pages_client_id or not s.linkedin_pages_client_secret or not s.linkedin_redirect_uri:
            raise LinkedInError(
                "LinkedIn Company Pages are not configured (LINKEDIN_PAGES_CLIENT_ID / "
                "LINKEDIN_PAGES_CLIENT_SECRET / LINKEDIN_REDIRECT_URI missing)."
            )
        return s.linkedin_pages_client_id, s.linkedin_pages_client_secret, s.linkedin_redirect_uri
    if not s.linkedin_client_id or not s.linkedin_client_secret or not s.linkedin_redirect_uri:
        raise LinkedInError(
            "LinkedIn is not configured (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / "
            "LINKEDIN_REDIRECT_URI missing)."
        )
    return s.linkedin_client_id, s.linkedin_client_secret, s.linkedin_redirect_uri


def _explain(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        # "Invalid param. Please see errorDetails…" — say what the details are
        details = body.get("errorDetails")
        msg = body.get("message") or ""
        if details:
            msg = f"{msg} {str(details)[:300]}".strip()
        return msg or str(body)[:300]
    except ValueError:
        return resp.text[:300] or f"HTTP {resp.status_code}"


def _rest_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        # LinkedIn versions its REST API by calendar month and retires each one
        # after ~a year — pinned via settings (LINKEDIN_API_VERSION).
        "LinkedIn-Version": get_settings().linkedin_api_version,
        "X-Restli-Protocol-Version": "2.0.0",
    }


def authorize_url(state: str, kind: str = "profile") -> str:
    client_id, _secret, redirect_uri = _conf(kind)
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": get_settings().linkedin_pages_scopes if kind == "page" else SCOPES,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def _token_request(data: dict, kind: str) -> dict:
    """POST to LinkedIn's token endpoint; returns the token fields a channel
    keeps: access_token, expires_at, and refresh_token (+ its expiry) when given."""
    client_id, secret, _redirect = _conf(kind)
    try:
        resp = httpx.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={**data, "client_id": client_id, "client_secret": secret},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the sign-in: {_explain(resp)}")
    body = resp.json()
    if not body.get("access_token"):
        raise LinkedInError("LinkedIn did not return an access token.")
    now = time.time()
    fields = {"access_token": body["access_token"], "expires_at": now + float(body.get("expires_in") or 0)}
    if body.get("refresh_token"):
        fields["refresh_token"] = body["refresh_token"]
        fields["refresh_expires_at"] = now + float(body.get("refresh_token_expires_in") or 0)
    return fields


def exchange_code(code: str, kind: str = "profile") -> dict:
    """Trade an OAuth ``code`` (from the callback) for the token fields."""
    _id, _secret, redirect_uri = _conf(kind)
    return _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}, kind)


def ensure_access_token(config: dict) -> tuple[str, dict | None]:
    """A live access token for this channel, refreshing a Page token first when
    it's near expiry. Returns (token, updated_config) — updated_config is None
    when nothing changed, else the caller saves it onto the channel."""
    token = config.get("access_token")
    if not token:
        raise LinkedInError("LinkedIn channel is missing its connection — reconnect it.")
    expires_at = float(config.get("expires_at") or 0)
    if not expires_at or expires_at - time.time() > _REFRESH_SKEW_SECONDS:
        return token, None
    refresh = config.get("refresh_token")
    if not refresh or float(config.get("refresh_expires_at") or 0) < time.time():
        if expires_at > time.time():
            return token, None  # can't refresh, but it still works for now
        raise LinkedInError("LinkedIn connection expired — reconnect this channel.")
    fresh = _token_request({"grant_type": "refresh_token", "refresh_token": refresh}, config.get("kind") or "profile")
    return fresh["access_token"], {**config, **fresh}


def author_urn(config: dict) -> str:
    """Who a channel's posts are from: its Company Page, else the person."""
    if config.get("org_id"):
        return f"urn:li:organization:{config['org_id']}"
    if config.get("person_sub"):
        return f"urn:li:person:{config['person_sub']}"
    raise LinkedInError("LinkedIn channel is missing its connection — reconnect it.")


def _rest_get(access_token: str, url: str) -> dict:
    try:
        resp = httpx.get(url, headers=_rest_headers(access_token), timeout=30.0)
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn refused the request: {_explain(resp)}")
    return resp.json()


def list_admin_pages(access_token: str) -> list[dict]:
    """The Company Pages the signed-in person may post for — [{id, name,
    vanity}], from their approved Page roles."""
    ids: list[str] = []
    start = 0
    while True:
        body = _rest_get(
            access_token, f"{API_BASE}/organizationAcls?q=roleAssignee&state=APPROVED&start={start}&count=100"
        )
        elements = body.get("elements") or []
        for el in elements:
            org = str(el.get("organization") or "")
            if el.get("role") in _POSTING_ROLES and org.startswith("urn:li:organization:"):
                org_id = org.rsplit(":", 1)[-1]
                if org_id not in ids:
                    ids.append(org_id)
        if len(elements) < 100 or start >= 900:
            break
        start += 100
    pages = []
    for org_id in ids:
        try:
            org = _rest_get(access_token, f"{API_BASE}/organizations/{org_id}")
        except LinkedInError:
            org = {}
        pages.append(
            {
                "id": org_id,
                "name": org.get("localizedName") or f"LinkedIn Page {org_id}",
                "vanity": org.get("vanityName") or "",
            }
        )
    return pages


# Page lists between the sign-in and the person's pick, held server-side so
# the token never reaches the browser (same as app/meta.py's).
_PENDING_TTL_SECONDS = 900
_pending: dict[str, dict] = {}


def _gc_pending() -> None:
    now = time.time()
    for key in [k for k, v in _pending.items() if v["expires"] < now]:
        _pending.pop(key, None)


def stash_pending(brand_id: int, token: dict, pages: list[dict]) -> str:
    pending_id = uuid.uuid4().hex
    _pending[pending_id] = {
        "brand_id": brand_id,
        "token": token,
        "pages": pages,
        "expires": time.time() + _PENDING_TTL_SECONDS,
    }
    _gc_pending()
    return pending_id


def peek_pending(pending_id: str) -> dict | None:
    _gc_pending()
    return _pending.get(pending_id)


def pop_pending(pending_id: str) -> dict | None:
    _gc_pending()
    return _pending.pop(pending_id, None)


def post_url(post_urn: str) -> str | None:
    return f"https://www.linkedin.com/feed/update/{post_urn}/" if post_urn else None


def post_stats(access_token: str, org_id: str, post_urn: str) -> dict:
    """A Company Page post's numbers: {likes, comments, shares, views, clicks}
    (``views`` = LinkedIn's impressions)."""
    kind = "ugcPosts" if post_urn.startswith("urn:li:ugcPost:") else "shares"
    org = quote(f"urn:li:organization:{org_id}", safe="")
    url = (
        f"{API_BASE}/organizationalEntityShareStatistics?q=organizationalEntity"
        f"&organizationalEntity={org}&{kind}=List({quote(post_urn, safe='')})"
    )
    elements = _rest_get(access_token, url).get("elements") or []
    totals = (elements[0].get("totalShareStatistics") or {}) if elements else {}
    return {
        "likes": totals.get("likeCount", 0),
        "comments": totals.get("commentCount", 0),
        "shares": totals.get("shareCount", 0),
        "views": totals.get("impressionCount", 0),
        "clicks": totals.get("clickCount", 0),
    }


def fetch_member(access_token: str) -> dict:
    """The connected person's LinkedIn member id + display name, via OpenID
    Connect userinfo. ``sub`` is the id half of their ``urn:li:person:{sub}``
    — the author urn every post/upload call needs."""
    try:
        resp = httpx.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"Could not read the LinkedIn profile: {_explain(resp)}")
    body = resp.json()
    sub = body.get("sub")
    if not sub:
        raise LinkedInError("LinkedIn did not return a member id.")
    return {"sub": sub, "name": body.get("name") or "LinkedIn member"}


def _register_image_upload(access_token: str, owner: str) -> tuple[str, str]:
    try:
        resp = httpx.post(
            f"{API_BASE}/images?action=initializeUpload",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json={"initializeUploadRequest": {"owner": owner}},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the image upload: {_explain(resp)}")
    value = resp.json().get("value") or {}
    upload_url, image_urn = value.get("uploadUrl"), value.get("image")
    if not upload_url or not image_urn:
        raise LinkedInError("LinkedIn did not return an image upload url.")
    return upload_url, image_urn


def _register_video_upload(access_token: str, owner: str, size: int) -> tuple[list[dict], str, str]:
    try:
        resp = httpx.post(
            f"{API_BASE}/videos?action=initializeUpload",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json={
                "initializeUploadRequest": {
                    "owner": owner,
                    "fileSizeBytes": size,
                    "uploadCaptions": False,
                    "uploadThumbnail": False,
                }
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the video upload: {_explain(resp)}")
    value = resp.json().get("value") or {}
    instructions = value.get("uploadInstructions") or []
    video_urn = value.get("video")
    if not instructions or not video_urn:
        raise LinkedInError("LinkedIn did not return a video upload url.")
    # LinkedIn splits anything over 4 MB into ~4 MB parts — one upload url
    # per byte range (firstByte..lastByte, inclusive). The finalize step must send
    # back the upload token it gave ("" too) — without it: "Invalid param".
    return instructions, video_urn, value.get("uploadToken") or ""


def _upload_image(access_token: str, owner: str, media: bytes) -> str:
    upload_url, image_urn = _register_image_upload(access_token, owner)
    try:
        put_resp = httpx.put(
            upload_url,
            headers={"Authorization": f"Bearer {access_token}"},
            content=media,
            timeout=120.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not upload the image to LinkedIn: {exc}") from exc
    if put_resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the image bytes (HTTP {put_resp.status_code}): {put_resp.text[:300]}")
    return image_urn


def _upload_video(access_token: str, owner: str, media: bytes) -> str:
    instructions, video_urn, upload_token = _register_video_upload(access_token, owner, len(media))
    part_ids: list[str] = []
    for part in instructions:
        first = int(part.get("firstByte") or 0)
        last = int(part["lastByte"]) if part.get("lastByte") is not None else len(media) - 1
        try:
            put_resp = httpx.put(
                part["uploadUrl"],
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/octet-stream"},
                content=media[first : last + 1],
                timeout=180.0,
            )
        except httpx.HTTPError as exc:
            raise LinkedInError(f"Could not upload the video to LinkedIn: {exc}") from exc
        if put_resp.status_code >= 400:
            raise LinkedInError(
                f"LinkedIn rejected the video bytes (HTTP {put_resp.status_code}, part "
                f"{len(part_ids) + 1}/{len(instructions)}): {put_resp.text[:300]}"
            )
        etag = put_resp.headers.get("ETag") or put_resp.headers.get("etag")
        if not etag:
            raise LinkedInError("LinkedIn did not confirm a video part upload.")
        part_ids.append(etag)
    try:
        fin_resp = httpx.post(
            f"{API_BASE}/videos?action=finalizeUpload",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json={
                "finalizeUploadRequest": {
                    "video": video_urn,
                    "uploadToken": upload_token,
                    "uploadedPartIds": part_ids,
                }
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if fin_resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the video finalize step: {_explain(fin_resp)}")
    return video_urn


def delete_post(access_token: str, post_urn: str) -> bool:
    """Delete one of the channel's own posts (the person's or the Page's).
    Returns False when LinkedIn says it's already gone. Raises LinkedInError
    otherwise."""
    try:
        resp = httpx.delete(
            f"{API_BASE}/posts/{quote(post_urn, safe='')}",
            headers={**_rest_headers(access_token), "X-RestLi-Method": "DELETE"},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code < 400:
        return True
    if resp.status_code in (404, 410):
        return False
    raise LinkedInError(f"LinkedIn couldn't delete the post: {_explain(resp)}")


def publish_post(
    access_token: str, author: str, caption: str, media: bytes | None, kind: str | None
) -> str:
    """Post as ``author`` (``author_urn()``: a Company Page, or the person's own
    feed) — text-only, or with one image/video attached. Returns the post's urn."""
    body: dict = {
        "author": author,
        "commentary": caption,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if media is not None:
        if kind == "image":
            asset_urn = _upload_image(access_token, author, media)
            body["content"] = {"media": {"id": asset_urn}}
        else:
            asset_urn = _upload_video(access_token, author, media)
            body["content"] = {"media": {"id": asset_urn}}

    try:
        resp = httpx.post(
            f"{API_BASE}/posts",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json=body,
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the post: {_explain(resp)}")
    # A successful create returns the new post's urn in the x-restli-id /
    # x-linkedin-id response header, not the (empty) body.
    return resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id") or ""
