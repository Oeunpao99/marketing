"""The voice-over: each scene's line read (add_voice), timed word by word, trimmed, and the scene's length set by it.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import base64
import contextvars
import re
import subprocess
import tempfile
from app import billing
from pathlib import Path

from typing import TYPE_CHECKING

from app.motion.common import TRANSITION_S, _km_words, log
from app.motion.props import default_seconds


# Silence after a scene's line, so it ends before the next scene slides in.
VOICE_TAIL = 0.8


def _cut(path: Path, start: float, end: float) -> bytes | None:
    """The MP3 from ``start`` to ``end`` seconds — None when ffmpeg can't."""
    from app.story import _ffmpeg

    out = path.with_name(path.stem + "-cut.mp3")
    try:
        subprocess.run(
            [
                _ffmpeg(),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(path),
                "-ss",
                f"{max(0.0, start):.3f}",
                "-to",
                f"{end:.3f}",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                str(out),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )
        blob = out.read_bytes()
    except (subprocess.SubprocessError, OSError):
        return None
    return blob if len(blob) > 1000 else None


def _pauses(path: Path) -> list[float]:
    """When the voice pauses in a line (seconds, the middle of each pause of
    0.12 s or more) — the subtitles of a voice without word timings (Gemini)
    change phrase there, so they follow its real rhythm."""
    from app.story import _ffmpeg

    try:
        info = subprocess.run(
            [
                _ffmpeg(),
                "-hide_banner",
                "-i",
                str(path),
                "-af",
                "silencedetect=n=-38dB:d=0.12",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=60,
        ).stderr
    except (subprocess.SubprocessError, OSError):
        return []
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", info)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", info)]
    return [round((a + b) / 2, 2) for a, b in zip(starts, ends) if a > 0.2]


def _trim_silence(path: Path) -> bytes | None:
    """The MP3 without the silence the voice service puts before and after
    the words — None when ffmpeg can't do it (the line is used as it is)."""
    from app.story import _ffmpeg

    out = path.with_name(path.stem + "-trim.mp3")
    edge = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03"
    try:
        subprocess.run(
            [
                _ffmpeg(),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(path),
                "-af",
                f"{edge},areverse,{edge},areverse",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                str(out),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )
        blob = out.read_bytes()
    except (subprocess.SubprocessError, OSError):
        return None
    return blob if len(blob) > 1000 else None


def spoken_text(say: str, pronunciations: list[dict] | None) -> tuple[str, list[tuple[str, str]]]:
    """(what the voice reads, its parts) for a line: numbers as Khmer words for
    Khmer lines, the brand's pronunciation list, and Khmer split into words
    (zero-width spaces) so Azure times every word. Parts that weren't changed
    show what's spoken, so remap_words leaves their words alone."""
    from app.khmer_speech import spoken_parts

    say = (say or "").strip()
    khmer = any("ក" <= ch <= "៿" for ch in say)
    pieces = []
    for shown, spoken in spoken_parts(say, pronunciations, numbers=khmer):
        said = _km_words(spoken) if any("ក" <= ch <= "៿" for ch in spoken) else spoken
        pieces.append((said if shown == spoken else shown, said))
    return "".join(s for _, s in pieces), pieces


def voice_pronunciations(
    voice: str, says: list[str], pronunciations: list[dict] | None
) -> list[dict]:
    """The brand's pronunciation list — plus every other English / brand word
    in a Khmer line written in Khmer letters, the way a Cambodian says it
    (khmer_speech.LOANWORDS, acronyms spelled out, else the AI —
    local_voice.transliterate): a Khmer voice reading Latin letters inside a
    Khmer sentence guesses and gets them wrong. English lines stay as they
    are, except for the local Khmer voice, which can't read Latin at all."""
    from app import local_voice, speech

    rules = list(pronunciations or [])
    if speech.reads_with_kiri(voice):
        # KiriTTS reads English inside Khmer itself — Khmer letters for it made it worse
        # (2026-10-26, by ear); only the brand's own list applies
        return rules
    local = voice.startswith(local_voice.PREFIX)
    lines = [s for s in says if s and (local or any("ក" <= ch <= "៿" for ch in s))]
    if not lines:
        return rules
    known = {(p.get("word") or "").strip().lower() for p in rules}
    latin = sorted(
        {w for say in lines for w in local_voice.LATIN_WORD.findall(say) if w.lower() not in known}
    )
    if latin:
        rules += [{"word": w, "say": k} for w, k in local_voice.transliterate(latin).items()]
    return rules


def add_voice(
    props: dict,
    script: dict,
    voice: str,
    ws: int | None,
    user_id: int | None,
    job_id: int,
    pronunciations: list[dict] | None = None,
    clone: bytes | None = None,
    voices: list[str] | None = None,
) -> int:
    """Each scene's spoken line, read by ``voice`` — and, with ``clone`` (a
    brand voice's fingerprint, app/voice_clone.py), turned into that voice
    after it's read: the MP3 goes into the scene
    and the scene lasts as long as its line (never shorter than its
    animation). Best effort — a line that fails just stays silent. Returns
    the characters spoken (what Azure bills). ``voices``: each scene's own
    voice (Dialogue · Two voices — the brand voice ``clone`` only on ``voice``'s lines)."""
    from app import speech
    from app.story import _probe

    says = [s.get("say") for s in script["scenes"]]
    pronunciations = voice_pronunciations(voice, says, pronunciations)
    local = voice.startswith(
        ("local:", "kokoro:")
    )  # the local Khmer voice and Kokoro cost no credit
    board = [dict(b) for b in (_progress.get(job_id, {}).get("scenes") or [])]
    _report(job_id, stage="voice")

    def mark(n: int, **fields) -> None:
        if n < len(board):
            board[n] = {**board[n], **fields}
            _report(job_id, scenes=[dict(b) for b in board])

    failed_before = len(speech.GEMINI_FAILURES)
    # Gemini answers in seconds but one at a time adds up — its lines are asked
    # for 4 at once up front; the loop below then takes them in order.
    ahead: dict = {}
    pool = None
    reader = lambda n: voices[n] if voices and n < len(voices) and voices[n] else voice  # noqa: E731 — who reads scene n
    if any(reader(n).startswith((speech.GEMINI, speech.KIRI)) for n in range(len(says))):
        from concurrent.futures import ThreadPoolExecutor

        pool = ThreadPoolExecutor(max_workers=4)
        for n, say in enumerate(says):
            if say and reader(n).startswith((speech.GEMINI, speech.KIRI)):
                ahead[n] = pool.submit(
                    contextvars.copy_context().run,
                    lambda t, v: (t, speech.speak_timed(t[0], v)),
                    spoken_text(say, pronunciations),
                    reader(n),
                )

    spoken = 0
    with tempfile.TemporaryDirectory() as tmp:
        for n, (scene, say) in enumerate(zip(props["scenes"], says)):
            _check(job_id)  # Stop pressed: no more lines are spoken (or billed)
            if not say:
                mark(n, voice="skip")
                continue
            mark(n, voice="speaking")
            try:
                # What the voice reads: numbers as Khmer words, the brand's
                # pronunciations, Khmer split into words so Azure times each one.
                if n in ahead:
                    (text, pieces), (mp3, words) = ahead[n].result()
                else:
                    text, pieces = spoken_text(say, pronunciations)
                    mp3, words = speech.speak_timed(text, reader(n))
                from app.khmer_speech import remap_words

                words = remap_words(
                    words, pieces, text
                )  # subtitles keep "$80", not its Khmer words
            except Exception as exc:  # noqa: BLE001 — a failed line stays silent, the video goes on
                log.warning("motion %s: voice for scene %s failed: %s", job_id, n + 1, exc)
                mark(n, voice="skip")
                continue
            path = Path(tmp) / f"say-{n}.mp3"
            path.write_bytes(mp3)
            # Only the speech itself — the subtitles follow it. With word
            # timings the cut is exact (and the timings move with it); without,
            # the silence at either end is detected.
            cut = _cut(path, words[0]["t"] - 0.05, words[-1]["e"] + 0.12) if words else None
            if cut:
                shift = max(0.0, words[0]["t"] - 0.05)
                words = [
                    {**w, "t": round(max(0.0, w["t"] - shift), 3), "e": round(w["e"] - shift, 3)}
                    for w in words
                ]
                mp3 = cut
            else:
                words = []
                mp3 = _trim_silence(path) or mp3
            if clone and reader(n) == voice:
                # the brand's own voice: same length out, so the word timings still fit
                from app import voice_clone

                try:
                    mp3 = voice_clone.convert(mp3, clone)
                except Exception as exc:  # noqa: BLE001 — the reader's voice beats a silent scene
                    log.warning(
                        "motion %s: brand voice for scene %s failed: %s", job_id, n + 1, exc
                    )
            path.write_bytes(mp3)
            _has_audio, duration = _probe(str(path))
            if duration <= 0:
                continue
            scene["audio"] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
            # The line starts once the scene has slid in + 6 frames breathing room (MotionPost.jsx).
            lead = (TRANSITION_S if n else 0.0) + 0.2 + min(1.5, float(scene.get("pause") or 0))
            scene["seconds"] = round(max(default_seconds(scene), lead + duration + VOICE_TAIL), 2)
            scene["voiceSeconds"] = round(duration, 2)  # subtitles follow the voice
            if words:
                scene["voiceWords"] = (
                    words  # …word by word, when Azure said when each word is (not "words": phones / stack / roll show their own)
                )
            else:
                scene["pauses"] = _pauses(path)  # …else phrase by phrase, at the voice's own pauses
            mark(n, voice="done", seconds=round(duration, 1))
            spoken += len(say)
    if pool:
        pool.shutdown(wait=False, cancel_futures=True)
    new_failures = speech.GEMINI_FAILURES[failed_before:]
    del speech.GEMINI_FAILURES[:-50]
    backup = speech.backup_for(voice)
    if new_failures and backup:
        # Gemini dropped out part-way: some lines are Gemini, some Sreymom.
        # One video, one voice — the whole thing is read again by the backup
        # (the reason is for the team, in the log).
        log.error(
            "motion %s: Gemini voice failed on %s line(s) (%s) — reading the whole video with %s",
            job_id,
            len(new_failures),
            new_failures[-1],
            backup,
        )
        for scene in props["scenes"]:
            for k in ("audio", "voiceWords", "pauses", "voiceSeconds"):
                scene.pop(k, None)
        _report(job_id, voice_note=_backup_note(backup))
        return add_voice(
            props,
            script,
            backup,
            ws,
            user_id,
            job_id,
            pronunciations,
            clone,
            [speech.backup_for(v) or v for v in voices] if voices else None,
        )
    if voice.startswith("km-KH") and speech.gemini_ready() and not speech.gemini_available():
        # the person picked the Gemini voice; Gemini is out, so a backup read it
        _report(job_id, voice_note=_backup_note(voice))
    own = min(
        spoken, (speech._WS_TALLY.get() or {}).get("chars", 0)
    )  # read with the workspace's own Gemini key
    if spoken - own > 0 and not local:
        billing.charge(
            ws,
            "video",
            (spoken - own) * speech.price_per_char(voice),
            user_id=user_id,
            model=voice,
            note="Remotion video voice-over",
            job_id=job_id,
        )
    return spoken


def _backup_note(azure_voice: str) -> str:
    """The video card's note when Sreymom / Piseth read a video instead of
    Gemini — what happened and that they can carry on, nothing technical."""
    who = azure_voice.split("-")[2].removesuffix("Neural")
    return f"The Gemini voice isn’t available right now, so {who} read this whole video. You can keep making videos with {who} — Gemini comes back by itself."


if TYPE_CHECKING:  # loaded after this module — app/motion/__init__.py binds these (_link)
    from app.motion.jobs import _check, _progress, _report
