"""The Bakong Open API (National Bank of Cambodia) — confirms a KHQR payment.

``check(md5)`` asks Bakong for the transaction paid with the KHQR whose md5
is given (app/khqr.py md5). Bakong answers:

    {"responseCode": 0, "data": {"hash", "fromAccountId", "toAccountId",
     "currency", "amount", "description", "createdDateMs", "acknowledgedDateMs"}}

or responseCode 1 with errorCode 1 when nothing was paid with it yet. The token
comes from api-bakong.nbc.gov.kh (BAKONG_API_TOKEN) and is renewed every ~90
days; BAKONG_API_URL may point at a relay in Cambodia if the API refuses our
server's address. Nothing here decides anything — app/payments.py checks the
account, the currency and the amount before a plan is switched on.
"""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

log = logging.getLogger("app.bakong")


class BakongError(Exception):
    """Bakong couldn't be asked (no token, refused, down) — the payment stays pending."""


def configured() -> bool:
    s = get_settings()
    return bool(s.bakong_account_id.strip() and s.bakong_api_token.strip() and s.bakong_merchant_name.strip())


def check(md5: str) -> dict | None:
    """The paid transaction for this KHQR, or None when it isn't paid (yet)."""
    s = get_settings()
    if not s.bakong_api_token.strip():
        raise BakongError("no Bakong API token")
    url = s.bakong_api_url.strip().rstrip("/") + "/v1/check_transaction_by_md5"
    try:
        r = httpx.post(
            url,
            json={"md5": md5},
            headers={"Authorization": f"Bearer {s.bakong_api_token.strip()}", "Content-Type": "application/json"},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise BakongError(f"Bakong unreachable: {exc.__class__.__name__}") from exc
    if r.status_code in (401, 403):
        # an expired token — or our server's address refused (outside Cambodia)
        raise BakongError(f"Bakong refused the request (HTTP {r.status_code}) — token expired or address not allowed")
    if r.status_code >= 400:
        raise BakongError(f"Bakong HTTP {r.status_code}")
    try:
        body = r.json()
    except ValueError as exc:
        raise BakongError("Bakong answered with something that isn't JSON") from exc
    if body.get("responseCode") == 0 and isinstance(body.get("data"), dict):
        return body["data"]
    if body.get("errorCode") == 1 or (body.get("responseCode") == 1 and body.get("errorCode") is None):
        return None  # not paid yet ("Transaction could not be found")
    # anything else (token problems come back as errorCode 6 and friends)
    raise BakongError(f"Bakong: {body.get('responseMessage') or 'unknown answer'} (error {body.get('errorCode')})")
