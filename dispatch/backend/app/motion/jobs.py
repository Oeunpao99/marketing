"""A making video's progress, Stop, and the pictures painted in the background (doodles).

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import contextvars
import os
import signal
import subprocess
import threading
import time

from typing import TYPE_CHECKING

from app.motion.common import log
from app.motion.templates.picture import picture_room


class Stopped(Exception):
    """The person pressed Stop — the job ends quietly, not as an error."""


_procs: dict[int, subprocess.Popen] = {}  # job id → its running render


_stopped: set[int] = set()


# Live progress of each motion job, for the page's storyboard while it waits
# (GET /ai/video/{id} → progress). In memory: one backend process, and a job
# lives only while its thread runs.
#   stage   — "story" | "polish" | "pictures" | "voice" | "render"
#   style   — the template
#   scenes  — [{type, text, voice: "" | "speaking" | "done" | "skip", seconds}]
#   render  — 0..1 of the frames drawn
_progress: dict[int, dict] = {}


# Presenter / Slides / AI team: at most this many scenes get an AI picture (the
# first, the rest spread over the film); the others keep their icon.
DOODLE_DRAWINGS = 3


# Doodle notes: a sketch for every scene that asks one (a 5-8 scene film asks
# up to ~6) — 3 left half the film on plain icons. Under doodle.MAX_DRAWINGS.
DOODLE_SKETCHES = 6


def _start_doodles(
    script: dict,
    job,
    job_id: int,
    style: str | None = None,
    limit: int = DOODLE_DRAWINGS,
    ratio: str = "16:9",
) -> tuple[threading.Thread, dict]:
    """Start drawing the Doodle sketches in a background thread — on copies of
    the prompts, so nothing shared changes under the rest of the job.
    Returns (thread, {scene index: picture}) for _finish_doodles."""
    from app import doodle

    asks = [n for n, sc in enumerate(script["scenes"]) if sc.get("draw") and not sc.get("image")]
    if len(asks) > limit:  # the first, then evenly spread
        step = (len(asks) - 1) / (limit - 1)
        asks = [asks[round(i * step)] for i in range(limit)]
    # Picture story: each picture painted with calm room where its words will sit
    room = (
        (lambda n: picture_room(n, ratio == "16:9"))
        if script.get("style") == "picture"
        else (lambda n: "")
    )
    if (
        script.get("art") == "stickman"
    ):  # Stick figures: the words centred on the white top, any shape
        # the title sits above the drawing and the subtitles below it (picture.jsx PAGE_BOX): the figures fill it
        room = lambda n: (
            " Composition: the figures centred and filling most of the frame, a little white margin all round."
        )  # noqa: E731
    todo = [{"draw": script["scenes"][n]["draw"] + room(n), "n": n} for n in asks]
    got: dict[int, str] = {}
    # the making card's rows: which scenes are being painted now (a feather), and
    # each finished picture, small, as soon as it's there
    painting: set[int] = set()
    pictures: list = [None] * len(script["scenes"])
    lock = threading.Lock()

    def started(t: dict) -> None:
        with lock:
            painting.add(t["n"])
            _report(job_id, painting=sorted(painting))

    def finished(t: dict, uri: str | None) -> None:
        thumb = _thumb(uri) if uri else None
        with lock:
            painting.discard(t["n"])
            if thumb:
                pictures[t["n"]] = _keep_picture(job_id, t["n"], len(pictures), thumb)
            _report(job_id, painting=sorted(painting), pictures=list(pictures))

    def work():
        doodle.draw_scenes(
            todo,
            job.workspace_id,
            job.user_id,
            report=lambda done, total: _report(job_id, drawn=done, drawings=total),
            style=style,
            limit=limit,
            ratio=ratio,
            on_start=started,
            on_done=finished,
        )
        got.update({t["n"]: t["image"] for t in todo if t.get("image")})

    _report(job_id, drawn=0, drawings=len(todo), waiting=asks)
    thread = threading.Thread(
        target=contextvars.copy_context().run, args=(work,), daemon=True, name=f"doodle-{job_id}"
    )
    thread.start()
    return thread, got


def _finish_doodles(doodling: tuple[threading.Thread, dict], props: dict, job_id: int) -> None:
    """Wait for the sketches still being drawn, then put each into its scene
    (build_props keeps the scenes one to one with the script's)."""
    thread, got = doodling
    if thread.is_alive():
        _report(job_id, stage="pictures")
        while thread.is_alive():
            thread.join(2)
            _check(job_id)  # Stop pressed: stop waiting (the drawing in hand finishes on its own)
    for n, uri in got.items():
        if n < len(props["scenes"]):
            props["scenes"][n]["image"] = uri
    # Picture story: a picture that couldn't be painted (even on its second try) shows the
    # nearest scene's picture — its own camera move makes it read as another shot — never a dark frame
    if props.get("style") == "picture":
        shots = props["scenes"]
        have = [i for i, s in enumerate(shots) if s.get("type") == "shot" and s.get("image")]
        for i, s in enumerate(shots):
            if s.get("type") == "shot" and not s.get("image") and have:
                near = min(have, key=lambda k: (abs(k - i), k > i))  # the one before it, on a tie
                s["image"] = shots[near]["image"]
                log.warning(
                    "job %s: picture %s missing — showing picture %s", job_id, i + 1, near + 1
                )


def share_post_picture(props: dict) -> None:
    """AI service · Your AI team: the post's picture (the product photo or the painted
    one) also shows in the pipeline, on the output that is a picture — what goes in,
    what comes out. Not when it's the same photo as the pipeline's input."""
    picture = next(
        (s.get("image") for s in props["scenes"] if s.get("type") == "approve" and s.get("image")),
        None,
    )
    for s in props["scenes"]:
        if s.get("type") == "pipeline" and picture and picture != s.get("image"):
            s["poster"] = picture


def _report(job_id: int | None, **fields) -> None:
    if job_id is not None:
        # "_at": when it last moved — video._tick keeps a long render (a 10-minute
        # video, past the 45-minute stale mark) alive while this keeps changing
        _progress[job_id] = {**_progress.get(job_id, {}), **fields, "_at": time.monotonic()}


def progress_of(job_id: int) -> dict | None:
    return _progress.get(job_id)


def _kill_tree(proc: subprocess.Popen) -> None:
    """Stop a render and every process it started (npx → node → Chrome)."""
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=30
            )
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except Exception:  # noqa: BLE001 — fall back to the process itself
        proc.kill()


def stop(job_id: int) -> None:
    """Stop a motion video: its render is killed now, and a job still writing
    its script or voice stops at the next step."""
    _stopped.add(job_id)
    proc = _procs.get(job_id)
    if proc is not None:
        _kill_tree(proc)


def _check(job_id: int | None) -> None:
    if job_id is not None and job_id in _stopped:
        raise Stopped()


if TYPE_CHECKING:  # loaded after this module — app/motion/__init__.py binds these (_link)
    from app.motion.review import _keep_picture, _thumb
