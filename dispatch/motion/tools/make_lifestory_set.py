"""The "Life story · One person" template's sample rooms (motion/src/lifestory.jsx)
for its preview picture and clip only: painted ONCE by the image model with the
template's own style (app/doodle.py LIFE_STYLE) and saved to
public/decor/lifestory/ (customers' videos paint their own rooms). Run from
dispatch/backend:

    PYTHONPATH=. uv run python ../motion/tools/make_lifestory_set.py
"""
import io
import pathlib

from PIL import Image

from app import doodle

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "decor" / "lifestory"
ROOMS = {
    "sample-home": "A small rented room in Phnom Penh in the evening: a wooden table by a window with a desk lamp, "
    "a woven mat, a small shelf with a rice cooker and a plant, a wall clock, warm lamp light.",
    "sample-market": "A morning market stall in Cambodia: a wooden counter with baskets of vegetables and fruit under a "
    "striped awning, crates stacked at the side, soft early sunlight.",
}

OUT.mkdir(parents=True, exist_ok=True)
for name, room in ROOMS.items():
    _p, blob, _usage = doodle._draw(doodle.LIFE_STYLE + room, "16:9")
    im = Image.open(io.BytesIO(blob)).convert("RGB")
    im.thumbnail((1920, 1280))
    im.save(OUT / f"{name}.jpg", "JPEG", quality=84, optimize=True)
    print(OUT / f"{name}.jpg", im.size)
