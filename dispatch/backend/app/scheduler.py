"""In-process delivery worker.

A single asyncio task that wakes every ``publish_worker_interval_seconds`` and
delivers any queued PostTarget whose ``scheduled_for`` has passed. This is what
makes "schedule a post" actually publish without an external cron.

Disable it with ``PUBLISH_WORKER_ENABLED=false`` in ``.env`` (e.g. when you run
the worker as a separate process hitting ``POST /api/views/publish-due``).
"""

from __future__ import annotations

import asyncio
import logging

from app.config import get_settings
from app.database import SessionLocal
from app.views import publish_due_targets

log = logging.getLogger("app.scheduler")


def _tick() -> dict:
    """One delivery pass. Runs in a worker thread (sync DB session)."""
    db = SessionLocal()
    try:
        return publish_due_targets(db, dwell=True)
    finally:
        db.close()


async def _run(interval: int) -> None:
    log.info("delivery worker started (every %ss)", interval)
    while True:
        try:
            result = await asyncio.to_thread(_tick)
            if result["due"]:
                log.info(
                    "delivered %d/%d due post(s); %d failed",
                    len(result["published"]),
                    result["due"],
                    len(result["failed"]),
                )
            for f in result["failed"]:
                log.warning("target %s failed: %s", f.get("id"), f.get("error"))
        except asyncio.CancelledError:
            log.info("delivery worker stopping")
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive across any error
            log.exception("delivery worker tick failed")
        await asyncio.sleep(interval)


def start(app) -> None:
    """Attach the worker task to the FastAPI app (call from lifespan startup)."""
    settings = get_settings()
    if not settings.publish_worker_enabled:
        log.info("delivery worker disabled (PUBLISH_WORKER_ENABLED=false)")
        app.state.publish_worker = None
        return
    interval = max(5, settings.publish_worker_interval_seconds)
    app.state.publish_worker = asyncio.create_task(_run(interval))


async def stop(app) -> None:
    """Cancel the worker task (call from lifespan shutdown)."""
    task = getattr(app.state, "publish_worker", None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
