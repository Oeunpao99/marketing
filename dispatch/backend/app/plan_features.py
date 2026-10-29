"""What each plan unlocks — the packages from the sales proposal (2026-10-28), kept in step
with the plan cards (src/lib/plans.js) — and the checks that hold a workspace to them.

The videos / images a month and the longest video are app/usage.py's (set in the admin
portal); this is everything else:

    brands            how many brands the workspace has (None = no limit)
    channels          connected channels per brand (Pages / accounts)
    posts_per_day     AI posts a day per brand (the automation's daily number)
    auto_post         posts may go out without a review (else every one waits for a yes)
    leads             Leads & hand-off (the chatbot's intake still keeps them — they wait)
    sales_reps        sales reps leads go to
    own_voice         the brand's own voice for videos (app/brand_voice.py)
    api               API keys and the MCP connector (app/api_keys.py, app/mcp_server.py)
    boost             which posts to boost (Insights)
    export            the Insights report as Excel / CSV (made in the browser — the app locks it)

A refusal is a 402 with a sentence that names the plan to move to — the app shows it as is.
Nothing already made is ever removed by a lower plan: it only stops more being added.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import billing
from app.models import Brand, Channel, Workspace

FEATURES: dict[str, dict] = {
    "free": {"brands": 1, "channels": 2, "posts_per_day": 1, "auto_post": False, "leads": False, "sales_reps": 0, "own_voice": False, "api": False, "boost": False, "export": False},
    "starter": {"brands": 1, "channels": 3, "posts_per_day": 1, "auto_post": False, "leads": False, "sales_reps": 0, "own_voice": False, "api": False, "boost": False, "export": False},
    "pro": {"brands": 1, "channels": 5, "posts_per_day": 2, "auto_post": True, "leads": True, "sales_reps": 3, "own_voice": False, "api": False, "boost": True, "export": False},
    "business": {"brands": 3, "channels": 5, "posts_per_day": 3, "auto_post": True, "leads": True, "sales_reps": 10, "own_voice": True, "api": True, "boost": True, "export": True},
    "enterprise": {"brands": None, "channels": None, "posts_per_day": 10, "auto_post": True, "leads": True, "sales_reps": None, "own_voice": True, "api": True, "boost": True, "export": True},
}
ORDER = ["free", "starter", "pro", "business", "enterprise"]
# what the feature is called in a refusal
NAMES = {
    "auto_post": "Posting automatically (without a review)",
    "leads": "Leads & hand-off",
    "own_voice": "Your own voice for videos",
    "api": "API & MCP",
    "boost": "Boost suggestions",
}


def plan_of(db: Session, ws: int) -> str:
    plan = db.scalar(select(Workspace.plan).where(Workspace.id == ws)) or "free"
    return plan if plan in FEATURES else "free"


def features(db: Session, ws: int) -> dict:
    """This workspace's plan and what it unlocks — sent to the app with the usage (GET /usage)."""
    plan = plan_of(db, ws)
    return {"plan": plan, **FEATURES[plan]}


def label(plan: str) -> str:
    return billing.PLAN_LABEL.get(plan, plan.title())


def first_with(key: str, more_than: int | None = None) -> str:
    """The lowest plan that has ``key`` (or more than ``more_than`` of it)."""
    for p in ORDER:
        v = FEATURES[p][key]
        if (more_than is None and v is True) or (more_than is not None and (v is None or (isinstance(v, int) and not isinstance(v, bool) and v > more_than))):
            return p
    return "enterprise"


def allows(db: Session, ws: int, key: str) -> bool:
    return bool(FEATURES[plan_of(db, ws)][key])


def require(db: Session, ws: int, key: str) -> None:
    """Refuse (402) when the plan doesn't include ``key``."""
    plan = plan_of(db, ws)
    if FEATURES[plan][key]:
        return
    need = first_with(key)
    raise HTTPException(402, f"{NAMES.get(key, key)} is on the {label(need)} plan and up — you're on {label(plan)}. Upgrade to use it.")


def needs(key: str):
    """A route dependency: the signed-in workspace's plan includes ``key`` (402 if not)."""
    from fastapi import Depends

    from app.database import get_db
    from app.tenancy import current_workspace_id

    def dep(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)) -> None:
        require(db, ws, key)

    return dep


def check_brand(db: Session, ws: int) -> None:
    """Before a new brand: the plan has room for one more."""
    plan = plan_of(db, ws)
    most = FEATURES[plan]["brands"]
    if most is None:
        return
    have = db.scalar(select(func.count()).select_from(Brand).where(Brand.workspace_id == ws)) or 0
    if have >= most:
        need = first_with("brands", have)
        raise HTTPException(
            402,
            f"Your {label(plan)} plan has {most} brand{'' if most == 1 else 's'}. "
            f"Upgrade to {label(need)} for more brands.",
        )


def check_channel(db: Session, brand: Brand, keep: int | None = None, adding: int = 1) -> None:
    """Before connecting ``adding`` channel(s) to ``brand``: the plan has room. ``keep`` = a channel
    being connected again (already counted, so it never blocks itself)."""
    plan = plan_of(db, brand.workspace_id)
    most = FEATURES[plan]["channels"]
    if most is None:
        return
    q = select(func.count()).select_from(Channel).where(Channel.brand_id == brand.id, Channel.status != "off")
    if keep is not None:
        q = q.where(Channel.id != keep)
    have = db.scalar(q) or 0
    if have + adding > most:
        need = first_with("channels", most)
        raise HTTPException(
            402,
            f"Your {label(plan)} plan connects {most} channels per brand — {brand.name} has {have}. "
            f"Disconnect one, or upgrade to {label(need)} for more.",
        )


def check_reps(db: Session, ws: int) -> None:
    """Before a new sales rep: the plan has room for one more."""
    from app.models import SalesRep

    plan = plan_of(db, ws)
    most = FEATURES[plan]["sales_reps"]
    if most is None:
        return
    have = db.scalar(select(func.count()).select_from(SalesRep).where(SalesRep.workspace_id == ws)) or 0
    if have >= most:
        raise HTTPException(402, f"Your {label(plan)} plan has {most} sales reps. Upgrade to {label(first_with('sales_reps', most))} for more.")


def posts_per_day(db: Session, ws: int, wanted: int) -> int:
    """The automation's daily number, held to the plan's."""
    most = FEATURES[plan_of(db, ws)]["posts_per_day"]
    return max(1, min(wanted, most if most is not None else wanted))
