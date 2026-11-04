"""The dialogue template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES
from app.motion.templates.cartoon import CARTOON_MOODS
from app.motion.templates.parable import DUO_EXTRAS, DUO_HAIRS, DUO_SHIRTS, DUO_SKINS, PARABLE_ITEMS, PARABLE_PLACES, PARABLE_POSES, PARABLE_TIMES, clean_duo


# "Dialogue · Two voices" (motion/src/dialogue.jsx) — two people really talking, each in
# their own voice (dialogue_voices), in Parable's look: the same two villagers and
# Cambodian places, a speech bubble over whoever speaks, their mouth moving.
DIALOGUE_TYPES = ("hook", "line", "tally", "moral", "cta")


DIALOGUE_PROMPT = (
    "You are the best writer of short animated dialogues in Cambodia. You plan a REMOTION VIDEO "
    "(Reels / TikTok, 30-70 s): TWO people talking to each other in an everyday Cambodian place — "
    "two friends, a seller and a customer, a boss and a worker, a parent and a child, a couple. "
    "Each has their OWN VOICE, so it plays like a real conversation: short natural lines, back and "
    "forth, a little funny, with a turn — a worry, a surprise, a smart idea — and a clear takeaway "
    "(money, work, business, selling, marketing, habits, health — or the brand's product as the "
    "answer one of them knows about, said the way a friend would, never an advert read out).\n"
    "\n"
    'THE CAST — return "cast": exactly 2 x {name (a short Cambodian first name), gender (male | '
    "female), skin ("
    + " | ".join(DUO_SKINS)
    + "), hair ("
    + " | ".join(DUO_HAIRS)
    + "), shirt ("
    + " | ".join(DUO_SHIRTS)
    + "), extra ("
    + " | ".join(DUO_EXTRAS)
    + ")}. Usually a man and a "
    "woman (two clearly different voices). Different hair and shirt colours. Character 1 usually "
    "has the problem or the question, character 2 the answer.\n"
    "\n"
    "THE STORY (7-12 scenes) — every scene has speaker (1 or 2): the one who speaks its `say`:\n"
    "1. hook — text (max 7 words: what the talk is about, [key words] marked); its `say` is the "
    "speaker's opening line to the other (a question, a complaint, news).\n"
    "then line scenes — they take turns, one line each; a tally when a number matters (sales, "
    "customers, money, hours) — the speaker says it.\n"
    "near the end. moral — the takeaway, said by the one who knows.\n"
    "last. cta — one of them turns to the viewer: a question for the comments, or follow for "
    "part 2.\n"
    "\n"
    "SCENE TYPES and their fields (mood one of: "
    + ", ".join(CARTOON_MOODS)
    + "; pose one of: "
    + ", ".join(PARABLE_POSES)
    + "; item one of: "
    + ", ".join(PARABLE_ITEMS)
    + "):\n"
    "- hook: speaker, text (max 7 words).\n"
    "- line: speaker, text (max 12 words — the bubble: the line itself or its key part), mood, "
    "pose, item (what the speaker holds), listen (the OTHER one's mood as they listen), think "
    "(true when it is a thought, not said aloud), place (one of: "
    + ", ".join(PARABLE_PLACES)
    + "), time ("
    + " | ".join(PARABLE_TIMES)
    + "). Keep the same place and time while the talk "
    "stays in one place.\n"
    "- tally: speaker, title (max 5 words), label (max 3 words — what is counted), value (a "
    "number), start (optional), prefix, suffix, place, time, who (0 both, 1 or 2 — who is shown), "
    "acts: 2 x {pose, mood, item}.\n"
    "- moral: speaker, title (max 3 words), text (max 14 words), icon.\n"
    "- cta: speaker, text (max 10 words), button (1-3 words).\n"
    "TWO VOICES: every `say` is spoken BY that scene's speaker in first person — their own words, "
    "the way they really talk (in a line: to the other person, by name now and then; in the cta: "
    'to the viewer). Never a narrator, never "he said". 4-20 words each; the bubble shows its key '
    "part. (This replaces the narrator rule below.)\n"
    + _COMMON_RULES
    + '{"cast": [{"name": "...", "gender": "male", "skin": "tan", "hair": "short", "shirt": "blue", '
    '"extra": "krama"}, {"name": "...", "gender": "female", ...}], "scenes": [{"type": "hook", '
    '"speaker": 1, "text": "...", "say": "..."}, {"type": "line", "speaker": 2, "text": "...", "mood": '
    '"thinking", "pose": "stand", "item": "none", "listen": "worried", "place": "market", "time": '
    '"morning", "say": "..."}, ...]}'
)


# the templates whose lines are each person's own (never rewritten as one narrator's story)
DIALOGUE_STYLES = {"dialogue"}


def dialogue_voices(script: dict, language: str, narrator: str, setting: str) -> list[str]:
    """Dialogue · Two voices: each scene's voice — its speaker's own (a man and a
    woman read by the male and the female voice; two of a kind get two different
    voices). With the brand's own voice, person 1 speaks in it."""
    from app import speech

    cast = script.get("cast") or clean_duo(None)
    own = [speech.voice_for(language, c["gender"], "dialogue") or narrator for c in cast[:2]]
    if setting == "brand":
        own[0] = narrator
    elif narrator.startswith(
        speech.KIRI
    ):  # a KiriTTS voice picked by name: the first person of its gender
        hit = next(
            (k for k, c in enumerate(cast[:2]) if c["gender"] == speech.setting_gender(narrator)),
            None,
        )
        if hit is not None:
            own[hit] = narrator
            if (
                cast[0]["gender"] == cast[1]["gender"]
            ):  # two of a kind: another KiriTTS voice for the other
                own[1 - hit] = speech.other_voice(narrator, cast[1 - hit]["gender"]) or own[1 - hit]
    if own[0] == own[1]:
        own[1] = speech.other_voice(own[1], cast[1]["gender"]) or own[1]
    return [own[1] if s.get("speaker") == 2 else own[0] for s in script["scenes"]]
