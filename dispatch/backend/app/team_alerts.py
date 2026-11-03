"""Team alerts — the Smart Marketing team hears about every new account on
Telegram, with who signed up and from where, so someone can reach out and help
them get started.

Set up in the admin portal (Team alerts; app/admin.py): the bot (its token from
@BotFather, kept encrypted — else TEAM_TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN in
.env) and who gets the alert. A bot can't message someone by @username until
they've talked to it, so each person or group connects with a one-time code:
the portal's link opens the bot (or picks a group for it) and sends
"/start CODE"; "Check" then reads the bot's recent messages for that exact code.
TEAM_TELEGRAM_CHAT_ID in .env still works as one more recipient.

Sending runs in a background thread — a Telegram problem never slows or breaks
a sign-up.
"""

from __future__ import annotations

import base64
import hashlib
import html
import logging
import re
import secrets
import threading
from datetime import UTC, datetime, timedelta

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import AppSetting, TeamMember, Workspace

log = logging.getLogger(__name__)
TELEGRAM_API = "https://api.telegram.org"
PHNOM_PENH = timedelta(hours=7)
KEY = "team_alerts"


class AlertError(RuntimeError):
    pass


def _call(token: str, method: str, payload: dict) -> dict:
    try:
        r = httpx.post(f"{TELEGRAM_API}/bot{token}/{method}", json=payload, timeout=15.0)
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AlertError("Can't reach Telegram right now — try again in a minute.") from exc
    if not data.get("ok"):
        err = AlertError(f"Telegram says: {data.get('description') or r.status_code}")
        err.reply = data  # type: ignore[attr-defined]
        raise err
    return data


# ── the stored setting ────────────────────────────────────────────────────
def _fernet() -> Fernet:
    secret = hashlib.sha256(("team-alert-bot|" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(secret))


def _load(db: Session) -> dict:
    row = db.get(AppSetting, KEY)
    return dict(row.value or {}) if row else {}


def _save(db: Session, value: dict) -> None:
    row = db.get(AppSetting, KEY) or AppSetting(key=KEY)
    row.value = value  # a new dict, so the JSON column is written
    db.add(row)
    db.commit()


def _portal_token(cfg: dict) -> str:
    enc = cfg.get("bot_token_enc")
    if not enc:
        return ""
    try:
        return _fernet().decrypt(enc.encode()).decode()
    except (InvalidToken, ValueError):
        log.warning("team alerts: the saved bot token can't be read (SECRET_KEY changed?) — ignored")
        return ""


def _token(cfg: dict) -> tuple[str, str]:
    """The bot token and where it's from ("portal" / "server" / "")."""
    t = _portal_token(cfg)
    if t:
        return t, "portal"
    s = get_settings()
    t = s.team_telegram_bot_token or s.telegram_bot_token
    return t, ("server" if t else "")


def _chats(cfg: dict) -> list[str]:
    chats = [str(r["chat_id"]) for r in cfg.get("recipients") or []]
    env = get_settings().team_telegram_chat_id
    if env and env not in chats:
        chats.append(env)
    return chats


def _bot_username(token: str) -> str:
    try:
        return _call(token, "getMe", {})["result"].get("username") or ""
    except AlertError:
        return ""


# ── sending ───────────────────────────────────────────────────────────────
def send(db: Session, text: str) -> int:
    """The message to everyone on the list (HTML). Returns how many got it.
    Follows a group Telegram upgraded to a supergroup (its id changes)."""
    cfg = _load(db)
    token, _ = _token(cfg)
    chats = _chats(cfg)
    if not (token and chats):
        return 0
    sent, moved_any = 0, False
    for chat in chats:
        payload = {"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
        try:
            _call(token, "sendMessage", payload)
            sent += 1
        except AlertError as exc:
            moved = (getattr(exc, "reply", {}) or {}).get("parameters", {}).get("migrate_to_chat_id")
            if not moved:
                log.warning("team alert to chat %s not sent: %s", chat, exc)
                continue
            for r in cfg.get("recipients") or []:
                if str(r["chat_id"]) == chat:
                    r["chat_id"] = str(moved)
                    moved_any = True
            try:
                _call(token, "sendMessage", {**payload, "chat_id": str(moved)})
                sent += 1
            except AlertError as exc2:
                log.warning("team alert to chat %s not sent: %s", moved, exc2)
    if moved_any:
        _save(db, {**cfg, "recipients": [dict(r) for r in cfg["recipients"]]})
    return sent


def signup_text(user: TeamMember, workspace: Workspace, how: str, device: str, place: str, ip: str, total: int) -> str:
    e = html.escape
    when = (datetime.now(UTC) + PHNOM_PENH).strftime("%d %b %Y, %H:%M")
    admin = get_settings().frontend_url.rstrip("/") + "/admin-mkt"
    lines = [
        "🎉 <b>New sign-up</b>",
        "",
        f"👤 <b>{e(user.name or '—')}</b>",
        f"✉️ {e(user.email)}",
        f"📞 {e(user.phone)}" if user.phone else "📞 No phone yet — they're asked for it when they open the app",
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
        cfg = _load(db)
        if not (_token(cfg)[0] and _chats(cfg)):
            return
        user = db.get(TeamMember, user_id)
        workspace = db.get(Workspace, user.workspace_id) if user else None
        if not (user and workspace):
            return
        total = db.scalar(select(func.count(Workspace.id))) or 0
        text = signup_text(user, workspace, how, describe_device(ua), _lookup_place(ip) if ip else "", ip, total)
        send(db, text)
    except Exception as exc:  # noqa: BLE001 — never the sign-up's problem
        log.warning("team alert for new account %s not sent: %s", user_id, exc)
    finally:
        db.close()


def _phone(user_id: int) -> None:
    db = SessionLocal()
    try:
        user = db.get(TeamMember, user_id)
        workspace = db.get(Workspace, user.workspace_id) if user else None
        if not (user and workspace and user.phone):
            return
        e = html.escape
        send(db, f"📞 <b>{e(user.name or user.email)}</b> added their phone: {e(user.phone)}\n"
                 f"✉️ {e(user.email)} · 🏢 {e(workspace.name or '—')} · account #{workspace.id}")
    except Exception as exc:  # noqa: BLE001
        log.warning("team alert for %s's phone not sent: %s", user_id, exc)
    finally:
        db.close()


def phone_added(user: TeamMember) -> None:
    """An owner gave their phone after signing up (Google, or an older account) — in the background."""
    threading.Thread(target=_phone, args=(user.id,), daemon=True, name=f"phone-alert-{user.id}").start()


def new_signup(user: TeamMember, request: Request, how: str) -> None:
    """Tell the team about a new account (``how``: "email" / "Google"), in the background."""
    from app.auth import client_ip

    ua = request.headers.get("user-agent", "")[:300]
    threading.Thread(target=_signup, args=(user.id, how, ua, client_ip(request)), daemon=True, name=f"signup-alert-{user.id}").start()


# ── the admin portal (app/admin.py routes) ────────────────────────────────
def status(db: Session) -> dict:
    cfg = _load(db)
    token, source = _token(cfg)
    username = _bot_username(token) if token else ""
    code = cfg.get("code")
    return {
        "bot": {"set": bool(token), "from": source, "username": username, "works": bool(username) if token else False},
        "recipients": cfg.get("recipients") or [],
        "server_chat": bool(get_settings().team_telegram_chat_id),
        "code": code,
        "links": _links(username, code) if (username and code) else None,
    }


def _links(username: str, code: str) -> dict:
    return {"person": f"https://t.me/{username}?start={code}", "group": f"https://t.me/{username}?startgroup={code}"}


def set_bot(db: Session, token: str) -> dict:
    token = token.strip()
    if not re.fullmatch(r"\d{5,}:[\w-]{30,}", token):
        raise HTTPException(422, "That doesn't look like a bot token — it looks like 123456789:AAH… (from @BotFather).")
    try:
        _call(token, "getMe", {})
    except AlertError as exc:
        raise HTTPException(422, "Telegram didn't accept that token — copy it again from @BotFather.") from exc
    cfg = _load(db)
    _save(db, {**cfg, "bot_token_enc": _fernet().encrypt(token.encode()).decode(), "code": None})
    return status(db)


def clear_bot(db: Session) -> dict:
    cfg = _load(db)
    cfg.pop("bot_token_enc", None)
    _save(db, {**cfg, "code": None})
    return status(db)


def start_connect(db: Session) -> dict:
    cfg = _load(db)
    token, _ = _token(cfg)
    if not token:
        raise HTTPException(409, "Add the bot first.")
    username = _bot_username(token)
    if not username:
        raise HTTPException(502, "Can't reach the bot right now — check its token, or try again in a minute.")
    code = secrets.token_hex(4).upper()
    _save(db, {**cfg, "code": code})
    return {"code": code, "bot_username": username, "links": _links(username, code)}


def check_connect(db: Session) -> dict:
    """Look for "/start CODE" (or "/connect CODE") sent to the bot; add each chat that sent it."""
    cfg = _load(db)
    code = cfg.get("code")
    if not code:
        raise HTTPException(409, "Press “Add someone” first to get a link.")
    token, _ = _token(cfg)
    try:
        updates = _call(token, "getUpdates", {"timeout": 0, "allowed_updates": ["message", "my_chat_member"]})["result"]
    except AlertError as exc:
        if "webhook" in str(exc).lower():
            raise HTTPException(409, "This bot is set up with a webhook, so it can't be checked this way — use another bot.") from exc
        raise HTTPException(502, str(exc)) from exc
    pattern = re.compile(rf"^/(start|connect)(@\w+)?\s+{re.escape(code)}\b", re.I)
    recipients = [dict(r) for r in cfg.get("recipients") or []]
    known = {str(r["chat_id"]) for r in recipients}
    added = []
    for u in updates:
        msg = u.get("message") or {}
        chat = msg.get("chat") or {}
        if not chat.get("id") or not pattern.match(msg.get("text") or ""):
            continue
        chat_id = str(chat["id"])
        if chat_id in known:
            continue
        person = chat.get("type") == "private"
        name = " ".join(x for x in (chat.get("first_name"), chat.get("last_name")) if x) if person else chat.get("title")
        row = {
            "chat_id": chat_id,
            "name": (name or ("Someone" if person else "A group"))[:120],
            "username": (chat.get("username") or "")[:64],
            "kind": "person" if person else "group",
            "added_at": datetime.now(UTC).isoformat(),
        }
        recipients.append(row)
        known.add(chat_id)
        added.append(row)
    if not added:
        return {"added": [], **status(db)}
    _save(db, {**cfg, "recipients": recipients, "code": None})
    for row in added:
        try:
            _call(token, "sendMessage", {"chat_id": row["chat_id"], "parse_mode": "HTML",
                                         "text": "✅ <b>Smart Marketing team alerts are on.</b>\nEvery new sign-up will be posted here."})
        except AlertError:
            pass
    return {"added": added, **status(db)}


def remove(db: Session, chat_id: str) -> dict:
    cfg = _load(db)
    _save(db, {**cfg, "recipients": [r for r in cfg.get("recipients") or [] if str(r["chat_id"]) != chat_id]})
    return status(db)


def test(db: Session) -> dict:
    cfg = _load(db)
    if not _token(cfg)[0]:
        raise HTTPException(409, "Add the bot first.")
    total = len(_chats(cfg))
    if not total:
        raise HTTPException(409, "Nobody gets the alerts yet — add someone first.")
    sent = send(db, "🔔 <b>Test from the Smart Marketing admin portal</b>\nNew sign-ups will be posted here.")
    if not sent:
        raise HTTPException(502, "Telegram didn't deliver it — is the bot still in the group, and not blocked?")
    return {"sent": sent, "total": total}
