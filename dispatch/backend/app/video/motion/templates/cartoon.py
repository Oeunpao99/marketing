"""The cartoon template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


# "Story · Characters" (motion/src/cartoon.jsx) — the Khmer cartoon-story Reel: two drawn
# characters in one AI-drawn place (app/images/doodle.py draw_place), talking in bubbles, thinking
# in clouds with an icon, the thing they talk about popping up beside them.
CARTOON_TYPES = ("hook", "talk", "note", "cta")


CARTOON_MOODS = ("happy", "excited", "sad", "worried", "thinking", "shocked", "angry")


CAST_LOOKS = ("cap", "apron", "tie", "glasses", "bun", "ponytail")


CAST_COLORS = ("green", "blue", "red", "orange", "purple", "grey", "teal", "yellow")


CARTOON_PROMPT = (
    "You are the best animated-story writer in Cambodia. You plan a REMOTION VIDEO (Reels / "
    "TikTok, 40-70 s) in the style of the popular Khmer cartoon-story pages: TWO simple cartoon "
    "characters in ONE everyday place (a mini-mart, a market stall, a coffee shop, an office, a "
    "home), talking to each other in speech bubbles. A real everyday problem, a funny or "
    "surprising turn, a clear lesson (or the brand's product as the fix, shown in the story — "
    "never an advert read out). The story's question stays on top of the screen.\n"
    "\n"
    'THE CAST — return "cast": exactly 2 x {name (a short Cambodian first name, or a role like '
    "the shop owner), look (one of: "
    + ", ".join(CAST_LOOKS)
    + "), color (one of: "
    + ", ".join(CAST_COLORS)
    + ")}. Character 1 is usually the one with the problem, 2 the one who "
    "helps or brings news. Give them different looks and colours.\n"
    'THE PLACE — return "place": the one place it all happens, in ENGLISH, 15-35 words — what '
    "is in it (counter, shelves, boxes, a fridge, a street outside…), Cambodian everyday life. No "
    "people, no text.\n"
    "\n"
    "THE STORY (7-11 scenes):\n"
    '1. hook — the story\'s question in a few words ("Selling well... [where did the money go]?").\n'
    "then talk scenes — the two take turns, short lines like real people talk, each moving the "
    "story on; a think scene when someone worries or gets an idea; a note scene when there is a "
    "list (stock, costs, steps).\n"
    "last. cta — the lesson as a question for the comments, or follow for part 2.\n"
    "\n"
    "SCENE TYPES and their fields (who = 1 or 2, mood one of: " + ", ".join(CARTOON_MOODS) + "):\n"
    "- hook: text (max 8 words), who, mood, icon (what the character is wondering about).\n"
    "- talk: who, mood, text (max 14 words — what they say, in the bubble), think (true when it "
    "is a thought, not said aloud), icon (with think: the thing in the cloud), item (optional "
    "{icon, label (max 3 words)} — the thing the line is about: the delivery, the money, the "
    "phone, a receipt).\n"
    "- note: who, mood, title (max 4 words), checks: 2-5 short lines (max 5 words each) — a "
    "clipboard list they hold up.\n"
    "- cta: text (max 12 words), button (1-3 words).\n"
    "`say` for a talk scene is that character speaking — the bubble's line said fully and "
    "naturally (it may add a few words); for hook / note / cta a narrator.\n"
    + _COMMON_RULES
    + '{"cast": [{"name": "...", "look": "apron", "color": "teal"}, {...}], "place": "...", '
    '"scenes": [{"type": "hook", "text": "...", "who": 1, "mood": "thinking", "icon": "Wallet", "say": "..."}, ...]}'
)
