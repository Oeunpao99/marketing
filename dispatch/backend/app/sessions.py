"""Signed-in devices — Settings → Security → Active sessions.

Session tokens stay stateless (app/security.py); this adds a row per token,
keyed by its SHA-256, so each device can be listed and signed out remotely.
A token that has no row yet (signed in before this existed) gets one the
first time it's used, so nobody is logged out by the change.

- ``start``  — at login / sign-up: record the new session.
- ``touch``  — on every signed-in request (tenancy.get_current_user): refuse a
  signed-out session, refresh "last active" at most every few minutes.
- Location: looked up once per new session from the IP via ipwho.is (a free
  IP-location service), cached per IP; private addresses are "Local network".
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import threading
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import TeamMember, UserSession
from app.tenancy import get_current_user

log = logging.getLogger("app.sessions")

router = APIRouter(prefix="/auth", tags=["Auth"])

_SEEN_EVERY = timedelta(minutes=5)  # how often "last active" is written
_places: dict[str, str] = {}  # ip -> "City, Region, CC"
_places_lock = threading.Lock()


def session_id(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return auth[7:].strip() if auth.lower().startswith("bearer ") else ""


def _client(request: Request) -> tuple[str, str]:
    from app.auth import client_ip  # local import: auth imports tenancy, which imports this lazily

    return client_ip(request)[:64], request.headers.get("user-agent", "")[:300]


# ── location ──────────────────────────────────────────────────────────────
def _lookup_place(ip: str) -> str:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ""
    if not addr.is_global:
        return "Local network"
    with _places_lock:
        if ip in _places:
            return _places[ip]
    try:
        resp = httpx.get(f"https://ipwho.is/{ip}", params={"fields": "success,city,region,country_code"}, timeout=6.0)
        data = resp.json() if resp.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return ""
    if not data.get("success"):
        return ""
    parts = [data.get("city"), data.get("region"), data.get("country_code")]
    place = ", ".join(p for p in parts if p)
    with _places_lock:
        if len(_places) > 5000:
            _places.clear()
        _places[ip] = place
    return place


def _locate(sid: str, ip: str) -> None:
    """Background: fill in a new session's location (never blocks a request)."""
    place = _lookup_place(ip)
    if not place:
        return
    db = SessionLocal()
    try:
        db.execute(update(UserSession).where(UserSession.id == sid).values(location=place[:160]))
        db.commit()
    except Exception:  # noqa: BLE001 - a missing city is not worth an error
        db.rollback()
    finally:
        db.close()


# ── recording ─────────────────────────────────────────────────────────────
def _create(sid: str, user: TeamMember, ip: str, ua: str) -> None:
    db = SessionLocal()
    try:
        now = datetime.now(UTC)
        db.add(
            UserSession(
                id=sid, user_id=user.id, workspace_id=user.workspace_id,
                created_at=now, last_seen_at=now, ip=ip, user_agent=ua,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()  # two first requests raced — the other one recorded it
        return
    finally:
        db.close()
    threading.Thread(target=_locate, args=(sid, ip), daemon=True, name="session-locate").start()


def start(token: str, user: TeamMember, request: Request) -> None:
    """A fresh login / sign-up: record its session."""
    ip, ua = _client(request)
    _create(session_id(token), user, ip, ua)


def touch(db: Session, token: str, user: TeamMember, request: Request) -> None:
    """Every signed-in request: turn away a signed-out session, and keep
    "last active" roughly current."""
    sid = session_id(token)
    row = db.get(UserSession, sid)
    if row is None:
        ip, ua = _client(request)
        _create(sid, user, ip, ua)
        return
    if row.revoked_at is not None or row.user_id != user.id:
        raise HTTPException(401, "You were signed out on this device.")
    now = datetime.now(UTC)
    if now - row.last_seen_at >= _SEEN_EVERY:
        ip, _ua = _client(request)
        writer = SessionLocal()
        try:
            values = {"last_seen_at": now}
            if ip and ip != row.ip:
                values.update(ip=ip)
            writer.execute(update(UserSession).where(UserSession.id == sid).values(**values))
            writer.commit()
        finally:
            writer.close()
        if ip and ip != row.ip:
            threading.Thread(target=_locate, args=(sid, ip), daemon=True, name="session-locate").start()


def revoke_others(user_id: int, keep_sid: str) -> int:
    db = SessionLocal()
    try:
        n = db.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.id != keep_sid, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        ).rowcount
        db.commit()
        return n or 0
    finally:
        db.close()


# ── API ───────────────────────────────────────────────────────────────────
def _device(ua: str) -> str:
    """ "Edge (Windows)" — the browser, and the system in brackets."""
    from app.auth import describe_device

    label = describe_device(ua)
    if " on " in label:
        browser, system = label.split(" on ", 1)
        return f"{browser} ({system})"
    return label


@router.get("/security/sessions")
def list_sessions(request: Request, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Your signed-in devices, most recently active first; this one flagged."""
    here = session_id(_token(request))
    oldest = datetime.now(UTC) - timedelta(hours=get_settings().token_ttl_hours)
    rows = db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None), UserSession.created_at >= oldest)
        .order_by(UserSession.last_seen_at.desc())
    ).all()
    out = [
        {
            "id": r.id,
            "device": _device(r.user_agent),
            "location": r.location or r.ip or "Unknown",
            "ip": r.ip,
            "created_at": r.created_at,
            "last_seen_at": r.last_seen_at,
            "current": r.id == here,
        }
        for r in rows
    ]
    out.sort(key=lambda r: not r["current"])  # this device first
    return out


@router.delete("/security/sessions/{sid}", status_code=204)
def sign_out_session(sid: str, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    row = db.get(UserSession, sid)
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Session not found.")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        db.commit()


@router.post("/security/sessions/sign-out-others")
def sign_out_others(request: Request, user: TeamMember = Depends(get_current_user)):
    return {"signed_out": revoke_others(user.id, session_id(_token(request)))}


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Sign out on this device: its token stops working even if it was copied."""
    row = db.get(UserSession, session_id(_token(request)))
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        db.commit()
