"""In-process delivery worker.

A single asyncio task that wakes every ``publish_worker_interval_seconds`` and
delivers any queued PostTarget whose ``scheduled_for`` has passed. This is what
makes "schedule a post" actually publish without an external cron.

Disable it with ``PUBLISH_WORKER_ENABLED=false`` in ``.env`` (e.g. when you run
the worker as a separate process hitting ``POST /api/views/publish-due``).
"""

from __future__ import annotations

import asyncio
import time
import logging

from app.config import get_settings
from app.database import SessionLocal
from app.views import publish_due_targets, settle_processing_targets

log = logging.getLogger("app.scheduler")


def _tick() -> dict:
    """One delivery pass. Runs in a worker thread (sync DB session)."""
    db = SessionLocal()
    try:
        result = publish_due_targets(db, dwell=True)
        # videos YouTube was still processing: posted when it says they're ready
        settled = settle_processing_targets(db)
        if settled["posted"] or settled["failed"]:
            log.info(
                "YouTube processing: %d now posted, %d failed, %d still processing",
                len(settled["posted"]),
                len(settled["failed"]),
                settled["waiting"],
            )
        return result
    finally:
        db.close()


CLAIM_CHECK_S = 600  # how often the monthly "claim your credits" reminder is checked


async def _run(interval: int) -> None:
    log.info("delivery worker started (every %ss)", interval)
    last_claim_check = 0.0
    last_pay_sweep = 0.0
    last_plan_check = 0.0
    while True:
        try:
            # once a month per workspace: "your monthly credits are ready" (app/billing.py)
            if time.monotonic() - last_claim_check >= CLAIM_CHECK_S:
                last_claim_check = time.monotonic()
                from app import billing

                reminded = await asyncio.to_thread(billing.remind_claims)
                if reminded:
                    log.info("monthly credits: reminded %d workspace(s) to claim", reminded)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - a reminder never stops delivery
            log.exception("monthly credit reminder failed")
        try:
            # KHQR plan payments (app/payments.py): confirm open ones with Bakong
            # (a page closed after paying), and end paid months that ran out
            from app import payments

            if time.monotonic() - last_pay_sweep >= payments.SWEEP_S:
                last_pay_sweep = time.monotonic()
                await asyncio.to_thread(payments.sweep)
            if time.monotonic() - last_plan_check >= CLAIM_CHECK_S:
                last_plan_check = time.monotonic()
                ended = await asyncio.to_thread(payments.expire_plans)
                if ended:
                    log.info("paid plans: %d ended, back to Free", ended)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - payments never stop delivery
            log.exception("payment sweep failed")
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
    if not settings.publish_worker_enabled or settings.maintenance_mode:
        log.info("delivery worker disabled (PUBLISH_WORKER_ENABLED=false or MAINTENANCE_MODE=true)")
        app.state.publish_worker = None
        return
    interval = max(5, settings.publish_worker_interval_seconds)
    app.state.publish_worker = asyncio.create_task(_run(interval))
    app.state.snapshot_worker = asyncio.create_task(_run_snapshots(SNAPSHOT_INTERVAL))


# Metric history for the Analytics "over time" charts: every few hours, save
# the current numbers of recent posts (app/views.py collect_snapshots).
SNAPSHOT_INTERVAL = 3 * 60 * 60


def _snapshot_tick() -> int:
    from app.importer import import_all
    from app.views import collect_snapshots

    db = SessionLocal()
    try:
        # New posts made straight on a connected Page first, so they get
        # their numbers saved in this same tick.
        imported = import_all(db)
        if imported:
            log.info("imported %d post(s) made outside ContentFlow", imported)
        saved = collect_snapshots(db)
        try:
            from app.post_tags import auto_tag_all

            read = auto_tag_all(db)
            if read:
                log.info("the AI read %d new post(s)", read)
        except Exception:  # noqa: BLE001 - never let tagging stop the metrics collector
            log.exception("auto-tagging failed")
        return saved
    finally:
        db.close()


async def _run_snapshots(interval: int) -> None:
    log.info("metric snapshot collector started (every %ss)", interval)
    await asyncio.sleep(120)  # let the app finish starting up first
    while True:
        try:
            saved = await asyncio.to_thread(_snapshot_tick)
            if saved:
                log.info("saved %d metric snapshot(s)", saved)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive across any error
            log.exception("metric snapshot tick failed")
        await asyncio.sleep(interval)


async def stop(app) -> None:
    """Cancel the worker tasks (call from lifespan shutdown)."""
    for name in ("publish_worker", "snapshot_worker"):
        task = getattr(app.state, name, None)
        if task is None:
            continue
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
