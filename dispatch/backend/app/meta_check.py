"""Which permissions each connected Facebook / Instagram channel's saved token
actually has — asks Facebook's debug_token, so it's the real answer, not a
guess. Run on the server:

    docker compose -f docker-compose.prod.yml exec backend python -m app.meta_check

Prints one line per channel: brand, Page, whether the token is valid, and
any of meta.SCOPES it is missing. Read-only.
"""

from __future__ import annotations

import httpx
from sqlalchemy import select

from app import meta
from app.database import SessionLocal
from app.models import Brand, Channel, Platform


def token_scopes(token: str) -> tuple[bool, set[str], str]:
    app_id, secret, _redirect, version = meta._conf()
    resp = httpx.get(
        f"{meta.GRAPH_HOST}/{version}/debug_token",
        params={"input_token": token, "access_token": f"{app_id}|{secret}"},
        timeout=20.0,
    )
    data = (resp.json() or {}).get("data") or {}
    err = ((data.get("error") or {}).get("message")) or ""
    return bool(data.get("is_valid")), set(data.get("scopes") or []), err


def main() -> None:
    wanted = meta.SCOPES.split(",")
    db = SessionLocal()
    try:
        rows = db.execute(
            select(Channel, Brand.name, Platform.slug)
            .join(Brand, Brand.id == Channel.brand_id)
            .join(Platform, Platform.id == Channel.platform_id)
            .where(Platform.slug.in_(("facebook", "instagram")))
            .order_by(Brand.name, Channel.id)
        ).all()
        for ch, brand, slug in rows:
            token = (ch.config or {}).get("access_token")
            head = f"[{ch.id}] {brand} · {slug} · {ch.handle or '?'} ({ch.status})"
            if not token:
                print(f"{head}: no saved token")
                continue
            valid, scopes, err = token_scopes(token)
            missing = [s for s in wanted if s not in scopes]
            state = "valid" if valid else f"INVALID {err}".strip()
            print(f"{head}: token {state}; missing: {', '.join(missing) or 'nothing'}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
