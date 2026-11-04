"""The reaction template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


# "Reaction meme" (motion/src/reaction.jsx) — the TikTok reaction-animal meme: the
# situation behind (the brand's screenshot / photo, or a drawn photo), a white meme
# caption on top, the funny bit circled in red, and 1-2 cut-out animals in front
# popping their mouths on the beat or freezing in shock. The animals are our own,
# drawn once per film (app/doodle.py draw_reaction).
REACTION_TYPES = ("hook", "react", "punch", "cta")


REACTION_MOODS = ("pop", "shock", "laugh", "side", "cry", "cool")


REACTION_ANIMALS = {
    "black-kitten": "a small fluffy black kitten with a white chest and big round amber eyes",
    "cream-cat": "a cream-and-white short-haired cat with a round face",
    "orange-cat": "a chubby orange tabby cat with a big round face",
    "grey-cat": "a fluffy grey British shorthair cat with copper eyes",
    "shiba": "a shiba inu dog with a cheeky face",
    "pug": "a fawn pug dog with big round eyes",
    "hamster": "a chubby golden hamster with full cheeks",
    "capybara": "a calm capybara",
}


REACTION_PROMPT = (
    "You are the funniest meme-page admin in Cambodia. You plan a REMOTION VIDEO (TikTok / Reels, "
    "8-20 s) in the reaction-meme format everyone shares: a relatable situation on screen, a short "
    "meme caption on top, and 1-2 animals in front REACTING — popping their mouths on the beat, "
    "freezing in shock, laughing. The joke is about the viewer's everyday life around the brief "
    "(a shop owner, a seller, an office worker, a customer) — the brand is the happy ending, never "
    "an advert read out.\n"
    "\n"
    'THE CAST — return "cast": 1 or 2 animals, each one of: ' + ", ".join(REACTION_ANIMALS) + ". "
    "Two different ones when two react.\n"
    "\n"
    "THE MEME (3-5 scenes):\n"
    '1. hook — the setup everyone knows ("Me after posting for 3 months: [47 followers]").\n'
    "then react scenes — the situation getting worse or funnier, one beat each.\n"
    "then punch — the twist / punchline, one animal close up.\n"
    "last. cta — a short line + button (follow, comment, try it).\n"
    "\n"
    "SCENE TYPES and their fields (who = list of cast numbers 1-2 in front, moods = one per animal, "
    "each one of: "
    + ", ".join(REACTION_MOODS)
    + " — pop flaps on the beat, shock freezes screaming, "
    "laugh cackles, side gives side-eye, cry sobs, cool stays smug):\n"
    "- hook / react: text (max 12 words, the meme caption, [key words] marked), who, moods, "
    'bubble (optional, max 4 words — what an animal whispers / says, "psst psst"), and THE PICTURE '
    "behind: shot (the number of one of the brand's screenshots, when one shows the situation) OR "
    "product (a product's exact name) OR draw (in ENGLISH, 10-30 words: a realistic phone photo of "
    "the situation — an empty shop, a phone showing a chat, a pile of boxes; no text in it), and "
    "circle (optional, with shot only, in ENGLISH, a few words — the funny bit on that screenshot to "
    'circle in red: "the follower count", "the 2 likes").\n'
    "- punch: text (max 12 words, [key words]), who (one cast number), moods (one).\n"
    "- cta: text (max 10 words), button (1-3 words).\n"
    "`say` — optional: a short line in a deadpan meme voice; leave it empty when the caption says it "
    "all (memes often have no voice).\n"
    + _COMMON_RULES
    + '{"cast": ["black-kitten", "cream-cat"], "scenes": [{"type": "hook", "text": "...", "who": [1, 2], '
    '"moods": ["pop", "shock"], "bubble": "...", "draw": "...", "say": ""}, ...]}'
)
