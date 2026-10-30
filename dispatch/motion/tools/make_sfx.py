"""Original sound effects for Remotion videos — synthesized from scratch (no
samples), so there is no licence question, like tools/make_music.py.

    uv run python ../motion/tools/make_sfx.py      (from dispatch/backend — needs numpy + imageio-ffmpeg)

Writes public/sfx/<name>.mp3 — the sounds motion/src/sfx.jsx puts on the
scenes: whoosh (scene change), pop (something springs in), blop (a chat
bubble / notification), click (a button pressed), ding (success), tick (a
countdown second), impact (a cinematic hit on a big reveal), riser (the
build-up before it). Re-running overwrites them (same seed → same sounds);
name some to make only those: make_sfx.py impact riser
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[1] / "public" / "sfx"
rng = np.random.default_rng(7)


def t(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def sweep(f0: float, f1: float, seconds: float, curve: float = 1.0) -> np.ndarray:
    """A sine gliding f0 → f1 (phase-continuous)."""
    x = t(seconds)
    f = f0 + (f1 - f0) * (x / seconds) ** curve
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def decay(seconds: float, rate: float) -> np.ndarray:
    return np.exp(-t(seconds) * rate)


def lowpass(x: np.ndarray, cutoff) -> np.ndarray:
    """One-pole low-pass; ``cutoff`` may change over time (an array)."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def fade(x: np.ndarray, ms: float = 4) -> np.ndarray:
    n = int(ms / 1000 * SR)
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def whoosh() -> np.ndarray:
    # air rushing past: noise through a filter that opens and closes
    sec = 0.5
    x = t(sec)
    shape = np.sin(np.pi * (x / sec) ** 0.7) ** 2
    cut = 300 + 3200 * shape
    noise = rng.standard_normal(len(x))
    band = lowpass(noise, cut) - lowpass(noise, cut * 0.25)
    return fade(band * shape * 2.2)


def pop() -> np.ndarray:
    # a round bubble: a fast pitch drop with a tiny click on top
    body = sweep(900, 260, 0.11, 0.5) * decay(0.11, 38)
    click = rng.standard_normal(len(body)) * decay(0.11, 400) * 0.25
    return fade(body + click)


def blop() -> np.ndarray:
    # a message arriving: two quick rising water-drop notes
    a = sweep(500, 1100, 0.07, 0.6) * decay(0.07, 30)
    b = sweep(700, 1500, 0.09, 0.6) * decay(0.09, 26)
    out = np.zeros(int(0.17 * SR))
    out[: len(a)] += a
    out[int(0.07 * SR) : int(0.07 * SR) + len(b)] += b * 0.9
    return fade(out)


def click() -> np.ndarray:
    # a soft UI click
    sec = 0.05
    body = np.sin(2 * np.pi * 1800 * t(sec)) * decay(sec, 160)
    tap = lowpass(rng.standard_normal(len(body)), 5000) * decay(sec, 300)
    return fade(body * 0.6 + tap * 0.8, 2)


def ding() -> np.ndarray:
    # success: a bright two-note bell
    sec = 0.9
    x = t(sec)
    out = np.zeros(len(x))
    for start, f in ((0.0, 1318.5), (0.09, 1975.5)):
        n0 = int(start * SR)
        xx = x[: len(x) - n0]
        tone = sum(amp * np.sin(2 * np.pi * f * m * xx) for m, amp in ((1, 1.0), (2.76, 0.3), (5.4, 0.1)))
        out[n0:] += tone * np.exp(-xx * 6)
    return fade(out * 0.6)


def tick() -> np.ndarray:
    # a clock tick for countdowns
    sec = 0.04
    return fade(np.sin(2 * np.pi * 2600 * t(sec)) * decay(sec, 220), 1)


def impact() -> np.ndarray:
    # a cinematic hit: a deep falling boom, a sub tail and a dark noise burst
    sec = 1.6
    x = t(sec)
    boom = sweep(110, 38, sec, 0.35) * np.exp(-x * 3.2)
    sub = np.sin(2 * np.pi * 45 * x) * np.exp(-x * 2.2) * 0.6
    burst = lowpass(rng.standard_normal(len(x)), 900) * np.exp(-x * 14) * 2.5
    return fade(boom + sub + burst, 2)


def riser() -> np.ndarray:
    # the build-up: rising filtered air and a climbing tone, cut at the top
    sec = 1.4
    x = t(sec)
    k = x / sec
    noise = rng.standard_normal(len(x))
    air = lowpass(noise, 250 + 5500 * k**2) - lowpass(noise, 120 + 1500 * k**2)
    tone = sweep(180, 900, sec, 2.0) * 0.25
    return fade((air * 2.0 + tone) * k**1.6, 6)


def sketch() -> np.ndarray:
    # a pencil drawing on paper (Logo · Drawing, logodraw.jsx): ~3 s of strokes — each a burst of
    # bright, grainy filtered noise that swells and fades, with a short lift of the hand between
    sec = 3.2
    out = np.zeros(int(sec * SR))
    pos = 0.0
    while pos < sec - 0.15:
        dur = rng.uniform(0.12, 0.38)
        n = int(dur * SR)
        start = int(pos * SR)
        if start + n > len(out):
            break
        noise = rng.standard_normal(n)
        band = lowpass(noise, 5200) - lowpass(noise, 1400)  # the scratch of graphite on paper
        grain = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * rng.uniform(28, 70) * t(dur) + rng.uniform(0, 6)))  # the paper's tooth
        env = np.sin(np.pi * np.linspace(0, 1, n)) ** 0.7  # the stroke swells and fades
        out[start : start + n] += band * grain * env * rng.uniform(0.6, 1.0)
        pos += dur + rng.uniform(0.03, 0.11)
    return fade(out, 8)


def write_mp3(mono: np.ndarray, path: Path) -> None:
    import imageio_ffmpeg

    peak = np.max(np.abs(mono)) or 1.0
    pcm = (mono / peak * 0.89 * 32767).astype("<i2")  # -1 dBFS — the template sets each volume
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1",
         "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "128k", str(path)],
        input=pcm.tobytes(),
        check=True,
    )


def main() -> None:
    import sys

    only = set(sys.argv[1:])
    for name, make in (("whoosh", whoosh), ("pop", pop), ("blop", blop), ("click", click), ("ding", ding), ("tick", tick), ("impact", impact), ("riser", riser), ("sketch", sketch)):
        if only and name not in only:
            continue
        path = OUT / f"{name}.mp3"
        write_mp3(make(), path)
        print(path)


if __name__ == "__main__":
    main()
