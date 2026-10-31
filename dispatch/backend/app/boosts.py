"""Real boosts from the Insights page: a brand's Facebook ad account, and the
boosts a person approves there (app/meta_ads.py talks to Facebook).

Connect: /boosts/ads/start → Facebook (the Page connect's app and redirect,
intent "ads") → views.meta_oauth_callback hands the login here (take_login) →
the page shows the ad accounts (/boosts/ads/pending/<id>) → one is saved for
the brand, its token encrypted. Only owners and admins connect, boost or stop
— a boost spends the customer's money. Facebook calls are made with no
database connection held (crowd-capacity rule).
"""

from __future__ import annotations

import base64
import hashlib
import logging
import time
import uuid
from datetime import UTC, datetime, timedelta

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import meta_ads
from app.config import get_settings
from app.database import get_db
from app.meta import MetaError
from app.models import AdAccount, Boost, Brand, Channel, Platform, Post, PostTarget, TeamMember, Video
from app.security import sign_payload
from app.tenancy import current_workspace_id, owned, require_manager, scope

log = logging.getLogger(__name__)
router = APIRouter(prefix="/boosts", tags=["Boosts"])

DAYS = (3, 5, 7)
MIN_USD, MAX_USD = 3, 500
STALE = timedelta(minutes=20)  # read a live boost's numbers again after this
DONE = ("finished", "failed", "rejected")


def _fernet() -> Fernet:
    secret = hashlib.sha256(("ads-token|" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(secret))


def _token(acc: AdAccount) -> str:
    try:
        return _fernet().decrypt(acc.token_enc.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        log.warning("ad account %s: its token can't be read (SECRET_KEY changed?)", acc.id)
        raise HTTPException(409, "Connect the ad account again — its Facebook sign-in has expired.") from exc


# ── connect ────────────────────────────────────────────────────────────────
# a Facebook login waiting for its ad account to be picked (process memory,
# like meta.stash_pending: lost harmlessly on a restart)
_PENDING_TTL = 600
_pending: dict[str, dict] = {}


def take_login(brand_id: int, user_token: str) -> str:
    """The OAuth callback's login (intent "ads") → an id the page picks from."""
    now = time.time()
    for k in [k for k, v in _pending.items() if v["at"] < now - _PENDING_TTL]:
        _pending.pop(k, None)
    accounts = meta_ads.list_ad_accounts(user_token)
    pid = uuid.uuid4().hex
    _pending[pid] = {"brand_id": brand_id, "token": user_token, "accounts": accounts, "at": now}
    return pid


@router.get("/ads/start")
def ads_start(brand_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    owned(db, Brand, brand_id, user.workspace_id)
    state = sign_payload({"brand_id": brand_id, "intent": "ads"}, _PENDING_TTL)
    try:
        return {"url": meta_ads.authorize_url(state)}
    except MetaError as exc:
        log.warning("ads connect: %s", exc)
        raise HTTPException(503, "Facebook connect isn't set up on this server yet.") from exc


@router.get("/ads/pending/{pid}")
def ads_pending(pid: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rec = _pending.get(pid)
    if rec is None:
        raise HTTPException(404, "That Facebook sign-in expired — connect again.")
    brand = owned(db, Brand, rec["brand_id"], ws)
    return {"brand_id": brand.id, "brand_name": brand.name, "accounts": rec["accounts"]}


class PickIn(BaseModel):
    account_id: str


@router.post("/ads/pending/{pid}/confirm")
def ads_confirm(pid: str, payload: PickIn, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    rec = _pending.get(pid)
    if rec is None:
        raise HTTPException(404, "That Facebook sign-in expired — connect again.")
    owned(db, Brand, rec["brand_id"], user.workspace_id)
    acc = next((a for a in rec["accounts"] if a["id"] == payload.account_id), None)
    if acc is None:
        raise HTTPException(404, "That ad account wasn't in the list.")
    if acc["currency"] != "USD":
        raise HTTPException(400, f"This ad account pays in {acc['currency']}. Boosts need an ad account in US dollars.")
    _pending.pop(pid, None)
    # one ad account per brand: a new pick replaces the old one
    row = db.scalar(select(AdAccount).where(AdAccount.brand_id == rec["brand_id"], AdAccount.workspace_id == user.workspace_id))
    if row is None:
        row = AdAccount(workspace_id=user.workspace_id, brand_id=rec["brand_id"])
        db.add(row)
    row.account_id, row.name, row.currency = acc["id"], acc["name"], acc["currency"]
    row.token_enc = _fernet().encrypt(rec["token"].encode()).decode()
    row.connected_by = user.id
    db.commit()
    return _account_out(row)


def _account_out(a: AdAccount) -> dict:
    return {"id": a.id, "brand_id": a.brand_id, "account_id": a.account_id, "name": a.name, "currency": a.currency}


@router.get("/ads")
def ads_list(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    return [_account_out(a) for a in db.scalars(select(AdAccount).where(scope(AdAccount, ws)).order_by(AdAccount.id))]


@router.delete("/ads/{acc_id}")
def ads_remove(acc_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    acc = owned(db, AdAccount, acc_id, user.workspace_id, "Ad account")
    db.delete(acc)  # boosts keep their numbers (ad_account_id → NULL); live ones keep running on Facebook
    db.commit()
    return {"ok": True}


# ── boost ──────────────────────────────────────────────────────────────────
class BoostIn(BaseModel):
    post_id: int
    budget_usd: float = Field(ge=MIN_USD, le=MAX_USD)
    days: int


def _facebook_target(db: Session, post: Post) -> tuple[PostTarget, Channel]:
    fb = db.scalar(select(Platform.id).where(Platform.slug == "facebook"))
    row = db.execute(
        select(PostTarget, Channel)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .where(PostTarget.post_id == post.id, Channel.platform_id == fb, PostTarget.status == "posted", PostTarget.external_id != "")
        .order_by(PostTarget.published_at.desc())
    ).first()
    if row is None:
        raise HTTPException(400, "Only posts live on a Facebook Page can be boosted for now.")
    return row[0], row[1]


@router.post("")
def boost_create(payload: BoostIn, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    if payload.days not in DAYS:
        raise HTTPException(400, "Pick 3, 5 or 7 days.")
    post = owned(db, Post, payload.post_id, user.workspace_id, "Post")
    target, channel = _facebook_target(db, post)
    page_id = str((channel.config or {}).get("page_id") or "")
    acc = db.scalar(select(AdAccount).where(AdAccount.brand_id == post.brand_id, AdAccount.workspace_id == user.workspace_id))
    if acc is None:
        raise HTTPException(409, "Connect this brand's Facebook ad account first.")
    live = db.scalar(select(Boost.id).where(Boost.post_id == post.id, Boost.status.in_(("in_review", "running"))))
    if live:
        raise HTTPException(409, "This post is already being boosted.")
    token, account_id, acc_id = _token(acc), acc.account_id, acc.id
    name = post.title or target.title or (target.caption or "")[:60] or f"post {post.id}"
    brand_id, target_id, post_id = post.brand_id, target.id, post.id
    external = target.external_id
    db.commit()  # no connection held while Facebook works

    try:
        made = meta_ads.boost_post(token, account_id, page_id, external, payload.budget_usd, payload.days, name)
    except MetaError as exc:
        raise HTTPException(502, str(exc)) from exc
    b = Boost(
        workspace_id=user.workspace_id,
        brand_id=brand_id,
        post_id=post_id,
        target_id=target_id,
        ad_account_id=acc_id,
        budget_usd=payload.budget_usd,
        days=payload.days,
        ends_at=made["ends_at"],
        status="in_review",
        campaign_id=made["campaign_id"],
        adset_id=made["adset_id"],
        ad_id=made["ad_id"],
        created_by=user.id,
    )
    db.add(b)
    db.commit()
    log.info("boost %s: post %s, $%s over %s days (campaign %s) by member %s", b.id, post_id, payload.budget_usd, payload.days, b.campaign_id, user.id)
    return _boost_out(b, db.get(Post, post_id))


def _boost_out(b: Boost, post: Post | None, db: Session | None = None) -> dict:
    from app.views import post_media  # the card's picture, as the Analytics list shows it

    media = {}
    if db is not None and post is not None:
        target = db.get(PostTarget, b.target_id) if b.target_id else None
        media = post_media(post, target, db.get(Video, post.video_id) if post.video_id else None, b.platform)
    return {
        **media,
        "id": b.id,
        "post_id": b.post_id,
        "title": (post.title if post else "") or "Boosted post",
        "platform": b.platform,
        "status": b.status,
        "note": b.note,
        "budget_usd": float(b.budget_usd),
        "days": b.days,
        "ends_at": b.ends_at,
        "created_at": b.created_at,
        "spend_usd": float(b.spend_usd or 0),
        "reach": b.reach,
        "clicks": b.clicks,
        "engaged": b.engaged,
        "daily": b.daily or [],
        "refreshed_at": b.refreshed_at,
    }


def refresh(db: Session, ws: int, brand_ids: list[int] | None = None, limit: int = 6) -> None:
    """Read the latest numbers of live boosts not read for a while (Facebook
    calls made with no connection held)."""
    now = datetime.now(UTC)
    q = select(Boost).where(scope(Boost, ws), Boost.status.not_in(DONE), Boost.ad_id != "")
    if brand_ids is not None:
        q = q.where(Boost.brand_id.in_(brand_ids))
    todo = []
    for b in db.scalars(q.order_by(Boost.refreshed_at.asc().nullsfirst()).limit(limit)):
        if b.refreshed_at and now - b.refreshed_at < STALE:
            continue
        acc = db.get(AdAccount, b.ad_account_id) if b.ad_account_id else None
        if acc is None:
            continue
        try:
            todo.append((b.id, _token(acc), b.ad_id, b.campaign_id, b.ends_at))
        except HTTPException:
            continue
    db.commit()
    if not todo:
        return
    results = {}
    for bid, token, ad_id, campaign_id, ends_at in todo:
        try:
            r = meta_ads.read_boost(token, ad_id, campaign_id)
        except MetaError as exc:
            log.warning("boost %s: couldn't read it: %s", bid, exc)
            continue
        if ends_at and now >= ends_at and r["status"] in ("running", "stopped"):
            r["status"] = "finished"
        results[bid] = r
    for bid, r in results.items():
        b = db.get(Boost, bid)
        if b is None:
            continue
        if b.status == "stopped" and r["status"] == "running":
            r["status"] = "stopped"  # a stop we sent wins over a stale read
        b.status, b.note = r["status"], r["note"] or b.note
        b.spend_usd, b.reach, b.clicks, b.engaged = r["spend_usd"], r["reach"], r["clicks"], r["engaged"]
        b.daily = r["daily"]
        b.refreshed_at = now
    db.commit()


@router.get("")
def boost_list(brand_id: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
    refresh(db, ws, [brand_id] if brand_id else None)
    q = select(Boost).where(scope(Boost, ws))
    if brand_id is not None:
        q = q.where(Boost.brand_id == brand_id)
    rows = db.scalars(q.order_by(Boost.id.desc()).limit(30)).all()
    posts = {p.id: p for p in db.scalars(select(Post).where(Post.id.in_([b.post_id for b in rows if b.post_id] or [0])))}
    return [_boost_out(b, posts.get(b.post_id), db) for b in rows]


@router.post("/{boost_id}/stop")
def boost_stop(boost_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    b = owned(db, Boost, boost_id, user.workspace_id, "Boost")
    if b.status in DONE or b.status == "stopped":
        return _boost_out(b, db.get(Post, b.post_id) if b.post_id else None)
    acc = db.get(AdAccount, b.ad_account_id) if b.ad_account_id else None
    if acc is None:
        raise HTTPException(409, "The ad account was disconnected — stop it in Facebook Ads Manager.")
    token, campaign_id = _token(acc), b.campaign_id
    db.commit()
    try:
        meta_ads.stop_boost(token, campaign_id)
    except MetaError as exc:
        raise HTTPException(502, str(exc)) from exc
    b = db.get(Boost, boost_id)
    b.status = "stopped"
    db.commit()
    log.info("boost %s stopped by member %s", boost_id, user.id)
    return _boost_out(b, db.get(Post, b.post_id) if b.post_id else None)
