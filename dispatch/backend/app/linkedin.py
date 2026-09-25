"""LinkedIn — OAuth connect (personal profile) and publishing via the
LinkedIn Posts API.

Setup: create an app at https://www.linkedin.com/developers/apps, add the
"Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn"
products (both self-serve — auto-approved, no partner review) and register
``LINKEDIN_REDIRECT_URI`` (must be a static https url) as an authorized
redirect URL. Put ``LINKEDIN_CLIENT_ID`` / ``LINKEDIN_CLIENT_SECRET`` /
``LINKEDIN_REDIRECT_URI`` in ``.env`` — see ``app/views.py``'s
``/oauth/linkedin/*`` endpoints for the connect flow and
``app/publishers.py`` for where a scheduled post actually gets sent.

This only posts to the connected person's own LinkedIn feed. Posting to a
Company Page instead needs LinkedIn's Community Management API, which
requires manual partner approval from LinkedIn — a separate, much slower
process, not built here.

LinkedIn's access tokens (~60 days) have no refresh flow under this product
set — once one expires, the channel needs reconnecting, same as a Meta user
token would if it weren't refreshed.

Flow:
  1. ``authorize_url()`` — the person logs into LinkedIn and approves the app.
  2. ``exchange_code()`` -> access token.
  3. ``fetch_member()`` -> the person's LinkedIn member id (``sub``) and
     display name, via the OpenID Connect userinfo endpoint.
  4. ``publish_post()`` — text-only, or with one image/video attached
     (LinkedIn requires media to be uploaded via its own asset-registration
     step first, not a direct multipart post).
"""

from __future__ import annotations

from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
API_BASE = "https://api.linkedin.com/rest"
SCOPES = "openid profile w_member_social"


class LinkedInError(RuntimeError):
    pass


def _conf() -> tuple[str, str, str]:
    s = get_settings()
    if not s.linkedin_client_id or not s.linkedin_client_secret or not s.linkedin_redirect_uri:
        raise LinkedInError(
            "LinkedIn is not configured (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / "
            "LINKEDIN_REDIRECT_URI missing)."
        )
    return s.linkedin_client_id, s.linkedin_client_secret, s.linkedin_redirect_uri


def _explain(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        return body.get("message") or str(body)[:300]
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


def authorize_url(state: str) -> str:
    client_id, _secret, redirect_uri = _conf()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": SCOPES,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> str:
    """Trade an OAuth ``code`` (from the callback) for an access token."""
    client_id, secret, redirect_uri = _conf()
    try:
        resp = httpx.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "client_secret": secret,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the code: {_explain(resp)}")
    token = resp.json().get("access_token")
    if not token:
        raise LinkedInError("LinkedIn did not return an access token.")
    return token


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


def _register_image_upload(access_token: str, person_urn: str) -> tuple[str, str]:
    try:
        resp = httpx.post(
            f"{API_BASE}/images?action=initializeUpload",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json={"initializeUploadRequest": {"owner": person_urn}},
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


def _register_video_upload(access_token: str, person_urn: str, size: int) -> tuple[str, str]:
    try:
        resp = httpx.post(
            f"{API_BASE}/videos?action=initializeUpload",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json={
                "initializeUploadRequest": {
                    "owner": person_urn,
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
    # Single-part upload only — fine for the short AI-generated clips this
    # portal renders; a much longer/heavier video would need multi-part.
    return instructions[0]["uploadUrl"], video_urn


def _upload_image(access_token: str, person_urn: str, media: bytes) -> str:
    upload_url, image_urn = _register_image_upload(access_token, person_urn)
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
        raise LinkedInError(f"LinkedIn rejected the image bytes: {put_resp.text[:300]}")
    return image_urn


def _upload_video(access_token: str, person_urn: str, media: bytes) -> str:
    upload_url, video_urn = _register_video_upload(access_token, person_urn, len(media))
    try:
        put_resp = httpx.put(
            upload_url,
            headers={"Authorization": f"Bearer {access_token}"},
            content=media,
            timeout=180.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not upload the video to LinkedIn: {exc}") from exc
    if put_resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the video bytes: {put_resp.text[:300]}")
    etag = put_resp.headers.get("ETag") or put_resp.headers.get("etag")
    try:
        fin_resp = httpx.post(
            f"{API_BASE}/videos?action=finalizeUpload",
            headers={**_rest_headers(access_token), "Content-Type": "application/json"},
            json={
                "finalizeUploadRequest": {
                    "video": video_urn,
                    "uploadedPartIds": [etag] if etag else [],
                }
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LinkedInError(f"Could not reach LinkedIn: {exc}") from exc
    if fin_resp.status_code >= 400:
        raise LinkedInError(f"LinkedIn rejected the video finalize step: {_explain(fin_resp)}")
    return video_urn


def publish_post(
    access_token: str, person_sub: str, caption: str, media: bytes | None, kind: str | None
) -> str:
    """Post to the connected person's own LinkedIn feed — text-only, or with
    one image/video attached. Returns the post's urn."""
    person_urn = f"urn:li:person:{person_sub}"
    body: dict = {
        "author": person_urn,
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
            asset_urn = _upload_image(access_token, person_urn, media)
            body["content"] = {"media": {"id": asset_urn}}
        else:
            asset_urn = _upload_video(access_token, person_urn, media)
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
