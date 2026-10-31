"""Facebook boosts through the Marketing API — what the Insights page's
"Approve boost" sends (app/boosts.py holds the routes and the database side).

A boost of a published Page post is four objects in the ad account:
campaign (OUTCOME_ENGAGEMENT) → ad set (the budget, the days, Cambodia 18+)
→ creative (the existing post, by its object_story_id) → ad. Everything is
made PAUSED first and switched on only once all four exist, so a failure half
way never spends money; the half-made campaign is deleted.

The login asks for ads_management + ads_read on top of the Page scopes (the
same Meta app and redirect as the Page connect, intent "ads"). Budgets are in
the account's currency's minor units: only USD accounts are taken.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.meta import AUTH_HOST, GRAPH_HOST, MetaError, _conf

log = logging.getLogger(__name__)

ADS_SCOPES = "ads_management,ads_read,pages_show_list,pages_read_engagement,business_management"
COUNTRY = "KH"
AGE_MIN = 18


def authorize_url(state: str) -> str:
    app_id, _secret, redirect_uri, version = _conf()
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "response_type": "code",
        "scope": ADS_SCOPES,
        "auth_type": "rerequest",
    }
    return f"{AUTH_HOST}/{version}/dialog/oauth?{urlencode(params)}"


def _say(resp: httpx.Response, what: str) -> str:
    """Facebook's own words for a person when it gives them (error_user_msg is
    written for advertisers); the raw error goes to the log only."""
    try:
        err = resp.json().get("error") or {}
    except ValueError:
        err = {}
    log.warning("meta ads: %s failed (%s): %s", what, resp.status_code, str(err or resp.text)[:500])
    msg = err.get("error_user_msg") or err.get("error_user_title") or ""
    if err.get("code") == 190:
        return "Facebook signed this ad account out — connect it again."
    if err.get("code") in (10, 200, 294) or "permission" in (err.get("message") or "").lower():
        return "Facebook didn't allow this — check you have Full control of the ad account and the Page."
    return msg or f"Facebook couldn't {what} — try again in a minute."


def _call(method: str, path: str, token: str, what: str, data: dict | None = None, params: dict | None = None) -> dict:
    _app, _secret, _redirect, version = _conf()
    url = f"{GRAPH_HOST}/{version}/{path}"
    try:
        if method == "GET":
            resp = httpx.get(url, params={**(params or {}), "access_token": token}, timeout=30.0)
        elif method == "DELETE":
            resp = httpx.delete(url, params={"access_token": token}, timeout=30.0)
        else:
            resp = httpx.post(url, data={**(data or {}), "access_token": token}, timeout=30.0)
    except httpx.HTTPError as exc:
        log.warning("meta ads: %s — could not reach Facebook: %s", what, exc)
        raise MetaError("Couldn't reach Facebook — try again in a minute.") from exc
    if resp.status_code >= 400:
        raise MetaError(_say(resp, what))
    try:
        return resp.json()
    except ValueError:
        return {}


def list_ad_accounts(user_token: str) -> list[dict]:
    """The ad accounts this login can use: id ("act_…"), name, currency, and
    whether it can run ads now (account_status 1 = active)."""
    out = []
    body = _call("GET", "me/adaccounts", user_token, "list your ad accounts", params={"fields": "id,name,currency,account_status", "limit": 100})
    for a in body.get("data") or []:
        out.append(
            {
                "id": a.get("id", ""),
                "name": a.get("name") or a.get("id", ""),
                "currency": a.get("currency") or "",
                "active": a.get("account_status") == 1,
            }
        )
    return out


def boost_post(token: str, account_id: str, page_id: str, post_id: str, budget_usd: float, days: int, name: str) -> dict:
    """Boost one published Page post. Returns {campaign_id, adset_id, ad_id,
    ends_at}. Raises MetaError with words for a person."""
    story = post_id if "_" in post_id else f"{page_id}_{post_id}"
    now = datetime.now(UTC)
    ends = now + timedelta(days=days)
    label = f"Smart Marketing boost · {name[:60]}"
    campaign = _call(
        "POST",
        f"{account_id}/campaigns",
        token,
        "create the campaign",
        data={
            "name": label,
            "objective": "OUTCOME_ENGAGEMENT",
            "status": "PAUSED",
            "special_ad_categories": "[]",
            # the budget sits on the ad set, not shared from the campaign
            "is_adset_budget_sharing_enabled": "false",
        },
    )
    cid = campaign.get("id")
    if not cid:
        raise MetaError("Facebook didn't create the campaign — try again in a minute.")
    try:
        adset = _call(
            "POST",
            f"{account_id}/adsets",
            token,
            "set the budget",
            data={
                "name": label,
                "campaign_id": cid,
                "lifetime_budget": str(round(budget_usd * 100)),  # cents of a USD account
                "start_time": now.isoformat(),
                "end_time": ends.isoformat(),
                "billing_event": "IMPRESSIONS",
                "optimization_goal": "POST_ENGAGEMENT",
                "destination_type": "ON_POST",
                "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
                "promoted_object": json.dumps({"page_id": page_id}),
                "targeting": json.dumps({"geo_locations": {"countries": [COUNTRY]}, "age_min": AGE_MIN}),
                "status": "PAUSED",
            },
        )
        creative = _call("POST", f"{account_id}/adcreatives", token, "use the post as the ad", data={"name": label, "object_story_id": story})
        ad = _call(
            "POST",
            f"{account_id}/ads",
            token,
            "create the ad",
            data={"name": label, "adset_id": adset["id"], "creative": json.dumps({"creative_id": creative["id"]}), "status": "PAUSED"},
        )
        # all four exist: switch them on (Facebook reviews the ad before it spends)
        for oid in (ad["id"], adset["id"], cid):
            _call("POST", oid, token, "start the boost", data={"status": "ACTIVE"})
    except (MetaError, KeyError) as exc:
        try:
            _call("DELETE", cid, token, "clean up the half-made campaign")
        except MetaError:
            log.warning("meta ads: campaign %s left behind (paused) after a failed boost", cid)
        if isinstance(exc, KeyError):
            raise MetaError("Facebook didn't finish the boost — try again in a minute.") from exc
        raise
    return {"campaign_id": cid, "adset_id": adset["id"], "ad_id": ad["id"], "ends_at": ends}


# the ad's effective_status → the boost's status on our page
_STATUS = {
    "ACTIVE": "running",
    "PENDING_REVIEW": "in_review",
    "IN_PROCESS": "in_review",
    "PREAPPROVED": "in_review",
    "DISAPPROVED": "rejected",
    "WITH_ISSUES": "rejected",
    "PAUSED": "stopped",
    "ADSET_PAUSED": "stopped",
    "CAMPAIGN_PAUSED": "stopped",
    "ARCHIVED": "stopped",
    "DELETED": "stopped",
}


def read_boost(token: str, ad_id: str, campaign_id: str) -> dict:
    """Where a boost stands now: status, spend ($), reach, clicks, engaged, its
    days (spend / reach per day) and Facebook's reason when it rejected the ad."""
    ad = _call("GET", ad_id, token, "read the boost", params={"fields": "effective_status,ad_review_feedback"})
    status = _STATUS.get(ad.get("effective_status") or "", "running")
    note = ""
    fb = ad.get("ad_review_feedback") or {}
    if status == "rejected" and isinstance(fb, dict):
        reasons = list((fb.get("global") or {}).values())
        note = (reasons[0] if reasons else "Facebook didn't approve this ad.")[:300]
    ins = _call(
        "GET",
        f"{campaign_id}/insights",
        token,
        "read the boost's numbers",
        params={"fields": "spend,reach,clicks,actions", "date_preset": "maximum"},
    )
    row = (ins.get("data") or [{}])[0]
    actions = {a.get("action_type"): int(float(a.get("value") or 0)) for a in row.get("actions") or []}
    # day by day, for the charts (a boost runs 7 days at most: one page)
    per_day = _call(
        "GET",
        f"{campaign_id}/insights",
        token,
        "read the boost's days",
        params={"fields": "spend,reach", "date_preset": "maximum", "time_increment": 1, "limit": 31},
    )
    daily = [
        {"day": d.get("date_start", ""), "spend": round(float(d.get("spend") or 0), 2), "reach": int(d.get("reach") or 0)}
        for d in per_day.get("data") or []
        if d.get("date_start")
    ]
    return {
        "daily": daily,
        "status": status,
        "note": note,
        "spend_usd": float(row.get("spend") or 0),
        "reach": int(row.get("reach") or 0),
        "clicks": int(row.get("clicks") or 0),
        "engaged": actions.get("post_engagement", 0),
    }


def stop_boost(token: str, campaign_id: str) -> None:
    _call("POST", campaign_id, token, "stop the boost", data={"status": "PAUSED"})
