"""Text-to-speech for motion video voice-overs (app/motion.py) — one MP3 per line.

Two providers, picked by SPEECH_PROVIDER (blank = Azure Speech when set up,
else Azure OpenAI):

- "azure": Azure Speech neural voices — Khmer Sreymom / Piseth (made for Khmer;
  the user preferred them by ear on 2026-10-13), English Ava / Andrew.
- "openai": Azure OpenAI gpt-4o-mini-tts — expressive, but speaks Khmer with a
  foreign accent. Voices TTS_VOICE_FEMALE / TTS_VOICE_MALE (coral / ash).

Without either, motion videos are simply made silent.
"""

from __future__ import annotations

import logging
from xml.sax.saxutils import escape

import httpx

from app.config import get_settings

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
    return provider() is not None


def voice_for(language: str, gender: str) -> str | None:
    """The voice for a video's language and the chosen gender — None = no
    voice. With gpt-4o-mini-tts the language comes from the text itself."""
    if gender not in ("female", "male"):
        return None
    s = get_settings()
    if provider() == "openai":
        return s.tts_voice_female if gender == "female" else s.tts_voice_male
    return VOICES[("km" if "khmer" in (language or "").lower() else "en", gender)]


def _lang(text: str) -> str:
    return "km" if any(0x1780 <= ord(ch) <= 0x17FF for ch in text) else "en"


def speak(text: str, voice: str) -> bytes:
    """``text`` read aloud by ``voice`` — MP3 bytes. Raises SpeechError."""
    which = provider()
    if which is None:
        raise SpeechError("No voice service is set up (Azure OpenAI TTS or Azure Speech).")
    return _openai(text, voice) if which == "openai" else _azure(text, voice)


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


def _azure(text: str, voice: str, rate: str = "+4%") -> bytes:
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
