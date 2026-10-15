"""What the voice-over says, as opposed to what is written — app/motion.py
add_voice.

A Khmer voice reads "$80", "24/7" or "Chumnouykar" badly: digits and symbols
literally, English letter by letter. Before a line is spoken it's cut into
parts (shown, spoken): numbers, money, percentages and times become Khmer
words, and the brand's pronunciation list (Brand.pronunciations — "how to say
it") replaces words it names. The voice reads the spoken text; the subtitles
keep the shown text (each part's words are mapped back by their position).
"""

from __future__ import annotations

import re

_DIGITS = {0: "សូន្យ", 1: "មួយ", 2: "ពីរ", 3: "បី", 4: "បួន", 5: "ប្រាំ", 6: "ប្រាំមួយ", 7: "ប្រាំពីរ", 8: "ប្រាំបី", 9: "ប្រាំបួន"}
_TENS = {1: "ដប់", 2: "ម្ភៃ", 3: "សាមសិប", 4: "សែសិប", 5: "ហាសិប", 6: "ហុកសិប", 7: "ចិតសិប", 8: "ប៉ែតសិប", 9: "កៅសិប"}
_KHMER_DIGITS = str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789")


def khmer_number(n: int) -> str:
    """A whole number in Khmer words: 80 → ប៉ែតសិប, 1200 → មួយពាន់ពីររយ,
    25000 → ពីរម៉ឺនប្រាំពាន់, 3000000 → បីលាន."""
    if n < 0:
        return "ដក" + khmer_number(-n)
    if n < 10:
        return _DIGITS[n]
    if n < 100:
        tens, ones = divmod(n, 10)
        return _TENS[tens] + (_DIGITS[ones] if ones else "")
    out = []
    for size, word in ((1_000_000, "លាន"), (100_000, "សែន"), (10_000, "ម៉ឺន"), (1000, "ពាន់"), (100, "រយ")):
        if n >= size:
            count, n = divmod(n, size)
            out.append((khmer_number(count) if size == 1_000_000 else _DIGITS[count]) + word)
    if n:
        out.append(khmer_number(n))
    return "".join(out)


def _say_number(raw: str) -> str:
    """"1,200" / "១ ២០០" / "4.5" / "៨០" in Khmer words."""
    s = re.sub(r"[,\s   ]", "", raw.translate(_KHMER_DIGITS))
    if "." in s:
        whole, frac = s.split(".", 1)
        return f"{khmer_number(int(whole or 0))} ចុច {' '.join(_DIGITS[int(d)] for d in frac)}"
    return khmer_number(int(s))


# a number: "1,400" / "4.5" / "៨០", or thousands split by a space — "១ ៤០០", "12 500"
# (1-3 digits, then groups of exactly 3, so "2024 100" stays two numbers)
_NUM = r"(?:[0-9០-៩]{1,3}(?:[    ][0-9០-៩]{3})+(?![0-9០-៩])|[0-9០-៩](?:[0-9០-៩,]*[0-9០-៩])?)(?:\.[0-9០-៩]+)?"
_PATTERNS = [
    # 24/7 — always open
    (re.compile(r"(?<![\w/])24\s*/\s*7(?![\w/])"), lambda m: "ម្ភៃបួនម៉ោង ប្រាំពីរថ្ងៃ"),
    # 9:30, ៩:៣០ — a time of day (a ម៉ោង already written before it is said once, not twice)
    (
        re.compile(r"(?:ម៉ោង\s*|(?<![\w:]))([0-9០-៩]{1,2}):([0-9០-៩]{2})(?![\w:])"),
        lambda m: "ម៉ោង" + _say_number(m[1]) + ("" if int(m[2].translate(_KHMER_DIGITS)) == 0 else " " + _say_number(m[2]) + "នាទី"),
    ),
    # $80, $1,200.50 / 80$ / 80 USD
    (re.compile(rf"\$\s?({_NUM})"), lambda m: _say_number(m[1]) + " ដុល្លារ"),
    (re.compile(rf"({_NUM})\s?(?:\$|USD\b)"), lambda m: _say_number(m[1]) + " ដុល្លារ"),
    # 5000៛ / 5000 រៀល stays "រៀល"
    (re.compile(rf"({_NUM})\s?៛"), lambda m: _say_number(m[1]) + " រៀល"),
    # 30%
    (re.compile(rf"({_NUM})\s?%"), lambda m: _say_number(m[1]) + " ភាគរយ"),
    # any other number
    (re.compile(rf"(?<![\w.]){_NUM}(?![\w])"), lambda m: _say_number(m[0])),
]


# English words in everyday Cambodian marketing, written the way they're said
# out loud — a Khmer voice reading them in Latin letters guesses (and often gets
# them wrong). Free, instant and always the same; anything not here is written
# in Khmer letters by the AI (local_voice.transliterate). The brand's own
# pronunciation list wins over both.
LOANWORDS = {
    "facebook": "ហ្វេសប៊ុក",
    "page": "ផេក",
    "tiktok": "ធីកតុក",
    "telegram": "តេឡេក្រាម",
    "youtube": "យូធូប",
    "instagram": "អ៊ីនស្តាក្រាម",
    "google": "ហ្គូហ្គល",
    "messenger": "មេសេនជ័រ",
    "online": "អនឡាញ",
    "offline": "អហ្វឡាញ",
    "inbox": "អ៊ីនបុក",
    "chat": "ឆាត",
    "video": "វីដេអូ",
    "follow": "ហ្វូឡូ",
    "like": "ឡាយ",
    "share": "ស៊ែរ",
    "comment": "ខមមិន",
    "promotion": "ប្រូម៉ូសិន",
    "promo": "ប្រូម៉ូ",
    "website": "វេបសាយ",
    "app": "អែប",
    "email": "អ៊ីមែល",
    "link": "លីង",
    "admin": "អេដមីន",
    "ok": "អូខេ",
    "wifi": "វ៉ាយហ្វាយ",
    "free": "ហ្វ្រី",
    "phone": "ហ្វូន",
    "iphone": "អាយហ្វូន",
    "laptop": "ឡេបថប",
    "software": "សូហ្វវែរ",
    "menu": "ម៉ឺនុយ",
    "coffee": "កាហ្វេ",
}
# Letter names as said in Khmer — acronyms are spelled out (AI → អេអាយ).
LETTERS = {
    "A": "អេ", "B": "ប៊ី", "C": "ស៊ី", "D": "ឌី", "E": "អ៊ី", "F": "អេហ្វ", "G": "ជី", "H": "អេច", "I": "អាយ",
    "J": "ជេ", "K": "ខេ", "L": "អែល", "M": "អឹម", "N": "អិន", "O": "អូ", "P": "ភី", "Q": "ឃ្យូ", "R": "អា",
    "S": "អេស", "T": "ធី", "U": "យូ", "V": "វី", "W": "ដាប់បលយូ", "X": "អ៊ិច", "Y": "វ៉ាយ", "Z": "ហ្សេដ",
}  # fmt: skip


def khmer_for(word: str) -> str | None:
    """A Latin word as a Khmer voice should say it, when that's known without
    the AI: a common loanword, or an acronym / single letter spelled out."""
    w = word.strip(".'’-")
    hit = LOANWORDS.get(w.lower())
    if hit:
        return hit
    if w.isascii() and w.isalpha() and (len(w) == 1 or (len(w) <= 6 and w.isupper())):
        return "".join(LETTERS[c] for c in w.upper())
    return None


def _is_latin(word: str) -> bool:
    return bool(re.search(r"[A-Za-z]", word))


def spoken_parts(text: str, pronunciations: list[dict] | None = None, numbers: bool = True) -> list[tuple[str, str]]:
    """``text`` cut into (shown, spoken) parts, in order; joined, the shown
    parts are ``text`` again. ``numbers`` = read numbers as Khmer words (a
    Khmer voice); the pronunciation list applies either way."""
    rules: list[tuple[re.Pattern, object]] = []
    for p in pronunciations or []:
        word, say = (p.get("word") or "").strip(), (p.get("say") or "").strip()
        if not word or not say:
            continue
        esc = re.escape(word)
        # Latin words match whole words, any case; Khmer ones match as written.
        pat = re.compile(rf"(?<![A-Za-z0-9]){esc}(?![A-Za-z0-9])", re.IGNORECASE) if _is_latin(word) else re.compile(esc)
        rules.append((pat, (lambda s: lambda m: s)(say)))
    if numbers:
        rules += _PATTERNS

    parts: list[tuple[str, str]] = []
    pos = 0
    while pos < len(text):
        best = None
        for pat, say in rules:
            m = pat.search(text, pos)
            if m and m.end() > m.start() and (best is None or m.start() < best[0].start() or (m.start() == best[0].start() and m.end() > best[0].end())):
                best = (m, say)
        if best is None:
            parts.append((text[pos:], text[pos:]))
            break
        m, say = best
        if m.start() > pos:
            parts.append((text[pos : m.start()], text[pos : m.start()]))
        parts.append((m[0], say(m)))
        pos = m.end()
    return parts


def remap_words(words: list[dict], parts: list[tuple[str, str]], spoken_text: str) -> list[dict]:
    """Azure's word timings are for the spoken text; give them the shown text
    back — every word inside a rewritten part becomes that part's original
    ("ប៉ែតសិប ដុល្លារ" → one "$80" word over the same time). Words need their
    position in the spoken text ("o")."""
    if not words or any("o" not in w for w in words):
        return words
    spans, at = [], 0
    for shown, spoken in parts:
        spans.append((at, at + len(spoken), shown, spoken))
        at += len(spoken)
    out: list[dict] = []
    merged: dict[int, dict] = {}
    for w in words:
        idx = next((i for i, (a, b, _, _) in enumerate(spans) if a <= w["o"] < b), None)
        if idx is None or spans[idx][2] == spans[idx][3]:
            out.append({k: v for k, v in w.items() if k != "o"})
            continue
        if idx in merged:
            merged[idx]["e"] = w["e"]
            continue
        a = spans[idx][0]
        shown = spans[idx][2].strip()
        word = {"w": shown, "t": w["t"], "e": w["e"], "sp": bool(out) and (a == 0 or spoken_text[a - 1] == " ")}
        merged[idx] = word
        out.append(word)
    return out
