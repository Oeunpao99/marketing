"""The aiteam template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.common import _icon, _line, _number
from app.video.motion.templates._shared import _COMMON_RULES


# "AI service · Your AI team" (motion/src/aiteam.jsx) — an AI-as-a-service told as a
# team you hire: the work piling up, the AI "workers" each doing a job, one input
# becoming finished work, you approving with one tap, results, plans, the call to action.
AITEAM_TYPES = ("hook", "overload", "crew", "pipeline", "approve", "gains", "plans", "cta")


AITEAM_CHANNELS = (
    "Facebook",
    "TikTok",
    "Telegram",
    "YouTube",
    "Instagram",
    "LinkedIn",
    "Messenger",
    "WhatsApp",
)


AITEAM_PROMPT = (
    "You are the best SaaS launch-video writer in Cambodia. You plan a REMOTION VIDEO (Reels / "
    "TikTok / YouTube, 35-60 s) that introduces an AI-AS-A-SERVICE — an AI product people "
    "subscribe to instead of hiring (an AI marketing team, an AI assistant, AI bookkeeping, an AI "
    "support agent…). The look: deep navy, a glowing AI core, cards and a phone. Told like hiring "
    "a team: the work that piles up today, the AI workers that take it over, one input becoming "
    "finished work, the owner staying in control, what they get, how they pay, the next step. "
    "Confident and clear, never hype.\n"
    "\n"
    "THE STORY (6-8 scenes, in this order; skip a middle one when the brief gives nothing for it):\n"
    "1. hook — the promise or the pain, in one line.\n"
    "2. overload — the to-dos that pile up without it.\n"
    "3. crew — the AI workers, each with a role and the job it does.\n"
    "4. pipeline — one thing goes in, several finished things come out.\n"
    "5. approve — the owner approves with one tap; it goes out to their channels.\n"
    "6. gains — what they get, as numbers (ONLY true numbers from the brief or product facts).\n"
    "7. plans — the plans, only when the brief gives plans or prices.\n"
    "8. cta — the next step.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon, sub (optional, max 5 words — e.g. the product name).\n"
    "- overload: text (max 7 words), tasks (3-5 to-dos, max 5 words each).\n"
    '- crew: text (max 6 words), agents (2-4: {role (1-2 words, e.g. "Writer"), task (max 7 '
    "words — what it does), icon}).\n"
    "- pipeline: text (max 8 words), input {icon, label (max 3 words)}, outputs (2-4: {icon, label "
    "(max 3 words)}).\n"
    "- approve: text (max 7 words), post (the ready post on the phone, max 18 words, in the "
    "brand's voice), draw (ENGLISH, max 25 words — the post's photo: what it shows, never any "
    'text in it), button (1-2 words, e.g. "Approve"), channels (2-5 of: '
    + ", ".join(AITEAM_CHANNELS)
    + ").\n"
    "- gains: text (max 6 words), metrics (1-3: {label (max 5 words), value (a number), prefix "
    "(optional, e.g. $), suffix (optional, e.g. % or +)}).\n"
    "- plans: text (max 6 words), tiers (2-4: {name (1-2 words), price (as written in the brief, "
    'e.g. "$19" or "Free"; leave "" when the brief gives none), note (max 5 words)}), pick (the '
    'index of the tier to suggest, from 0), badge (optional, 1-2 words, e.g. "Popular").\n'
    "- cta: text (max 9 words), button (1-3 words).\n"
    "Every word on screen is in the video's LANGUAGE (roles, tasks, labels, the button too); app "
    "names stay as written.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "sub": "...", "say": "..."}, '
    '{"type": "overload", "text": "...", "tasks": ["...", "..."], "say": "..."}, {"type": "crew", "text": "...", '
    '"agents": [{"role": "...", "task": "...", "icon": "Calendar"}], "say": "..."}, {"type": "pipeline", "text": '
    '"...", "input": {"icon": "Lightbulb", "label": "..."}, "outputs": [{"icon": "FileText", "label": "..."}], '
    '"say": "..."}, {"type": "approve", "text": "...", "post": "...", "button": "...", "channels": ["Facebook", '
    '"TikTok"], "say": "..."}, ...]}'
)


def _aiteam_scene(kind: str, raw: dict, say: str) -> dict | None:
    """AI service · Your AI team: its own scenes (None = not one of them, or empty)."""
    text = _line(raw.get("text"), 120)
    if kind == "overload":
        tasks = [
            _line(x, 40)
            for x in (raw.get("tasks") if isinstance(raw.get("tasks"), list) else [])
            if _line(x, 40)
        ][:5]
        return {"type": kind, "text": text, "tasks": tasks, "say": say} if len(tasks) >= 2 else None
    if kind == "crew":
        agents = [
            {
                "role": _line(a.get("role"), 24),
                "task": _line(a.get("task"), 60),
                "icon": _icon(a.get("icon"), "Bot"),
            }
            for a in (raw.get("agents") if isinstance(raw.get("agents"), list) else [])
            if isinstance(a, dict) and _line(a.get("role"), 24) and _line(a.get("task"), 60)
        ][:4]
        return (
            {"type": kind, "text": text, "agents": agents, "say": say} if len(agents) >= 2 else None
        )
    if kind == "pipeline":
        given = raw.get("input") if isinstance(raw.get("input"), dict) else {}
        outputs = [
            {"icon": _icon(o.get("icon"), "Sparkles"), "label": _line(o.get("label"), 30)}
            for o in (raw.get("outputs") if isinstance(raw.get("outputs"), list) else [])
            if isinstance(o, dict) and _line(o.get("label"), 30)
        ][:4]
        if not _line(given.get("label"), 30) or len(outputs) < 2:
            return None
        return {
            "type": kind,
            "text": text,
            "input": {
                "icon": _icon(given.get("icon"), "Lightbulb"),
                "label": _line(given.get("label"), 30),
            },
            "outputs": outputs,
            "say": say,
        }
    if kind == "approve":
        known = {c.lower(): c for c in AITEAM_CHANNELS}
        channels = []
        for c in raw.get("channels") if isinstance(raw.get("channels"), list) else []:
            name = known.get(str(c).strip().lower())
            if name and name not in channels:
                channels.append(name)
        post = _line(raw.get("post"), 160)
        scene = {
            "type": kind,
            "text": text,
            "post": post,
            "button": _line(raw.get("button"), 24),
            "channels": channels[:5],
            "say": say,
        }
        if _line(raw.get("draw"), 300):
            scene["draw"] = _line(
                raw["draw"], 300
            )  # the post's photo, painted when there's no product photo
        return scene if post else None
    if kind == "gains":
        metrics = []
        for m in raw.get("metrics") if isinstance(raw.get("metrics"), list) else []:
            if not isinstance(m, dict) or not _line(m.get("label"), 40):
                continue
            value = _number(m.get("value"))
            if value <= 0:
                continue
            metrics.append(
                {
                    "label": _line(m.get("label"), 40),
                    "value": int(value) if value == int(value) else round(value, 1),
                    "prefix": _line(m.get("prefix"), 3),
                    "suffix": _line(m.get("suffix"), 8),
                }
            )
        return {"type": kind, "text": text, "metrics": metrics[:3], "say": say} if metrics else None
    if kind == "plans":
        tiers = [
            {
                "name": _line(x.get("name"), 20),
                "price": _line(x.get("price"), 14),
                "note": _line(x.get("note"), 40),
            }
            for x in (raw.get("tiers") if isinstance(raw.get("tiers"), list) else [])
            if isinstance(x, dict) and _line(x.get("name"), 20)
        ][:4]
        if len(tiers) < 2:
            return None
        try:
            pick = max(0, min(len(tiers) - 1, int(raw.get("pick"))))
        except (TypeError, ValueError):
            pick = min(1, len(tiers) - 1)
        scene = {"type": kind, "text": text, "tiers": tiers, "pick": pick, "say": say}
        if _line(raw.get("badge"), 16):
            scene["badge"] = _line(raw.get("badge"), 16)
        return scene
    return None
