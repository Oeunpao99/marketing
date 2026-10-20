"""Render one how-to video for the Video tutorials page (motion/src/tutorial.jsx).

    cd dispatch/backend
    uv run --no-sync python ../motion/tools/make_tutorial.py <lesson.json> [--no-voice]

lesson.json:
    { "id": "connect", "lesson": "មេរៀនទី ១", "title": "…", "sub": "Connect your pages",
      "voice": "km-KH-SreymomNeural",
      "pronunciations": [{"word": "Setup", "say": "សិតអាប់"}],
      "intro": {"say": "…"},
      "steps": [{"shot": "C:/…/01-home.png", "box": [x, y, w, h], "label": "…", "say": "…", "click": true}],
      "outro": {"title": "…", "sub": "…", "say": "…"} }

Screenshots are 1920×1080 (the app at 1600×900, scale 1.2) and boxes are in
those pixels. Each line is read by Azure Speech with word timings (the
subtitles follow them); a scene lasts as long as its line plus a beat.
Writes motion/out/tutorials/<id>.mp4. Speech is billed to backend/.env's
AZURE_SPEECH_KEY (a lesson is ~1,000 characters ≈ $0.02).
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))  # run from dispatch/backend

from app import speech  # noqa: E402
from app.khmer_speech import remap_words  # noqa: E402
from app.motion import spoken_text  # noqa: E402
from app.story import _probe  # noqa: E402

MOTION = Path(__file__).resolve().parent.parent
FPS = 30
CLICK_AT = 56 / FPS  # tutorial.jsx: the box draws at frame 34, the click lands at 56


def voice_line(text: str, voice: str, rules: list[dict], out: Path) -> tuple[list[dict], float]:
    said, parts = spoken_text(text, rules)
    mp3, words = speech.speak_timed(said, voice)
    out.write_bytes(mp3)
    _, seconds = _probe(str(out))
    return remap_words(words, parts, said), seconds


def main() -> None:
    lesson = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    voiced = "--no-voice" not in sys.argv
    key = f"run-tutorial-{lesson['id']}"
    folder = MOTION / "public" / key  # public/run-* is gitignored
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    voice = lesson.get("voice") or speech.VOICES[("km", "female")]
    rules = lesson.get("pronunciations") or []

    def scene(name: str, part: dict, least: float, lead: float) -> dict:
        part = dict(part)
        if voiced and part.get("say"):
            words, secs = voice_line(part["say"], voice, rules, folder / f"{name}.mp3")
            part.update(audio=f"{key}/{name}.mp3", words=words, seconds=round(max(least, lead + secs + 0.9), 2))
            print(f"  {name}: {secs:.1f}s voice")
        else:
            part["seconds"] = max(least, part.get("seconds") or 0)
        return part

    steps = []
    for i, step in enumerate(lesson["steps"], 1):
        shot = folder / f"{i:02d}.png"
        shutil.copy(step["shot"], shot)
        # a step with a click lasts at least until the click has landed and settled
        least = CLICK_AT + 1.4 if step.get("box") and step.get("click", True) else 3.5
        s = scene(f"{i:02d}", {**step, "shot": f"{key}/{shot.name}"}, least, 6 / FPS)
        steps.append(s)
    props = {
        "title": lesson["title"],
        "sub": lesson.get("sub", ""),
        "lesson": lesson.get("lesson", ""),
        "intro": scene("intro", lesson.get("intro", {}), 3.5, 10 / FPS),
        "steps": steps,
        "outro": scene("outro", lesson.get("outro", {}), 3.5, 10 / FPS),
    }
    out = MOTION / "out" / "tutorials" / f"{lesson['id']}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    npx = shutil.which("npx") or "npx"
    cmd = [npx, "remotion", "render", "src/index.jsx", "Tutorial", str(out), f"--props={f.name}", "--log=error", "--concurrency=50%"]
    subprocess.run(cmd, cwd=MOTION, check=True)
    _, total = _probe(str(out))
    print(f"wrote {out} ({total:.0f}s)")


if __name__ == "__main__":
    main()
