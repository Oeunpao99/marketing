"""Per-member feature access — what an Editor may use.

Owners and admins always have everything. An editor's ``TeamMember.access`` is
either null (everything an editor can do) or a list of FEATURES keys; the
frontend hides what's not on it and ``check`` (run by tenancy.get_current_user
on every signed-in request) refuses the API calls behind it, so a hidden page
can't be reached by calling the API directly.

Reading shared data other pages need (brands, channels list, products list,
calendar) stays open — the rules guard each feature's own actions.
"""

from __future__ import annotations

import re

from fastapi import HTTPException, Request

# key → (label, what it covers) — also shown on the Team page.
FEATURES: dict[str, tuple[str, str]] = {
    "compose": ("Compose & schedule", "Write, schedule, edit and publish posts"),
    "content": ("Review AI ideas", "Approve or send back the AI's daily ideas"),
    "ai": ("AI Agent", "Ask the AI, make images, videos and stories, improve posts"),
    "weekly": ("Weekly plan", "Plan a week of posts with AI"),
    "auto": ("Auto-generate", "Daily AI ideas and their settings"),
    "library": ("Library", "Generated images and videos, and their captions"),
    "products": ("Products & brand kit", "Add or change products, logo and poster templates"),
    "channels": ("Platforms", "Connect, disconnect and import from Pages and accounts"),
    "insights": ("Analytics", "Post results and insights"),
    "website": ("Website check", "Website health, SEO, speed and domain checks"),
    "activity": ("Activity plan", "The team's weekly goals and day-by-day to-do list"),
    "leads": ("Leads & hand-off", "See chatbot leads, hand them to the sales team, and manage the team"),
}

_W = {"POST", "PUT", "PATCH", "DELETE"}

# (feature, methods — None = any, path regex after "/api")
RULES: list[tuple[str, set[str] | None, re.Pattern[str]]] = [
    ("compose", _W, re.compile(r"^/views/(schedule|posts/|post-targets/)")),
    ("compose", _W, re.compile(r"^/(posts|post_targets|post-targets)(/|$)")),
    ("content", _W, re.compile(r"^/views/drafts/")),
    ("content", _W, re.compile(r"^/drafts(/|$)")),
    ("ai", None, re.compile(r"^/ai(/|$)")),
    ("weekly", None, re.compile(r"^/weekly(/|$)")),
    ("auto", None, re.compile(r"^/views/auto(/|$)")),
    ("auto", _W, re.compile(r"^/automations(/|$)")),
    ("library", None, re.compile(r"^/views/(library|media/)")),
    ("library", _W, re.compile(r"^/(videos|generation-jobs)(/|$)")),
    ("products", _W, re.compile(r"^/(products|brand-kit)(/|$)")),
    ("channels", _W, re.compile(r"^/views/channels(/|$)")),
    ("channels", None, re.compile(r"^/views/oauth/")),
    ("channels", _W, re.compile(r"^/channels(/|$)")),
    ("insights", None, re.compile(r"^/views/insights(/|$)")),
    ("website", None, re.compile(r"^/website(/|$)")),
    ("activity", None, re.compile(r"^/activity(/|$)")),
    ("leads", None, re.compile(r"^/leads(/|$)")),
    ("leads", None, re.compile(r"^/sales-alerts(/|$)")),
]


def clean(access: list | None) -> list[str] | None:
    """Keep only known feature keys; None stays None (= everything)."""
    if access is None:
        return None
    return [k for k in FEATURES if k in set(access)]


def check(request: Request, user) -> None:
    from app.tenancy import MANAGER_ROLES  # local: tenancy imports this module

    access = user.access
    if access is None or user.role in MANAGER_ROLES:
        return
    path = request.url.path
    path = path[4:] if path.startswith("/api/") else path
    for feature, methods, rx in RULES:
        if feature in access or (methods is not None and request.method not in methods):
            continue
        if rx.search(path):
            raise HTTPException(
                403,
                f"Your access doesn't include {FEATURES[feature][0]} — ask a workspace owner or admin.",
            )
