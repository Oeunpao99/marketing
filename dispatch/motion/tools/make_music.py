"""Original background music for Remotion videos — composed and synthesized
from scratch (no samples, no third-party recordings), so there is no licence
question for ContentFlow or its customers.

    uv run python ../motion/tools/make_music.py      (from dispatch/backend — needs numpy + imageio-ffmpeg)

Writes two seamless ~32 s loops per mood into public/music/<mood>/ (the folders
app/motion.py music_tracks() reads). Each mood has its own tempo, key, chord
progression and instruments; the second track of a mood uses another key,
progression and melody seed. Re-running overwrites them (same seeds → same music).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[1] / "public" / "music"
MAJOR = [0, 2, 4, 5, 7, 9, 11]
PENTA = [0, 2, 4, 7, 9]


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    """ADSR over n samples (seconds for a/d/r, level for s)."""
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    e = np.full(n, s, dtype=np.float64)
    if a_n:
        e[: min(a_n, n)] = np.linspace(0, 1, a_n)[: min(a_n, n)]
    if d_n and a_n < n:
        seg = np.linspace(1, s, d_n)[: max(0, min(d_n, n - a_n))]
        e[a_n : a_n + len(seg)] = seg
    if r_n:
        tail = min(r_n, n)
        e[n - tail :] *= np.linspace(1, 0, tail)
    return e


def additive(freq: float, n: int, partials, decay=None) -> np.ndarray:
    """Sum of sine partials [(ratio, amp)]; ``decay`` (per-partial seconds) makes
    higher partials die faster — piano / pluck / bell character."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (ratio, amp) in enumerate(partials):
        f = freq * ratio
        if f > SR / 2.2:
            continue
        p = amp * np.sin(2 * np.pi * f * t)
        if decay is not None:
            p *= np.exp(-t / decay[k])
        out += p
    return out


# ── instruments ────────────────────────────────────────────────────────────
def pad(notes, dur: float, bright: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    out = np.zeros(n)
    t = np.arange(n) / SR
    for m in notes:
        for detune in (-0.06, 0.06):  # two slightly detuned voices
            f = hz(m + detune)
            parts = [(h, (1 / h**1.6) * (bright if h > 2 else 1)) for h in range(1, 7)]
            out += additive(f, n, parts)
    out *= env(n, 0.45, 0.4, 0.8, 0.7) * (1 + 0.08 * np.sin(2 * np.pi * 0.25 * t))
    return out / max(1, len(notes))


def pluck(m: float, dur: float, tone: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    parts = [(1, 1), (2, 0.5 * tone), (3, 0.28 * tone), (4, 0.16 * tone), (5, 0.08 * tone)]
    decay = [0.55, 0.32, 0.2, 0.13, 0.09]
    return additive(hz(m), n, parts, decay) * env(n, 0.004, 0.05, 1.0, 0.06)


def piano(m: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    parts = [(1, 1), (2, 0.42), (3, 0.2), (4, 0.12), (6, 0.05)]
    decay = [1.4, 0.8, 0.5, 0.35, 0.2]
    return additive(hz(m), n, parts, decay) * env(n, 0.006, 0.1, 1.0, 0.25)


def bell(m: float, dur: float) -> np.ndarray:
    """Struck-bar sound (inharmonic partials) — a nod to the roneat."""
    n = int(dur * SR)
    parts = [(1, 1), (2.76, 0.45), (5.4, 0.22), (8.93, 0.1)]
    decay = [0.9, 0.45, 0.25, 0.12]
    return additive(hz(m), n, parts, decay) * env(n, 0.002, 0.05, 1.0, 0.1)


def bass(m: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    return additive(hz(m), n, [(1, 1), (2, 0.25), (3, 0.06)]) * env(n, 0.006, 0.12, 0.65, 0.08)


def kick(rng) -> np.ndarray:
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t / 0.035)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t / 0.13)


def _noise(rng, n):
    return rng.standard_normal(n)


def hat(rng, soft: float = 1.0) -> np.ndarray:
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    x = np.diff(_noise(rng, n + 1))  # crude high-pass
    return 0.25 * soft * x * np.exp(-t / 0.018)


def clap(rng) -> np.ndarray:
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = _noise(rng, n)
    smooth = np.convolve(x, np.ones(8) / 8, mode="same")
    band = x - smooth  # crude band-pass
    e = np.exp(-t / 0.06)
    for off in (0.0, 0.011, 0.022):  # a few hands
        k = int(off * SR)
        e[k:] += 0.6 * np.exp(-(t[: n - k]) / 0.012)
    return 0.35 * band * e


def shaker(rng, soft: float = 1.0) -> np.ndarray:
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    x = np.diff(_noise(rng, n + 1))
    return 0.12 * soft * x * np.sin(np.pi * t / t[-1])


def rim(rng) -> np.ndarray:
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    return 0.35 * np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012) + 0.08 * _noise(rng, n) * np.exp(-t / 0.006)


# ── arrangement ────────────────────────────────────────────────────────────
class Track:
    def __init__(self, seconds: float):
        self.n = int(seconds * SR)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)
        self.wet = np.zeros(self.n)  # reverb send (mono)

    def add(self, sound: np.ndarray, at: float, gain: float, pan: float = 0.0, verb: float = 0.0):
        i = int(at * SR)
        if i >= self.n:
            return
        s = sound[: self.n - i] * gain
        self.L[i : i + len(s)] += s * np.sqrt((1 - pan) / 2)
        self.R[i : i + len(s)] += s * np.sqrt((1 + pan) / 2)
        if verb:
            self.wet[i : i + len(s)] += s * verb


def reverb(x: np.ndarray, seconds: float, rng) -> np.ndarray:
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 4))
    ir = np.convolve(ir, np.ones(30) / 30, mode="same")  # darker tail
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return y / (np.max(np.abs(ir)) * 60)


def chord(key: int, degree: int, sevenths: bool, octave: int = 4) -> list[int]:
    """Scale-degree chord in a major key (degree 0 = I), voiced around ``octave``."""
    base = 12 * (octave + 1) + key
    steps = [0, 2, 4, 6] if sevenths else [0, 2, 4]
    notes = []
    for s in steps:
        i = degree + s
        notes.append(base + MAJOR[i % 7] + 12 * (i // 7))
    return notes


def compose(spec: dict) -> np.ndarray:
    rng = np.random.default_rng(spec["seed"])
    bpm, key, prog = spec["bpm"], spec["key"], spec["prog"]
    beat = 60 / bpm
    bar = 4 * beat
    bars = spec["bars"]
    total = bars * bar
    tr = Track(total + bar)  # one extra bar for tails, folded back for a seamless loop

    for b in range(bars):
        t0 = b * bar
        deg = prog[b % len(prog)]
        notes = chord(key, deg, spec.get("sevenths", False))
        tr.add(pad(notes, bar * 1.05, spec.get("pad_bright", 1.0)), t0, spec["pad"], 0, 0.5)
        root = 12 * 3 + key + MAJOR[deg % 7] - (12 if MAJOR[deg % 7] > 7 else 0)
        style = spec["style"]

        # bass
        if style in ("upbeat", "festive"):
            for k in range(8):
                tr.add(bass(root + (12 if k % 2 else 0), beat * 0.45), t0 + k * beat / 2, spec["bass"])
        elif style == "corporate":
            for k in range(8):
                tr.add(bass(root, beat * 0.4), t0 + k * beat / 2, spec["bass"] * (1 if k % 2 == 0 else 0.6))
        else:
            tr.add(bass(root, bar * 0.95), t0, spec["bass"])

        # drums
        for k in range(16):
            at = t0 + k * beat / 4
            if style in ("upbeat", "festive") and k % 4 == 0:
                tr.add(kick(rng), at, 0.9)
            if style == "corporate" and k in (0, 8, 10):
                tr.add(kick(rng), at, 0.75)
            if style == "warm" and k in (0, 10):
                tr.add(kick(rng), at, 0.5)
            if style in ("upbeat", "festive", "corporate") and k in (4, 12):
                tr.add(clap(rng), at, 0.55 if style != "corporate" else 0.3, 0.1, 0.3)
            if style == "warm" and k in (4, 12):
                tr.add(rim(rng), at, 0.45, 0.2, 0.3)
            if style in ("upbeat", "corporate") and k % 2 == 1:
                tr.add(hat(rng), at, 0.6, 0.35)
            if style == "festive":
                tr.add(shaker(rng, 1.3 if k % 4 == 2 else 0.7), at, 1, 0.4)
            if style in ("calm", "warm") and k % 2 == 1:
                tr.add(shaker(rng, 0.6 if k % 4 == 3 else 0.35), at, 1, -0.3)

        # melodic layer
        tones = chord(key, deg, True, spec.get("lead_octave", 5))
        if style == "upbeat":
            for k in range(16):
                m = tones[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]]
                tr.add(pluck(m, beat * 0.3, 1.2), t0 + k * beat / 4, 0.32, 0.4 if k % 2 else -0.4, 0.35)
        elif style == "calm":
            pattern = [0, 2, 3, 1, 2, 3, 1, 2]
            for k in range(8):
                tr.add(piano(tones[pattern[k]] - 12, beat * 1.4), t0 + k * beat / 2, 0.38, (k % 2) * 0.4 - 0.2, 0.6)
        elif style == "warm":
            pattern = [0, 1, 2, 1, 3, 2, 1, 2]
            for k in range(8):
                tr.add(pluck(tones[pattern[k]] - 12, beat * 0.8, 0.8), t0 + k * beat / 2, 0.34, (k % 2) * 0.5 - 0.25, 0.5)
        elif style == "corporate":
            for k in range(8):
                m = tones[0] - 12 if k % 4 != 3 else tones[2] - 12
                tr.add(pluck(m, beat * 0.35, 0.7), t0 + k * beat / 2, 0.36, 0.3, 0.3)
        elif style == "festive":
            scale = [12 * 6 + key + p for p in PENTA] + [12 * 7 + key + p for p in PENTA[:3]]
            for k in range(8):
                if rng.random() < 0.78:
                    pick = scale[int(rng.integers(0, len(scale)))]
                    tr.add(bell(pick, beat * 1.2), t0 + k * beat / 2, 0.3, rng.uniform(-0.5, 0.5), 0.45)

    # mix: reverb, fold the extra bar onto the start (seamless loop), level, limit
    wet = reverb(tr.wet, 1.6, rng)
    L, R = tr.L + wet, tr.R + wet
    cut = int(total * SR)
    L[: len(L) - cut] += L[cut:]
    R[: len(R) - cut] += R[cut:]
    L, R = L[:cut], R[:cut]
    stereo = np.stack([L, R], axis=1)
    rms = np.sqrt(np.mean(stereo**2))
    stereo *= 0.12 / max(rms, 1e-9)  # the same loudness for every track
    stereo = np.tanh(stereo * 1.2) / 1.2  # gentle soft-clip instead of hard peaks
    # Only ever turned down (to stay under -1 dB) — never up, so every mood
    # keeps the same loudness instead of the quiet ones being boosted.
    return stereo * min(1.0, 0.89 / max(np.max(np.abs(stereo)), 1e-9))


# Two tracks per mood: tempo, key (semitones above C), progression (scale degrees, 0 = I).
SPECS = {
    "upbeat": [
        dict(style="upbeat", bpm=118, key=0, prog=[0, 4, 5, 3], bars=16, pad=0.22, bass=0.5, seed=11),
        dict(style="upbeat", bpm=122, key=7, prog=[5, 3, 0, 4], bars=16, pad=0.22, bass=0.5, seed=12),
    ],
    "calm": [
        dict(style="calm", bpm=78, key=5, prog=[0, 5, 3, 4], bars=10, pad=0.3, bass=0.35, sevenths=True, pad_bright=0.6, seed=21),
        dict(style="calm", bpm=74, key=2, prog=[0, 3, 5, 4], bars=10, pad=0.3, bass=0.35, sevenths=True, pad_bright=0.6, seed=22),
    ],
    "warm": [
        dict(style="warm", bpm=90, key=7, prog=[0, 5, 3, 4], bars=12, pad=0.28, bass=0.4, sevenths=True, pad_bright=0.8, seed=31),
        dict(style="warm", bpm=86, key=4, prog=[0, 2, 3, 0], bars=12, pad=0.28, bass=0.4, sevenths=True, pad_bright=0.8, seed=32),
    ],
    "corporate": [
        dict(style="corporate", bpm=108, key=2, prog=[0, 4, 5, 3], bars=14, pad=0.25, bass=0.45, pad_bright=0.9, seed=41),
        dict(style="corporate", bpm=112, key=9, prog=[5, 3, 0, 4], bars=14, pad=0.25, bass=0.45, pad_bright=0.9, seed=42),
    ],
    "festive": [
        dict(style="festive", bpm=124, key=9, prog=[0, 3, 4, 0], bars=16, pad=0.2, bass=0.5, seed=51),
        dict(style="festive", bpm=128, key=2, prog=[0, 4, 3, 4], bars=16, pad=0.2, bass=0.5, seed=52),
    ],
}


def write_mp3(stereo: np.ndarray, path: Path) -> None:
    import imageio_ffmpeg

    pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2",
         "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "160k", str(path)],
        input=pcm,
        check=True,
    )


def main() -> None:
    for mood, specs in SPECS.items():
        (OUT / mood).mkdir(parents=True, exist_ok=True)
        for i, spec in enumerate(specs, 1):
            path = OUT / mood / f"contentflow-{mood}-{i}.mp3"
            write_mp3(compose(spec), path)
            print(f"{path.relative_to(OUT.parent)}  {spec['bpm']} bpm", flush=True)


if __name__ == "__main__":
    sys.exit(main())
