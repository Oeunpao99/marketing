"""Customers close their own account — Settings → Workspace.

- The owner: "Close my account" — the account's name typed again, and their
  password (a Google-only account: a 6-digit code by email instead). It's
  suspended at once (everyone signed out, no AI, no posting) and deleted for good
  14 days later (app/admin/admin.py delete_account_now: payments are kept). Signing in
  again within the 14 days restores it.
- Anyone else: "Leave this workspace" — their own login goes; what they made stays.

The team's Telegram hears about closings and restores (app/notify/team_alerts.py), and
the owner gets an email each time.
"""

from __future__ import annotations

import html
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.models import TeamMember, UserSession, Workspace
from app.core.security import verify_password
from app.core.tenancy import get_current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/account", tags=["Auth"])
GRACE = timedelta(days=14)
_PURPOSE = "close:"


def _aware(t: datetime | None) -> datetime | None:
    return t.replace(tzinfo=UTC) if t is not None and t.tzinfo is None else t


def deletes_on(w: Workspace) -> datetime | None:
    c = _aware(w.closing_at)
    return c + GRACE if c else None


def _owner_only(user: TeamMember) -> None:
    if user.role != "owner":
        raise HTTPException(403, "Only the account's owner can close it — you can leave the workspace instead.")


def _alert(text: str) -> None:
    from app.notify import team_alerts

    def run() -> None:
        db = SessionLocal()
        try:
            team_alerts.send(db, text)
        except Exception as exc:  # noqa: BLE001 — never the customer's problem
            log.warning("team alert not sent: %s", exc)
        finally:
            db.close()

    import threading

    threading.Thread(target=run, daemon=True, name="close-alert").start()


# ── the owner ─────────────────────────────────────────────────────────────
@router.post("/close/code")
def close_code(request: Request, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """A Google-only owner (no password) confirms by a code emailed to them."""
    from app.notify import mailer
    from app.auth.auth import _RESEND_AFTER, _code_hash, client_ip

    _owner_only(user)
    if not mailer.configured():
        raise HTTPException(503, "Email isn't available right now — please contact Smart Marketing support to close the account.")
    now = datetime.now(UTC)
    sent = _aware(user.reset_code_sent_at)
    if sent is not None and now - sent < _RESEND_AFTER:
        wait = int((_RESEND_AFTER - (now - sent)).total_seconds()) + 1
        raise HTTPException(429, f"Wait {wait} seconds, then send a new code.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.reset_code_hash = _code_hash(user, code, _PURPOSE)
    user.reset_code_expires = now + timedelta(minutes=15)
    user.reset_code_sent_at = now
    user.reset_code_tries = 0
    db.commit()
    mailer.send_close_code(user.email, user.name, code, ip=client_ip(request), ua=request.headers.get("user-agent", ""))
    return {"sent": True}


class CloseIn(BaseModel):
    confirm: str = Field(max_length=200)  # the account's name, typed again
    password: str = Field(default="", max_length=128)
    code: str = Field(default="", max_length=12)


def _check_identity(db: Session, user: TeamMember, payload: CloseIn) -> None:
    from app.auth.auth import _code_hash

    if user.password_hash:
        if not payload.password or not verify_password(payload.password, user.password_hash):
            raise HTTPException(422, "That password isn't right.")
        return
    expires = _aware(user.reset_code_expires)
    code = "".join(ch for ch in payload.code if ch.isdigit())
    if not user.reset_code_hash or expires is None or expires < datetime.now(UTC) or user.reset_code_tries >= 5:
        raise HTTPException(422, "Ask for a code first — or it has expired.")
    if not secrets.compare_digest(_code_hash(user, code, _PURPOSE), user.reset_code_hash):
        user.reset_code_tries += 1
        db.commit()
        raise HTTPException(422, "That code isn't right.")
    user.reset_code_hash = None
    user.reset_code_expires = None


@router.post("/close")
def close_account(payload: CloseIn, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Close the account: suspended now, deleted for good in 14 days (unless the owner signs in again)."""
    from app.notify import mailer

    _owner_only(user)
    w = db.get(Workspace, user.workspace_id)
    if payload.confirm.strip().casefold() != (w.name or "").strip().casefold():
        raise HTTPException(422, "Type your workspace's name exactly to confirm.")
    _check_identity(db, user, payload)
    now = datetime.now(UTC)
    w.closing_at = now
    w.suspended_at = now
    on = now + GRACE
    w.suspended_reason = f"Closed by the owner — deleted for good on {on:%d %b %Y} unless they sign in again"
    db.execute(update(UserSession).where(UserSession.workspace_id == w.id, UserSession.revoked_at.is_(None)).values(revoked_at=now))
    db.commit()
    log.warning("account %s closed by its owner %s — deletes on %s", w.id, user.id, on.date())
    mailer.send_account_closing(user.email, user.name, w.name, f"{on:%d %B %Y}")
    e = html.escape
    _alert(f"👋 <b>{e(w.name)}</b> (account #{w.id}) was closed by its owner\n✉️ {e(user.email)}"
           + (f" · 📞 {e(user.phone)}" if user.phone else "")
           + f"\nDeleted for good on {on:%d %b %Y} unless they sign in again — maybe reach out first.")
    return {"closed": True, "deletes_on": on}


def restore_if_closing(db: Session, user: TeamMember) -> bool:
    """At sign-in: the owner of an account they closed less than 14 days ago — it's
    restored (back to how it was). True when it was."""
    if user.role != "owner":
        return False
    w = db.get(Workspace, user.workspace_id)
    if w is None or w.closing_at is None:
        return False
    # what was due while it was closed doesn't all go out late at once: marked
    # "failed" with why, so they can be sent again on purpose (Calendar)
    from app.models import Brand, Channel, PostTarget

    late = select(PostTarget.id).join(Channel, Channel.id == PostTarget.channel_id).join(Brand, Brand.id == Channel.brand_id).where(
        Brand.workspace_id == w.id, PostTarget.status == "queued", PostTarget.scheduled_for <= datetime.now(UTC)
    )
    db.execute(
        update(PostTarget)
        .where(PostTarget.id.in_(late))
        .values(status="failed", error="Not posted — the account was closed at its time. Send it again if you still want it.")
    )
    w.closing_at = None
    w.suspended_at = None
    w.suspended_reason = ""
    db.commit()
    log.warning("account %s restored — its owner %s signed in again", w.id, user.id)
    from app.notify import mailer

    mailer.send_account_restored(user.email, user.name, w.name)
    _alert(f"🎉 <b>{html.escape(w.name)}</b> (account #{w.id}) is back — {html.escape(user.email)} signed in and it was restored.")
    return True


def is_closing(db: Session, workspace_id: int) -> bool:
    return db.scalar(select(Workspace.closing_at).where(Workspace.id == workspace_id)) is not None


# ── a team member ─────────────────────────────────────────────────────────
class LeaveIn(BaseModel):
    password: str = Field(default="", max_length=128)


@router.post("/leave")
def leave_workspace(payload: LeaveIn, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Anyone but the owner: remove their own login. What they made stays with the workspace."""
    if user.role == "owner":
        raise HTTPException(409, "You own this workspace — close the account instead.")
    if user.password_hash and not verify_password(payload.password, user.password_hash):
        raise HTTPException(422, "That password isn't right.")
    who = f"{user.name} <{user.email}> (workspace {user.workspace_id})"
    db.delete(user)
    db.commit()
    log.warning("%s left their workspace", who)
    return {"left": True}


# ── from the scheduler ────────────────────────────────────────────────────
def purge_due() -> int:
    """Delete for good the accounts closed by their owner 14+ days ago. Returns how many."""
    from app.admin.admin import delete_account_now

    db = SessionLocal()
    done = 0
    try:
        cutoff = datetime.now(UTC) - GRACE
        rows = db.scalars(select(Workspace).where(Workspace.closing_at.is_not(None), Workspace.closing_at <= cutoff)).all()
        for w in rows:
            name, wid = w.name, w.id
            if delete_account_now(db, w, why="closed by its owner 14 days ago"):
                done += 1
                _alert(f"🗑 <b>{html.escape(name)}</b> (account #{wid}) was deleted for good — closed by its owner 14 days ago.")
    finally:
        db.close()
    return done
