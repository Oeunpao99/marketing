"""The Bakong Open API (National Bank of Cambodia) — confirms a KHQR payment.

``check(md5)`` asks Bakong for the transaction paid with the KHQR whose md5
is given (app/khqr.py md5); ``check_many(md5s)`` asks about many at once (one
request, however many payments are waiting). Bakong answers:

    {"responseCode": 0, "data": {"hash", "fromAccountId", "toAccountId",
     "currency", "amount", "description", "createdDateMs", "acknowledgedDateMs"}}

or responseCode 1 with errorCode 1 when nothing was paid with it yet.

Requests are SCARCE: a token has a daily allowance (100 a day on a new one —
errorCode 17 "Daily request limit … exceeded"). app/payments.py therefore asks
rarely and in batches; and when Bakong says the allowance is used up, every
call waits LIMIT_WAIT_S before trying again (BakongLimit, ``limited_for()``)
instead of spending more requests on a closed door.

The token comes from api-bakong.nbc.gov.kh (BAKONG_API_TOKEN) and is renewed
every ~90 days; BAKONG_API_URL may point at a relay in Cambodia if the API
refuses our server's address. Nothing here decides anything — app/payments.py
checks the account, the currency and the amount before a plan is switched on.
"""

from __future__ import annotations

import logging
import time

import httpx

from app.config import get_settings

log = logging.getLogger("app.bakong")

LIMIT_WAIT_S = 20 * 60  # after "daily limit": try again only this often
_limited_until = 0.0


class BakongError(Exception):
    """Bakong couldn't be asked (no token, refused, down) — the payment stays pending."""


class BakongLimit(BakongError):
    """The token's daily request allowance is used up — nothing is asked until it resets."""


def configured() -> bool:
    s = get_settings()
    return bool(s.bakong_account_id.strip() and s.bakong_api_token.strip() and s.bakong_merchant_name.strip())


def limited_for() -> int:
    """Seconds until we'll ask Bakong again after a daily-limit answer (0 = not limited)."""
    return max(0, round(_limited_until - time.monotonic()))


def _post(path: str, payload) -> dict:
    """One request; the answer's JSON. Raises BakongLimit / BakongError."""
    global _limited_until
    s = get_settings()
    if not s.bakong_api_token.strip():
        raise BakongError("no Bakong API token")
    if limited_for():
        raise BakongLimit(f"Bakong's daily request limit is used up — next try in {limited_for() // 60 + 1} min")
    url = s.bakong_api_url.strip().rstrip("/") + path
    try:
        r = httpx.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {s.bakong_api_token.strip()}", "Content-Type": "application/json"},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise BakongError(f"Bakong unreachable: {exc.__class__.__name__}") from exc
    if r.status_code in (401, 403):
        # an expired token — or our server's address refused (outside Cambodia)
        raise BakongError(f"Bakong refused the request (HTTP {r.status_code}) — token expired or address not allowed")
    try:
        body = r.json()
    except ValueError as exc:
        if r.status_code >= 400:
            raise BakongError(f"Bakong HTTP {r.status_code}") from exc
        raise BakongError("Bakong answered with something that isn't JSON") from exc
    if not isinstance(body, dict):
        raise BakongError("Bakong answered with something unexpected")
    if body.get("errorCode") == 17 or "daily request limit" in str(body.get("responseMessage") or "").lower():
        _limited_until = time.monotonic() + LIMIT_WAIT_S
        log.error("Bakong: %s — asking again in %d min", body.get("responseMessage"), LIMIT_WAIT_S // 60)
        raise BakongLimit(str(body.get("responseMessage") or "Bakong's daily request limit is used up"))
    if r.status_code >= 400 and body.get("errorCode") != 1:
        raise BakongError(f"Bakong HTTP {r.status_code}")
    return body


def check(md5: str) -> dict | None:
    """The paid transaction for this KHQR, or None when it isn't paid (yet)."""
    body = _post("/v1/check_transaction_by_md5", {"md5": md5})
    if body.get("responseCode") == 0 and isinstance(body.get("data"), dict):
        return body["data"]
    if body.get("errorCode") == 1 or (body.get("responseCode") == 1 and body.get("errorCode") is None):
        return None  # not paid yet ("Transaction could not be found")
    # anything else (token problems come back as errorCode 6 and friends)
    raise BakongError(f"Bakong: {body.get('responseMessage') or 'unknown answer'} (error {body.get('errorCode')})")


def check_many(md5s: list[str]) -> dict[str, dict]:
    """{md5: transaction} for those of ``md5s`` that were paid — ONE request for all of
    them (check_transaction_by_md5_list, up to 50). Raises BakongError when the answer
    can't be matched to the codes asked about (the caller then asks one by one)."""
    if not md5s:
        return {}
    body = _post("/v1/check_transaction_by_md5_list", list(md5s)[:50])
    if body.get("responseCode") != 0:
        if body.get("errorCode") == 1:
            return {}  # none of them found
        raise BakongError(f"Bakong: {body.get('responseMessage') or 'unknown answer'} (error {body.get('errorCode')})")
    data = body.get("data")
    if data in (None, [], {}):
        return {}
    if not isinstance(data, list):
        raise BakongError("Bakong's list answer isn't a list")
    out: dict[str, dict] = {}
    for item in data:
        md5 = str(item.get("md5") or "").lower() if isinstance(item, dict) else ""
        if not md5:
            raise BakongError("Bakong's list answer doesn't say which code each payment is for")
        out[md5] = item
    return out
