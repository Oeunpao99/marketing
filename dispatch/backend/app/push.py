"""Web Push — real phone / desktop notifications, even with ContentFlow closed.

Each browser or installed app that turns on "Push notifications" (Settings →
Notifications) registers a subscription here. When something happens — a post
goes live or fails, a batch of AI ideas is waiting — ``notify_workspace``
pushes it to every opted-in member of that workspace, respecting each
person's per-kind choices (``preferences.notify``). The service worker
(public/sw.js) shows it on the lock screen and opens the right page on tap.

iPhone/iPad: works from iOS 16.4 for the app *added to the Home Screen*.
Needs HTTPS (or localhost). Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
VAPID_SUBJECT in .env — make a pair with ``python -m app.push keys``.
"""

from __future__ import annotations

import base64
import json
import logging
import threading

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import PushSubscription, TeamMember
from app.tenancy import get_current_user

log = logging.getLogger("app.push")
router = APIRouter(prefix="/push", tags=["Push"])


def enabled() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def generate_keys() -> tuple[str, str]:
    """A fresh VAPID pair as (public, private), both base64url — the public one
    is the browser's applicationServerKey, the private one signs each push."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    raw_private = key.private_numbers().private_value.to_bytes(32, "big")
    raw_public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
    return b64(raw_public), b64(raw_private)


# ── API ───────────────────────────────────────────────────────────────────
class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(max_length=1000)
    keys: Keys
    user_agent: str = Field(default="", max_length=300)


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=1000)


@router.get("/key")
def public_key(user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    devices = db.scalars(select(PushSubscription).where(PushSubscription.user_id == user.id)).all()
    return {
        "enabled": enabled(),
        "public_key": get_settings().vapid_public_key if enabled() else "",
        "devices": len(devices),
    }


@router.post("/subscribe", status_code=201)
def subscribe(payload: SubscriptionIn, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    if not enabled():
        raise HTTPException(503, "Push notifications aren't set up on the server (VAPID keys missing).")
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=payload.endpoint)
        db.add(sub)
    # (Re)bind to whoever is signed in on this device now.
    sub.user_id = user.id
    sub.workspace_id = user.workspace_id
    sub.p256dh = payload.keys.p256dh
    sub.auth = payload.keys.auth
    sub.user_agent = payload.user_agent
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe", status_code=204)
def unsubscribe(payload: EndpointIn, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = db.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint, PushSubscription.user_id == user.id
        )
    )
    if sub is not None:
        db.delete(sub)
        db.commit()
    return None


@router.post("/test")
def test_push(user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    if not enabled():
        raise HTTPException(503, "Push notifications aren't set up on the server (VAPID keys missing).")
    subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == user.id)).all()
    if not subs:
        raise HTTPException(404, "This account has no device with push turned on yet.")
    sent = _send_many(
        db,
        subs,
        {
            "title": "ContentFlow notifications are on ✓",
            "body": "This is how you’ll hear about posts going live, failures and new ideas.",
            "url": "/",
            "tag": "test",
            "badge": badge_count(db, user),
        },
    )
    return {"sent": sent, "devices": len(subs)}


# ── sending ───────────────────────────────────────────────────────────────
def _send_many(db: Session, subs: list[PushSubscription], message: dict) -> int:
    from pywebpush import WebPushException, webpush

    s = get_settings()
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=json.dumps(message),
                vapid_private_key=s.vapid_private_key,
                vapid_claims={"sub": s.vapid_subject or "https://contentflow.app"},
                ttl=60 * 60 * 12,
                timeout=10,
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):  # the device unsubscribed / app removed
                db.delete(sub)
            else:
                log.warning("push to %s… failed: %s", sub.endpoint[:40], exc)
        except Exception:  # noqa: BLE001 - one bad device mustn't stop the rest
            log.exception("push send crashed")
    db.commit()
    return sent


def badge_count(db: Session, member: TeamMember) -> int:
    """The number on the app icon — the same "needs you" items the bell counts
    (ideas to review, failed posts, channels to reconnect), limited to the
    kinds this person switched on in Settings → Notifications."""
    from app.models import Channel, Draft, PostTarget
    from app.tenancy import scope

    ws = member.workspace_id
    notify = (member.preferences or {}).get("notify") or {}
    total = 0
    if notify.get("review", True):
        total += db.scalar(select(func.count()).select_from(Draft).where(scope(Draft, ws), Draft.status == "waiting")) or 0
    if notify.get("failed", True):
        total += db.scalar(
            select(func.count()).select_from(PostTarget).where(scope(PostTarget, ws), PostTarget.status == "failed")
        ) or 0
    if notify.get("channel", True):
        total += db.scalar(select(func.count()).select_from(Channel).where(scope(Channel, ws), Channel.status == "soon")) or 0
    return total


def _send_to_member(db: Session, member: TeamMember, message: dict) -> None:
    subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == member.id)).all()
    if subs:
        _send_many(db, list(subs), {**message, "badge": badge_count(db, member)})


def _wants(member: TeamMember, kind: str) -> bool:
    prefs = member.preferences or {}
    return bool(prefs.get("push_alerts")) and (prefs.get("notify") or {}).get(kind, True)


def _deliver(workspace_id: int, kind: str, message: dict) -> None:
    db = SessionLocal()
    try:
        members = db.scalars(
            select(TeamMember).where(TeamMember.workspace_id == workspace_id, TeamMember.is_active.is_(True))
        ).all()
        for m in members:
            if _wants(m, kind):
                _send_to_member(db, m, message)
    finally:
        db.close()


def notify_workspace(workspace_id: int | None, kind: str, title: str, body: str, url: str = "/", tag: str = "") -> None:
    """Fire-and-forget: push to every opted-in member of a workspace. ``kind`` is
    one of review | failed | published | channel (Settings → Notifications)."""
    if not workspace_id or not enabled():
        return
    message = {"title": title, "body": body[:240], "url": url, "tag": tag or kind}
    threading.Thread(target=_deliver, args=(workspace_id, kind, message), daemon=True).start()


def _deliver_user(user_id: int, kind: str, message: dict) -> None:
    db = SessionLocal()
    try:
        m = db.get(TeamMember, user_id)
        if m is None or not m.is_active or not _wants(m, kind):
            return
        _send_to_member(db, m, message)
    finally:
        db.close()


def notify_user(user_id: int | None, kind: str, title: str, body: str, url: str = "/", tag: str = "") -> None:
    """Fire-and-forget push to one person (e.g. "your image is ready")."""
    if not user_id or not enabled():
        return
    message = {"title": title, "body": body[:240], "url": url, "tag": tag or kind}
    threading.Thread(target=_deliver_user, args=(user_id, kind, message), daemon=True).start()


if __name__ == "__main__":  # python -m app.push keys
    import sys

    if sys.argv[1:] == ["keys"]:
        pub, priv = generate_keys()
        print(f"VAPID_PUBLIC_KEY={pub}\nVAPID_PRIVATE_KEY={priv}\nVAPID_SUBJECT=https://your-domain.com")
    else:
        print("usage: python -m app.push keys")
