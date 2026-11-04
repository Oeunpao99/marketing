"""The logodraw template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations


# "Logo · Drawing" (motion/src/logodraw.jsx) — a 10-second logo intro with no voice: the brand's own
# logo drawn from scratch over a construction grid, filled, then its name and a tagline. The lines
# come from the uploaded logo (app/logo_draw.py); the AI only writes the name and the tagline.
LOGODRAW_TYPES = ("draw",)


LOGODRAW_PROMPT = (
    "You write the words of a 10-second LOGO INTRO video: the brand's logo is drawn from scratch "
    "on a drafting grid, then its name and a short tagline appear under it. There is no voice-over.\n"
    'Return JSON: {"scenes": [{"type": "draw", "name": "...", "tagline": "...", "say": ""}]}\n'
    "- name: the brand's name exactly as written (Latin letters as given) — or, when the brief says the "
    "logo is another company's (a client's, a new brand's), THAT company's name as the brief writes it.\n"
    "- tagline: 2-6 words — what the brand promises, from the brief / products; in the LANGUAGE "
    "given; no hashtags, no price, no emoji. If the brief gives a tagline, use it word for word.\n"
    '- say: always "" (the intro has no voice).\n'
)


SILENT_STYLES = {"logodraw"}  # made without a voice-over, whatever the voice picker says
