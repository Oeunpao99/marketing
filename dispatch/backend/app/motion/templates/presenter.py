"""The presenter template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.common import _line
from app.motion.templates._shared import _COMMON_RULES


# "Presenter · Brand host" (motion/src/presenter.jsx) — the brand's own presenter: a
# friendly robot host in a T-shirt with the brand's logo, at a desk, who greets ("Hi! I'm
# Kalyan, BCIE's personal assistant"), brings today's topic and talks it through, a panel
# beside her showing the words. Drawn in code, the same host in every video.
PRESENTER_TYPES = ("hook", "speak", "list", "stat", "qa", "cta")


PRESENTER_GESTURES = ("present", "point", "thumb", "wave")


PRESENTER_PROMPT = (
    "You write for the brand's own video host — its personal assistant who presents a topic "
    "every day on Reels / TikTok (30-60 s), like a friendly professional content creator "
    "talking to camera. She sits at a desk in the brand's T-shirt, a panel beside her shows "
    "the key words. She explains ANY topic the brief gives — news, tips, how-to, an idea, the "
    "brand's product — clearly, warmly and with energy, never like an advert read out.\n"
    "\n"
    "THE STORY (5-8 scenes):\n"
    "1. hook — text (max 9 words: today's topic as a title or a question, [key words] marked), "
    "icon, draw. Its `say` IS her introduction: it starts with THE GREETING given below, word for "
    'word, then brings today\'s new topic in one sentence (Khmer: "ថ្ងៃនេះ មានប្រធានបទថ្មីមួយ…").\n'
    "then 3-6 scenes that explain it, one idea each, building to the most useful:\n"
    "- speak: text (max 12 words — the idea on the panel, [key words] marked), icon, gesture "
    "(one of: " + ", ".join(PRESENTER_GESTURES) + "), product (optional — a product's exact "
    "name when the line is about it: its photo goes on the panel), draw.\n"
    "- list: title (max 7 words), items: 2-4 x {icon, text (max 6 words)} — steps, tips, reasons.\n"
    "- stat: value (a number), prefix, suffix, label (max 8 words), icon — only a TRUE number "
    "from the brief or common knowledge.\n"
    "- qa: q (max 10 words — what people often ask), a (max 18 words — her answer).\n"
    "last. cta — text (max 10 words: follow for tomorrow's topic, comment, message us), button "
    "(1-3 words). Its `say` ends warmly, like a host signing off.\n"
    "draw — the PICTURE on the panel above the words, in ENGLISH, 10-30 words: one clear scene "
    "that shows the idea (a shop owner smiling at a phone full of messages, a robot helping at a "
    "desk…) — a colour illustration is made from it. No text in it, no logos, no brand or product "
    "packaging (a product's own photo is used for that). Give `draw` to the hook and to the 2 most "
    "important speak scenes only; leave it out elsewhere.\n"
    "`say` is HER talking to the viewer — first person, lively, natural, as a presenter speaks "
    '("let me show you…", "here is the trick…"), each line leading into the next.\n'
    + _COMMON_RULES
    + '{"host": {"name": "...", "gender": "female"}, "scenes": [{"type": "hook", "text": "...", '
    '"icon": "Lightbulb", "say": "..."}, {"type": "speak", "text": "...", "icon": "MessageCircle", '
    '"gesture": "present", "say": "..."}, ...]}'
)


HOST_NAMES = {
    ("female", True): "កល្យាណ",
    ("female", False): "Kalyan",
    ("male", True): "ដារ៉ា",
    ("male", False): "Dara",
}


def host_greeting(host: dict, brand_name: str, khmer: bool) -> str:
    """Her first words, always the same shape: hello, who she is, whose assistant."""
    if khmer:
        me = "នាងខ្ញុំ" if host.get("gender") != "male" else "ខ្ញុំបាទ"
        return (
            f"សួស្តី! {me} {host['name']} ជំនួយការផ្ទាល់របស់ {brand_name}។"
            if brand_name
            else f"សួស្តី! {me} {host['name']}។"
        )
    return (
        f"Hi! I'm {host['name']}, {possessive(brand_name)} personal assistant."
        if brand_name
        else f"Hi! I'm {host['name']}."
    )


def possessive(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def clean_host(raw, khmer: bool, voice: str = "") -> dict:
    """Presenter · Brand host: her name and whether she's a he. The brief may name
    the host; else the default name — a male voice makes a male host."""
    from app.speech import setting_gender

    raw = raw if isinstance(raw, dict) else {}
    gender = raw.get("gender") if raw.get("gender") in ("female", "male") else setting_gender(voice)
    return {"name": _line(raw.get("name"), 30) or HOST_NAMES[(gender, khmer)], "gender": gender}


def _host_intro(script: dict, brand_name: str, khmer: bool) -> None:
    """The hook's voice opens with her greeting — put back if the editors dropped it."""
    hook = next((s for s in script["scenes"] if s["type"] == "hook"), None)
    host = script.get("host") or {}
    if hook is not None and host.get("name") and host["name"] not in (hook.get("say") or ""):
        hook["say"] = _line(
            f"{host_greeting(host, brand_name, khmer)} {hook.get('say') or ''}".strip(), 300
        )
