"""The "Podcast · Story Talk" template's studio (motion/src/podcast.jsx): the room
behind the host's desk, drawn ONCE by the image model and saved to
public/decor/podcast/studio.jpg (shipped with the app; customers never pay for
it). The desk, the mic and the host are drawn in code in front of it. Run from
dispatch/backend:

    PYTHONPATH=. uv run python ../motion/tools/make_podcast_set.py
"""
import io
import pathlib

from PIL import Image

from app import doodle

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "decor" / "podcast"
ROOM = (
    "A cosy small podcast recording studio at golden hour, seen straight from the front at seated "
    "eye level: a back wall of warm wooden acoustic slats and a few dark grey sound-foam panels, a "
    "low shelf with books, a vinyl record player and small plants, a big leafy plant in a corner, "
    "a round paper lamp glowing warm, soft teal light from one side for contrast, gently blurred "
    "like a shallow depth of field. NO desk, NO table, NO microphone, NO chair and NO people in "
    "the lower half — the lower third is just the bottom of the wall and a plain dark floor, out "
    "of focus. No text, no letters, no logos, no signs."
)

OUT.mkdir(parents=True, exist_ok=True)
_p, blob, _usage = doodle._draw(doodle.BACKDROP_STYLE.split("EMPTY")[0] + ROOM, "16:9")
im = Image.open(io.BytesIO(blob)).convert("RGB")
im.thumbnail((1920, 1280))
im.save(OUT / "studio.jpg", "JPEG", quality=84, optimize=True)
print(OUT / "studio.jpg", im.size)
