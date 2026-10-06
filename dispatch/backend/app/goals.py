"""Content goals — the 9 goals in 3 stages (Attract / Nurture / Convert) the
Plan & best time page shows, each judged by its own KPI.

They sit on top of content_ai.PILLARS, which stay what the AI writes and what
app/learning.py compares (so past results keep counting): every pillar
belongs to exactly one goal, and a brand's goal mix (Automation.goal_mix,
percent per goal) becomes "how many posts of which goal" for a plan. The
frontend mirrors GOALS in src/lib/goals.js — don't rename a key.
"""

from __future__ import annotations

from app.content_ai import PILLARS, SELLING_PILLARS

# key → stage, label, pillars, KPI. Order = the order shown on the page.
GOALS: dict[str, dict] = {
    "reach": {"stage": "attract", "label": "Increase Reach", "pillars": ("relatable", "local_moment"), "kpi": "Reach, Impressions"},
    "followers": {"stage": "attract", "label": "Increase Followers", "pillars": ("quote",), "kpi": "Follower growth"},
    "awareness": {"stage": "attract", "label": "Awareness", "pillars": ("trend", "benefit"), "kpi": "Reach, Views"},
    "engagement": {"stage": "attract", "label": "Engagement", "pillars": ("community",), "kpi": "Comments, Reactions"},
    "education": {"stage": "nurture", "label": "Education", "pillars": ("educate",), "kpi": "Saves, Shares"},
    "trust": {"stage": "nurture", "label": "Trust", "pillars": ("behind_scenes", "proof"), "kpi": "Engagement rate"},
    "authority": {"stage": "nurture", "label": "Authority", "pillars": ("comparison",), "kpi": "Shares, Mentions"},
    "solution": {"stage": "convert", "label": "Solution", "pillars": ("product",), "kpi": "Website clicks"},
    "conversion": {"stage": "convert", "label": "Conversion", "pillars": ("promotion",), "kpi": "Leads generated"},
}

# The AI's default mix (percent) — Attract 50 · Nurture 30 · Convert 20.
DEFAULT_MIX: dict[str, int] = {
    "reach": 15,
    "followers": 10,
    "awareness": 15,
    "engagement": 10,
    "education": 15,
    "trust": 10,
    "authority": 5,
    "solution": 10,
    "conversion": 10,
}

_GOAL_OF = {p: g for g, spec in GOALS.items() for p in spec["pillars"]}
assert set(_GOAL_OF) == set(PILLARS), "every pillar needs exactly one goal"

# Goals whose posts can only go on a selling day (all their pillars sell).
SELLING_GOALS = {g for g, spec in GOALS.items() if all(p in SELLING_PILLARS for p in spec["pillars"])}


def goal_of(pillar: str) -> str:
    return _GOAL_OF.get(pillar, "")


def clean_mix(mix: dict | None) -> dict[str, int] | None:
    """Known goals only, whole percents 0-100; None (or all zero) = the default."""
    if not isinstance(mix, dict):
        return None
    out = {}
    for g in GOALS:
        try:
            out[g] = max(0, min(100, int(mix.get(g, 0))))
        except (TypeError, ValueError):
            out[g] = 0
    return out if any(out.values()) else None


def targets(mix: dict | None, count: int) -> dict[str, int]:
    """How many of ``count`` posts each goal gets — largest remainder, so the
    counts always add up to ``count``."""
    mix = clean_mix(mix) or DEFAULT_MIX
    total = sum(mix.values())
    raw = {g: count * v / total for g, v in mix.items()}
    out = {g: int(r) for g, r in raw.items()}
    for g in sorted(raw, key=lambda g: (-(raw[g] - out[g]), -mix[g]))[: count - sum(out.values())]:
        out[g] += 1
    return out


def batch_brief(still_needed: dict[str, int], n: int, selling_allowed: int) -> tuple[str, dict[str, int]]:
    """The goals for the next ``n`` ideas: the ones furthest from their
    target, selling goals only up to ``selling_allowed``. Returns the brief
    line for content_ai and the picked counts."""
    picked: dict[str, int] = {}
    need = dict(still_needed)
    selling = 0
    # A selling day comes round only every few days — use it while it's here.
    for _ in range(min(n, selling_allowed)):
        owed = [g for g in SELLING_GOALS if need.get(g, 0) > 0]
        if not owed:
            break
        g = max(owed, key=lambda g: (need[g], -list(GOALS).index(g)))
        picked[g] = picked.get(g, 0) + 1
        need[g] -= 1
        selling += 1
    for _ in range(n - selling):
        options = [g for g, k in need.items() if k > 0 and (g not in SELLING_GOALS or selling < selling_allowed)]
        if not options:
            options = [g for g in GOALS if g not in SELLING_GOALS]  # mix met — fill with value goals
        g = max(options, key=lambda g: (need.get(g, 0), -list(GOALS).index(g)))
        picked[g] = picked.get(g, 0) + 1
        need[g] = need.get(g, 0) - 1
        selling += g in SELLING_GOALS
    parts = [
        f"{k} × {GOALS[g]['label']} (pillar {' or '.join(GOALS[g]['pillars'])})"
        for g, k in picked.items()
    ]
    return "GOAL MIX for this batch (one idea each): " + "; ".join(parts), picked
