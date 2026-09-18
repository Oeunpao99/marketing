"""Password hashing + signed bearer tokens, standard-library only."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from app.config import get_settings

_PBKDF2_ROUNDS = 200_000


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


# ── passwords ────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), _unb64(salt_b64), int(rounds)
        )
        return hmac.compare_digest(_b64(dk), hash_b64)
    except (ValueError, AttributeError):
        return False


# ── tokens ───────────────────────────────────────────────────────────────
def _secret() -> bytes:
    return get_settings().secret_key.encode()


def sign_payload(data: dict, ttl_seconds: int) -> str:
    """HMAC-sign an arbitrary short-lived payload (session tokens, OAuth state)."""
    payload = {**data, "exp": int(time.time()) + ttl_seconds}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_payload(token: str) -> dict:
    body, sig = token.split(".", 1)
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad signature")
    payload = json.loads(_unb64(body))
    if int(payload["exp"]) < time.time():
        raise ValueError("token expired")
    return payload


def create_token(user_id: int) -> str:
    ttl = get_settings().token_ttl_hours * 3600
    return sign_payload({"sub": int(user_id)}, ttl)


def decode_token(token: str) -> int:
    return int(verify_payload(token)["sub"])
