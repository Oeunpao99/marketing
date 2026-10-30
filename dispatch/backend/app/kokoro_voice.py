"""The English voice: Kokoro, an open-source text-to-speech model (Apache 2.0
— free for commercial use) run on the server's CPU with kokoro-onnx (MIT).
It reads every English line when ENGLISH_SPEECH_PROVIDER is "kokoro" (off by
default — Azure reads English); Khmer lines keep their own voices (app/speech.py).
Measured 2026-10-30: ~14 s for 7.7 s of speech on 2 cores (~10 s on 4) — the
small int8 model is no faster.

The two model files (~340 MB) download once from kokoro-onnx's GitHub release
into KOKORO_DIR (blank = HF_HOME/kokoro — a Docker volume on the server), are
loaded on first use and kept in memory. One line at a time: the server has two
cores. No word timings — subtitles use the estimated timing. A line that fails
is read by Azure's English voice instead (app/speech.py speak).

Voices: "kokoro:af_heart" (female, the default) — any voice in voices-v1.0.bin
works by name: af_bella, af_nicole, am_michael, am_adam, bf_emma, bm_george…
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

import httpx

from app.config import get_settings

log = logging.getLogger("app.kokoro_voice")

PREFIX = "kokoro:"  # speech.voice_for's voice name for this voice: "kokoro:<voice>"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
VOICES_FILE = "voices-v1.0.bin"
# A second voice of the same kind, for a dialogue between two women or two men
OTHERS = {"female": ("af_heart", "af_bella", "af_nicole"), "male": ("am_michael", "am_adam", "am_fenrir")}
MALE = {"am_", "bm_"}

_lock = threading.Lock()  # one line at a time — and one download
_model = None
_failed_at = 0.0  # a download / load that failed: not tried again for a while


def _dir() -> Path:
    s = get_settings()
    if s.kokoro_dir:
        return Path(s.kokoro_dir)
    return Path(os.environ.get("HF_HOME") or Path.home() / ".cache") / "kokoro"


def ready() -> bool:
    """Kokoro reads English lines on this server."""
    import time
    from importlib.util import find_spec

    if (get_settings().english_speech_provider or "").strip().lower() != "kokoro":
        return False
    if time.time() - _failed_at < 600:
        return False
    return find_spec("kokoro_onnx") is not None


def gender(voice: str) -> str:
    name = voice[len(PREFIX) :] if voice.startswith(PREFIX) else voice
    return "male" if name[:3] in MALE else "female"


def voice_for(gender: str) -> str:
    s = get_settings()
    return PREFIX + (s.kokoro_voice_male if gender == "male" else s.kokoro_voice_female)


def other_voice(voice: str, gender: str) -> str | None:
    name = voice[len(PREFIX) :]
    other = next((n for n in OTHERS.get(gender, ()) if n != name), None)
    return PREFIX + other if other else None


def _fetch(name: str, dest: Path) -> None:
    """One model file from the release, written whole or not at all."""
    log.info("downloading the Kokoro voice file %s", name)
    part = dest.with_suffix(dest.suffix + ".part")
    with httpx.stream("GET", RELEASE + name, follow_redirects=True, timeout=600.0) as resp:
        resp.raise_for_status()
        with part.open("wb") as f:
            for chunk in resp.iter_bytes(1 << 20):
                f.write(chunk)
    part.replace(dest)


def _load():
    global _model, _failed_at
    if _model is None:
        import time

        from kokoro_onnx import Kokoro

        folder = _dir()
        folder.mkdir(parents=True, exist_ok=True)
        model_file = get_settings().kokoro_model
        try:
            for name in (model_file, VOICES_FILE):
                if not (folder / name).exists():
                    _fetch(name, folder / name)
            log.info("loading the Kokoro voice %s", model_file)
            _model = Kokoro(str(folder / model_file), str(folder / VOICES_FILE))
        except Exception:
            _failed_at = time.time()
            raise
    return _model


def speak(text: str, name: str) -> bytes:
    """``text`` (English) read aloud by the Kokoro voice ``name`` — MP3 bytes."""
    from app.local_voice import wav_to_mp3

    clean = text.replace("​", "").strip()
    if not clean:
        raise ValueError("Nothing to say.")
    lang = "en-gb" if name[:1] == "b" else "en-us"
    with _lock:
        model = _load()
        wav, rate = model.create(clean, voice=name, speed=get_settings().kokoro_speed, lang=lang)
    return wav_to_mp3(wav, rate)
