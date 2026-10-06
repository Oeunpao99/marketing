"""Sales alerts — every lead hand-off is posted to the sales team's Telegram
group, mentioning the rep by @username, with the lead's details and a link.

Linking the group: the owner presses "Connect" in Setup and gets a one-time
code; they add the bot to their sales group and send "/connect CODE" there;
"Check" then reads the bot's recent messages for that exact code (so a shared
bot never links one workspace to another's group). Bots receive commands in
groups even with privacy mode on.

The bot: the workspace's own Telegram channel bot when it has one, else the
app-wide TELEGRAM_BOT_TOKEN. Sending runs in a background thread after the
hand-off is saved — a Telegram problem never blocks or undoes a hand-off.
"""

from __future__ import annotations

import html
import logging
import re
import secrets
import threading

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import Brand, Channel, Lead, Platform, SalesRep, TeamMember, Workspace
from app.tenancy import current_workspace_id, require_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/sales-alerts", tags=["Leads"])
TELEGRAM_API = "https://api.telegram.org"


class AlertError(RuntimeError):
    pass


def _call(token: str, method: str, payload: dict) -> dict:
    """One Bot API call. Returns the whole reply (so callers can read
    ``parameters.migrate_to_chat_id``); raises AlertError when it fails."""
    try:
        r = httpx.post(f"{TELEGRAM_API}/bot{token}/{method}", json=payload, timeout=15.0)
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AlertError(f"Could not reach Telegram: {exc}") from exc
    if not data.get("ok"):
        err = AlertError(f"Telegram: {data.get('description') or r.status_code}")
        err.reply = data  # type: ignore[attr-defined]
        raise err
    return data


def bot_token(db: Session, ws: int) -> str:
    """The workspace's own Telegram channel bot, else the app's bot."""
    rows = db.execute(
        select(Channel.config)
        .join(Brand, Brand.id == Channel.brand_id)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(Brand.workspace_id == ws, Platform.slug == "telegram")
    ).all()
    for (cfg,) in rows:
        if isinstance(cfg, dict) and cfg.get("bot_token"):
            return cfg["bot_token"]
    return get_settings().telegram_bot_token


def _bot_username(token: str) -> str:
    try:
        return _call(token, "getMe", {})["result"].get("username") or ""
    except AlertError:
        return ""


def send(db: Session, w: Workspace, text: str) -> None:
    """Post to the workspace's sales group (HTML). Follows a group that Telegram
    upgraded to a supergroup (its id changes). Raises AlertError."""
    token = bot_token(db, w.id)
    if not token:
        raise AlertError("No Telegram bot is set up.")
    payload = {"chat_id": w.sales_tg_chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    try:
        _call(token, "sendMessage", payload)
    except AlertError as exc:
        moved = (getattr(exc, "reply", {}) or {}).get("parameters", {}).get("migrate_to_chat_id")
        if not moved:
            raise
        w.sales_tg_chat_id = str(moved)
        db.commit()
        _call(token, "sendMessage", {**payload, "chat_id": w.sales_tg_chat_id})


# ── the hand-off message ──────────────────────────────────────────────────
SLA = {"hot": 15, "warm": 120}


def _message(lead: Lead, rep: SalesRep, brand: Brand, reassigned: bool) -> str:
    from app.leads import temperature  # local: leads imports this module

    e = html.escape
    temp = temperature(lead.score)
    icon = {"hot": "🔥", "warm": "🟠"}.get(temp, "🔵")
    mins = SLA.get(temp)
    due = f"call within {mins} min" if mins and mins < 60 else (f"call within {mins // 60} h" if mins else "no call deadline")
    who = f"@{e(rep.telegram)}" if rep.telegram else f"<b>{e(rep.name)}</b>"
    head = "Lead moved to" if reassigned else "New lead for"
    lines = [
        f"{icon} <b>{temp.capitalize()} lead · {lead.score}</b> · {due}",
        f"{head} {who}",
        "",
        f"<b>{e(lead.name)}</b>" + (f" · {e(lead.industry)}" if lead.industry else "") + f" · {e(brand.name)}",
    ]
    if lead.post is not None:
        lines.append(f"From post: “{e(lead.post.title or 'Untitled post')}”")
    if lead.source:
        lines.append(f"Came in via: {e(lead.source)}")
    if lead.need or lead.summary:
        lines.append(f"Needs: {e((lead.need or lead.summary)[:300])}")
    for label, value in (("Volume", lead.volume), ("Timeline", lead.timeline)):
        if value:
            lines.append(f"{label}: {e(value)}")
    contact = " · ".join(x for x in (lead.contact_name, lead.phone, lead.email) if x)
    if contact:
        lines.append(f"Contact: {e(contact)}")
    if (lead.route or {}).get("reason"):
        lines.append(f"<i>Why {e(rep.name)}: {e(lead.route['reason'])}</i>")
    if (lead.route or {}).get("compliance"):
        lines.append("⚠️ Regulated industry — follow the compliance checklist.")
    last = [m for m in (lead.messages or []) if m.get("from") == "customer"][-1:]
    if last:
        lines.append(f"Last message: “{e(last[0].get('text', '')[:200])}”")
    url = f"{get_settings().frontend_url.rstrip('/')}/leads?lead={lead.id}"
    lines += ["", f'<a href="{e(url)}">Open in ContentFlow</a> · mark it Contacted once you call']
    return "\n".join(lines)


def notify_handoff(lead_id: int, reassigned: bool = False) -> None:
    """Post the hand-off to the sales group, in the background."""

    def run() -> None:
        db = SessionLocal()
        try:
            lead = db.get(Lead, lead_id)
            if lead is None or lead.rep_id is None:
                return
            brand = db.get(Brand, lead.brand_id)
            w = db.get(Workspace, brand.workspace_id)
            if not w.sales_tg_chat_id:
                return
            send(db, w, _message(lead, db.get(SalesRep, lead.rep_id), brand, reassigned))
        except AlertError as exc:
            log.warning("sales alert for lead %s not sent: %s", lead_id, exc)
        except Exception:  # noqa: BLE001 - an alert must never break anything
            log.exception("sales alert for lead %s failed", lead_id)
        finally:
            db.close()

    threading.Thread(target=run, daemon=True, name=f"sales-alert-{lead_id}").start()


# ── Setup → Sales alerts ──────────────────────────────────────────────────
@router.get("")
def alerts_status(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    w = db.get(Workspace, ws)
    token = bot_token(db, ws)
    pending = bool(w.sales_tg_code) and not w.sales_tg_chat_id
    return {
        "telegram": {
            "has_bot": bool(token),
            "connected": bool(w.sales_tg_chat_id),
            "title": w.sales_tg_title,
            "code": w.sales_tg_code if pending else None,
            "bot_username": _bot_username(token) if (pending and token) else None,
        }
    }


@router.post("/telegram/start")
def telegram_start(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    token = bot_token(db, user.workspace_id)
    if not token:
        raise HTTPException(409, "No Telegram bot is set up — connect a Telegram channel first, or set TELEGRAM_BOT_TOKEN.")
    w = db.get(Workspace, user.workspace_id)
    w.sales_tg_code = secrets.token_hex(3).upper()
    db.commit()
    return {"code": w.sales_tg_code, "bot_username": _bot_username(token)}


@router.post("/telegram/check")
def telegram_check(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Look for "/connect CODE" in a group the bot is in; link that group."""
    w = db.get(Workspace, user.workspace_id)
    if not w.sales_tg_code:
        raise HTTPException(409, "Press Connect first to get a code.")
    token = bot_token(db, w.id)
    try:
        updates = _call(token, "getUpdates", {"timeout": 0, "allowed_updates": ["message"]})["result"]
    except AlertError as exc:
        if "webhook" in str(exc).lower():
            raise HTTPException(409, "This bot is set up with a webhook, so it can't be checked this way.") from exc
        raise HTTPException(502, str(exc)) from exc
    pattern = re.compile(rf"^/connect(@\w+)?\s+{re.escape(w.sales_tg_code)}\b", re.I)
    for u in reversed(updates):
        msg = u.get("message") or {}
        chat = msg.get("chat") or {}
        if chat.get("type") in ("group", "supergroup") and pattern.match(msg.get("text") or ""):
            w.sales_tg_chat_id = str(chat["id"])
            w.sales_tg_title = (chat.get("title") or "Sales group")[:200]
            w.sales_tg_code = None
            db.commit()
            try:
                send(db, w, "✅ <b>ContentFlow sales alerts are on.</b>\nEvery lead handed to a rep will be posted here, mentioning them.")
            except AlertError:
                pass
            return {"connected": True, "title": w.sales_tg_title}
    return {"connected": False}


@router.post("/telegram/test")
def telegram_test(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    w = db.get(Workspace, user.workspace_id)
    if not w.sales_tg_chat_id:
        raise HTTPException(409, "No sales group is connected.")
    try:
        send(db, w, f"🔔 Test from ContentFlow — sales alerts reach this group. Sent by {html.escape(user.name)}.")
    except AlertError as exc:
        raise HTTPException(502, f"{exc} — is the bot still in the group?") from exc
    return {"ok": True}


@router.delete("/telegram", status_code=204)
def telegram_disconnect(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    w = db.get(Workspace, user.workspace_id)
    w.sales_tg_chat_id = None
    w.sales_tg_title = ""
    w.sales_tg_code = None
    db.commit()
