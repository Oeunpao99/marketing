"""Text-to-speech for motion video voice-overs (app/motion.py) — one MP3 per line.

Two providers, picked by SPEECH_PROVIDER (blank = Azure Speech when set up,
else Azure OpenAI):

- "azure": Azure Speech neural voices — Khmer Sreymom / Piseth (made for Khmer;
  the user preferred them by ear on 2026-10-13), English Ava / Andrew.
- "openai": Azure OpenAI gpt-4o-mini-tts — expressive, but speaks Khmer with a
  foreign accent. Voices TTS_VOICE_FEMALE / TTS_VOICE_MALE (coral / ash).

Without either, motion videos are simply made silent.

Khmer lines go to Google Gemini TTS (KHMER_SPEECH_PROVIDER, blank = Gemini when
GEMINI_API_KEY is set) — voice names "gemini:<voice>" — and fall back to Azure
when Gemini fails. Gemini gives no word timings: Khmer subtitles use the estimate.
With KIRITTS_API_KEY set, KiriTTS (a Khmer-first voice) reads those lines before
Gemini — see _kiri.
"""

from __future__ import annotations

import contextvars
import hashlib
import logging
import random
import time
from xml.sax.saxutils import escape

import httpx

from app.config import gemini_url, get_settings

log = logging.getLogger("app.speech")

VOICES = {
    ("km", "female"): "km-KH-SreymomNeural",
    ("km", "male"): "km-KH-PisethNeural",
    ("en", "female"): "en-US-AvaNeural",
    ("en", "male"): "en-US-AndrewNeural",
}
# Pay-as-you-go estimates per character spoken: Azure Speech neural voices
# ~$15 / 1M; gpt-4o-mini-tts ~$0.015 per minute of audio ≈ $15 / 1M too.
PRICE_PER_CHAR = 15 / 1_000_000

# How gpt-4o-mini-tts should sound, per language.
HOW = {
    "km": (
        "Speak in natural Cambodian Khmer with a native Phnom Penh accent. Warm, friendly and "
        "upbeat, like a young Cambodian seller talking to one customer on TikTok. Natural pace, "
        "clear words; brand and product names as written."
    ),
    "en": (
        "Warm, friendly and upbeat, like a small-business owner talking to one customer on "
        "TikTok. Natural pace, clear words."
    ),
}


class SpeechError(Exception):
    pass


def provider() -> str | None:
    """The provider in use — None when neither is set up."""
    s = get_settings()
    has = {
        "openai": bool(s.azure_openai_tts_endpoint and s.azure_openai_tts_api_key),
        "azure": bool(s.azure_speech_key and s.azure_speech_region),
    }
    if s.speech_provider in has:
        return s.speech_provider if has[s.speech_provider] else None
    return "azure" if has["azure"] else "openai" if has["openai"] else None


def ready() -> bool:
    from app import local_voice

    return provider() is not None or local_voice.ready() or gemini_ready()


GEMINI = "gemini:"
# Why Gemini lines fell back to Azure, newest last — the server log says why.
GEMINI_FAILURES: list[str] = []
# Gemini voice models known to be out until then (a used-up daily quota, a
# rejected key): the next model reads, and once they all are, Khmer lines go
# straight to Azure instead of failing one by one. Per key — ours and each
# workspace's own: {"<slot>|<model>": (until epoch s, why)}
_GEMINI_OUT: dict[str, tuple[float, str]] = {}

# The workspace's own Gemini key for this job / request (app/gemini_keys.py):
# read with after ours, before Azure. Its tally counts the characters it read
# (they aren't charged — Google bills them). Threads started for a job copy
# the context (app/motion.py add_voice).
_WS_KEY: contextvars.ContextVar[str] = contextvars.ContextVar("ws_gemini_key", default="")
_WS_TALLY: contextvars.ContextVar[dict | None] = contextvars.ContextVar("ws_gemini_tally", default=None)


def use_workspace_key(key: str) -> dict:
    """From here on (this thread / context): the workspace's own Gemini key
    after ours. Returns the tally of characters it reads: {"chars": n}."""
    tally = {"chars": 0}
    _WS_KEY.set(key or "")
    _WS_TALLY.set(tally)
    return tally


def _slot(key: str | None) -> str:
    return "ours" if not key else "ws:" + hashlib.sha256(key.encode()).hexdigest()[:10]


def _out(key: str | None, model: str) -> tuple[float, str]:
    return _GEMINI_OUT.get(f"{_slot(key)}|{model}", (0.0, ""))


def _keys() -> list[str | None]:
    """The Gemini keys to try, in order: ours (None), then the workspace's own."""
    out: list[str | None] = [None] if _ours_ready() else []
    if _WS_KEY.get() and _provider_ok():
        out.append(_WS_KEY.get())
    return out


def gemini_models() -> list[str]:
    """The Gemini voice models, in the order they're tried."""
    s = get_settings()
    return list(dict.fromkeys([s.gemini_tts_model, *(m.strip() for m in s.gemini_tts_backup_models.split(",") if m.strip())]))


def _live_models(key: str | None = None) -> list[str]:
    now = time.time()
    return [m for m in gemini_models() if _out(key, m)[0] <= now]


def gemini_available() -> bool:
    """Gemini is set up and at least one of its voice models isn't out — with
    our key or the workspace's own."""
    return any(_live_models(k) for k in _keys())


def gemini_status() -> dict:
    """For the page: is the Gemini voice reading Khmer now — and if it's out,
    who reads instead and when it's back. No reasons (keys, quotas) — those
    are in the server log."""
    from app import local_voice

    available = gemini_available() or kiri_ready()  # KiriTTS reads under the Gemini voice's name
    out = gemini_ready() and not available
    return {
        # the open-source Khmer voice can be picked ("Native") on this server
        "native": local_voice.ready(),
        "configured": gemini_ready() or kiri_ready(),
        "available": available,
        "back_at": min((_out(k, m)[0] for k in _keys() for m in gemini_models()), default=None) if out else None,
        "own_key": bool(_WS_KEY.get()),
        # KiriTTS's Khmer voices to pick by name — empty when it isn't set up
        "kiri": [{"name": n, "gender": g} for n, g in KIRI_VOICES.items()] if kiri_ready() else [],
        "kiri_default": {"female": get_settings().kiritts_voice_female, "male": get_settings().kiritts_voice_male} if kiri_ready() else {},
        "backup": {g: VOICES[("km", g)].split("-")[2].removesuffix("Neural") for g in ("female", "male")} if provider() == "azure" else {},
    }


def backup_for(voice: str) -> str | None:
    """The Azure voice that reads instead of a Gemini one — Sreymom for the
    female voice, Piseth for the male one. None without Azure Speech."""
    if not voice.startswith(GEMINI) or provider() != "azure":
        return None
    name = voice[len(GEMINI) :].split("|")[0]
    female = name == get_settings().gemini_tts_voice_female or name in GEMINI_OTHERS["female"]
    return VOICES[("km", "female" if female else "male")]


# A second voice of the same kind, for a dialogue between two women or two men
# (app/motion.py dialogue_voices). Azure's Khmer has one voice each — there the
# two share it.
GEMINI_OTHERS = {"female": ("Aoede", "Leda", "Kore"), "male": ("Puck", "Orus", "Charon")}
AZURE_OTHERS = {"en-US-AvaNeural": "en-US-EmmaNeural", "en-US-AndrewNeural": "en-US-BrianNeural"}


def other_voice(voice: str, gender: str) -> str | None:
    """Another voice like ``voice`` (the same gender) — None when there is none."""
    if voice.startswith(KIRI):
        name, _, act = voice[len(KIRI) :].partition("|")
        other = next((n for n, g in KIRI_VOICES.items() if g == gender and n != name), None)
        return KIRI + other + (f"|{act}" if act else "") if other else None
    if voice.startswith(GEMINI):
        name, _, act = voice[len(GEMINI) :].partition("|")
        other = next((n for n in GEMINI_OTHERS.get(gender, ()) if n != name), None)
        return GEMINI + other + (f"|{act}" if act else "") if other else None
    return AZURE_OTHERS.get(voice)


def _gemini_error(resp: httpx.Response) -> str:
    """Gemini's error in a line for the log: code, status, quota or message."""
    try:
        err = resp.json().get("error") or {}
    except ValueError:
        return f"{resp.status_code}: {resp.text[:150]}"
    quota = next(
        (v.get("quotaId") for d in err.get("details") or [] for v in d.get("violations") or [] if v.get("quotaId")),
        "",
    )
    reasons = " ".join(d.get("reason", "") for d in err.get("details") or [] if d.get("reason"))
    return f"{resp.status_code} {err.get('status', '')} {quota or reasons} — {(err.get('message') or '')[:140]}".strip()


def _mark_out(model: str, resp: httpx.Response, detail: str, key: str | None = None) -> bool:
    """A model's daily quota used up: that model is out until it's back (the
    quota's retry delay, else an hour). A rejected key: every model, tried
    again in 10 min. True when something was marked out."""
    if resp.status_code == 429 and "PerDay" in detail:
        wait, why, models = _gemini_retry_after_seconds(resp) or 3600.0, "daily limit used up", [model]
    elif resp.status_code in (400, 401, 403) and ("API_KEY" in detail or "API key" in detail):
        wait, why, models = 600.0, "API key rejected", gemini_models()
    else:
        return False
    for m in models:
        _GEMINI_OUT[f"{_slot(key)}|{m}"] = (time.time() + wait, why)
    whose = "our key" if not key else "the workspace's own key"
    log.error("Gemini voice %s (%s) is out for %.0f min (%s): %s", ", ".join(models), whose, wait / 60, why, detail)
    return True


def _why(exc: Exception) -> str:
    """A short reason for the log."""
    text = str(exc)
    if "PerDay" in text:
        return "Gemini's daily limit is used up (billing on the key raises it)"
    if "API_KEY" in text or "API key not valid" in text:
        return "the Gemini API key was rejected"
    if "402" in text or "prepayment" in text.lower() or "credit" in text.lower():
        return "Gemini credit is used up"
    if "429" in text:
        return "Gemini is busy (too many requests)"
    return text[:160]  # voice_for's names for Gemini TTS voices: "gemini:Kore"
# Gemini TTS ≈ $9 per 1M audio tokens (~25 a second) + the text — per character
# of Khmer that's about twice Azure's.
PRICE_PER_CHAR_GEMINI = 30 / 1_000_000


def _provider_ok() -> bool:
    return get_settings().khmer_speech_provider in ("", "gemini")


def _ours_ready() -> bool:
    return bool(get_settings().gemini_api_key) and _provider_ok()


def gemini_ready() -> bool:
    """Gemini can read Khmer here: our key, or the workspace's own."""
    return bool(_keys())


# KiriTTS (kiritts.com): a Khmer-first voice, asked before Gemini for Khmer
# lines when it's set up. It reads under the Gemini voice's name ("gemini:Kore"
# → Maly), so a video's backup, its note and its dialogue voices work as they
# did; only Gemini's main female / male voices map to it (a dialogue's second
# voice stays on Gemini). ~$0.033 an audio minute (Starter) at ~0.085 s a character.
PRICE_PER_CHAR_KIRI = 50 / 1_000_000
_KIRI_OUT = [0.0]  # out until then: a rejected key, or the month's credit used up
# …or picked by name in the composer: "kiri:Neary" (voice_clone.narrator_for adds
# the template — "kiri:Neary|picture"). Its Khmer voices only: GET /v1/voices also
# lists other languages' (Wei, Hoa, Emma…).
KIRI = "kiri:"
KIRI_VOICES = {
    "Maly": "female", "Neary": "female", "Mey": "female", "Nita": "female", "Soklin": "female",
    "Dara": "male", "Sophon": "male", "Seth": "male", "Chanda": "male", "Bora": "male", "Arun": "male",
}  # fmt: skip


def setting_gender(setting: str) -> str:
    """female / male for a Voice setting — "male" and "kiri:Dara" are male."""
    if setting.startswith(KIRI):
        return KIRI_VOICES.get(setting[len(KIRI) :].split("|")[0], "female")
    return "male" if setting == "male" else "female"


def kiri_ready() -> bool:
    return bool(get_settings().kiritts_api_key) and _KIRI_OUT[0] <= time.time()


def _kiri_voice(name: str) -> str:
    """The KiriTTS voice for a Gemini voice name — blank = Gemini reads it."""
    s = get_settings()
    return {s.gemini_tts_voice_female: s.kiritts_voice_female, s.gemini_tts_voice_male: s.kiritts_voice_male}.get(name, "")


def reads_with_kiri(voice: str) -> bool:
    """A Khmer line for ``voice`` goes to KiriTTS first (picked by name, or Gemini's main voice mapped to it)."""
    if voice.startswith(KIRI):
        return kiri_ready()
    return voice.startswith(GEMINI) and kiri_ready() and bool(_kiri_voice(voice[len(GEMINI) :].split("|")[0]))


def _kiri(text: str, voice: str, style: str = "") -> bytes:
    """KiriTTS reads ``text`` — MP3 bytes. No reading notes: measured 2026-10-26, any
    notes (accent, the template's acting) made it read slower (8.8 s → 10.3 s a line)
    and the user preferred it plain, as their website reads. ``style`` is unused."""
    s = get_settings()
    body = {"model": s.kiritts_model, "input": text.replace(ZWSP, "").strip(), "voice": voice, "response_format": "mp3"}
    for attempt in range(2):
        try:
            resp = httpx.post(
                f"{s.kiritts_base_url.rstrip('/')}/audio/speech",
                headers={"Authorization": f"Bearer {s.kiritts_api_key}"},
                json=body,
                timeout=180.0,
            )
        except httpx.HTTPError as exc:
            raise SpeechError(f"Could not reach KiriTTS: {exc}") from exc
        if resp.status_code == 200 and len(resp.content) > 1000:
            return _as_mp3(resp.content)
        try:  # {"error": {"message": …}} (seen), or {"detail": …} (their docs)
            err = resp.json()
            detail = str((err.get("error") or {}).get("message") or err.get("detail") or "")[:160]
        except (ValueError, AttributeError):
            detail = resp.text[:160]
        used_up = resp.status_code == 429 and any(w in detail.lower() for w in ("month", "credit"))
        if resp.status_code == 429 and not used_up and attempt == 0:
            time.sleep(min(float(resp.headers.get("retry-after") or 3), 15))  # over the per-minute limit: once more
            continue
        if resp.status_code in (401, 403) or used_up:
            _KIRI_OUT[0] = time.time() + (3600 if used_up else 600)
            log.error("KiriTTS is out for %s min: %s %s", 60 if used_up else 10, resp.status_code, detail)
        raise SpeechError(f"KiriTTS said {resp.status_code}: {detail or 'no audio'}")
    raise SpeechError("KiriTTS is busy")


def _as_mp3(audio: bytes) -> bytes:
    """KiriTTS answers "mp3" with a WAV (seen 2026-10-26): made an MP3 here, as the video stores it."""
    if not audio.startswith(b"RIFF"):
        return audio
    import subprocess

    import imageio_ffmpeg

    done = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
        input=audio,
        capture_output=True,
    )
    if done.returncode != 0 or not done.stdout:
        raise SpeechError("Couldn't encode the KiriTTS audio.")
    return done.stdout


def price_per_char(voice: str) -> float:
    if voice.startswith(KIRI):
        return PRICE_PER_CHAR_KIRI
    if voice.startswith(GEMINI):
        return PRICE_PER_CHAR_KIRI if kiri_ready() else PRICE_PER_CHAR_GEMINI
    return PRICE_PER_CHAR


def voice_for(language: str, gender: str, style: str | None = None) -> str | None:
    """The voice for a video's language and the chosen gender — None = no
    voice. With gpt-4o-mini-tts the language comes from the text itself."""
    if gender not in ("female", "male"):
        return None
    s = get_settings()
    from app import local_voice

    # Khmer → KiriTTS / Gemini TTS when set up (the most natural Khmer), English → Azure.
    name = s.gemini_tts_voice_female if gender == "female" else s.gemini_tts_voice_male
    if "khmer" in (language or "").lower() and (gemini_available() or (kiri_ready() and _kiri_voice(name))):
        # "gemini:Kore|training" — the template sets how the voice acts (GEMINI_ACT)
        return GEMINI + name + (f"|{style}" if style in GEMINI_ACT else "")
    # Gemini is set up but out for now (daily limit, key): Sreymom / Piseth
    # read — the voices people know — before any other Khmer voice
    if "khmer" in (language or "").lower() and gemini_ready() and provider() == "azure":
        return VOICES[("km", gender)]

    # KHMER_TTS_MODEL set: Khmer lines are read by the local open-source voice
    # (one voice — Female and Male both use it); English keeps Azure.
    if "khmer" in (language or "").lower() and local_voice.ready():
        return local_voice.PREFIX + local_voice.model_id()
    if provider() is None:
        return None
    if provider() == "openai":
        return s.tts_voice_female if gender == "female" else s.tts_voice_male
    return VOICES[("km" if "khmer" in (language or "").lower() else "en", gender)]


def _lang(text: str) -> str:
    return "km" if any(0x1780 <= ord(ch) <= 0x17FF for ch in text) else "en"


ZWSP = "​"


# Lines already spoken, kept a while: a storyboard's ▶ / "Listen to the whole
# voice" and then "Make the video" read the same lines — the video reuses them
# instead of asking Gemini (and its daily limit) twice. Only a line read by the
# voice asked for is kept, never a fallback. {(voice, text): (mp3, words, at)}
_SPOKEN: dict[tuple[str, str], tuple[bytes, list, float]] = {}
_SPOKEN_KEEP = 3 * 3600  # seconds
_SPOKEN_MAX = 400


def speak_timed(text: str, voice: str) -> tuple[bytes, list[dict]]:
    """``text`` read aloud with its word timings — reused when this exact line
    was read by this exact voice in the last few hours (see _speak_timed)."""
    key = (voice, text)
    hit = _SPOKEN.get(key)
    if hit and time.time() - hit[2] < _SPOKEN_KEEP:
        return hit[0], list(hit[1])
    failed_before = len(GEMINI_FAILURES)
    mp3, words = _speak_timed(text, voice)
    if len(GEMINI_FAILURES) == failed_before:  # read by the voice asked for — worth keeping
        if len(_SPOKEN) >= _SPOKEN_MAX:
            for k in sorted(_SPOKEN, key=lambda k: _SPOKEN[k][2])[: _SPOKEN_MAX // 4]:
                _SPOKEN.pop(k, None)
        _SPOKEN[key] = (mp3, list(words), time.time())
    return mp3, words


def _speak_timed(text: str, voice: str) -> tuple[bytes, list[dict]]:
    """``text`` read aloud, with when each word is said — (MP3 bytes,
    [{"w": word, "t": start s, "e": end s, "sp": space before it}]). The
    subtitles follow these exactly (motion/src/explainer.jsx Caption).

    Word timings come from the Azure Speech SDK's word-boundary events; Khmer
    gets one per word when the text carries zero-width spaces between words
    (app/khmer_words.py), else one per space-separated phrase. Without the
    SDK, or with the OpenAI voice, the words list is empty and the subtitles
    fall back to an estimate. Raises SpeechError."""
    from app import local_voice

    if voice.startswith((local_voice.PREFIX, GEMINI, KIRI)):  # no word timings
        return speak(text, voice), []
    if provider() != "azure":
        return speak(text, voice), []
    try:
        import azure.cognitiveservices.speech as sdk
    except ImportError:  # the SDK isn't installed — plain REST, no timings
        return speak(text, voice), []
    s = get_settings()
    cfg = sdk.SpeechConfig(subscription=s.azure_speech_key, region=s.azure_speech_region)
    cfg.set_speech_synthesis_output_format(sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3)
    cfg.speech_synthesis_voice_name = voice
    synth = sdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    events: list = []
    synth.synthesis_word_boundary.connect(events.append)
    result = synth.speak_text_async(text).get()  # as given: word positions ("o") index into it
    if result.reason == sdk.ResultReason.SynthesizingAudioCompleted and not result.audio_data:
        # "completed" with no audio (seen on prod for some lines): read it again
        # the plain way — no word timings (the subtitles estimate them), but
        # the scene has its voice instead of staying silent
        log.warning("Azure Speech gave no audio for a %d-character line (%s) — reading it again without word timings", len(text), voice)
        return speak(text, voice), []
    if result.reason != sdk.ResultReason.SynthesizingAudioCompleted or not result.audio_data:
        details = getattr(result, "cancellation_details", None)
        raise SpeechError(f"Azure Speech failed: {getattr(details, 'error_details', '') or result.reason}")
    words: list[dict] = []
    for ev in events:
        piece = ev.text or ""
        start = ev.audio_offset / 10_000_000
        end = start + ev.duration.total_seconds()
        if ev.boundary_type == sdk.SpeechSynthesisBoundaryType.Punctuation:
            if words:  # "?" belongs to the word before it
                words[-1]["w"] += piece
                words[-1]["e"] = round(end, 3)
            continue
        if ev.boundary_type != sdk.SpeechSynthesisBoundaryType.Word or not piece.strip(ZWSP + " "):
            continue
        words.append(
            {
                "w": piece.replace(ZWSP, ""),
                "t": round(start, 3),
                "e": round(end, 3),
                # a word that came after a zero-width space joins the one before it
                "sp": bool(words) and not piece.startswith(ZWSP),
                "o": ev.text_offset,  # where it is in ``text`` (khmer_speech.remap_words)
            }
        )
    return result.audio_data, words


def speak(text: str, voice: str, kiri_first: bool = True) -> bytes:
    """``text`` read aloud by ``voice`` — MP3 bytes. Raises SpeechError."""
    from app import local_voice

    if voice.startswith(KIRI):  # a KiriTTS voice picked by name: "kiri:Neary|picture"
        name, _, style = voice[len(KIRI) :].partition("|")
        # every line, English ones too — a KiriTTS voice is only ever a Khmer video's
        # (narrator_for), and one video keeps one voice; KiriTTS reads English well
        if kiri_ready():
            try:
                return _kiri(text, name, style)
            except SpeechError as exc:
                log.warning("KiriTTS %s failed (%s) — Gemini reads the line", name, exc)
        # an English line, or KiriTTS out: the voice its gender has (Gemini, else Azure) —
        # never KiriTTS's default voice, so the line isn't read by another KiriTTS voice
        s = get_settings()
        female = KIRI_VOICES.get(name, "female") == "female"
        backup = GEMINI + (s.gemini_tts_voice_female if female else s.gemini_tts_voice_male) + (f"|{style}" if style else "")
        if not gemini_ready():
            backup = VOICES[(_lang(text), "female" if female else "male")]
        return speak(text, backup, kiri_first=False)

    if voice.startswith(GEMINI):  # "gemini:<voice>" or "gemini:<voice>|<template>"
        name, _, style = voice[len(GEMINI) :].partition("|")
        # Gemini voices are only Khmer videos' (voice_for) — so their English lines go to KiriTTS too
        kiri = _kiri_voice(name) if kiri_first and kiri_ready() else ""
        if kiri:
            try:
                return _kiri(text, kiri, style)
            except SpeechError as exc:
                log.warning("KiriTTS failed (%s) — Gemini reads the line", exc)
        try:
            exc_last: SpeechError | None = None
            for key in _keys():  # ours first, then the workspace's own
                try:
                    if not _live_models(key):  # every voice model known out with this key: don't ask
                        raise SpeechError("Gemini is out (every voice model's daily limit is used up)")
                    mp3 = _gemini(text, name, style, key=key)
                    if key and _WS_TALLY.get() is not None:
                        _WS_TALLY.get()["chars"] += len(text)
                    return mp3
                except SpeechError as e:
                    exc_last = e
                    if key is None and _WS_KEY.get():
                        log.info("Our Gemini key couldn't read the line (%s) — trying the workspace's own key", e)
            raise exc_last or SpeechError("Gemini isn't set up")
        except SpeechError as exc:
            # Gemini down / out of credit / bad key: Azure reads this line instead
            s = get_settings()
            backup = VOICES[(_lang(text), "female" if name == s.gemini_tts_voice_female else "male")]
            log.warning("Gemini TTS failed (%s) — reading the line with %s", exc, backup)
            GEMINI_FAILURES.append(_why(exc))  # the video card says so (app/motion.py add_voice)
            if provider() != "azure":
                raise
            return _azure(text, backup)

    if voice.startswith(local_voice.PREFIX):
        try:
            return local_voice.speak(text, voice[len(local_voice.PREFIX) :])
        except Exception as exc:  # noqa: BLE001 — model / ffmpeg failure: the line stays silent
            raise SpeechError(f"The local Khmer voice failed: {exc}") from exc
    which = provider()
    if which is None:
        raise SpeechError("No voice service is set up (Azure OpenAI TTS or Azure Speech).")
    return _openai(text, voice) if which == "openai" else _azure(text, voice)


TAKES = 3  # Gemini takes per line before the backup voice reads it (_gemini's length check)
# Measured 2026-10-24 (Kore): a normal read is 0.08-0.09 s a character, a 9-character line
# 1.2 s. The limit leaves room for a calmer template style; a line read twice (~2x) is over it.
SLOWEST_S_PER_CHAR = 0.115
TAKE_PAD_S = 1.0  # its silence at either end


def too_long(said: str) -> float:
    """Seconds above which a Gemini take of ``said`` holds more than the line once (the line
    twice, or the director's notes) — see SLOWEST_S_PER_CHAR."""
    return TAKE_PAD_S + len(said) * SLOWEST_S_PER_CHAR


def _gemini(text: str, voice: str, style: str = "", plain: bool = False, key: str | None = None, attempt: int = 0) -> bytes:
    """Gemini TTS: 24 kHz 16-bit PCM back, made an MP3 here. The director's
    notes (HOW + the template's ACT) say how to read it, kept apart from the
    transcript in the layout Google's TTS guide uses. Now and then a voice
    model reads the notes aloud anyway: a line far longer than its words can
    take is asked for again as the bare text (``plain``) — never the notes."""
    import base64
    import subprocess

    import imageio_ffmpeg

    s = get_settings()
    said = text.replace(ZWSP, "").strip()
    if _lang(text) == "en":
        # an English line (in a Khmer video: a product name, a SaaS line) reads
        # naturally as it is — with English notes in front, Gemini most often
        # mistakes the notes for the line and says them aloud
        plain = True
    notes = f"{GEMINI_HOW[_lang(text)]} {GEMINI_ACT.get(style, '')}".rstrip()
    body = {
        # Gemini reads Khmer as written — the zero-width spaces between words are
        # for Azure's word timings, and make Gemini read word by word
        "contents": [{"parts": [{"text": said if plain else (
            "### DIRECTOR'S NOTES — how to read it. Never say these notes aloud.\n"
            + notes
            + f"\n\n#### TRANSCRIPT — say exactly this, and nothing else:\n{said}"
        )}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    resp, detail = None, ""
    api_key = key or s.gemini_api_key
    models = _live_models(key)
    for i, model in enumerate(models):  # the main voice model, then the next when one is used up
        waited = 0.0
        while True:
            try:
                # the key in a header, never in the url — urls end up in logs
                resp = httpx.post(
                    gemini_url(f"/v1beta/models/{model}:generateContent"),
                    headers={"x-goog-api-key": api_key},
                    json=body,
                    timeout=180.0,
                )
            except httpx.HTTPError as exc:
                raise SpeechError(f"Could not reach Gemini: {exc}") from exc
            # 429 = over this model's per-minute limit (10 lines a minute; several
            # are asked for at once). Another model with room reads it now;
            # only the last one waits as long as Google says, up to a minute.
            # A used-up daily quota won't come back by waiting.
            delay = _gemini_retry_after(resp) if resp.status_code == 429 else None
            if delay is not None and i + 1 < len(models):
                log.info("Gemini TTS %s busy this minute — trying %s", model, models[i + 1])
                break
            if delay is None or waited + delay > 60:
                break
            log.info("Gemini TTS %s busy — trying again in %.0fs", model, delay)
            time.sleep(delay)
            waited += delay
        if resp.status_code == 200:
            break
        detail = _gemini_error(resp)
        busy_minute = resp.status_code == 429 and "PerDay" not in detail
        if busy_minute:
            continue  # this model is full for the minute — the next one tries
        if not _mark_out(model, resp, detail, key) or "API key" in _out(key, model)[1]:
            break  # not a used-up model (or the key): the next model won't do better
    if resp is None:
        raise SpeechError("Gemini is out (every voice model's daily limit is used up)")
    if resp.status_code != 200:
        raise SpeechError(f"Gemini said {detail}")
    try:
        pcm = base64.b64decode(resp.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    except (KeyError, IndexError, ValueError) as exc:
        raise SpeechError("Gemini returned no audio.") from exc
    # ~0.085 s a character is normal speech. A take far longer than a slow read of
    # the LINE ALONE means Gemini said more than the line: the notes, or — now and
    # then — the line twice (a known glitch of its voice models). Ask again with the
    # bare text, up to TAKES times; still too long → SpeechError, and speak() has the
    # backup voice read this line rather than putting it in the video twice.
    seconds = len(pcm) / 48000
    if seconds > too_long(said):
        if attempt + 1 < TAKES:
            log.warning("Gemini TTS read more than the line (%.1fs for %s chars, take %d) — asking again with the text only", seconds, len(said), attempt + 1)
            return _gemini(text, voice, style, plain=True, key=key, attempt=attempt + 1)
        raise SpeechError(f"Gemini kept reading more than the line ({seconds:.1f}s for {len(said)} characters)")
    pcm = _trim_tail(pcm)
    done = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
         # skip Gemini's click at the very start, lower its background hiss, and
         # fade each end so lines never pop (as the Chumnouykar video script does)
         "-af", "atrim=start=0.06,asetpts=PTS-STARTPTS,afftdn=nf=-45,afade=in:d=0.03,areverse,afade=in:d=0.08,areverse",
         "-codec:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
        input=pcm,
        capture_output=True,
    )
    if done.returncode != 0 or not done.stdout:
        raise SpeechError("Couldn't encode the Gemini audio.")
    return done.stdout


def _trim_tail(pcm: bytes, rate: int = 24000) -> bytes:
    """Gemini's audio without the short loud noise it often adds after a gap
    at the end of a line (from the user's Chumnouykar video script): the last
    sound is cut when it is short (< 0.6 s), louder than the voice usually is,
    and comes after a pause — the line then ends in the middle of that pause.
    Anything else (a real last word) is kept."""
    import array
    import math

    s = array.array("h", pcm[: len(pcm) // 2 * 2])
    n = rate // 50  # 20 ms slices
    db = [20 * math.log10(math.sqrt(sum(x * x for x in s[i : i + n]) / n) / 32768 + 1e-9) for i in range(0, len(s) - n + 1, n)]
    i = len(db) - 1
    while i >= 0 and db[i] < -50:  # the silence at the very end
        i -= 1
    burst_end = i
    while i >= 0 and db[i] >= -50:  # the last sound
        i -= 1
    if burst_end - i > 30:  # longer than 0.6 s = real speech
        return pcm
    speech = sorted(d for d in db[: i + 1] if d >= -50)
    if not speech or max(db[i + 1 : burst_end + 1]) < speech[len(speech) // 2] + 5:
        return pcm  # not louder than the voice = a real word
    quiet = 0
    while i >= 0 and db[i] < -50:
        quiet += 1
        i -= 1
    if quiet < 5:  # no pause before it = part of the speech
        return pcm
    return s[: (i + 1 + quiet // 2) * n].tobytes()


def _gemini_retry_after_seconds(resp: httpx.Response) -> float | None:
    """Google's own retryDelay, as it says (a daily quota: hours)."""
    try:
        details = resp.json()["error"].get("details") or []
        return float(str(next(d["retryDelay"] for d in details if "retryDelay" in d)).rstrip("s"))
    except (ValueError, KeyError, StopIteration, AttributeError, TypeError):
        return None


def _gemini_retry_after(resp: httpx.Response) -> float | None:
    """Seconds to wait before asking Gemini again after a 429 — None when the
    daily quota is used up (waiting won't help)."""
    text = resp.text
    if "PerDay" in text:
        return None
    try:
        details = resp.json()["error"].get("details") or []
        delay = next(d["retryDelay"] for d in details if "retryDelay" in d)  # e.g. "17s"
        return min(max(float(str(delay).rstrip("s")), 1.0), 60.0) + random.uniform(0, 2)
    except (ValueError, KeyError, StopIteration, AttributeError, TypeError):
        return 10.0 + random.uniform(0, 5)


# How Gemini should say it — the director's notes before the transcript (_gemini).
GEMINI_HOW = {
    "km": (
        "Natural, fluent Cambodian Khmer with a native Phnom Penh accent — warm and friendly, like "
        "a young Cambodian seller talking to one customer, with natural pauses and rising and "
        "falling intonation. Brand and product names as written."
    ),
    "en": "A warm, friendly, natural voice, like a small-business owner talking to one customer.",
}
# …and how to act it, by the video's template (app/motion.py STYLES).
GEMINI_ACT = {
    "tech": "Energetic and confident, like a seller who believes in the product.",
    "offer": "Excited and punchy — lift the voice on prices and offers, short pause before each price.",
    "training": "Clear, calm and professional, like a good trainer presenting to a team — steady pace, pauses between ideas.",
    "explainer": "Warm and gentle, like telling a short story to a friend — slow down on the important moments.",
    "testimonial": "Warm and heartfelt, like telling a friend what happened to a real person.",
    "custom": "Confident and friendly, like a product presenter showing something they love using.",
    "hottake": "Bold and confident, like someone sharing an opinion they stand behind — a beat of pause before the take.",
    "casestudy": "Warm and credible, like telling a real customer's success story — let the numbers land.",
    "faq": "Friendly and helpful, like the best support person answering a customer's question.",
    "report": "Clear and calm, like a presenter walking through findings — slow down on each number.",
    "countdown": "Upbeat and punchy, like a creator counting down a top 5 — build a little excitement towards number one.",
    "thisorthat": "Playful and quick, like a friend asking you to pick a side.",
    "reviews": "Warm and sincere, like sharing what real customers said — let their words land.",
    "tips": "Friendly and practical, like a helpful teacher giving tips you can use today.",
    "clarity": "Calm, clear and warm, like a premium product explainer — unhurried, every sentence landing.",
    "launch": "Confident and cinematic, like the voice of a premium product launch film — calm power, a small pause before the big moment.",
    "showcase": "Bright and upbeat, like a polished app launch video — confident, a little excited, quick pace.",
    "demo": "Clear and friendly, like showing a friend how to use an app, step by step.",
    "poll": "Playful and lively, like a game-show host.",
    "quote": "Calm and slow, with weight on every word.",
    "pov": "Relaxed and funny, like telling a friend a moment they know too well.",
    "trend": "Like a sharp news presenter — clear, upbeat, informative.",
    "versus": "Confident and fair, like an expert comparing two options.",
    "canvas": "Confident and clear, like the narrator of a polished brand film — a small pause before each big moment.",
    "doodle": "Calm and warm, like an older sibling sharing a life lesson — gentle pauses, never rushed.",
    "cartoon": "Lively and natural, like telling a funny everyday story to a friend.",
    "lesson": "Friendly and clear, like a favourite teacher explaining at the board — slow down on each number.",
    "deck": "Clear, confident and warm, like a good presenter walking an audience through their slides — steady pace, a small pause between points.",
    "aiteam": "Confident, clear and modern, like the voice of a good product launch film — upbeat but never pushy, a small pause before each turn.",
    "saashub": "Sharp, energetic and tech-forward, like a keynote presenter unveiling a revolutionary cloud platform — crisp, authoritative, enthusiastic.",
    "picture": "Warm, clear and storytelling, like the narrator of a good YouTube story channel — unhurried, with feeling, a small pause between moments.",
    "illustrated": "Calm, warm and clear, like the narrator of a short documentary — unhurried, kind, a little pause between thoughts.",
    "street3d": "Warm and confident, a little cinematic, like the voice of a short brand film — unhurried, proud of the shop.",
    "dialogue": "Natural and conversational, like a real person chatting with a friend — relaxed, expressive, never like reading.",
    "parable": "Warm and lively, like a grandparent telling a fable with a twinkle — a little playful, a small pause before the turn and the lesson.",
    "rise": "Warm and encouraging, building gently towards the end — like someone who believes in the listener.",
    "studio": "Calm, warm and elegant, like a premium brand film — unhurried, confident, inviting.",
    "podcast": "Relaxed, honest and warm, like a podcast host telling a personal story to a friend — natural pauses, a little smile in the voice.",
    "presenter": "Bright, warm and confident, like a favourite content creator talking to camera — friendly, lively, clear.",
    "reaction": "Deadpan and playful, like a meme page admin — short, dry, a little dramatic on the punchline.",
}


def _openai(text: str, voice: str) -> bytes:
    s = get_settings()
    url = (
        f"{s.azure_openai_tts_endpoint.rstrip('/')}/openai/deployments/{s.azure_openai_tts_deployment}"
        f"/audio/speech?api-version={s.azure_openai_tts_api_version}"
    )
    body = {
        "model": s.azure_openai_tts_deployment,
        "input": text.strip(),
        "voice": voice,
        "instructions": HOW[_lang(text)],
        "response_format": "mp3",
    }
    try:
        resp = httpx.post(url, headers={"api-key": s.azure_openai_tts_api_key}, json=body, timeout=120.0)
    except httpx.HTTPError as exc:
        raise SpeechError(f"Could not reach the voice service: {exc}") from exc
    if resp.status_code != 200 or not resp.content:
        raise SpeechError(f"The voice service said {resp.status_code}: {resp.text[:200]}")
    return resp.content


def _azure(text: str, voice: str, rate: str = "0%") -> bytes:
    s = get_settings()
    lang = "-".join(voice.split("-")[:2])
    ssml = (
        f"<speak version='1.0' xml:lang='{lang}'><voice name='{voice}'>"
        f"<prosody rate='{rate}'>{escape(text.strip())}</prosody></voice></speak>"
    )
    try:
        resp = httpx.post(
            f"https://{s.azure_speech_region}.tts.speech.microsoft.com/cognitiveservices/v1",
            content=ssml.encode("utf-8"),
            headers={
                "Ocp-Apim-Subscription-Key": s.azure_speech_key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
                "User-Agent": "contentflow",
            },
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise SpeechError(f"Could not reach Azure Speech: {exc}") from exc
    if resp.status_code != 200 or not resp.content:
        raise SpeechError(f"Azure Speech said {resp.status_code}: {resp.text[:200]}")
    return resp.content
