"""The Content studio → Templates tab's hover previews: a short silent clip per
template, from tools/previews/<id>.json "clip" (a few scenes: hook, the
template's own scenes, the close), rendered small to ../public/templates/<id>.mp4.
Run from dispatch/motion after a template changes:

    python tools/make_clips.py [id ...]
"""

import json
import pathlib
import shutil
import subprocess
import sys

here = pathlib.Path(__file__).resolve().parent
motion = here.parent
out = motion.parent / "public" / "templates"
npx = shutil.which("npx") or "npx"

ids = sys.argv[1:] or sorted(p.stem for p in (here / "previews").glob("*.json"))
(motion / "out").mkdir(exist_ok=True)
# One bundle for every clip — bundling per render is the slow part.
bundle = motion / "out" / "clip-bundle"
subprocess.run([npx, "remotion", "bundle", "src/index.jsx", f"--out-dir={bundle}", "--log=error"], cwd=motion, check=True)
for id in ids:
    d = json.load(open(here / "previews" / f"{id}.json", encoding="utf-8"))
    props = motion / "out" / f"clip-{id}.json"
    json.dump({"brand": d["brand"], "style": d["style"], "look": d.get("look"), "cast": d.get("cast"), "place": d.get("place"), "scenes": d["clip"]}, open(props, "w", encoding="utf-8"), ensure_ascii=False)
    mp4 = motion / "out" / f"clip-{id}.mp4"
    subprocess.run(
        [npx, "remotion", "render", str(bundle), "MotionPost", str(mp4), f"--props={props}", "--scale=0.4", "--muted", "--crf=30", "--timeout=120000", "--concurrency=2", "--log=error"],  # 2 workers: the computer stays usable
        cwd=motion,
        check=True,
    )
    shutil.copyfile(mp4, out / f"{id}.mp4")
    print(out / f"{id}.mp4", f"{(out / f'{id}.mp4').stat().st_size // 1024} KB")
