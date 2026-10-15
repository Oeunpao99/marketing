"""Writing-model choice for a workspace (app/ai_models.py has the catalog):
which models it may pick and what each costs it, its default, and its usage
by model and person. The platform admin's side is in app/admin.py."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import ai_models
from app.config import get_settings
from app.database import get_db
from app.models import CreditEntry, TeamMember, Workspace
from app.tenancy import current_workspace_id, require_manager

router = APIRouter(prefix="/ai-models", tags=["AI models"])


def platform_default() -> str:
    """The platform's writer as a catalog key (what "Default" means)."""
    s = get_settings()
    writer = s.azure_openai_writer_deployment or s.azure_openai_deployment
    return writer if writer in ai_models.CATALOG else ""


def model_rows(ws: Workspace | None) -> list[dict]:
    """The models this workspace may pick, with what 1M tokens costs it (markup included)."""
    out = []
    for key in ai_models.allowed_for(ws):
        p_in, p_out, markup = ai_models.pricing(key) or (0, 0, 1)
        out.append({**ai_models.CATALOG[key], "key": key, "price_in": round(p_in * markup, 4), "price_out": round(p_out * markup, 4)})
    # a cost tier for the menu: $ cheapest … $$$ priciest (by output price)
    prices = sorted({m["price_out"] for m in out})
    for m in out:
        rank = prices.index(m["price_out"]) if prices else 0
        m["tier"] = "$" * (1 + round(2 * rank / max(1, len(prices) - 1))) if len(prices) > 1 else "$"
    return out


@router.get("")
def list_models(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    w = db.get(Workspace, ws)
    rows = model_rows(w)
    keys = [m["key"] for m in rows]
    default = w.ai_model if w and w.ai_model in keys else ""
    return {"models": rows, "default": default, "platform_default": platform_default() if platform_default() in keys else ""}


class DefaultIn(BaseModel):
    model: str = Field(default="", max_length=40)  # "" = the platform's default


@router.put("/default")
def set_default(payload: DefaultIn, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    w = db.get(Workspace, user.workspace_id)
    if payload.model and payload.model not in ai_models.allowed_for(w):
        raise HTTPException(400, "That model isn't available to this workspace.")
    w.ai_model = payload.model
    db.commit()
    ai_models.forget_workspace(w.id)
    return {"default": w.ai_model}


def usage_rows(db: Session, since: datetime, ws: int | None = None, by_user: bool = False) -> list[dict]:
    """AI text spend since ``since``, grouped by workspace (or person) and model."""
    who = CreditEntry.user_id if by_user else CreditEntry.workspace_id
    q = (
        select(
            who,
            CreditEntry.model,
            func.count(),
            func.coalesce(func.sum(CreditEntry.input_tokens), 0),
            func.coalesce(func.sum(CreditEntry.output_tokens), 0),
            func.coalesce(func.sum(CreditEntry.tokens), 0),
            func.coalesce(func.sum(CreditEntry.cost_usd), 0),
            func.coalesce(-func.sum(CreditEntry.amount_usd), 0),
        )
        .where(CreditEntry.kind == "text", CreditEntry.created_at >= since)
        .group_by(who, CreditEntry.model)
    )
    if ws is not None:
        q = q.where(CreditEntry.workspace_id == ws)
    out: dict[tuple, dict] = {}
    for w, m, n, tin, tout, tot, cost, charged in db.execute(q).all():
        # older entries carry the provider's dated name ("gpt-5-mini-2025-08-07")
        r = out.setdefault((w, ai_models.canonical(m or "")), {"who": w, "model": ai_models.canonical(m or ""), "calls": 0, "input_tokens": 0, "output_tokens": 0, "tokens": 0, "cost": 0.0, "charged": 0.0})
        r["calls"] += n
        r["input_tokens"] += int(tin)
        r["output_tokens"] += int(tout)
        r["tokens"] += int(tot)
        r["cost"] = round(r["cost"] + float(cost), 4)  # what the provider charged us
        r["charged"] = round(r["charged"] + float(charged), 4)  # what the workspace's credit was charged
    return list(out.values())


@router.get("/usage")
def my_usage(days: int = 30, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """This workspace's AI writing by model and person, the last ``days`` days."""
    since = datetime.now(UTC) - timedelta(days=max(1, min(days, 366)))
    names = dict(db.execute(select(TeamMember.id, TeamMember.name).where(TeamMember.workspace_id == ws)).all())
    rows = usage_rows(db, since, ws=ws, by_user=True)
    for r in rows:
        r["user"] = names.get(r.pop("who"), "Automations")
        r.pop("cost", None)  # our cost stays ours — they see what they were charged
    return {"days": days, "rows": rows}
