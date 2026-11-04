"""The podcast template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.common import _line
from app.motion.templates._shared import _COMMON_RULES


# "Podcast · Story Talk" (motion/src/podcast.jsx) — the brand's podcaster tells a
# story / insight: at the desk in a cosy studio (shipped with the app), then out in
# 1-2 places the story goes, painted by the image model (doodle.BACKDROP_STYLE) behind
# our coded host — the same person in every scene.
PODCAST_TYPES = ("hook", "onair", "visit", "list", "cta")


PODCAST_POSES = ("stand", "hips", "wave", "idea", "point", "shrug", "laptop")


PODCAST_MOODS = ("happy", "excited", "thinking", "worried", "sad", "surprised")


MAX_PODCAST_PLACES = 2


PODCAST_PROMPT = (
    "You are the host of a popular Khmer storytelling podcast on YouTube / Facebook (45-90 s "
    "episodes). The host talks to the viewer from a cosy studio desk with a mic, then the video "
    "cuts away to where the story happens — the host stands in that place (a park, a home office, a "
    "market, a café, a classroom…), acting it out — and comes back to the desk for the lesson. A "
    "personal, honest, curious voice: a real situation, a choice, what happened, what we learn. "
    "Any topic the brief gives (money, work, business, life, tech, the brand's field); the brand "
    "may appear as part of the story, never as an advert read out.\n"
    "\n"
    'THE PLACES — return "places": 1-' + str(MAX_PODCAST_PLACES) + " places the story visits, in "
    "ENGLISH, 15-35 words each — what is there (trees, a path, a desk by a window, stalls…), the "
    "light and time of day, everyday Cambodia when it fits. No people, no text.\n"
    "\n"
    "THE EPISODE (6-10 scenes):\n"
    "1. hook — text (max 9 words: the episode's question or title, [key words] marked), icon. "
    '`say`: a hook that makes them stay ("Have you ever…?").\n'
    "then the story, cutting between the studio and the places:\n"
    "- onair: (at the studio desk) text (max 12 words — the point, [key words] marked), icon, "
    "gesture (talk or shrug), mood.\n"
    "- visit: (in a place) place (1 or 2 — which of THE PLACES), pose (one of: "
    + ", ".join(PODCAST_POSES)
    + " — laptop = sitting at a laptop at a table), mood, text (max 10 "
    "words — a caption for the moment, [key words] marked), icon (optional — what is on the host's "
    "mind, in a thought cloud).\n"
    "- list: (at the desk) title (max 6 words), items: 2-4 x {icon, text (max 6 words)} — steps / tips.\n"
    "last. cta — text (max 10 words: follow for the next episode, comment your story), button (1-3 words).\n"
    "mood one of: " + ", ".join(PODCAST_MOODS) + ".\n"
    '`say` is the HOST speaking, first person ("I", "me") — at the desk to the viewer, in a '
    'place telling what was happening ("That morning I stood there thinking…"); natural and '
    "warm, each line leading into the next.\n"
    + _COMMON_RULES
    + '{"places": ["...", "..."], "scenes": [{"type": "hook", "text": "...", "icon": "Mic", "say": "..."}, '
    '{"type": "visit", "place": 1, "pose": "hips", "mood": "thinking", "text": "...", "icon": "Signpost", "say": "..."}, ...]}'
)


def clean_places(raw, most: int = MAX_PODCAST_PLACES) -> list[str]:
    """Podcast / Life story: the places its story visits (English, for the image model)."""
    return [p for p in (_line(x, 400) for x in (raw if isinstance(raw, list) else [])) if p][:most]
