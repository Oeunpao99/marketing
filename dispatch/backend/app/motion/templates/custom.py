"""The custom template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import re

from app.motion.common import _line
from app.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── "Designed for you" (style "custom", motion/src/saas.jsx customTemplate) ──
# The AI picks the look for THIS video and composes the story from the scene
# kit — including the brand's real screenshots (Brand kit "screenshot").
CUSTOM_TYPES = (
    "hook",
    "notify",
    "reveal",
    "screen",
    "step",
    "flow",
    "dashboard",
    "list",
    "stat",
    "news",
    "offer",
    "cta",
)


CUSTOM_PROMPT = (
    "You are the creative director of a top SaaS video studio — the clean, confident launch "
    "videos of Linear, Notion, Stripe or Microsoft Power Platform — making videos for Cambodian "
    "businesses. You design ONE vertical REMOTION VIDEO (TikTok / Facebook Reels, 45-60 s): "
    "animated product UI, no actors. You choose the LOOK for this exact topic and compose the "
    "story from a kit of animated scenes. Videos must not all look alike — the look comes from "
    "the SUBJECT, while the brand's logo, voice and subtitles stay the same.\n"
    "\n"
    'THE LOOK — return "look": {"mode": "dark" | "light", "bg": "#RRGGBB", "a": "#RRGGBB" '
    '(the main accent — vivid, readable on bg), "b": "#RRGGBB" (a second accent for '
    'gradients on buttons and tiles), "background": "grid" | "dots" | "clean", "kicker": the product '
    'category in English, 1-3 words ("POWER APPS", "AUTOMATION", "CRM") or ""}.\n'
    "SaaS looks: dark navy / charcoal (bg like #070B16) with ONE vivid accent — or clean light "
    "(bg like #F7F8FC) with a strong accent. When the brief names a platform, use its real "
    "colour: Power Apps #742774, Power Automate #0066FF, Power BI #F2C811 (on dark), Microsoft "
    "Teams #6264A7, Excel #217346, Salesforce #00A1E0, Shopify #95BF47 — else the brand's own "
    "feel. background: grid for tech and automation (the default), dots for a clean product, "
    "clean (plain colour) for minimal. NEVER a glow or a gradient background — the background "
    "is a flat colour with a grid, dots, or nothing.\n"
    "\n" + _SAAS_CRAFT + "\n"
    "THE STORY (8-10 scenes):\n"
    '1. hook — the outcome or the pain, specific (a number, a time, a role): "Approving leave '
    'still takes [3 days]?"\n'
    "2. the pain made visible — `notify` (the inbox / phone filling up).\n"
    '3. the turn — `reveal` that names the product: "Meet [Power Apps]", "There\'s a [2-minute] '
    'way".\n'
    "4-6. how it works, 2-3 beats — `screen` (a real screenshot) wherever one fits, else `step`; "
    "a `flow` when the value is automation (work or data moving between apps).\n"
    "7. the outcome — `dashboard` (the product's live view) or `stat` (a TRUE number).\n"
    "8. what you get — `list` of 3 concrete features, in UI words.\n"
    'last. cta — ONE action: "Book a demo", "Start free", "Message us \'DEMO\'".\n'
    "\n"
    "SCENE TYPES and their fields:\n"
    '- hook: text (max 9 words; never the brand name, a greeting or "Did you know"), icon.\n'
    '- notify: title (max 7 words, optional), time ("23:47", optional), notes: 3-4 x '
    '{"app": "Outlook" | "Messenger" | "Telegram" | "Teams" | "Mail", "text": max 8 words}.\n'
    "- reveal: text (max 8 words), icon.\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 6 "
    "words), text (max 10 words, optional), target (in ENGLISH: the ONE element to point at, e.g. "
    '"the Submit button" — or "" for the whole screen), action ("click" | "highlight"), result '
    "(max 5 words — what happens, optional).\n"
    "- step: title (max 6 words — the action), text (max 12 words), icon, result (max 5 words) — "
    "a drawn app window, for a beat no screenshot shows.\n"
    '- flow: title (max 6 words), nodes: 3-4 x {"icon", "label": 2-5 words — what happens, '
    '"sub": the app or tool, 1-3 words, optional} — how work or data moves (form → approval → '
    "Teams → SharePoint).\n"
    '- dashboard: title (max 6 words, optional), metrics: 2-3 x {"label": 1-3 words like a UI '
    'card ("Requests today"), "value": number, "prefix", "suffix", "delta": e.g. "+18%" or '
    '""}, chart: "line" | "bars". It is the product\'s screen with SAMPLE data of a demo account '
    "— keep numbers small and believable, never present them as a customer's results.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-5 words}.\n'
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon — ONLY a true number.\n"
    "- news: tag, headline (max 14 words), text (max 16 words) — only a real, widely known trend.\n"
    "- offer: plan, price, period, was, badge, features: 3 x 2-5 words — ONLY when the brief or the "
    "product information gives an offer; never invent a price or a discount.\n"
    "- cta: text (max 8 words, pays off the hook), button (2-4 words).\n"
    "Real screenshots beat drawn screens: when THE BRAND'S SCREENSHOTS show what a beat needs, "
    "use them (1-3 `screen` scenes).\n"
    + _COMMON_RULES
    + '{"look": {"mode": "dark", "bg": "#0B0714", "a": "#742774", "b": "#C239B3", "background": "grid", '
    '"kicker": "POWER APPS"}, "scenes": [{"type": "hook", "text": "...", "icon": "Mail", "say": "..."}, ...]}'
)


_HEX = re.compile(r"#[0-9a-fA-F]{6}")


def _lum(hex_: str) -> float:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _contrast(x: str, y: str) -> float:
    hi, lo = sorted((_lum(x), _lum(y)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def clean_look(raw, brand_hex: str) -> dict:
    """The AI's look, made safe: a background that is really dark / light and
    accents that stay readable on it (else the brand colour, else a default)."""
    raw = raw if isinstance(raw, dict) else {}
    mode = "light" if raw.get("mode") == "light" else "dark"
    hexes = {k: str(raw.get(k) or "") for k in ("bg", "a", "b")}
    bg = hexes["bg"] if _HEX.fullmatch(hexes["bg"]) else ""
    if not bg or (mode == "dark" and _lum(bg) > 0.04) or (mode == "light" and _lum(bg) < 0.82):
        bg = "#0A0F1F" if mode == "dark" else "#F8FAFC"

    def accent(value: str, fallback: str, need: float) -> str:
        for c in (value, brand_hex, fallback):
            if _HEX.fullmatch(c or "") and _contrast(c, bg) >= need:
                return c
        return fallback

    a = accent(hexes["a"], "#6366F1" if mode == "dark" else "#4338CA", 3.0)
    b = accent(hexes["b"], a, 2.0)
    # flat backgrounds only (grid / dots / plain) — no glow, no gradient
    background = (
        raw.get("background") if raw.get("background") in ("grid", "dots", "clean") else "grid"
    )
    look = {
        "mode": mode,
        "bg": bg,
        "a": a,
        "b": b,
        "background": background,
        "kicker": _line(raw.get("kicker"), 20).upper(),
    }
    card = str(raw.get("card") or "")
    if _HEX.fullmatch(card) and (
        (mode == "light" and _lum(card) > 0.6) or (mode == "dark" and _lum(card) < 0.12)
    ):
        look["card"] = card
    if raw.get("radius") in ("sharp", "soft", "round"):
        look["radius"] = raw["radius"]
    return look
