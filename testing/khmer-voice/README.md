# Khmer voice test (2026-10-13)

The same 4 Khmer lines read by three voices, to compare by ear before choosing
a voice for ContentFlow's Remotion videos.

| File suffix | Voice | Notes |
|---|---|---|
| `__azure-sreymom.mp3` | Azure Speech `km-KH-SreymomNeural` — what ContentFlow uses now | 24 kHz; reads English words; gives word timings for subtitles |
| `__mms-meta.wav` | [facebook/mms-tts-khm](https://huggingface.co/facebook/mms-tts-khm) (open source) | 16 kHz; **CC-BY-NC 4.0 — non-commercial only** |
| `__mms-finetuned.wav` | [khmerttsopensource/khmer-tts](https://huggingface.co/khmerttsopensource/khmer-tts) (fine-tune of the above) | 16 kHz; **CC-BY-NC 4.0** |

Lines (`samples/`):

1. `1-everyday` — everyday shop talk
2. `2-number-price` — numbers and a price (៨០ ដុល្លារ, ២៤ ម៉ោង)
3. `3-english-brand` — English and brand names (Chumnouykar AI, Facebook, Telegram).
   The open-source files are only 1.5–2 s long: they most likely skip the English words.
4. `4-long-story` — a longer, two-sentence line

Speed on a laptop CPU: each line in ~0.3–1.6 s (fast enough for a server).

## Make them again (or with new lines)

Edit `LINES` in `khmer_tts_test.py`, then from this folder:

```
uv run --no-project --python 3.12 --with torch --with transformers --with scipy --with azure-cognitiveservices-speech python khmer_tts_test.py samples ../../dispatch/backend/.env all
```

The last argument picks the voices: `all`, `mms`, `ft` or `azure`. Azure needs the
speech key in `dispatch/backend/.env` (never copy the key into this folder).
