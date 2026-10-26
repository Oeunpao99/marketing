"""Your own voice on a finished template video (the video editor, POST
/ai/motion/edit/{id}/own-voice): the person downloads the video's script,
reads it all in one recording — a short pause between scenes — and uploads it.
Here it is cleaned up (one level, mono) and cut into one piece per voiced
scene, at the pauses nearest to where each scene's words should end; app/motion.py
then fits each scene to its piece, so the pictures and the subtitles follow
their pace, not the AI voice's.

No speech recognition: the cut points come from the script (each scene's share
of the words) and the recording's own pauses, so it works for Khmer and English
alike and costs nothing.
"""

import logging
import re
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)

MAX_BYTES = 80 * 1024 * 1024  # a 10-minute script, read in a phone's own format
MAX_SECONDS = 15 * 60
MIN_PIECE = 0.5  # seconds: a scene's piece is never shorter than this
SILENCE = "silencedetect=n=-35dB:d=0.22"  # a pause between words / scenes in a cleaned recording
NO_PAUSE_COST = 2.0  # what cutting where there's no pause "costs", in seconds of being off target


class OwnVoiceError(RuntimeError):
    """The recording can't be used — the message is for the person."""


def weight(line: str) -> float:
    """How long a line takes to say, roughly: Khmer letters at ~11 a second,
    other words at ~2.6 a second (app/motion.py story_seconds says the same)."""
    khmer = sum(1 for ch in line if "ក" <= ch <= "៿")
    words = len(re.findall(r"[A-Za-z0-9]+", line))
    return max(0.3, khmer / 11 + words / 2.6)


def _run(args: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=timeout)


def clean(src: Path, out: Path) -> float:
    """The recording as one even level, mono 44.1 kHz WAV (any format the
    phone saved in). Returns its length in seconds."""
    from app.story import _ffmpeg, _probe

    done = _run(
        [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "44100",
         "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11", str(out)]
    )
    if done.returncode != 0 or not out.exists():
        log.warning("own voice: ffmpeg could not read the recording: %s", done.stderr[-300:])
        raise OwnVoiceError("That file couldn't be read as audio — upload an MP3, M4A or WAV recording.")
    _has, seconds = _probe(str(out))
    return seconds


def silences(path: Path) -> list[tuple[float, float]]:
    """The pauses in the recording: [(start, end)] in seconds."""
    from app.story import _ffmpeg

    info = _run([_ffmpeg(), "-hide_banner", "-i", str(path), "-af", SILENCE, "-f", "null", "-"]).stderr
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", info)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", info)]
    out = [(max(0.0, a), b) for a, b in zip(starts, ends)]
    if len(starts) > len(ends):  # a pause that runs to the end
        out.append((max(0.0, starts[-1]), float("inf")))
    merged: list[tuple[float, float]] = []
    for a, b in out:  # a click or a breath in the middle of a pause doesn't split it in two
        if merged and a - merged[-1][1] < 0.2:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def cut_points(lines: list[str], total: float, pauses: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Where each line is spoken: [(start, end)] per line, in order. The speech
    runs from the end of the opening silence to the start of the closing one;
    each boundary between two lines is a pause chosen so that, all together,
    the boundaries sit as near as they can to where the script says the lines
    change (each line's share of the words) — a longer pause is a likelier
    scene change. Where no pause fits, the boundary is cut at its target."""
    begin, end = 0.0, total
    inner = []
    for a, b in pauses:
        if a <= 0.05:
            begin = max(begin, min(b, total))
        elif b >= total - 0.05:
            end = min(end, a)
        else:
            inner.append((a, b))
    if end - begin < MIN_PIECE * len(lines):
        raise OwnVoiceError("The recording is shorter than the script — read every scene's line, then upload it again.")
    n = len(lines)
    if n == 1:
        return [(begin, end)]
    # They were asked to pause between scenes: when exactly that many pauses
    # stand out as longer than the rest (the pauses inside sentences), those
    # are the scene changes — whatever the script's word counts suggest.
    by_len = sorted(inner, key=lambda p: p[1] - p[0], reverse=True)
    if len(by_len) >= n - 1:
        picked = by_len[: n - 1]
        shortest = min(b - a for a, b in picked)
        rest = (by_len[n - 1][1] - by_len[n - 1][0]) if len(by_len) >= n else 0.0
        if shortest >= 0.5 and shortest >= 1.3 * rest:
            bounds = sorted((a + b) / 2 for a, b in picked)
            edges = [begin, *bounds, end]
            if all(edges[i + 1] - edges[i] >= MIN_PIECE for i in range(n)):
                return [(edges[i], edges[i + 1]) for i in range(n)]
    weights = [weight(x) for x in lines]
    span, total_w = end - begin, sum(weights)
    targets, acc = [], 0.0
    for w in weights[:-1]:
        acc += w
        targets.append(begin + span * acc / total_w)
    cands = [((a + b) / 2, b - a) for a, b in inner if begin < (a + b) / 2 < end]
    # Each boundary picks a pause near its target (or "no pause": cut at the
    # target) so that the boundaries stay in order with every piece long enough,
    # at the lowest total of (distance from the target − a bonus for a long
    # pause). Dynamic programming over (boundary, option).
    reach = max(3.0, 0.6 * span / n)  # how far from its target a boundary may move
    options = []  # per boundary: [(position, pause index or -1, cost)]
    for k, t in enumerate(targets):
        opts = [(mid, j, abs(mid - t) - 0.8 * min(dur, 1.5)) for j, (mid, dur) in enumerate(cands) if abs(mid - t) <= reach]
        opts.append((t, -1, NO_PAUSE_COST))
        options.append(opts)
    INF = float("inf")
    best = [[INF] * len(o) for o in options]
    back = [[-1] * len(o) for o in options]
    for k, opts in enumerate(options):
        for b, (here, j, c) in enumerate(opts):
            if k == 0:
                if here - begin >= MIN_PIECE:
                    best[k][b] = c
                continue
            for a, (prev, i, _c) in enumerate(options[k - 1]):
                if best[k - 1][a] == INF or here - prev < MIN_PIECE:
                    continue
                if j >= 0 and i >= 0 and i >= j:  # the same pause can't end two lines
                    continue
                if best[k - 1][a] + c < best[k][b]:
                    best[k][b], back[k][b] = best[k - 1][a] + c, a
    last = [b for b, (here, _j, _c) in enumerate(options[-1]) if best[-1][b] < INF and end - here >= MIN_PIECE]
    if not last:  # no way to keep every piece long enough: the script's own shares
        bounds = targets
    else:
        b = min(last, key=lambda x: best[-1][x])
        bounds = [0.0] * (n - 1)
        for k in range(n - 2, -1, -1):
            bounds[k] = options[k][b][0]
            b = back[k][b]
    # each line from one boundary to the next — the pause itself is cut away by
    # trimming each piece's quiet edges (cut_piece)
    edges = [begin, *bounds, end]
    return [(edges[i], edges[i + 1]) for i in range(n)]


def cut_piece(src: Path, start: float, end: float, out: Path) -> tuple[bytes, float]:
    """One line of the recording as an MP3, its quiet edges trimmed — (mp3, seconds)."""
    from app.story import _ffmpeg, _probe

    edge = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    done = _run(
        [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(src),
         "-af", f"{edge},areverse,{edge},areverse,afade=t=in:d=0.02", "-c:a", "libmp3lame", "-b:a", "128k", str(out)],
        timeout=120,
    )
    if done.returncode != 0 or not out.exists() or out.stat().st_size < 800:
        # trimmed to nothing (a very quiet piece): the piece as it was
        _run([_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(src),
              "-c:a", "libmp3lame", "-b:a", "128k", str(out)], timeout=120)
    _has, seconds = _probe(str(out))
    if seconds <= 0:
        raise OwnVoiceError("A part of the recording couldn't be cut — try uploading it again.")
    return out.read_bytes(), seconds


def split(recording: Path, lines: list[str], work: Path) -> list[tuple[bytes, float]]:
    """The recording cut into one MP3 per line, in order — [(mp3, seconds)]."""
    wav = work / "voice.wav"
    total = clean(recording, wav)
    if total <= 0.5:
        raise OwnVoiceError("That recording is empty — record the script, then upload it.")
    if total > MAX_SECONDS:
        raise OwnVoiceError("That recording is longer than 15 minutes — upload just the script's reading.")
    spans = cut_points(lines, total, silences(wav))
    log.info("own voice: %.1f s cut into %d lines at %s", total, len(lines), ", ".join(f"{a:.1f}" for a, _ in spans[1:]))
    return [cut_piece(wav, a, b, work / f"line-{n}.mp3") for n, (a, b) in enumerate(spans)]


def script_text(lines: list[tuple[int, str]]) -> str:
    """The script to read, scene by scene — [(scene number, line)]."""
    head = "Read every line in order, with a short pause (about 1 second) between scenes.\n\n"
    return head + "\n\n".join(f"{n}. {line}" for n, line in lines) + "\n"
