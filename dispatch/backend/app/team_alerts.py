"""Team alerts — the Smart Marketing team hears about every new account in its
own Telegram group, with who signed up and from where, so someone can reach
out and help them get started.

Settings (.env): TEAM_TELEGRAM_CHAT_ID — the team group's chat id; the bot is
TEAM_TELEGRAM_BOT_TOKEN, else the app-wide TELEGRAM_BOT_TOKEN (it must be a
member of the group). No chat id = switched off. Sending runs in a background
thread — a Telegram problem never slows or breaks a sign-up.
"""

from __future__ import annotations

import html
import logging
import threading
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import Request
from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal
from app.models import TeamMember, Workspace

log = logging.getLogger(__name__)
TELEGRAM_API = "https://api.telegram.org"
PHNOM_PENH = timedelta(hours=7)


def _bot() -> tuple[str, str]:
    s = get_settings()
    return (s.team_telegram_bot_token or s.telegram_bot_token), s.team_telegram_chat_id


def configured() -> bool:
    token, chat = _bot()
    return bool(token and chat)


def send(text: str) -> None:
    """One message to the team group (HTML). Raises RuntimeError when Telegram refuses."""
    token, chat = _bot()
    if not (token and chat):
        return
    try:
        r = httpx.post(
            f"{TELEGRAM_API}/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=15.0,
        )
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Could not reach Telegram: {exc}") from exc
    if not data.get("ok"):
        raise RuntimeError(f"Telegram: {data.get('description') or r.status_code}")


def signup_text(user: TeamMember, workspace: Workspace, how: str, device: str, place: str, ip: str, total: int) -> str:
    e = html.escape
    when = (datetime.now(UTC) + PHNOM_PENH).strftime("%d %b %Y, %H:%M")
    admin = get_settings().frontend_url.rstrip("/") + "/admin-mkt"
    lines = [
        "🎉 <b>New sign-up</b>",
        "",
        f"👤 <b>{e(user.name or '—')}</b>",
        f"✉️ {e(user.email)}",
        f"🏢 {e(workspace.name or '—')} · account #{workspace.id}",
        f"🔑 Signed up with {e(how)} · {e(workspace.plan or 'free').title()} plan",
        f"💻 {e(device or 'Unknown device')}",
        f"📍 {e(place or 'Unknown place')}" + (f" · {e(ip)}" if ip else ""),
        f"🕒 {when} (Phnom Penh)",
        "",
        f"Accounts so far: <b>{total}</b>",
        f'<a href="{e(admin)}">Open the admin portal</a> — say hello and help them get started.',
    ]
    return "\n".join(lines)


def _signup(user_id: int, how: str, ua: str, ip: str) -> None:
    from app.auth import describe_device
    from app.sessions import _lookup_place

    db = SessionLocal()
    try:
        user = db.get(TeamMember, user_id)
        workspace = db.get(Workspace, user.workspace_id) if user else None
        if not (user and workspace):
            return
        total = db.scalar(select(func.count(Workspace.id))) or 0
        text = signup_text(user, workspace, how, describe_device(ua), _lookup_place(ip) if ip else "", ip, total)
    finally:
        db.close()
    try:
        send(text)
    except Exception as exc:  # noqa: BLE001 — never the sign-up's problem
        log.warning("team alert for new account %s not sent: %s", user_id, exc)


def new_signup(user: TeamMember, request: Request, how: str) -> None:
    """Tell the team about a new account (``how``: "email" / "Google"), in the background."""
    if not configured():
        return
    from app.auth import client_ip

    ua = request.headers.get("user-agent", "")[:300]
    threading.Thread(target=_signup, args=(user.id, how, ua, client_ip(request)), daemon=True, name=f"signup-alert-{user.id}").start()
