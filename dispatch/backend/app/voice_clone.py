"""A brand's own voice for its videos — voice CONVERSION, not cloning TTS.

No hosted voice-cloning service speaks Khmer, so the line is read as usual
(Gemini / Azure / the local voice: words, numbers and prices come out right)
and OpenVoice v2's tone-colour converter (app/openvoice, MIT) then changes the
timbre to the brand's: tested in testing/khmer-voice (the Voice Lab), where
"Your voice · from Piseth" ranked first.

- ``enroll(recording)`` — the voice's fingerprint (a 256-number tone-colour
  embedding) from a recording of the owner speaking, plus whether it's a low
  (male base voice) or high (female) voice.
- ``convert(mp3, fingerprint)`` — a spoken line in that voice, as MP3.

Runs on the server's CPU (PyTorch is already here for app/local_voice.py);
the converter's weights (~130 MB) are fetched from Hugging Face once and kept
in HF_HOME (a volume in docker-compose.prod.yml). Audio goes in and out
through ffmpeg, so there's no audio library to add."""

from __future__ import annotations

import io
import json
import logging
import subprocess
import tempfile
from pathlib import Path
from threading import Lock

import numpy as np

log = logging.getLogger(__name__)

SR = 22050  # the converter's sample rate (its config.json)
STRENGTH = 0.3  # tau: how far the timbre moves (the Lab's setting)
MIN_SECONDS = 20  # of speech, for a fingerprint worth having
REPO = "myshell-ai/OpenVoiceV2"

_lock = Lock()
_model = None
_hps = None


class VoiceCloneError(RuntimeError):
    pass


class _HParams(dict):
    """config.json as attributes (hps.data.filter_length)."""

    def __init__(self, **kw):
        super().__init__({k: _HParams(**v) if isinstance(v, dict) else v for k, v in kw.items()})

    __getattr__ = dict.get


def _load():
    global _model, _hps
    if _model is None:
        import torch
        from huggingface_hub import hf_hub_download

        from app.openvoice.models import SynthesizerTrn

        with open(hf_hub_download(REPO, "converter/config.json"), encoding="utf-8") as f:
            hps = _HParams(**json.load(f))
        model = SynthesizerTrn(
            len(hps.symbols or []), hps.data.filter_length // 2 + 1, n_speakers=hps.data.n_speakers, **hps.model
        )
        state = torch.load(hf_hub_download(REPO, "converter/checkpoint.pth"), map_location="cpu")
        model.load_state_dict(state["model"], strict=False)
        model.eval()
        _model, _hps = model, hps
    return _model, _hps


def _ffmpeg() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _pcm(audio: bytes) -> np.ndarray:
    """Any audio file → mono float32 samples at SR. Read from a file, not a
    pipe: M4A / MP4 (phones, Windows Voice Recorder) need seeking."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in"
        src.write_bytes(audio)
        out = subprocess.run(
            [_ffmpeg(), "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"],
            capture_output=True,
            timeout=180,
        )
    if out.returncode != 0 or not out.stdout:
        raise VoiceCloneError("Couldn't read that audio file — try an MP3, M4A, WAV or WebM recording.")
    return np.frombuffer(out.stdout, dtype=np.float32).copy()


def _mp3(y: np.ndarray) -> bytes:
    out = subprocess.run(
        [_ffmpeg(), "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
        input=np.asarray(y, dtype=np.float32).tobytes(),
        capture_output=True,
        timeout=180,
    )
    if out.returncode != 0:
        raise VoiceCloneError("Couldn't encode the converted voice.")
    return out.stdout


def _spec(y: np.ndarray):
    """Linear spectrogram, exactly as OpenVoice's mel_processing.spectrogram_torch."""
    import torch

    _, hps = _load()
    n_fft, hop, win = hps.data.filter_length, hps.data.hop_length, hps.data.win_length
    t = torch.from_numpy(y).float().unsqueeze(0)
    t = torch.nn.functional.pad(t.unsqueeze(1), (int((n_fft - hop) / 2), int((n_fft - hop) / 2)), mode="reflect").squeeze(1)
    spec = torch.stft(t, n_fft, hop_length=hop, win_length=win, window=torch.hann_window(win), center=False, return_complex=True)
    return torch.sqrt(spec.real.pow(2) + spec.imag.pow(2) + 1e-6)


def _embed(pieces: list[np.ndarray]):
    """The tone-colour embedding of some speech (the mean over its pieces)."""
    import torch

    model, _ = _load()
    with torch.no_grad():
        gs = [model.ref_enc(_spec(p).transpose(1, 2)).unsqueeze(-1) for p in pieces]
    return torch.stack(gs).mean(0)


def _pitch(y: np.ndarray) -> float:
    """Median pitch (Hz) of the loud 40 ms frames, by autocorrelation."""
    frame, found = int(0.04 * SR), []
    lo, hi = SR // 400, SR // 65
    for start in range(0, min(len(y), 60 * SR) - frame, frame):
        f = y[start : start + frame]
        if np.sqrt(np.mean(f**2)) < 0.03:
            continue
        f = f - f.mean()
        ac = np.correlate(f, f, mode="full")[frame - 1 :]
        if ac[0] <= 0:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / ac[0] > 0.3:
            found.append(SR / lag)
    return float(np.median(found)) if found else 0.0


def enroll(recording: bytes) -> dict:
    """{"fingerprint": bytes, "seconds": speech used, "pitch": Hz, "base":
    "male" | "female"} from a recording of the voice. Raises VoiceCloneError."""
    import torch

    y = _pcm(recording)
    pieces, step = [], 10 * SR
    for start in range(0, len(y) - 3 * SR, step):  # 10 s pieces, mostly-silent ones left out
        chunk = y[start : start + step]
        if np.sqrt(np.mean(chunk**2)) >= 0.01:
            pieces.append(chunk)
    seconds = round(sum(len(p) for p in pieces) / SR)
    if seconds < MIN_SECONDS:
        raise VoiceCloneError(
            f"Only {seconds} s of speech came through — record at least {MIN_SECONDS} s (a minute is better), somewhere quiet."
        )
    with _lock:
        se = _embed(pieces)
    buf = io.BytesIO()
    torch.save(se.cpu(), buf)
    pitch = _pitch(y)
    return {"fingerprint": buf.getvalue(), "seconds": seconds, "pitch": round(pitch), "base": "male" if pitch and pitch < 165 else "female"}


def convert(audio: bytes, fingerprint: bytes, strength: float = STRENGTH) -> bytes:
    """``audio`` (one spoken line) in the fingerprint's voice, as MP3. Same
    length as the input, so word timings still fit. Raises VoiceCloneError."""
    import torch

    y = _pcm(audio)
    if len(y) < SR // 10:
        raise VoiceCloneError("The line is too short to convert.")
    target = torch.load(io.BytesIO(fingerprint), map_location="cpu")
    with _lock:
        model, _ = _load()
        spec = _spec(y)
        with torch.no_grad():
            src = model.ref_enc(spec.transpose(1, 2)).unsqueeze(-1)
            out = model.voice_conversion(spec, torch.LongTensor([spec.size(-1)]), sid_src=src, sid_tgt=target, tau=strength)
        wav = out[0][0, 0].cpu().float().numpy()
    return _mp3(wav)


def ready_for(brand) -> bool:
    return (getattr(brand, "voice_clone", None) or {}).get("status") == "ready"


def narrator_for(brand, language: str, voice: str, style: str | None = None) -> tuple[str | None, bytes | None]:
    """(who reads the lines, the brand's fingerprint or None) for a video's
    Voice setting: "female" | "male" | "none" as before, or "brand" — read by
    the base voice closest to the brand's (its pitch) and then converted. A
    "brand" pick without a ready voice falls back to the female voice."""
    from app import speech
    from app.media import read_media

    if not speech.ready() or voice == "none":
        return None, None
    if voice != "brand":
        return speech.voice_for(language, voice, style), None
    clone = (getattr(brand, "voice_clone", None) or {}) if brand is not None else {}
    fingerprint = read_media(clone["fingerprint"]) if clone.get("status") == "ready" and clone.get("fingerprint") else None
    base = (clone.get("base") or "female") if fingerprint else "female"
    narrator = speech.voice_for(language, base, style)
    return narrator, fingerprint
