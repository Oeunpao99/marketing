"""Daily content generation — the engine behind the Auto-generate page.

A single asyncio task (mirrors ``app/scheduler.py``'s delivery worker) that
wakes every minute and, for each enabled ``Automation`` whose ``run_at`` on the
Phnom Penh clock has passed today and hasn't run yet today, writes that
brand's batch of ideas as ``Draft`` rows dated onto today's calendar slot.

``run_automation`` is the shared core — the worker calls it on schedule, and
``POST /api/views/auto/{id}/run-now`` calls it on demand for a same-day test.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.content_ai import ContentAIError, generate_ideas
from app.database import SessionLocal
from app.models import Automation, Brand, Draft, Product

log = logging.getLogger("app.content_scheduler")

# Same fixed-offset clock every schedule-facing view in this app uses.
PHNOM_PENH = timezone(timedelta(hours=7))


def _today() -> date:
    return datetime.now(PHNOM_PENH).date()


def run_automation(db: Session, automation_id: int) -> list[Draft] | None:
    """Generate + persist one automation's batch of ideas for today.

    Row-locks the ``Automation`` and re-checks ``last_run_on`` before writing,
    so the minute-by-minute worker tick and a manual "run now" click racing
    each other can't both write today's batch — the loser just waits for the
    lock, sees today is already done, and returns ``None``. Raises
    ``ContentAIError`` on failure; ``last_run_on`` only advances on success, so
    a failed run is retried on the next tick.
    """
    automation = db.execute(
        select(Automation).where(Automation.id == automation_id).with_for_update()
    ).scalar_one_or_none()
    if automation is None:
        raise ContentAIError(f"Automation {automation_id} not found.")

    today = _today()
    if automation.last_run_on == today:
        db.commit()  # release the row lock
        return None

    brand = db.get(Brand, automation.brand_id)
    if brand is None:
        db.commit()
        raise ContentAIError(f"Automation {automation.id} has no brand.")

    products = db.scalars(
        select(Product).where(Product.brand_id == brand.id).order_by(Product.name)
    ).all()
    count = max(1, min(automation.videos_per_day, 5))
    try:
        ideas = generate_ideas(brand.name, brand.lang, list(products), automation.topic_source, count)
    except ContentAIError:
        db.commit()  # release the lock even though this attempt failed
        raise

    status = "waiting" if automation.require_approval else "approved"
    drafts = [
        Draft(
            brand_id=brand.id,
            title=idea["title"],
            body=idea["caption"],
            insight=idea["insight"],
            planned_for=today,
            source="ai-auto",
            status=status,
        )
        for idea in ideas
    ]
    db.add_all(drafts)
    automation.last_run_on = today
    db.commit()
    for d in drafts:
        db.refresh(d)
    return drafts


def _due(automation: Automation, now: datetime) -> bool:
    if not automation.enabled:
        return False
    if automation.last_run_on == now.date():
        return False
    return now.time() >= automation.run_at


def _tick() -> dict:
    """One generation pass across every brand. Runs in a worker thread."""
    db = SessionLocal()
    written = 0
    failed: list[str] = []
    try:
        now = datetime.now(PHNOM_PENH)
        due_ids = [a.id for a in db.scalars(select(Automation)).all() if _due(a, now)]
        for automation_id in due_ids:
            try:
                drafts = run_automation(db, automation_id)
                written += len(drafts) if drafts else 0
            except ContentAIError as exc:
                db.rollback()
                failed.append(f"automation {automation_id}: {exc}")
            except Exception:  # noqa: BLE001 - one brand's bug shouldn't sink the tick
                db.rollback()
                log.exception("content generation crashed for automation %s", automation_id)
                failed.append(f"automation {automation_id}: unexpected error")
        return {"checked": len(due_ids), "written": written, "failed": failed}
    finally:
        db.close()


async def _run(interval: int) -> None:
    log.info("content scheduler started (checks every %ss)", interval)
    while True:
        try:
            result = await asyncio.to_thread(_tick)
            if result["checked"]:
                log.info(
                    "content scheduler: %d automation(s) due, %d idea(s) written",
                    result["checked"], result["written"],
                )
            for msg in result["failed"]:
                log.warning("content scheduler: %s", msg)
        except asyncio.CancelledError:
            log.info("content scheduler stopping")
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive across any error
            log.exception("content scheduler tick failed")
        await asyncio.sleep(interval)


def start(app) -> None:
    """Attach the worker task to the FastAPI app (call from lifespan startup)."""
    settings = get_settings()
    if not settings.content_scheduler_enabled:
        log.info("content scheduler disabled (CONTENT_SCHEDULER_ENABLED=false)")
        app.state.content_scheduler = None
        return
    app.state.content_scheduler = asyncio.create_task(_run(60))


async def stop(app) -> None:
    task = getattr(app.state, "content_scheduler", None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
