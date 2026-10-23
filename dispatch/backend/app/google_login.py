"""Sign in / sign up with Google — the login page's "Continue with Google".

Plain OAuth (openid email profile — basic scopes, no Google review needed):
  1. GET /api/auth/google/start  → a short-lived nonce in a cookie (and, signed,
     in ``state``), then off to Google's account picker.
  2. GET /api/auth/google/callback → code → tokens → who it is (userinfo).
     Only a Google-verified email counts. That email already has a login →
     signed in. New email → a new workspace with them as owner, exactly like
     the email sign-up (app/auth.py register), with no password.
  3. Back to the app with our own token in the URL *fragment*
     (``/#google_token=…``) — fragments aren't sent to servers or logged;
     src/auth.jsx picks it up and clears it.

Setup: the same Google OAuth client as YouTube can be used. Its Authorized
redirect URIs must include ``GOOGLE_LOGIN_REDIRECT_URI`` exactly — by default
"<this backend>/api/auth/google/callback", worked out from
YOUTUBE_REDIRECT_URI when not set. GOOGLE_CLIENT_ID / _SECRET fall back to the
YOUTUBE_ ones.
"""

from __future__ import annotations

import logging
import secrets
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import sessions
from app.auth import _initials, record_login
from app.config import get_settings
from app.database import get_db
from app.models import TeamMember, Workspace
from app.security import create_token, sign_payload, verify_payload

log = logging.getLogger("app.google_login")
router = APIRouter(prefix="/auth/google", tags=["Auth"])

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
COOKIE = "cf_google_nonce"
CALLBACK_PATH = "/api/auth/google/callback"


def _conf() -> tuple[str, str, str]:
    """(client id, secret, redirect URI) — or empties when not set up."""
    s = get_settings()
    client_id = s.google_client_id or s.youtube_client_id
    secret = s.google_client_secret or s.youtube_client_secret
    redirect = s.google_login_redirect_uri
    if not redirect and s.youtube_redirect_uri:
        parts = urlsplit(s.youtube_redirect_uri)
        redirect = f"{parts.scheme}://{parts.netloc}{CALLBACK_PATH}"
    return client_id, secret, redirect


def configured() -> bool:
    return all(_conf())


def _back(error: str = "", token: str = "") -> RedirectResponse:
    frontend = get_settings().frontend_url.rstrip("/")
    if token:
        resp = RedirectResponse(f"{frontend}/#google_token={token}")
    else:
        resp = RedirectResponse(f"{frontend}/login?{urlencode({'google_error': error[:200]})}")
    resp.delete_cookie(COOKIE, path="/api/auth/google")
    return resp


@router.get("/status")
def google_status():
    """Is "Continue with Google" set up on this server? (the login page asks)"""
    return {"enabled": configured()}


@router.get("/start", include_in_schema=False)
def google_start(request: Request):
    client_id, _secret, redirect = _conf()
    if not configured():
        return _back("Google sign-in isn't set up on this server yet — use your email and password.")
    nonce = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": "openid email profile",
        "state": sign_payload({"n": nonce}, 600),
        "prompt": "select_account",
    }
    resp = RedirectResponse(f"{AUTH_URL}?{urlencode(params)}")
    # the same browser must come back: the nonce rides in a cookie too
    resp.set_cookie(
        COOKIE,
        nonce,
        max_age=600,
        httponly=True,
        secure=redirect.startswith("https://"),
        samesite="lax",
        path="/api/auth/google",
    )
    return resp


def _google_person(code: str) -> dict:
    """code → {email, email_verified, name, sub} from Google."""
    client_id, secret, redirect = _conf()
    with httpx.Client(timeout=20) as http:
        tok = http.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": secret,
                "redirect_uri": redirect,
                "grant_type": "authorization_code",
            },
        )
        if tok.status_code != 200:
            log.warning("google login: token exchange failed %s %s", tok.status_code, tok.text[:300])
            raise RuntimeError("token")
        who = http.get(USERINFO_URL, headers={"Authorization": f"Bearer {tok.json().get('access_token', '')}"})
        if who.status_code != 200:
            log.warning("google login: userinfo failed %s %s", who.status_code, who.text[:300])
            raise RuntimeError("userinfo")
        return who.json()


@router.get("/callback", include_in_schema=False)
def google_callback(request: Request, code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    if error:
        return _back("You cancelled the Google sign-in." if error == "access_denied" else "Google sign-in didn't finish — try again.")
    try:
        nonce = verify_payload(state).get("n")
    except Exception:  # noqa: BLE001 — expired / tampered state
        nonce = None
    if not nonce or nonce != request.cookies.get(COOKIE):
        return _back("That sign-in link expired — please try again.")
    try:
        person = _google_person(code)
    except Exception:  # noqa: BLE001 — the reason is in the log
        return _back("Couldn't sign in with Google just now — please try again.")

    email = (person.get("email") or "").strip().lower()
    if not email or not person.get("email_verified"):
        return _back("That Google account has no verified email — use another account, or sign up with email.")

    user = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    status = "success"
    if user is None:
        # first time: a new private workspace, them as owner (as app/auth.py register)
        name = (person.get("name") or email.split("@")[0]).strip()[:120]
        workspace = Workspace(name=f"{name}'s workspace", plan="free")  # new accounts start on Free
        db.add(workspace)
        db.flush()
        user = TeamMember(
            workspace_id=workspace.id,
            name=name,
            email=email,
            initials=_initials(name),
            role="owner",
            password_hash="",  # Google-only until they set one
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        status = "signup"
        log.info("google login: new account %s (workspace %s)", user.id, workspace.id)
    else:
        if not user.is_active:
            record_login(db, request, email, "disabled", user)
            return _back("This account is disabled.")
        if db.scalar(select(Workspace.suspended_at).where(Workspace.id == user.workspace_id)):
            record_login(db, request, email, "suspended", user)
            return _back("This account is suspended — please contact Smart Marketing support.")

    record_login(db, request, email, status, user)
    token = create_token(user.id)
    sessions.start(token, user, request)
    return _back(token=token)
