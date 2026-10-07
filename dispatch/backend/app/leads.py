"""Leads & hand-off — qualified leads and who they go to (src/pages/LeadsPage.jsx).

A lead is what a chatbot (or a person) captured: the company, what they need,
a 0-100 score, the last chat messages. Once it is ready, ``suggest`` picks the
sales rep with the hand-off rules, checked in order:

1. Existing customer — the lead's phone, email or company matches an account
   in the customer list → that account's owner (always, whatever their load).
2. Regulated industry (banking, insurance, health…) → a senior rep, and the
   hand-off carries a compliance note.
3. Industry → the rep who owns that industry.
4. Rep at capacity (as many open leads as their limit) → the next rep on the
   same team: one who shares an industry, else the rep with the fewest open.

"Open" = handed over and not closed. Leads get in by hand (Add lead), by
import, or by POST /leads — the call a chatbot integration makes later. Every
route is workspace-scoped and needs the "leads" feature (app/access.py).
"""

from __future__ import annotations

import hashlib
import re
import secrets
import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import sales_alerts
from app.config import get_settings
from app.database import get_db
from app.models import Brand, Lead, LeadAccount, Post, PostTarget, SalesRep, TeamMember, Workspace, WorkspaceInvite
from app.tenancy import brand_ids, current_workspace_id, get_current_user, owned, require_manager, scope

router = APIRouter(prefix="/leads", tags=["Leads"])

HOT = 70  # score at or above → hot
WARM = 40  # at or above → warm, below → cold
READY_AT = 60  # a new lead with a way to contact them and this score is ready for a rep
CLOSE_BELOW = 25  # a new lead scoring under this is closed (not worth a rep)
SLA_MINUTES = {"hot": 15, "warm": 120}  # first contact within this long after hand-off; cold has none
SLA_WINDOW = timedelta(days=90)  # the Sales team table's "SLA met" looks this far back
# Industry words that make a lead "regulated" (rule 2).
REGULATED = ("bank", "insur", "health", "financ", "loan", "microfinance", "pharma", "medic", "hospital", "clinic")

RULES = [
    {"title": "Existing customer", "text": "Match phone, email or company in your customer list → its account owner"},
    {"title": "Regulated industry", "text": "(banking, insurance, health) → senior rep + compliance note"},
    {"title": "Industry", "text": "→ the rep who owns that industry"},
    {"title": "Rep at capacity", "text": "(at their open-lead limit) → next rep in the same team"},
]


# ── scoring and matching ──────────────────────────────────────────────────
def temperature(score: int) -> str:
    return "hot" if score >= HOT else "warm" if score >= WARM else "cold"


def auto_score(*, need="", volume="", timeline="", phone="", email="", contact_name="", messages=()) -> int:
    """A transparent 0-100 score from what the lead has told us: a stated need,
    volume and timeline, a way to contact them, and buying words in the chat."""
    s = 0
    s += 20 if need.strip() else 0
    s += 15 if volume.strip() else 0
    s += 15 if timeline.strip() else 0
    s += 20 if (phone.strip() or email.strip()) else 0
    s += 5 if contact_name.strip() else 0
    # What the customer said, plus the need as the bot or a person wrote it down.
    said = " ".join([need] + [m.get("text", "") for m in messages if m.get("from") == "customer"]).lower()
    if re.search(r"price|cost|how much|quote|demo|trial|buy|order|តម្លៃ|ចំណាយ", said):
        s += 20
    if re.search(r"today|tomorrow|this week|next week|asap|urgent|soon|before|ថ្ងៃនេះ|ស្អែក", f"{timeline} {said}".lower()):
        s += 10
    return min(100, s)


def default_status(score: int, has_contact: bool) -> str:
    if score < CLOSE_BELOW:
        return "closed"
    return "ready" if score >= READY_AT and has_contact else "qualifying"


def _digits(phone: str) -> str:
    d = re.sub(r"\D", "", phone or "")
    return d[-8:] if len(d) >= 8 else ""  # +855 12 345 678 and 012 345 678 are the same number


def _name_key(name: str) -> str:
    return re.sub(r"[^\w]+", " ", (name or "").lower()).strip()


def match_account(lead: Lead, accounts: list[LeadAccount]) -> LeadAccount | None:
    phone, email, name = _digits(lead.phone), (lead.email or "").strip().lower(), _name_key(lead.name)
    for a in accounts:
        if phone and phone == _digits(a.phone):
            return a
        if email and email == (a.email or "").strip().lower():
            return a
        if name and name == _name_key(a.name):
            return a
    return None


def _industry_match(rep: SalesRep, industry: str) -> bool:
    ind = (industry or "").strip().lower()
    if not ind:
        return False
    for owned_ in rep.industries or []:
        o = (owned_ or "").strip().lower()
        if o and (o in ind or ind in o):
            return True
    return False


def is_regulated(industry: str) -> bool:
    return any(k in (industry or "").lower() for k in REGULATED)


def open_counts(db: Session, ws: int) -> dict[int, int]:
    rows = db.execute(
        select(Lead.rep_id).where(Lead.brand_id.in_(brand_ids(ws)), Lead.status == "handed_off", Lead.rep_id.is_not(None))
    ).all()
    out: dict[int, int] = {}
    for (rid,) in rows:
        out[rid] = out.get(rid, 0) + 1
    return out


def suggest(db: Session, ws: int, lead: Lead) -> dict:
    """The rep the rules pick for this lead, and why. Never writes."""
    reps = db.scalars(select(SalesRep).where(scope(SalesRep, ws), SalesRep.active.is_(True)).order_by(SalesRep.name)).all()
    if not reps:
        return {"rep_id": None, "rep_name": "", "rule": "none", "reason": "Add your sales team first — there is nobody to hand this to.", "detail": "", "compliance": False}
    accounts = db.scalars(select(LeadAccount).where(scope(LeadAccount, ws))).all()
    load = open_counts(db, ws)
    n = lambda r: load.get(r.id, 0)  # noqa: E731
    regulated = is_regulated(lead.industry)
    ind = lead.industry.strip()
    pick, rule, reason = None, "", ""

    acct = match_account(lead, accounts)
    if acct is not None and acct.owner_rep_id:
        owner = next((r for r in reps if r.id == acct.owner_rep_id), None)
        if owner is not None:
            pick, rule = owner, "existing"
            reason = f"Existing customer {acct.name} → its account owner, {owner.name}."

    if pick is None and regulated:
        seniors = [r for r in reps if r.senior]
        pool = [r for r in seniors if _industry_match(r, ind)] or seniors
        if pool:
            pick, rule = min(pool, key=n), "regulated"
            reason = f"Regulated industry ({ind or 'regulated'}) → senior rep {pick.name}, with a compliance note."

    owners: list[SalesRep] = []
    if pick is None:
        owners = [r for r in reps if _industry_match(r, ind)]
        if owners:
            pick, rule = min(owners, key=n), "industry"
            reason = f"{'New company' if acct is None else 'Customer'} · {ind} → {pick.name}, who owns that industry."
        else:
            pick, rule = min(reps, key=n), "fewest"
            reason = f"No rep owns {ind or 'this industry'} yet → {pick.name}, who has the fewest open leads."

    # Rule 4: a full rep passes it on (an account owner keeps their own customers).
    if rule != "existing" and n(pick) >= pick.capacity:
        first = pick
        team = [r for r in reps if r.id != first.id and n(r) < r.capacity]
        mates = [r for r in team if any(_industry_match(r, i) for i in first.industries or []) or (first.senior and r.senior)]
        nxt = min(mates or team, key=n) if (mates or team) else None
        if nxt is not None:
            pick, rule = nxt, "capacity"
            reason = f"{first.name} is at capacity ({n(first)} open leads) → next rep on the team, {nxt.name}."
        else:
            reason += " Everyone is at capacity, so it stays with them."

    count = n(pick)
    detail = f"{pick.name} has {count} open lead{'' if count == 1 else 's'} (under {pick.capacity})." if count < pick.capacity else f"{pick.name} has {count} open leads (limit {pick.capacity})."
    return {
        "rep_id": pick.id,
        "rep_name": pick.name,
        "rule": rule,
        "reason": reason,
        "detail": detail,
        "compliance": regulated,
        "account": {"id": acct.id, "name": acct.name} if acct else None,
    }


# ── output ────────────────────────────────────────────────────────────────
def _out(lead: Lead, reps: dict[int, SalesRep], brands: dict[int, str], full: bool = False) -> dict:
    temp = temperature(lead.score)
    sla = SLA_MINUTES.get(temp)
    due = lead.handed_off_at + timedelta(minutes=sla) if (lead.handed_off_at and sla) else None
    rep = reps.get(lead.rep_id) if lead.rep_id else None
    out = {
        "id": lead.id,
        "brand_id": lead.brand_id,
        "brand_name": brands.get(lead.brand_id, ""),
        "name": lead.name,
        "industry": lead.industry,
        "source": lead.source,
        "contact_name": lead.contact_name,
        "phone": lead.phone,
        "email": lead.email,
        "summary": lead.summary,
        "need": lead.need,
        "volume": lead.volume,
        "timeline": lead.timeline,
        "score": lead.score,
        "temperature": temp,
        "status": lead.status,
        "rep": {"id": rep.id, "name": rep.name} if rep else None,
        "route": lead.route or {},
        "handed_off_at": lead.handed_off_at,
        "first_contact_at": lead.first_contact_at,
        "sla_minutes": sla,
        "sla_due_at": due,
        "sla_missed": bool(
            due and lead.status == "handed_off" and not lead.first_contact_at and datetime.now(UTC) > due
        ),
        "closed_at": lead.closed_at,
        "outcome": lead.outcome,
        "value_usd": float(lead.value_usd) if lead.value_usd is not None else None,
        "post_id": lead.post_id,
        "post_title": (lead.post.title or "Untitled post") if lead.post else "",
        "created_at": lead.created_at,
    }
    if full:
        out["messages"] = lead.messages or []
    return out


def _context(db: Session, ws: int) -> tuple[dict[int, SalesRep], dict[int, str]]:
    reps = {r.id: r for r in db.scalars(select(SalesRep).where(scope(SalesRep, ws)))}
    brands = {b.id: b.name for b in db.scalars(select(Brand).where(scope(Brand, ws)))}
    return reps, brands


_ORDER = {"ready": 0, "qualifying": 1, "handed_off": 2, "closed": 3}


# ── sales team (declared before /{lead_id} so "reps" isn't read as an id) ──
class RepIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=40)
    telegram: str = Field(default="", max_length=100)  # @username, for sales alerts
    member_id: int | None = None  # their portal login, if they have one
    industries: list[str] = Field(default_factory=list, max_length=12)
    senior: bool = False
    capacity: int = Field(default=12, ge=1, le=200)
    active: bool = True


def _tg(name: str) -> str:
    """A Telegram username as stored: no @, no t.me/ link, no spaces."""
    name = (name or "").strip()
    name = re.sub(r"^(https?://)?(t\.me/|telegram\.me/)", "", name, flags=re.I)
    return name.lstrip("@").strip()[:64]


def _clean_industries(items: list[str]) -> list[str]:
    seen: list[str] = []
    for i in items:
        i = (i or "").strip()[:60]
        if i and i.lower() not in [s.lower() for s in seen]:
            seen.append(i)
    return seen


def _rep_out(r: SalesRep, open_: int, handed: int, met_pct: int | None, extra: dict | None = None) -> dict:
    return {
        **(extra or {}),
        "member_id": r.member_id,
        "id": r.id,
        "name": r.name,
        "email": r.email,
        "phone": r.phone,
        "telegram": r.telegram,
        "industries": r.industries or [],
        "senior": r.senior,
        "capacity": r.capacity,
        "active": r.active,
        "open": open_,
        "handed_90d": handed,
        "sla_met_pct": met_pct,
    }


@router.get("/reps")
def reps_list(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    reps = db.scalars(select(SalesRep).where(scope(SalesRep, ws)).order_by(SalesRep.active.desc(), SalesRep.name)).all()
    load = open_counts(db, ws)
    since = datetime.now(UTC) - SLA_WINDOW
    recent = db.scalars(
        select(Lead).where(Lead.brand_id.in_(brand_ids(ws)), Lead.rep_id.is_not(None), Lead.handed_off_at >= since)
    ).all()
    members = {m.id: m for m in db.scalars(select(TeamMember).where(TeamMember.workspace_id == ws))}
    now_ = datetime.now(UTC)
    invited = {
        i.sales_rep_id
        for i in db.scalars(
            select(WorkspaceInvite).where(
                WorkspaceInvite.workspace_id == ws, WorkspaceInvite.sales_rep_id.is_not(None), WorkspaceInvite.revoked.is_(False)
            )
        )
        if i.expires_at > now_ and (i.max_uses is None or i.uses < i.max_uses)
    }
    out = []
    for r in reps:
        mine = [l for l in recent if l.rep_id == r.id]
        now = datetime.now(UTC)
        # A lead still inside its first-contact window isn't a miss yet — only
        # count ones that were contacted or whose time has run out.
        timed = [
            l
            for l in mine
            if SLA_MINUTES.get(temperature(l.score))
            and (l.first_contact_at or now > l.handed_off_at + timedelta(minutes=SLA_MINUTES[temperature(l.score)]))
        ]
        met = [
            l
            for l in timed
            if l.first_contact_at
            and l.first_contact_at <= l.handed_off_at + timedelta(minutes=SLA_MINUTES[temperature(l.score)])
        ]
        won = [l for l in mine if l.outcome == "won"]
        member = members.get(r.member_id) if r.member_id else None
        extra = {
            "won_90d": len(won),
            "won_value_90d": round(sum(float(l.value_usd or 0) for l in won)),
            "member": {"id": member.id, "name": member.name, "email": member.email, "active": member.is_active} if member else None,
            "invited": r.id in invited and member is None,
        }
        out.append(_rep_out(r, load.get(r.id, 0), len(mine), round(100 * len(met) / len(timed)) if timed else None, extra))
    return out


def _member_for(db: Session, ws: int, member_id: int | None, rep_id: int | None = None) -> int | None:
    """A login of this workspace that no other rep is linked to."""
    if member_id is None:
        return None
    m = db.get(TeamMember, member_id)
    if m is None or m.workspace_id != ws:
        raise HTTPException(422, "That person isn't in this workspace.")
    taken = db.scalar(select(SalesRep).where(SalesRep.member_id == member_id, SalesRep.id != (rep_id or 0)))
    if taken is not None:
        raise HTTPException(409, f"{m.name} is already linked to {taken.name}.")
    return m.id


@router.post("/reps/{rep_id}/invite")
def rep_invite(rep_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """A one-person, 7-day join link with Sales access (Leads only). Joining
    with it links the new login to this rep. Older links for the rep stop working."""
    from app.auth import _hash  # local: app.auth is heavy and only needed here

    rep = owned(db, SalesRep, rep_id, user.workspace_id, "Rep")
    if rep.member_id:
        raise HTTPException(409, f"{rep.name} already has a login.")
    for old in db.scalars(select(WorkspaceInvite).where(WorkspaceInvite.sales_rep_id == rep.id, WorkspaceInvite.revoked.is_(False))):
        old.revoked = True
    token = secrets.token_urlsafe(24)
    inv = WorkspaceInvite(
        workspace_id=user.workspace_id,
        created_by=user.id,
        token_hash=_hash(token),
        role="editor",
        access=["leads"],
        label=f"Sales · {rep.name}"[:120],
        expires_at=datetime.now(UTC) + timedelta(days=7),
        max_uses=1,
        sales_rep_id=rep.id,
    )
    db.add(inv)
    db.commit()
    return {"link": f"{get_settings().frontend_url.rstrip('/')}/join/{token}", "expires_at": inv.expires_at}


@router.post("/reps", status_code=201)
def rep_create(payload: RepIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rep = SalesRep(
        workspace_id=ws,
        name=payload.name.strip(),
        email=payload.email.strip(),
        phone=payload.phone.strip(),
        telegram=_tg(payload.telegram),
        member_id=_member_for(db, ws, payload.member_id),
        industries=_clean_industries(payload.industries),
        senior=payload.senior,
        capacity=payload.capacity,
        active=payload.active,
    )
    db.add(rep)
    db.commit()
    return _rep_out(rep, 0, 0, None)


@router.patch("/reps/{rep_id}")
def rep_update(rep_id: int, payload: RepIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rep = owned(db, SalesRep, rep_id, ws, "Rep")
    rep.name = payload.name.strip()
    rep.email = payload.email.strip()
    rep.phone = payload.phone.strip()
    rep.telegram = _tg(payload.telegram)
    rep.member_id = _member_for(db, ws, payload.member_id, rep.id)
    rep.industries = _clean_industries(payload.industries)
    rep.senior = payload.senior
    rep.capacity = payload.capacity
    rep.active = payload.active
    db.commit()
    return _rep_out(rep, open_counts(db, ws).get(rep.id, 0), 0, None)


@router.delete("/reps/{rep_id}", status_code=204)
def rep_delete(rep_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rep = owned(db, SalesRep, rep_id, ws, "Rep")
    if open_counts(db, ws).get(rep.id, 0):
        raise HTTPException(409, f"{rep.name} still has open leads — reassign them first (or mark the rep inactive).")
    db.delete(rep)
    db.commit()


# ── existing customers ────────────────────────────────────────────────────
class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=200)
    owner_rep_id: int | None = None
    note: str = Field(default="", max_length=400)


def _account_out(a: LeadAccount, reps: dict[int, SalesRep]) -> dict:
    owner = reps.get(a.owner_rep_id) if a.owner_rep_id else None
    return {
        "id": a.id,
        "name": a.name,
        "phone": a.phone,
        "email": a.email,
        "note": a.note,
        "owner": {"id": owner.id, "name": owner.name} if owner else None,
    }


def _check_owner(db: Session, ws: int, rep_id: int | None) -> None:
    if rep_id is not None:
        owned(db, SalesRep, rep_id, ws, "Rep")


@router.get("/accounts")
def accounts_list(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    reps, _ = _context(db, ws)
    rows = db.scalars(select(LeadAccount).where(scope(LeadAccount, ws)).order_by(LeadAccount.name)).all()
    return [_account_out(a, reps) for a in rows]


@router.post("/accounts", status_code=201)
def account_create(payload: AccountIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    _check_owner(db, ws, payload.owner_rep_id)
    a = LeadAccount(
        workspace_id=ws,
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        email=payload.email.strip(),
        owner_rep_id=payload.owner_rep_id,
        note=payload.note.strip(),
    )
    db.add(a)
    db.commit()
    reps, _ = _context(db, ws)
    return _account_out(a, reps)


class AccountImport(BaseModel):
    accounts: list[AccountIn] = Field(max_length=500)


@router.post("/accounts/import")
def accounts_import(payload: AccountImport, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Add many customers at once (e.g. exported from Dynamics 365). A row whose
    phone, email or name is already on the list is skipped, not duplicated."""
    reps, _ = _context(db, ws)
    existing = db.scalars(select(LeadAccount).where(scope(LeadAccount, ws))).all()
    phones = {_digits(a.phone) for a in existing if _digits(a.phone)}
    emails = {a.email.strip().lower() for a in existing if a.email.strip()}
    names = {_name_key(a.name) for a in existing}
    added = skipped = 0
    for row in payload.accounts:
        p, e, n = _digits(row.phone), row.email.strip().lower(), _name_key(row.name)
        if (p and p in phones) or (e and e in emails) or n in names or (row.owner_rep_id and row.owner_rep_id not in reps):
            skipped += 1
            continue
        db.add(
            LeadAccount(workspace_id=ws, name=row.name.strip(), phone=row.phone.strip(), email=row.email.strip(),
                        owner_rep_id=row.owner_rep_id, note=row.note.strip())
        )
        phones.add(p) if p else None
        emails.add(e) if e else None
        names.add(n)
        added += 1
    db.commit()
    return {"added": added, "skipped": skipped}


@router.patch("/accounts/{account_id}")
def account_update(account_id: int, payload: AccountIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    a = owned(db, LeadAccount, account_id, ws, "Customer")
    _check_owner(db, ws, payload.owner_rep_id)
    a.name, a.phone, a.email = payload.name.strip(), payload.phone.strip(), payload.email.strip()
    a.owner_rep_id, a.note = payload.owner_rep_id, payload.note.strip()
    db.commit()
    reps, _ = _context(db, ws)
    return _account_out(a, reps)


@router.delete("/accounts/{account_id}", status_code=204)
def account_delete(account_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    db.delete(owned(db, LeadAccount, account_id, ws, "Customer"))
    db.commit()


# ── leads ─────────────────────────────────────────────────────────────────
class Msg(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    sender: Literal["customer", "bot", "rep"] = Field(alias="from")
    text: str = Field(max_length=1000)


class LeadIn(BaseModel):
    brand_id: int
    name: str = Field(min_length=1, max_length=200)
    industry: str = Field(default="", max_length=120)
    source: str = Field(default="", max_length=120)
    contact_name: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=300)
    need: str = Field(default="", max_length=2000)
    volume: str = Field(default="", max_length=120)
    timeline: str = Field(default="", max_length=120)
    score: int | None = Field(default=None, ge=0, le=100)  # None = worked out from the fields
    status: Literal["qualifying", "ready", "closed"] | None = None  # None = worked out from the score
    messages: list[Msg] = Field(default_factory=list, max_length=60)
    post_id: int | None = None  # the post that brought them in


class LeadPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    industry: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=120)
    contact_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=300)
    need: str | None = Field(default=None, max_length=2000)
    volume: str | None = Field(default=None, max_length=120)
    timeline: str | None = Field(default=None, max_length=120)
    score: int | None = Field(default=None, ge=0, le=100)
    status: Literal["qualifying", "ready", "closed"] | None = None  # a handed-over lead moves with /close
    post_id: int | None = None  # send null to clear it


def _post_for(db: Session, ws: int, brand_id: int, post_id: int | None) -> int | None:
    """The post must be one of this workspace's, and belong to the lead's brand."""
    if post_id is None:
        return None
    post = owned(db, Post, post_id, ws, "Post")
    if post.brand_id != brand_id:
        raise HTTPException(422, "That post belongs to a different brand.")
    return post.id


@router.get("/post-options")
def post_options(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Recently published posts of a brand — the list a lead's "which post brought
    them?" picker offers."""
    owned(db, Brand, brand_id, ws)
    rows = db.execute(
        select(Post.id, Post.title, func.max(PostTarget.published_at).label("at"))
        .join(PostTarget, PostTarget.post_id == Post.id)
        .where(scope(Post, ws), Post.brand_id == brand_id, PostTarget.status == "posted")
        .group_by(Post.id)
        .order_by(func.max(PostTarget.published_at).desc())
        .limit(60)
    ).all()
    return [{"id": r.id, "title": r.title or "Untitled post", "at": r.at} for r in rows]


def _msgs(items: list[Msg]) -> list[dict]:
    return [{"from": m.sender, "text": m.text.strip()} for m in items if m.text.strip()][-30:]


@router.get("")
def leads_list(
    brand_id: int | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
    my_rep = db.scalar(select(SalesRep).where(SalesRep.member_id == user.id, SalesRep.workspace_id == ws))
    q = select(Lead).where(scope(Lead, ws))
    if brand_id is not None:
        q = q.where(Lead.brand_id == brand_id)
    if mine:  # a rep's own leads only
        q = q.where(Lead.rep_id == (my_rep.id if my_rep else -1))
    rows = db.scalars(q.order_by(Lead.created_at.desc()).limit(500)).all()
    rows.sort(key=lambda l: (_ORDER.get(l.status, 9), -l.score))
    reps, brands = _context(db, ws)
    counts = {s: 0 for s in _ORDER}
    for l in rows:
        counts[l.status] = counts.get(l.status, 0) + 1
    return {
        "leads": [_out(l, reps, brands) for l in rows],
        "counts": counts,
        "rules": RULES,
        "has_reps": any(r.active for r in reps.values()),
        "my_rep_id": my_rep.id if my_rep else None,
    }


@router.post("", status_code=201)
def lead_create(payload: LeadIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, payload.brand_id, ws)
    messages = _msgs(payload.messages)
    score = payload.score
    if score is None:
        score = auto_score(
            need=payload.need, volume=payload.volume, timeline=payload.timeline, phone=payload.phone,
            email=payload.email, contact_name=payload.contact_name, messages=messages,
        )
    lead = Lead(
        brand_id=payload.brand_id,
        name=payload.name.strip(),
        industry=payload.industry.strip(),
        source=payload.source.strip(),
        contact_name=payload.contact_name.strip(),
        phone=payload.phone.strip(),
        email=payload.email.strip(),
        summary=(payload.summary.strip() or " ".join(payload.need.split())[:140]),
        need=payload.need.strip(),
        volume=payload.volume.strip(),
        timeline=payload.timeline.strip(),
        score=score,
        status=payload.status or default_status(score, bool(payload.phone.strip() or payload.email.strip())),
        messages=messages,
        post_id=_post_for(db, ws, payload.brand_id, payload.post_id),
    )
    accounts = db.scalars(select(LeadAccount).where(scope(LeadAccount, ws))).all()
    acct = match_account(lead, accounts)
    lead.account_id = acct.id if acct else None
    db.add(lead)
    db.commit()
    reps, brands = _context(db, ws)
    return _out(lead, reps, brands, full=True)


# ── chatbot intake key (Setup → Chatbots) ─────────────────────────────────
def _key_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def post_code(post_id: int) -> str:
    """The short code a post's links carry (t.me/bot?start=P123) so the chatbot
    can say which post a conversation came from."""
    return f"P{post_id}"


_CODE = re.compile(r"^\s*[Pp](\d{1,9})\s*$")


@router.get("/intake-key")
def intake_key_status(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    w = db.get(Workspace, ws)
    since = datetime.now(UTC) - timedelta(days=30)
    recent = db.scalar(
        select(func.count()).select_from(Lead).where(
            Lead.brand_id.in_(brand_ids(ws)), Lead.external_id != "", Lead.created_at >= since
        )
    )
    brands = db.scalars(select(Brand).where(scope(Brand, ws)).order_by(Brand.name)).all()
    return {
        "configured": bool(w.lead_intake_key_hash),
        "hint": w.lead_intake_key_hint,
        "last_lead_at": w.lead_intake_last_at,
        "leads_30d": recent or 0,
        "path": "/api/intake/leads",
        "brands": [{"id": b.id, "name": b.name} for b in brands],
    }


@router.post("/intake-key")
def intake_key_create(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Make a new key (replacing any old one, which stops working at once).
    The key is only ever shown in this response."""
    key = "cfk_" + secrets.token_urlsafe(32)
    w = db.get(Workspace, user.workspace_id)
    w.lead_intake_key_hash = _key_hash(key)
    w.lead_intake_key_hint = key[-4:]
    db.commit()
    return {"key": key, "hint": w.lead_intake_key_hint}


@router.delete("/intake-key", status_code=204)
def intake_key_delete(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    w = db.get(Workspace, user.workspace_id)
    w.lead_intake_key_hash = None
    w.lead_intake_key_hint = ""
    db.commit()


@router.get("/{lead_id}")
def lead_detail(lead_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    lead = owned(db, Lead, lead_id, ws, "Lead")
    reps, brands = _context(db, ws)
    out = _out(lead, reps, brands, full=True)
    out["suggestion"] = suggest(db, ws, lead) if lead.status in ("ready", "qualifying") else None
    return out


@router.patch("/{lead_id}")
def lead_update(lead_id: int, payload: LeadPatch, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    lead = owned(db, Lead, lead_id, ws, "Lead")
    data = payload.model_dump(exclude_unset=True)
    status = data.pop("status", None)
    if "post_id" in data:
        lead.post_id = _post_for(db, ws, lead.brand_id, data.pop("post_id"))
    for field, value in data.items():
        if value is not None:
            setattr(lead, field, value.strip() if isinstance(value, str) else value)
    if status is not None:
        if lead.status == "handed_off":
            raise HTTPException(409, "This lead is with a rep — close it or reassign it instead.")
        lead.status = status
        lead.closed_at = datetime.now(UTC) if status == "closed" else None
    accounts = db.scalars(select(LeadAccount).where(scope(LeadAccount, ws))).all()
    acct = match_account(lead, accounts)
    lead.account_id = acct.id if acct else None
    db.commit()
    reps, brands = _context(db, ws)
    return _out(lead, reps, brands, full=True)


@router.delete("/{lead_id}", status_code=204)
def lead_delete(lead_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    db.delete(owned(db, Lead, lead_id, ws, "Lead"))
    db.commit()


class HandoffIn(BaseModel):
    rep_id: int | None = None  # None = the rep the rules pick


@router.post("/{lead_id}/handoff")
def lead_handoff(
    lead_id: int,
    payload: HandoffIn | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Hand the lead to a rep — the rules' pick, or the one chosen here."""
    payload = payload or HandoffIn()
    lead = owned(db, Lead, lead_id, ws, "Lead")
    if lead.status == "handed_off":
        raise HTTPException(409, "Already handed over — use Reassign to change the rep.")
    if lead.status == "closed":
        raise HTTPException(409, "This lead is closed.")
    sug = suggest(db, ws, lead)
    if payload.rep_id is not None:
        rep = owned(db, SalesRep, payload.rep_id, ws, "Rep")
        if not rep.active:
            raise HTTPException(409, f"{rep.name} is inactive.")
        route = {"rule": "manual", "reason": f"Chosen by {user.name}.", "compliance": sug["compliance"]}
        if rep.id == sug["rep_id"]:
            route = {"rule": sug["rule"], "reason": sug["reason"], "compliance": sug["compliance"]}
    else:
        if sug["rep_id"] is None:
            raise HTTPException(422, sug["reason"])
        rep = db.get(SalesRep, sug["rep_id"])
        route = {"rule": sug["rule"], "reason": sug["reason"], "compliance": sug["compliance"]}
    lead.rep_id = rep.id
    lead.status = "handed_off"
    lead.route = route
    lead.handed_off_at = datetime.now(UTC)
    lead.handed_off_by = user.id
    lead.first_contact_at = None
    db.commit()
    sales_alerts.notify_handoff(lead.id)
    reps, brands = _context(db, ws)
    return _out(lead, reps, brands, full=True)


class ReassignIn(BaseModel):
    rep_id: int


@router.post("/{lead_id}/reassign")
def lead_reassign(
    lead_id: int,
    payload: ReassignIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    lead = owned(db, Lead, lead_id, ws, "Lead")
    if lead.status != "handed_off":
        raise HTTPException(409, "Only a lead that is with a rep can be reassigned.")
    rep = owned(db, SalesRep, payload.rep_id, ws, "Rep")
    if not rep.active:
        raise HTTPException(409, f"{rep.name} is inactive.")
    lead.rep_id = rep.id
    lead.route = {**(lead.route or {}), "rule": "manual", "reason": f"Reassigned to {rep.name} by {user.name}."}
    if not lead.first_contact_at:
        lead.handed_off_at = datetime.now(UTC)  # the new rep's clock starts now
    db.commit()
    sales_alerts.notify_handoff(lead.id, reassigned=True)
    reps, brands = _context(db, ws)
    return _out(lead, reps, brands, full=True)


@router.post("/{lead_id}/contacted")
def lead_contacted(lead_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The rep reached out — stops the first-contact clock."""
    lead = owned(db, Lead, lead_id, ws, "Lead")
    if lead.status != "handed_off":
        raise HTTPException(409, "This lead isn't with a rep.")
    if not lead.first_contact_at:
        lead.first_contact_at = datetime.now(UTC)
    db.commit()
    reps, brands = _context(db, ws)
    return _out(lead, reps, brands, full=True)


class CloseIn(BaseModel):
    outcome: Literal["won", "lost", ""] = ""
    value_usd: float | None = Field(default=None, ge=0, le=1_000_000_000)


@router.post("/{lead_id}/close")
def lead_close(lead_id: int, payload: CloseIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    lead = owned(db, Lead, lead_id, ws, "Lead")
    lead.status = "closed"
    lead.closed_at = datetime.now(UTC)
    lead.outcome = payload.outcome
    lead.value_usd = payload.value_usd if payload.outcome == "won" else None
    db.commit()
    reps, brands = _context(db, ws)
    return _out(lead, reps, brands, full=True)


# ── chatbot intake (public — authenticated by the workspace's key) ─────────
# Mounted without the signed-in-user dependency (app/main.py). Spec for the
# chatbot team: docs/chatbot-lead-intake.md.
intake_router = APIRouter(prefix="/intake", tags=["Lead intake"])

# At most this many calls per key per minute — a broken bot or a leaked key
# can't flood a workspace. Kept in memory, per server process.
INTAKE_PER_MINUTE = 60
_intake_calls: dict[int, list[float]] = {}
_intake_lock = threading.Lock()


def _within_rate(ws: int) -> bool:
    now = time.monotonic()
    with _intake_lock:
        recent = [t for t in _intake_calls.get(ws, []) if now - t < 60]
        if len(recent) >= INTAKE_PER_MINUTE:
            _intake_calls[ws] = recent
            return False
        recent.append(now)
        _intake_calls[ws] = recent
        return True


class IntakeLead(BaseModel):
    external_id: str = Field(min_length=1, max_length=120)  # the bot's conversation id
    brand_id: int | None = None  # optional when the workspace has one brand
    ref: str = Field(default="", max_length=40)  # the post code from the link, e.g. "P123"
    name: str = Field(default="", max_length=200)
    industry: str = Field(default="", max_length=120)
    source: str = Field(default="", max_length=120)
    contact_name: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=300)
    need: str = Field(default="", max_length=2000)
    volume: str = Field(default="", max_length=120)
    timeline: str = Field(default="", max_length=120)
    score: int | None = Field(default=None, ge=0, le=100)
    messages: list[Msg] = Field(default_factory=list, max_length=60)


def _workspace_for_key(db: Session, key: str | None) -> Workspace:
    if not key or not key.startswith("cfk_"):
        raise HTTPException(401, "Missing or malformed X-ContentFlow-Key header.")
    w = db.scalar(select(Workspace).where(Workspace.lead_intake_key_hash == _key_hash(key.strip())))
    if w is None:
        raise HTTPException(401, "Unknown key — it may have been replaced in Setup.")
    return w


@intake_router.post("/leads")
def intake_lead(
    payload: IntakeLead,
    db: Session = Depends(get_db),
    x_contentflow_key: str | None = Header(default=None),
):
    """A chatbot sends (or re-sends) one conversation. The same external_id
    updates the same lead; a lead a rep already holds keeps its status."""
    w = _workspace_for_key(db, x_contentflow_key)
    ws = w.id
    if not _within_rate(ws):
        raise HTTPException(429, f"Too many leads — at most {INTAKE_PER_MINUTE} a minute. Try again shortly.")
    if payload.brand_id is not None:
        brand = db.scalar(select(Brand).where(Brand.id == payload.brand_id, Brand.workspace_id == ws))
        if brand is None:
            raise HTTPException(422, "brand_id is not a brand of this workspace.")
    else:
        brands = db.scalars(select(Brand).where(Brand.workspace_id == ws)).all()
        if len(brands) != 1:
            raise HTTPException(422, "This workspace has several brands — send brand_id (listed in Setup → Chatbots).")
        brand = brands[0]

    post_id = None
    m = _CODE.match(payload.ref or "")
    if m:
        post = db.get(Post, int(m.group(1)))
        if post is not None and post.brand_id == brand.id:
            post_id = post.id  # an unknown or foreign code is ignored, never an error

    lead = db.scalar(select(Lead).where(Lead.brand_id == brand.id, Lead.external_id == payload.external_id.strip()))
    created = lead is None
    messages = _msgs(payload.messages)
    if created:
        name = payload.name.strip() or payload.contact_name.strip() or f"Chat {payload.external_id.strip()[:40]}"
        lead = Lead(brand_id=brand.id, external_id=payload.external_id.strip(), name=name[:200])
        db.add(lead)
    # Fill in what the bot knows now; never blank out what it said before.
    for field in ("industry", "source", "contact_name", "phone", "email", "need", "volume", "timeline", "summary"):
        value = getattr(payload, field).strip()
        if value:
            setattr(lead, field, value)
    if payload.name.strip():
        lead.name = payload.name.strip()[:200]
    if not lead.summary:
        lead.summary = " ".join((lead.need or "").split())[:140]
    if messages:
        lead.messages = messages
    if post_id and not lead.post_id:
        lead.post_id = post_id
    lead.score = (
        payload.score
        if payload.score is not None
        else auto_score(
            need=lead.need or "", volume=lead.volume or "", timeline=lead.timeline or "", phone=lead.phone or "",
            email=lead.email or "", contact_name=lead.contact_name or "", messages=lead.messages or [],
        )
    )
    if created or lead.status in ("qualifying", "ready"):  # a rep's lead keeps its place
        lead.status = default_status(lead.score, bool((lead.phone or "").strip() or (lead.email or "").strip()))
    accounts = db.scalars(select(LeadAccount).where(LeadAccount.workspace_id == ws)).all()
    acct = match_account(lead, accounts)
    lead.account_id = acct.id if acct else None
    w.lead_intake_last_at = datetime.now(UTC)
    db.commit()
    return {
        "id": lead.id,
        "created": created,
        "status": lead.status,
        "score": lead.score,
        "temperature": temperature(lead.score),
        "post_id": lead.post_id,
    }
