"""Why can't a Facebook post report its numbers? Run on the server:

    docker compose -f docker-compose.prod.yml exec backend python -m app.fb_diag

For every Facebook post (last 90 days) it tries the single-post read the
Insights page uses; for each one Facebook refuses it prints Graph's own error
and whether the Page's post list (the fallback, app/views.py _from_page_feed)
has that post. Never prints tokens.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app import meta
from app.database import SessionLocal
from app.models import Channel, Platform, PostTarget
from app.views import _from_page_feed, _MetricsCache


def main() -> None:
    db = SessionLocal()
    since = datetime.now(UTC) - timedelta(days=90)
    fb = db.scalar(select(Platform).where(Platform.slug == "facebook"))
    channels = db.scalars(select(Channel).where(Channel.platform_id == fb.id)).all() if fb else []
    for ch in channels:
        cfg = ch.config or {}
        token, page_id = cfg.get("access_token"), cfg.get("page_id")
        targets = db.scalars(
            select(PostTarget).where(
                PostTarget.channel_id == ch.id,
                PostTarget.status == "posted",
                PostTarget.external_id != "",
                PostTarget.published_at >= since,
            )
        ).all()
        print(f"\n== {ch.handle} (channel {ch.id}, page {page_id}) — {len(targets)} posts")
        if not token:
            print("   no access token — not connected")
            continue
        _app, _secret, _redirect, version = meta._conf()
        cache = _MetricsCache()
        ok = refused = rescued = 0
        for t in targets:
            body, err = meta._graph_read(version, t.external_id, {"fields": "id,permalink_url", "access_token": token})
            if body is not None:
                ok += 1
                continue
            refused += 1
            fallback = _from_page_feed(meta, token, page_id, t.external_id, t.published_at, cache)
            rescued += fallback is not None
            print(
                f"   ✗ target {t.id} id={t.external_id} published={t.published_at:%Y-%m-%d %H:%M}\n"
                f"     Facebook: code {err.get('code')}/{err.get('error_subcode')} — {(err.get('message') or '')[:160]}\n"
                f"     page list fallback: {'FOUND → ' + str(fallback) if fallback else 'not found'}"
            )
        print(f"   single read ok: {ok}   refused: {refused}   rescued by the page list: {rescued}")
    db.close()


if __name__ == "__main__":
    main()
