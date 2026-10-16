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
"""

from __future__ import annotations

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
# straight to Azure instead of failing one by one. {model: (until epoch s, why)}
_GEMINI_OUT: dict[str, tuple[float, str]] = {}


def gemini_models() -> list[str]:
    """The Gemini voice models, in the order they're tried."""
    s = get_settings()
    return list(dict.fromkeys([s.gemini_tts_model, *(m.strip() for m in s.gemini_tts_backup_models.split(",") if m.strip())]))


def _live_models() -> list[str]:
    now = time.time()
    return [m for m in gemini_models() if _GEMINI_OUT.get(m, (0.0, ""))[0] <= now]


def gemini_available() -> bool:
    """Gemini is set up and at least one of its voice models isn't out."""
    return gemini_ready() and bool(_live_models())


def gemini_status() -> dict:
    """For the page: is the Gemini voice reading Khmer now — and if it's out,
    who reads instead and when it's back. No reasons (keys, quotas) — those
    are in the server log."""
    from app import local_voice

    out = gemini_ready() and not gemini_available()
    return {
        # the open-source Khmer voice can be picked ("Native") on this server
        "native": local_voice.ready(),
        "configured": gemini_ready(),
        "available": gemini_available(),
        "back_at": min((_GEMINI_OUT.get(m, (0.0, ""))[0] for m in gemini_models()), default=None) if out else None,
        "backup": {g: VOICES[("km", g)].split("-")[2].removesuffix("Neural") for g in ("female", "male")} if provider() == "azure" else {},
    }


def backup_for(voice: str) -> str | None:
    """The Azure voice that reads instead of a Gemini one — Sreymom for the
    female voice, Piseth for the male one. None without Azure Speech."""
    if not voice.startswith(GEMINI) or provider() != "azure":
        return None
    name = voice[len(GEMINI) :].split("|")[0]
    return VOICES[("km", "female" if name == get_settings().gemini_tts_voice_female else "male")]


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


def _mark_out(model: str, resp: httpx.Response, detail: str) -> bool:
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
        _GEMINI_OUT[m] = (time.time() + wait, why)
    log.error("Gemini voice %s is out for %.0f min (%s): %s", ", ".join(models), wait / 60, why, detail)
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


def gemini_ready() -> bool:
    s = get_settings()
    if not s.gemini_api_key:
        return False
    return s.khmer_speech_provider in ("", "gemini")


def price_per_char(voice: str) -> float:
    return PRICE_PER_CHAR_GEMINI if voice.startswith(GEMINI) else PRICE_PER_CHAR


def voice_for(language: str, gender: str, style: str | None = None) -> str | None:
    """The voice for a video's language and the chosen gender — None = no
    voice. With gpt-4o-mini-tts the language comes from the text itself."""
    if gender not in ("female", "male"):
        return None
    s = get_settings()
    from app import local_voice

    # Khmer → Gemini TTS when it's set up (the most natural Khmer), English → Azure.
    if "khmer" in (language or "").lower() and gemini_available():
        name = s.gemini_tts_voice_female if gender == "female" else s.gemini_tts_voice_male
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

    if voice.startswith(local_voice.PREFIX) or voice.startswith(GEMINI):  # no word timings
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


def speak(text: str, voice: str) -> bytes:
    """``text`` read aloud by ``voice`` — MP3 bytes. Raises SpeechError."""
    from app import local_voice

    if voice.startswith(GEMINI):  # "gemini:<voice>" or "gemini:<voice>|<template>"
        name, _, style = voice[len(GEMINI) :].partition("|")
        try:
            if not _live_models():  # every voice model known out: don't ask again
                raise SpeechError("Gemini is out (every voice model's daily limit is used up)")
            return _gemini(text, name, style)
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


def _gemini(text: str, voice: str, style: str = "", plain: bool = False) -> bytes:
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
    body = {
        # Gemini reads Khmer as written — the zero-width spaces between words are
        # for Azure's word timings, and make Gemini read word by word
        "contents": [{"parts": [{"text": said if plain else (
            "### DIRECTOR'S NOTES — how to read it. Never say these notes aloud.\n"
            f"{GEMINI_HOW[_lang(text)]} {GEMINI_ACT.get(style, '')}".rstrip()
            + f"\n\n#### TRANSCRIPT — say exactly this, and nothing else:\n{said}"
        )}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    resp, detail = None, ""
    models = _live_models()
    for i, model in enumerate(models):  # the main voice model, then the next when one is used up
        waited = 0.0
        while True:
            try:
                # the key in a header, never in the url — urls end up in logs
                resp = httpx.post(
                    gemini_url(f"/v1beta/models/{model}:generateContent"),
                    headers={"x-goog-api-key": s.gemini_api_key},
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
        if not _mark_out(model, resp, detail) or "API key" in _GEMINI_OUT.get(model, (0, ""))[1]:
            break  # not a used-up model (or the key): the next model won't do better
    if resp is None:
        raise SpeechError("Gemini is out (every voice model's daily limit is used up)")
    if resp.status_code != 200:
        raise SpeechError(f"Gemini said {detail}")
    try:
        pcm = base64.b64decode(resp.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    except (KeyError, IndexError, ValueError) as exc:
        raise SpeechError("Gemini returned no audio.") from exc
    if not plain and len(pcm) / 48000 > 3.0 + len(said) * 0.14:
        # ~0.07 s a character is normal speech: twice that and more = it read the notes too
        log.warning("Gemini TTS read the notes aloud (%.1fs for %s chars) — asking again with the text only", len(pcm) / 48000, len(said))
        return _gemini(text, voice, style, plain=True)
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
