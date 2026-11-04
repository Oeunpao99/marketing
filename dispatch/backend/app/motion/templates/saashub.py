"""The saashub template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.common import _icon, _line
from app.motion.templates._shared import _COMMON_RULES


# ── SaaS Hub · Connect & Automate (motion/src/saashub.jsx) ──────────────────
# Modern cloud SaaS platform and workflow automation: scattered app chaos,
# central cloud hub connecting all tools, automated trigger flows, real-time
# ROI metrics dashboard, subscription plans, and high-converting CTA.
SAASHUB_TYPES = ("hook", "chaos", "hub", "trigger", "metrics", "plans", "cta")


SAASHUB_PROMPT = (
    "You are the top SaaS video director in Cambodia. You plan a REMOTION VIDEO (Reels / "
    "TikTok / YouTube, 35-60 s) for a MODERN SAAS PLATFORM / CLOUD SERVICE / AUTOMATION SUITE. "
    "The look: deep obsidian slate, electric cyan and indigo glow, glassmorphism cards and live data lines. "
    "Story arc: the pain of disconnected tools, the central hub that unites them all, instant automated workflows, "
    "proven ROI metrics, pricing tiers, and a high-converting call to action. Sharp, modern, and trustworthy.\n"
    "\n"
    "THE STORY (5-7 scenes, in this order; skip plans if no pricing in the brief):\n"
    "1. hook — the big promise or bold question in one crisp line.\n"
    "2. chaos — the mess of scattered tools and manual work before.\n"
    "3. hub — the central SaaS platform connecting all apps & channels.\n"
    "4. trigger — an automated event trigger with sequential action steps.\n"
    "5. metrics — real-time ROI, time saved, or uptime metrics (ONLY true numbers from brief).\n"
    "6. plans — subscription tiers (only when brief mentions plans or pricing).\n"
    "7. cta — the next step (start free trial / get demo).\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    '- hook: text (max 8 words), badge (optional, 1-3 words, e.g. "Cloud Platform"), sub (optional, max 5 words), icon.\n'
    "- chaos: text (max 7 words), tools (2-4 pain points/manual tools, max 4 words each).\n"
    "- hub: text (max 6 words), apps (2-4 connected apps: {name (max 3 words), icon, desc (max 4 words)}).\n"
    "- trigger: text (max 6 words), event {label (max 4 words), icon}, actions (2-3 steps: {label (max 5 words), icon}).\n"
    "- metrics: text (max 6 words), stats (2-3 metrics: {label (max 4 words), value (number or string), prefix?, suffix?, note? (max 4 words)}).\n"
    '- plans: text (max 6 words), tiers (2-3: {name (1-2 words), price (e.g. "$29/mo"), note (max 4 words), badge? (e.g. "Popular")}), pick (0-based index).\n'
    '- cta: text (max 8 words), button (1-3 words, e.g. "Start Free Trial"), sub (optional, max 6 words).\n'
    "Every word on screen is in the video's LANGUAGE; app and tool names stay as written.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "badge": "Cloud Hub", "icon": "Layers", "say": "..."}, '
    '{"type": "chaos", "text": "...", "tools": ["Manual Sheets", "Scattered DMs"], "say": "..."}, '
    '{"type": "hub", "text": "...", "apps": [{"name": "Smart CRM", "icon": "Users", "desc": "All contacts in one place"}], "say": "..."}, '
    '{"type": "trigger", "text": "...", "event": {"label": "Order Placed", "icon": "ShoppingCart"}, "actions": [{"label": "Auto-invoice created", "icon": "FileText"}], "say": "..."}, ...]}'
)


def _saashub_scene(kind: str, raw: dict, say: str) -> dict | None:
    """SaaS Hub · Connect & Automate: scene parser."""
    text = _line(raw.get("text"), 120)
    if kind == "hook":
        return (
            {
                "type": kind,
                "text": text,
                "badge": _line(raw.get("badge"), 24),
                "sub": _line(raw.get("sub"), 40),
                "icon": _icon(raw.get("icon"), "Layers"),
                "say": say,
            }
            if text
            else None
        )
    if kind == "chaos":
        tools = [
            _line(x, 40)
            for x in (raw.get("tools") if isinstance(raw.get("tools"), list) else [])
            if _line(x, 40)
        ][:4]
        return {"type": kind, "text": text, "tools": tools, "say": say} if len(tools) >= 2 else None
    if kind == "hub":
        apps = [
            {
                "name": _line(a.get("name"), 24),
                "icon": _icon(a.get("icon"), "CheckCircle"),
                "desc": _line(a.get("desc"), 40),
            }
            for a in (raw.get("apps") if isinstance(raw.get("apps"), list) else [])
            if isinstance(a, dict) and _line(a.get("name"), 24)
        ][:4]
        return {"type": kind, "text": text, "apps": apps, "say": say} if len(apps) >= 2 else None
    if kind == "trigger":
        ev = raw.get("event") if isinstance(raw.get("event"), dict) else {}
        actions = [
            {"label": _line(a.get("label"), 40), "icon": _icon(a.get("icon"), "Check")}
            for a in (raw.get("actions") if isinstance(raw.get("actions"), list) else [])
            if isinstance(a, dict) and _line(a.get("label"), 40)
        ][:3]
        if not _line(ev.get("label"), 30) or len(actions) < 2:
            return None
        return {
            "type": kind,
            "text": text,
            "event": {"label": _line(ev.get("label"), 30), "icon": _icon(ev.get("icon"), "Zap")},
            "actions": actions,
            "say": say,
        }
    if kind == "metrics":
        stats = []
        for s in raw.get("stats") if isinstance(raw.get("stats"), list) else []:
            if not isinstance(s, dict) or not _line(s.get("label"), 40):
                continue
            stats.append(
                {
                    "label": _line(s.get("label"), 40),
                    "value": str(s.get("value", "")).strip()[:16],
                    "prefix": _line(s.get("prefix"), 4),
                    "suffix": _line(s.get("suffix"), 8),
                    "note": _line(s.get("note"), 40),
                }
            )
        return {"type": kind, "text": text, "stats": stats[:3], "say": say} if stats else None
    if kind == "plans":
        tiers = [
            {
                "name": _line(x.get("name"), 20),
                "price": _line(x.get("price"), 16),
                "note": _line(x.get("note"), 40),
                "badge": _line(x.get("badge"), 16),
            }
            for x in (raw.get("tiers") if isinstance(raw.get("tiers"), list) else [])
            if isinstance(x, dict) and _line(x.get("name"), 20)
        ][:3]
        if len(tiers) < 2:
            return None
        try:
            pick = max(0, min(len(tiers) - 1, int(raw.get("pick", 1))))
        except (TypeError, ValueError):
            pick = 1
        return {"type": kind, "text": text, "tiers": tiers, "pick": pick, "say": say}
    if kind == "cta":
        return (
            {
                "type": kind,
                "text": text,
                "button": _line(raw.get("button"), 30),
                "sub": _line(raw.get("sub"), 50),
                "say": say,
            }
            if text
            else None
        )
    return None
