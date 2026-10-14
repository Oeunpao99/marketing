"""Khmer prosody — where a speaker breathes and what they stress, as SSML.

Khmer is written without spaces between words and with little punctuation,
so a voice reading it as is runs whole sentences together and sounds read-out.
Successful Khmer TTS pipelines go: normalize (numbers → words, app/khmer_speech)
→ segment words (app/khmer_words) → PHRASE BREAKS → stress → the voice. This
module is the phrase-break + stress step, rule-based and free:

- a pause before a linking word (ហើយ, ប៉ុន្តែ, ដោយសារ, ព្រោះ, បើ, ដូច្នេះ …),
- a pause after an opener (កាលពីមុន, ពេលនេះ, សួស្តីបង …),
- the writer's own spaces kept as pauses (unless the phrase would be tiny),
- a long run split at the word boundary nearest its middle,
- prices / numbers stressed (slower, a little higher),
- a question rising at the end, an exclamation lifted.

``ssml()`` renders it for Azure's Khmer voices; ``marked()`` shows it as text
("|" pause, "‖" sentence end, «stressed») for a preview.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from xml.sax.saxutils import escape

from app.khmer_words import ZWSP, breaks

# a pause BEFORE these (they start a new clause)
LINKERS = (
    "ប៉ុន្តែ", "ដោយសារ", "ពីព្រោះ", "ព្រោះ", "ប្រសិនបើ", "បើ", "ដូច្នេះ", "ទើប", "ដើម្បី",
    "ទោះបី", "បន្ទាប់មក", "រួចហើយ", "ហើយ", "ពេលដែល", "ខណៈដែល", "ពីមុន",
)
# a pause AFTER these when they open a sentence
OPENERS = (
    "សួស្តីបង", "សួស្តី", "កាលពីមុន", "ពេលនេះ", "ឥឡូវនេះ", "ថ្ងៃនេះ", "សព្វថ្ងៃ", "ជាដំបូង",
    "ជាចុងក្រោយ", "ម្យ៉ាងទៀត", "ជាពិសេស", "បងៗ", "អ៊ីចឹង", "ដូច្នេះ",
)
_DIGIT_WORDS = "សូន្យ|មួយ|ពីរ|បី|បួន|ប្រាំ|ដប់|ម្ភៃ|សាម|សែ|ហា|ហុក|ចិត|ប៉ែត|កៅ|សិប|រយ|ពាន់|ម៉ឺន|សែន|លាន"
_NUMBER = re.compile(rf"^(?:{_DIGIT_WORDS})+$")
UNITS = ("ដុល្លារ", "រៀល", "ភាគរយ", "ម៉ោង", "នាទី", "ថ្ងៃ", "ខែ", "ឆ្នាំ", "ដង")
# "$29" became "ម្ភៃប្រាំបួន ដុល្លារ" (app/khmer_speech) — that space must not become a pause
_NUMBER_GAP = re.compile(rf"((?:{_DIGIT_WORDS})+)\s+(?=(?:{_DIGIT_WORDS}|{'|'.join(UNITS)}))")
MAX_PHRASE = 30  # Khmer characters (~2.5 s) before a run gets a breath
MIN_PHRASE = 6  # shorter than this and a space doesn't become a pause


@dataclass
class Phrase:
    words: list[tuple[str, bool]] = field(default_factory=list)  # (word, stressed)

    @property
    def size(self) -> int:
        return sum(len(w) for w, _ in self.words)


@dataclass
class Sentence:
    phrases: list[Phrase]
    end: str  # "." | "!" | "?"


def _words(chunk: str) -> list[str]:
    """``chunk`` (no spaces) split into words: ICU-dictionary breaks for Khmer,
    Latin / digit runs kept whole."""
    chunk = chunk.replace(ZWSP, "")
    cuts = sorted(breaks(chunk))
    out, prev = [], 0
    for i in cuts:
        if i > prev:
            out.append(chunk[prev:i])
        prev = i
    if prev < len(chunk):
        out.append(chunk[prev:])
    return [w for w in out if w.strip()]


def _stress(words: list[str]) -> list[tuple[str, bool]]:
    """Numbers, and the unit right after a number, are stressed — not a lone
    "មួយ" ("a month" isn't a number worth stressing)."""
    out: list[tuple[str, bool]] = []
    for k, w in enumerate(words):
        number = (bool(_NUMBER.match(w)) and w != "មួយ") or w.isdigit()
        unit = w in UNITS and k > 0 and out[-1][1]  # only after a stressed number
        out.append((w, number or unit))
    return out


def _split_long(p: Phrase) -> list[Phrase]:
    if p.size <= MAX_PHRASE or len(p.words) < 2:
        return [p]
    half, run, cut, best = p.size / 2, 0, 0, None
    for k, (w, hot) in enumerate(p.words[:-1], 1):
        run += len(w)
        nxt, nxt_hot = p.words[k]
        if (hot and nxt_hot) or nxt in UNITS:  # never inside a price ("ប្រាំ | ដុល្លារ")
            continue
        if best is None or abs(run - half) < best:
            best, cut = abs(run - half), k
    if not cut:
        return [p]
    return _split_long(Phrase(p.words[:cut])) + _split_long(Phrase(p.words[cut:]))


def plan(text: str) -> list[Sentence]:
    """The text as sentences of phrases — where the voice breathes."""
    sentences = []
    for raw in re.split(r"(?<=[។!?៕])\s*", text.strip()):
        raw = raw.strip()
        if not raw:
            continue
        end = "?" if raw.endswith("?") else "!" if raw.endswith("!") else "."
        body = _NUMBER_GAP.sub(r"\1", raw.rstrip("។!?៕ ").strip())
        phrases: list[list[str]] = []  # words, per phrase
        size = lambda ws: sum(len(w) for w in ws)  # noqa: E731
        for chunk in body.split():  # the writer's spaces
            words = _words(chunk)
            current: list[str] = []
            for k, w in enumerate(words):
                if w in LINKERS and current:
                    phrases.append(current)
                    current = []
                current.append(w)
                if w in OPENERS and not phrases and len(current) == 1 and k < len(words) - 1:
                    phrases.append(current)  # "កាលពីមុន |", "សួស្តីបង |"
                    current = []
            if current:
                # a tiny piece joins the phrase before it instead of getting its own pause
                if phrases and (size(current) < MIN_PHRASE or size(phrases[-1]) < MIN_PHRASE) and current[0] not in LINKERS:
                    phrases[-1].extend(current)
                else:
                    phrases.append(current)
        stressed = []
        for words in phrases:
            stressed += _split_long(Phrase(_stress(words)))
        if stressed:
            sentences.append(Sentence(stressed, end))
    return sentences


def marked(text: str) -> str:
    """A readable preview: "|" a breath, "‖" the end of a sentence, «stressed»."""
    out = []
    for s in plan(text):
        phrases = [_join([f"«{w}»" if hot else w for w, hot in p.words]) for p in s.phrases]
        out.append(" | ".join(phrases) + (s.end if s.end != "." else "។"))
    return "  ‖  ".join(out)


# style → (rate, phrase pause ms, sentence pause ms, base pitch %, "!" lift %, "?" rise %, stress pitch %, stress rate)
STYLES = {
    "natural": ("-5%", 170, 420, 0, 6, 10, 6, "-14%"),
    "excited": ("+3%", 110, 300, 4, 10, 12, 9, "-10%"),
    "calm": ("-12%", 240, 560, -2, 3, 8, 4, "-16%"),
}


def ssml(text: str, voice: str, style: str = "natural") -> str:
    """Azure SSML for ``text`` (numbers already words) read with these pauses and stresses."""
    rate, phrase_ms, sentence_ms, base, lift, rise, s_pitch, s_rate = STYLES.get(style, STYLES["natural"])
    parts = []
    for k, s in enumerate(plan(text)):
        pitch = base + (lift if s.end == "!" else 0) + (2 if k % 2 else -1)  # sentences don't all sit on one line
        pieces = []
        for j, p in enumerate(s.phrases):
            body = "".join(
                f"<prosody rate='{s_rate}' pitch='+{s_pitch}%'>{escape(w)}</prosody>" if hot else escape(w) for w, hot in p.words
            )
            if s.end == "?" and j == len(s.phrases) - 1:
                body = f"<prosody pitch='+{rise}%'>{body}</prosody>"  # a question rises at the end
            pieces.append(body)
        inner = f"<break time='{phrase_ms}ms'/>".join(pieces)
        parts.append(f"<prosody rate='{rate}' pitch='{pitch:+d}%'>{inner}</prosody>")
    lang = "-".join(voice.split("-")[:2])
    return f"<speak version='1.0' xml:lang='{lang}'><voice name='{voice}'>" + f"<break time='{sentence_ms}ms'/>".join(parts) + "</voice></speak>"


def _join(words: list[str]) -> str:
    """Words back into text — Khmer runs together, a Latin word keeps its spaces."""
    out = ""
    for w in words:
        if out and (re.match(r"[A-Za-z0-9]", w) or re.search(r"[A-Za-z0-9]$", out)):
            out += " "
        out += w
    return out


def punctuated(text: str) -> str:
    """The text with commas at the breaths — for voices that read punctuation
    (gpt-4o-mini-tts), not SSML."""
    return " ".join(", ".join(_join([w for w, _ in p.words]) for p in s.phrases) + ("?" if s.end == "?" else "!" if s.end == "!" else "។") for s in plan(text))
