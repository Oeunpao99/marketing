"""Khmer Voice Lab — paste Khmer, hear every voice side by side.

Run from dispatch/backend (it reuses the app's voice code and .env keys — no
scheduler, no database):

    PYTHONPATH=. uv run uvicorn --app-dir ../../testing/khmer-voice/lab lab:app --port 8020

then open http://127.0.0.1:8020. Each Azure / GPT line costs a fraction of a
cent on your Azure subscription; the MMS voices run free on this computer.
"""

import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app import speech
from app.config import get_settings
from app.khmer_speech import spoken_parts

app = FastAPI(title="Khmer Voice Lab")
HERE = Path(__file__).parent


def _mms_finetuned(text: str) -> bytes:
    from app import local_voice

    name = get_settings().khmer_tts_model
    if not name:
        raise RuntimeError("KHMER_TTS_MODEL is not set in .env")
    return local_voice.speak(text, name)


def _mms_meta(text: str) -> bytes:
    # the mms-tts-khm-fastapi project, if it's running on port 8010
    r = httpx.post("http://127.0.0.1:8010/speech/generate", json={"model_id": "mms-khm", "text": text, "device": "cpu"}, timeout=120)
    r.raise_for_status()
    return r.content


# How gpt-4o-mini-tts should act the line — the source of the rhythm and melody
# (the clone only changes the sound of the voice, not how it's spoken).
STYLES = {
    "app": None,  # what the app sends today (speech.HOW)
    "natural": (
        "Speak Cambodian Khmer the way a real person talks to a friend — relaxed and natural, never "
        "read-out. Native Phnom Penh accent. Let the pitch rise and fall with the meaning, take small "
        "natural breaths between phrases, slow down a little on the important words, and smile through "
        "the friendly parts. Conversational pace, not too fast."
    ),
    "excited": (
        "Speak Cambodian Khmer like an energetic young Cambodian seller doing a TikTok promo. Native "
        "Phnom Penh accent. Bright and excited, with clear rises in pitch on prices, discounts and offers, "
        "a short pause before each price, and punchy endings. Lively but clear — every number easy to catch."
    ),
    "calm": (
        "Speak Cambodian Khmer like a warm storyteller telling a short story to one person. Native Phnom "
        "Penh accent. Calm and gentle, slightly slower than normal, real pauses at the end of each "
        "sentence, soft emphasis on feelings, natural falling pitch at the end of sentences."
    ),
}


def _azure_styled(text: str, voice: str, style: str = "app") -> bytes:
    """Azure with the Khmer prosody front-end (app/khmer_prosody): breaths at
    linking words and openers, prices stressed, questions rising — or plain."""
    from app import khmer_prosody

    if style not in khmer_prosody.STYLES:
        return speech._azure(text, voice)
    s = get_settings()
    r = httpx.post(
        f"https://{s.azure_speech_region}.tts.speech.microsoft.com/cognitiveservices/v1",
        content=khmer_prosody.ssml(text, voice, style).encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": s.azure_speech_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "contentflow",
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.content


def _gpt(text: str, voice: str, style: str = "app", custom: str = "") -> bytes:
    """gpt-4o-mini-tts with an acting instruction (the lab's speaking styles)."""
    how = custom.strip() if style == "custom" and custom.strip() else STYLES.get(style)
    if style != "app":
        from app import khmer_prosody

        text = khmer_prosody.punctuated(text)  # the breaths as commas
    if not how:
        return speech._openai(text, voice)
    s = get_settings()
    url = (
        f"{s.azure_openai_tts_endpoint.rstrip('/')}/openai/deployments/{s.azure_openai_tts_deployment}"
        f"/audio/speech?api-version={s.azure_openai_tts_api_version}"
    )
    body = {"model": s.azure_openai_tts_deployment, "input": text, "voice": voice, "instructions": how, "response_format": "mp3"}
    r = httpx.post(url, headers={"api-key": s.azure_openai_tts_api_key}, json=body, timeout=120)
    r.raise_for_status()
    return r.content


def _yours(source):
    """The owner's cloned voice: the line read by ``source``, then converted by
    the OpenVoice helper (C:\\venvs\\openvoice-test\\convert_server.py, port 8030)."""

    def make(text: str, p) -> bytes:
        audio = source(text, p)
        r = httpx.post(f"http://127.0.0.1:8030/convert?strength={p.strength}", content=audio, timeout=300)
        r.raise_for_status()
        return r.content

    return make


def _female() -> str:
    return get_settings().tts_voice_female


def _male() -> str:
    return get_settings().tts_voice_male


def _azure_hd(text: str, voice: str) -> bytes:
    """An Azure HD / multilingual voice reading Khmer — they list km-KH as a
    second language; the <lang> tag tells them to speak it."""
    from xml.sax.saxutils import escape

    lang = "-".join(voice.split(":")[0].split("-")[:2])
    ssml = (
        f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'>"
        f"<voice name='{voice}'><lang xml:lang='km-KH'>{escape(text)}</lang></voice></speak>"
    )
    s = get_settings()
    r = httpx.post(
        f"https://{s.azure_speech_region}.tts.speech.microsoft.com/cognitiveservices/v1",
        content=ssml.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": s.azure_speech_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "contentflow",
        },
        timeout=90,
    )
    r.raise_for_status()
    return r.content


HD_VOICES = {
    "hd-ava": ("Azure HD · Ava (female)", "en-US-Ava:DragonHDLatestNeural"),
    "hd-andrew": ("Azure HD · Andrew (male)", "en-US-Andrew:DragonHDLatestNeural"),
    "hd-omni-ava": ("Azure HD Omni · Ava (female, preview)", "en-us-ava:DragonHDOmniLatestNeural"),
    "hd-omni-brian": ("Azure HD Omni · Brian (male, preview)", "en-US-Brian:DragonHDOmniLatestNeural"),
    "hd-xiaochen": ("Azure HD · Xiaochen (female)", "zh-CN-Xiaochen:DragonHDLatestNeural"),
    "multi-serena": ("Azure Multilingual · Serena (female)", "en-US-SerenaMultilingualNeural"),
    "multi-andrew": ("Azure Multilingual · Andrew (male)", "en-US-AndrewMultilingualNeural"),
}


# id → (label, audio type, make(text, request))
VOICES = {
    "you-piseth": ("Your voice · from Piseth", "audio/mpeg", _yours(lambda t, p: _azure_styled(t, "km-KH-PisethNeural", p.style))),
    "you-gpt": ("Your voice · from gpt-4o-mini-tts", "audio/mpeg", _yours(lambda t, p: _gpt(t, _male(), p.style, p.custom))),
    "you-mms-meta": ("Your voice · from MMS Meta", "audio/mpeg", _yours(lambda t, p: _mms_meta(t))),
    "azure-sreymom": ("Azure · Sreymom (female)", "audio/mpeg", lambda t, p: _azure_styled(t, "km-KH-SreymomNeural", p.style)),
    "azure-piseth": ("Azure · Piseth (male)", "audio/mpeg", lambda t, p: _azure_styled(t, "km-KH-PisethNeural", p.style)),
    "gpt-female": ("Azure OpenAI · gpt-4o-mini-tts (female)", "audio/mpeg", lambda t, p: _gpt(t, _female(), p.style, p.custom)),
    "gpt-male": ("Azure OpenAI · gpt-4o-mini-tts (male)", "audio/mpeg", lambda t, p: _gpt(t, _male(), p.style, p.custom)),
    "mms-finetuned": ("Open-source MMS · fine-tuned", "audio/mpeg", lambda t, p: _mms_finetuned(t)),
    "mms-meta": ("Open-source MMS · Meta (port 8010)", "audio/wav", lambda t, p: _mms_meta(t)),
}
for _id, (_label, _voice) in HD_VOICES.items():
    VOICES[_id] = (_label, "audio/mpeg", lambda t, p, v=_voice: _azure_hd(t, v))



class SayIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    voice: str
    numbers: bool = True  # "$29" → Khmer words first, like the app does
    strength: float = Field(0.3, ge=0.1, le=1.0)  # your voice: how much of it to apply
    style: str = "natural"  # how the GPT voice acts the line (STYLES, or "custom")
    custom: str = Field("", max_length=1000)


@app.get("/")
def page():
    return FileResponse(HERE / "index.html")


@app.post("/spoken")
def spoken(payload: SayIn):
    """What the voice will actually read after the numbers step."""
    return {"text": "".join(say for _, say in spoken_parts(payload.text)) if payload.numbers else payload.text}


@app.post("/phrasing")
def phrasing(payload: SayIn):
    """Where the voice will breathe ("|"), sentence ends ("‖"), «stressed» words."""
    from app import khmer_prosody

    text = "".join(s for _, s in spoken_parts(payload.text)) if payload.numbers else payload.text
    return {"marked": khmer_prosody.marked(text)}


@app.post("/say")
def say(payload: SayIn):
    if payload.voice not in VOICES:
        raise HTTPException(404, "Unknown voice")
    _label, mime, make = VOICES[payload.voice]
    text = "".join(s for _, s in spoken_parts(payload.text)) if payload.numbers else payload.text
    t = time.time()
    try:
        audio = make(text.strip(), payload)
    except Exception as exc:  # noqa: BLE001 — show the reason on the card
        raise HTTPException(502, f"{type(exc).__name__}: {str(exc)[:300]}") from exc
    return Response(audio, media_type=mime, headers={"X-Seconds": f"{time.time() - t:.2f}", "Cache-Control": "no-store"})
