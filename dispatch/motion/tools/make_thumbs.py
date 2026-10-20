"""Thumbnails for the Video tutorials page (dispatch/public/tutorials/<id>-thumb.jpg).

    cd dispatch/backend
    uv run --no-sync python ../motion/tools/make_thumbs.py [lesson-id ...] [--redraw]

Each one = an AI illustration of the lesson (gpt-image via app/video.py, no text
in it: image AI garbles Khmer) + the Khmer title drawn by the TutorialThumb
composition (motion/src/tutorial.jsx). Pictures are kept in
motion/public/run-thumbs/ (gitignored) and only drawn again with --redraw —
each costs one image on backend/.env's image key.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))  # run from dispatch/backend

from app import video as video_gen  # noqa: E402
from app.imaging import shrink  # noqa: E402

MOTION = Path(__file__).resolve().parent.parent
OUT = MOTION.parent / "public" / "tutorials"
ART = MOTION / "public" / "run-thumbs"

STYLE = (
    " Flat modern vector illustration, friendly and clean, rounded shapes, soft shadows, "
    "palette of deep navy blue (#1f4e8c), sky blue, warm orange (#f97316) and white on a soft cream background. "
    "Absolutely no text, no letters, no numbers, no real brand logos. Centered with generous padding."
)

LESSONS = [
    ("connect", 1, "ភ្ជាប់ទំព័ររបស់បង", "Connect your pages",
     "A laptop and a smartphone linked by glowing cables to three round social media app icons (a speech bubble, a camera, a paper plane), a plug clicking into a socket."),
    ("brand-kit", 2, "រៀបចំកញ្ចប់ម៉ាក", "Set up your brand kit",
     "A brand kit laid out on a table: a round coffee-shop logo badge, colour swatches in brown and cream, a product photo card of an iced coffee, a paint palette."),
    ("weekly-plan", 3, "ផែនការប្រចាំសប្តាហ៍", "Your weekly plan",
     "A weekly calendar planner with a small social post card on each day, green check marks on some days, a clock and a sparkle showing AI help."),
    ("new-post", 4, "បង្កើតប្រកាសដោយខ្លួនឯង", "Make a post yourself",
     "A hand holding a smartphone showing a social media post being written with a photo and caption lines, a paper plane flying out to send it."),
    ("studio-video", 5, "បង្កើតវីដេអូក្នុងស្ទូឌីយោ", "Make a video in the Content studio",
     "A video studio scene: a big play button screen, a row of storyboard frames, a clapperboard and a microphone."),
    ("autopilot", 6, "ស្វ័យប្រវត្តិ", "Autopilot",
     "A friendly round robot at a control panel with a toggle switched on, post cards flying out on a dotted path like a schedule, a small clock."),
    ("insights", 7, "អានលទ្ធផលរបស់បង", "Read your results",
     "An analytics dashboard: rising bar chart and a line graph going up, a magnifying glass, floating heart and thumbs-up reaction bubbles."),
    ("leads", 8, "អតិថិជនសក្តានុពល", "Leads & hand-off",
     "Customer chat bubbles flowing along arrows into a neat list, then handed to a smiling sales person with a headset, a handshake icon."),
    ("website", 9, "ពិនិត្យគេហទំព័រ", "Check your website",
     "A website in a browser window with a big magnifying glass over it, a speedometer gauge, a green shield and check marks."),
    ("team", 10, "អញ្ជើញក្រុមការងារ", "Invite your team",
     "Three friendly office workers around a laptop waving, an envelope with an invitation flying in, small user avatars connected together."),
]
KM_DIGITS = str.maketrans("0123456789", "០១២៣៤៥៦៧៨៩")


def draw(lesson_id: str, prompt: str, redraw: bool) -> Path:
    path = ART / f"{lesson_id}.png"
    if path.exists() and not redraw:
        return path
    _, blob, _ = video_gen.generate_image(prompt + STYLE, "1:1")
    path.write_bytes(shrink(blob, 1024))
    print(f"  drew {lesson_id}")
    return path


def main() -> None:
    want = {a for a in sys.argv[1:] if not a.startswith("--")}
    redraw = "--redraw" in sys.argv
    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx") or "npx"
    for lesson_id, n, title, sub, prompt in LESSONS:
        if want and lesson_id not in want:
            continue
        art = draw(lesson_id, prompt, redraw)
        props = {"lesson": f"មេរៀនទី {str(n).translate(KM_DIGITS)}", "n": n, "title": title, "sub": sub, "art": f"run-thumbs/{art.name}"}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(props, f, ensure_ascii=False)
        png = ART / f"{lesson_id}-thumb.png"
        subprocess.run([npx, "remotion", "still", "src/index.jsx", "TutorialThumb", str(png), f"--props={f.name}", "--log=error"], cwd=MOTION, check=True)
        jpg = OUT / f"{lesson_id}-thumb.jpg"
        from PIL import Image

        Image.open(png).convert("RGB").save(jpg, quality=86, optimize=True)
        print(f"wrote {jpg.name}")


if __name__ == "__main__":
    main()
