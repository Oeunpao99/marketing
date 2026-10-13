"""The local Khmer voice: an open-source text-to-speech model run on the
server's CPU, for Khmer voice-overs when KHMER_TTS_MODEL is set (e.g.
"khmerttsopensource/khmer-tts"). English lines keep Azure (app/speech.py).

The model (a VITS fine-tune of Meta's MMS Khmer voice, ~36M parameters) is
downloaded once into HF_HOME (a Docker volume on the server), loaded on first
use and kept in memory; a line takes about a second. It knows only Khmer
letters — English words are written in Khmer letters first (transliterate) —
and gives no word timings, so subtitles use the estimated timing.

License: the MMS Khmer models are CC-BY-NC 4.0 (non-commercial). Turning this
on is the workspace owner's decision (see testing/khmer-voice/README.md).
"""

from __future__ import annotations

import io
import logging
import re
import subprocess
import tempfile
import threading
import wave
from pathlib import Path

from app.config import get_settings

log = logging.getLogger("app.local_voice")

PREFIX = "local:"  # speech.voice_for's voice name for this voice: "local:<model id>"

_lock = threading.Lock()  # one line at a time — the model isn't shared across threads
_loaded: dict[str, tuple] = {}
_translit_cache: dict[str, str] = {}


def model_id() -> str:
    return (get_settings().khmer_tts_model or "").strip()


def ready() -> bool:
    if not model_id():
        return False
    from importlib.util import find_spec

    return find_spec("torch") is not None and find_spec("transformers") is not None


def _load(name: str):
    if name not in _loaded:
        from transformers import AutoTokenizer, VitsModel
        from transformers.utils import logging as hf_logging

        # The checkpoint also holds training-only parts (the "discriminator"),
        # which the loader reports as UNEXPECTED — harmless; keep the log quiet.
        hf_logging.set_verbosity_error()
        log.info("loading the local Khmer voice %s", name)
        try:  # the copy already downloaded (HF_HOME) — no trip to Hugging Face
            model = VitsModel.from_pretrained(name, local_files_only=True)
            tok = AutoTokenizer.from_pretrained(name, local_files_only=True)
        except OSError:  # not downloaded yet: fetch it once
            model = VitsModel.from_pretrained(name)
            tok = AutoTokenizer.from_pretrained(name)
        _loaded[name] = (model.eval(), tok)
    return _loaded[name]


def speak(text: str, name: str) -> bytes:
    """``text`` (Khmer) read aloud by the local model — MP3 bytes."""
    import numpy as np
    import torch

    from app.story import _ffmpeg

    clean = re.sub(r"[​‌‍]", "", text).strip()
    if not clean:
        raise ValueError("Nothing to say.")
    with _lock:
        model, tok = _load(name)
        torch.manual_seed(7)  # the model is a little random — the same line sounds the same each time
        inputs = tok(clean, return_tensors="pt")
        with torch.no_grad():
            wav = model(**inputs).waveform[0].numpy()
        rate = model.config.sampling_rate
    pcm = (np.clip(wav, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "line.wav", Path(tmp) / "line.mp3"
        src.write_bytes(buf.getvalue())
        subprocess.run(
            [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "96k", str(out)],
            check=True,
            capture_output=True,
            timeout=60,
        )
        return out.read_bytes()


LATIN_WORD = re.compile(r"[A-Za-z][A-Za-z0-9'’.\-]*[A-Za-z0-9]|[A-Za-z]")


def transliterate(words: list[str]) -> dict[str, str]:
    """English / brand words written in Khmer letters, as a Cambodian would
    say them (Facebook → ហ្វេសប៊ុក) — the local voice can't read Latin
    letters. One AI call for the words not seen before; cached in memory.
    Returns {} for the words it couldn't do (they're then skipped)."""
    todo = sorted({w for w in words if w and w.lower() not in _translit_cache})
    if todo:
        from app.content_ai import ContentAIError, _chat

        try:
            raw = _chat(
                [
                    {
                        "role": "system",
                        "content": (
                            "Write each English word or brand name in Khmer script, the way a Cambodian "
                            "says it out loud (Facebook → ហ្វេសប៊ុក, TikTok → ធីកតុក, AI → អេអាយ, "
                            "Chumnouykar → ជំនួយការ). Spell out abbreviations letter by letter. Return ONLY "
                            'a JSON object: {"words": {"<word>": "<Khmer>", ...}}'
                        ),
                    },
                    {"role": "user", "content": "\n".join(todo[:80])},
                ],
                get_settings().azure_openai_deployment,
                max_tokens=2000,
                effort="low",
            )
            for k, v in (raw.get("words") or {}).items():
                if isinstance(v, str) and re.search(r"[ក-៿]", v):
                    _translit_cache[str(k).lower()] = v.strip()
        except ContentAIError as exc:
            log.warning("transliteration failed: %s", exc)
    return {w: _translit_cache[w.lower()] for w in words if w.lower() in _translit_cache}
