"""Original sound effects for Remotion videos — synthesized from scratch (no
samples), so there is no licence question, like tools/make_music.py.

    uv run python ../motion/tools/make_sfx.py      (from dispatch/backend — needs numpy + imageio-ffmpeg)

Writes public/sfx/<name>.mp3 — the sounds motion/src/sfx.jsx puts on the
scenes: whoosh (scene change), pop (something springs in), blop (a chat
bubble / notification), click (a button pressed), ding (success), tick (a
countdown second), impact (a cinematic hit on a big reveal), riser (the
build-up before it), and (2026-10-30) swish (a whip pan), swoosh (a big
sweep), shimmer (a sparkle), cash / coin (offers, claiming a deal), notify,
typing, drumroll, applause (events), page / chime (lessons), drop (a launch),
confetti, shutter (photos). Re-running overwrites them (same seed → same sounds);
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


def bell_tone(f: float, sec: float, rate: float = 6.0, parts=((1, 1.0), (2.76, 0.3), (5.4, 0.1))) -> np.ndarray:
    x = t(sec)
    return sum(amp * np.sin(2 * np.pi * f * m * x) for m, amp in parts) * np.exp(-x * rate)


def place(out: np.ndarray, x: np.ndarray, at: float, gain: float = 1.0) -> None:
    n0 = int(at * SR)
    n = min(len(x), len(out) - n0)
    if n > 0:
        out[n0 : n0 + n] += x[:n] * gain


def swish() -> np.ndarray:
    # a whip pan: short, bright, fast air
    sec = 0.28
    x = t(sec)
    shape = np.sin(np.pi * (x / sec) ** 0.5) ** 3
    noise = rng.standard_normal(len(x))
    band = lowpass(noise, 1500 + 7000 * shape) - lowpass(noise, 900 + 1500 * shape)
    return fade(band * shape * 2.4)


def swoosh() -> np.ndarray:
    # a big ribbon sweeping past: deep air with a falling tone underneath
    sec = 0.75
    x = t(sec)
    shape = np.sin(np.pi * (x / sec) ** 0.8) ** 2
    noise = rng.standard_normal(len(x))
    air = lowpass(noise, 150 + 2200 * shape) - lowpass(noise, 60 + 300 * shape)
    tone = sweep(320, 90, sec, 0.7) * shape * 0.35
    return fade(air * shape * 2.6 + tone)


def shimmer() -> np.ndarray:
    # a sparkle: a cloud of tiny high bells twinkling up
    sec = 1.1
    out = np.zeros(int(sec * SR))
    for i in range(18):
        f = 2600 + 3200 * rng.random() + i * 60
        place(out, bell_tone(f, 0.4, 14, ((1, 1.0), (2.0, 0.2))), i * 0.04 + rng.uniform(0, 0.03), 0.25 + 0.03 * i)
    return fade(out * np.linspace(1, 0.6, len(out)))


def cash() -> np.ndarray:
    # a cash register "ka-ching": a drawer clunk, a bell and coins
    sec = 1.1
    out = np.zeros(int(sec * SR))
    clunk = lowpass(rng.standard_normal(int(0.08 * SR)), 1200) * decay(0.08, 50) * 1.5
    place(out, clunk, 0.0)
    place(out, bell_tone(2093.0, 0.9, 4.5), 0.06, 0.8)
    place(out, bell_tone(2637.0, 0.8, 5.0), 0.1, 0.6)
    for i in range(6):
        place(out, bell_tone(3800 + 900 * rng.random(), 0.15, 30, ((1, 1.0), (1.6, 0.4))), 0.14 + i * 0.045, 0.35)
    return fade(out)


def coin() -> np.ndarray:
    # one coin collected: two quick rising bells
    out = np.zeros(int(0.5 * SR))
    place(out, bell_tone(1975.5, 0.12, 20), 0.0, 0.8)
    place(out, bell_tone(2637.0, 0.4, 8), 0.07, 1.0)
    return fade(out)


def notify() -> np.ndarray:
    # a phone notification: a soft two-tone chime
    out = np.zeros(int(0.7 * SR))
    place(out, bell_tone(1046.5, 0.5, 7, ((1, 1.0), (3.0, 0.15))), 0.0, 0.8)
    place(out, bell_tone(1568.0, 0.55, 6, ((1, 1.0), (3.0, 0.15))), 0.11, 0.9)
    return fade(out)


def typing() -> np.ndarray:
    # someone typing: a run of keyboard clacks
    sec = 1.2
    out = np.zeros(int(sec * SR))
    at = 0.0
    while at < sec - 0.06:
        key = (lowpass(rng.standard_normal(int(0.03 * SR)), 4500) - lowpass(rng.standard_normal(int(0.03 * SR)), 800)) * decay(0.03, 160)
        place(out, key, at, rng.uniform(0.5, 1.0))
        at += rng.uniform(0.05, 0.14)
    return fade(out)


def drumroll() -> np.ndarray:
    # a snare roll building up to a reveal
    sec = 1.5
    out = np.zeros(int(sec * SR))
    at = 0.0
    while at < sec - 0.05:
        k = at / sec
        hit = (lowpass(rng.standard_normal(int(0.06 * SR)), 5000) * 0.8 + np.sin(2 * np.pi * 190 * t(0.06)) * 0.5) * decay(0.06, 55)
        place(out, hit, at, 0.25 + 0.75 * k**1.5)
        at += 0.045 - 0.015 * k
    return fade(out, 6)


def applause() -> np.ndarray:
    # a crowd clapping and cheering — events, openings
    sec = 2.4
    x = t(sec)
    out = np.zeros(len(x))
    for _ in range(420):
        clap = (lowpass(rng.standard_normal(int(0.025 * SR)), 3800) - lowpass(rng.standard_normal(int(0.025 * SR)), 700)) * decay(0.025, 140)
        place(out, clap, rng.uniform(0, sec - 0.05), rng.uniform(0.2, 0.6))
    crowd = lowpass(rng.standard_normal(len(x)), 900) * 0.6
    shape = np.minimum(1, x / 0.25) * np.exp(-np.maximum(0, x - 1.4) * 2.2)
    return fade((out + crowd) * shape, 10)


def page() -> np.ndarray:
    # a page turning — lessons, tips
    sec = 0.45
    x = t(sec)
    shape = np.sin(np.pi * x / sec) ** 1.5
    noise = rng.standard_normal(len(x))
    rustle = (lowpass(noise, 6000) - lowpass(noise, 1800)) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 34 * x)))
    flap = lowpass(rng.standard_normal(len(x)), 500) * np.exp(-np.maximum(0, x - 0.3) * 40) * (x > 0.3)
    return fade(rustle * shape * 1.6 + flap * 1.2)


def chime() -> np.ndarray:
    # "you got it": three marimba notes going up — a tip or a right answer
    out = np.zeros(int(0.9 * SR))
    for i, f in enumerate((784.0, 987.8, 1318.5)):
        place(out, bell_tone(f, 0.5, 9, ((1, 1.0), (4.0, 0.25), (10.0, 0.05))), i * 0.08, 0.8)
    return fade(out)


def drop() -> np.ndarray:
    # the launch drop: a sub bass sliding down under a bright crash
    sec = 1.8
    x = t(sec)
    sub = sweep(90, 32, sec, 0.5) * np.exp(-x * 1.6)
    crash = (rng.standard_normal(len(x)) - lowpass(rng.standard_normal(len(x)), 3000)) * np.exp(-x * 3.5) * 0.7
    return fade(sub * 1.4 + crash, 2)


def confetti() -> np.ndarray:
    # a party popper: a pop and paper falling with little twinkles
    sec = 1.2
    out = np.zeros(int(sec * SR))
    place(out, lowpass(rng.standard_normal(int(0.07 * SR)), 2500) * decay(0.07, 45) * 2.0, 0.0)
    for i in range(14):
        place(out, bell_tone(1800 + 2500 * rng.random(), 0.25, 18), 0.06 + i * 0.06 + rng.uniform(0, 0.03), 0.3)
    return fade(out)


def shutter() -> np.ndarray:
    # a camera shutter — a product photo, a gallery
    out = np.zeros(int(0.25 * SR))
    for at in (0.0, 0.09):
        place(out, (lowpass(rng.standard_normal(int(0.04 * SR)), 6000) - lowpass(rng.standard_normal(int(0.04 * SR)), 1500)) * decay(0.04, 120), at, 1.0)
    return fade(out)


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
    for name, make in (
        ("whoosh", whoosh), ("pop", pop), ("blop", blop), ("click", click), ("ding", ding), ("tick", tick), ("impact", impact), ("riser", riser), ("sketch", sketch),
        ("swish", swish), ("swoosh", swoosh), ("shimmer", shimmer), ("cash", cash), ("coin", coin), ("notify", notify), ("typing", typing),
        ("drumroll", drumroll), ("applause", applause), ("page", page), ("chime", chime), ("drop", drop), ("confetti", confetti), ("shutter", shutter),
    ):
        if only and name not in only:
            continue
        path = OUT / f"{name}.mp3"
        write_mp3(make(), path)
        print(path)


if __name__ == "__main__":
    main()
