"""Khmer word breaks — Khmer writes a whole phrase with no spaces, so a line
on a poster may only break between two words, never inside one (មនុ|ស្ស).
The AI is asked to put zero-width spaces between words but doesn't always,
so the words are found here: longest-match against ICU's Khmer dictionary
(assets/khmer/khmerdict.txt, Unicode licence — header kept in the file).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

DICT_PATH = Path(__file__).parent / "assets" / "khmer" / "khmerdict.txt"
COENG = "្"
ZWSP = "​"
_MAX_CLUSTERS = 16  # longer than any dictionary word worth matching


def _letter(ch: str) -> bool:
    """Part of a Khmer word: letters, vowels, signs, coeng (U+1780-U+17D3)."""
    return 0x1780 <= ord(ch) <= 0x17D3


def _punct(ch: str) -> bool:
    """Khmer punctuation that ends a word: ។ ៕ ៗ and friends (U+17D4-U+17DC)."""
    return 0x17D4 <= ord(ch) <= 0x17DC


@lru_cache(maxsize=1)
def _words() -> frozenset[str]:
    try:
        lines = DICT_PATH.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return frozenset()
    return frozenset(w for w in (ln.strip() for ln in lines) if w and not w.startswith("#"))


def _segment(run: str) -> list[int]:
    """Start offsets of the words in ``run`` (all Khmer letters): the split
    with the fewest unknown clusters, then the fewest words."""
    starts = [i for i in range(len(run)) if i == 0 or (0x1780 <= ord(run[i]) <= 0x17B3 and run[i - 1] != COENG)]
    starts.append(len(run))
    words = _words()
    n = len(starts) - 1
    best: list[tuple[int, int, int] | None] = [None] * (n + 1)  # (unknown, words, previous cluster)
    best[0] = (0, 0, -1)
    for a in range(n):
        if best[a] is None:
            continue
        unknown, count, _ = best[a]
        for b in range(a + 1, min(n, a + _MAX_CLUSTERS) + 1):
            known = run[starts[a] : starts[b]] in words
            if not known and b != a + 1:
                continue
            cand = (unknown + (0 if known else 1), count + 1, a)
            if best[b] is None or cand[:2] < best[b][:2]:
                best[b] = cand
    cuts, b = [], n
    while b > 0:
        cuts.append(starts[b])
        b = best[b][2]
    return sorted(c for c in cuts if 0 < c < len(run))


@lru_cache(maxsize=4096)
def breaks(text: str) -> frozenset[int]:
    """Indices i where a line may break before text[i] with no space there:
    between two Khmer words, after a zero-width space, or after Khmer
    punctuation (។ ៗ) when a Khmer word follows."""
    out = {i for i in range(1, len(text)) if text[i - 1] == ZWSP}
    i = 0
    while i < len(text):
        if not _letter(text[i]):
            i += 1
            continue
        j = i
        while j < len(text) and _letter(text[j]):
            j += 1
        out.update(i + c for c in _segment(text[i:j]))
        if i > 0 and _punct(text[i - 1]):
            out.add(i)
        i = j
    return frozenset(out)
