"""The "Collage · Studio" template's decorations (motion/src/studio.jsx): vines,
loose leaves, a stone column top, clouds — drawn ONCE by the image model on a
flat key colour, cut out here and saved to public/decor/studio/*.png (shipped
with the app; customers never pay for them). Run from dispatch/backend:

    PYTHONPATH=. .venv/Scripts/python.exe ../motion/tools/make_decor.py [name ...]
"""
import io
import pathlib
import sys

from PIL import Image, ImageChops, ImageFilter

from app import doodle

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "decor" / "studio"
GREEN, MAGENTA = "pure chroma-key green (#00FF00)", "pure flat magenta (#FF00FF)"
LOOK = "Photorealistic, soft bright studio light, crisp detail, no shadow on the background. No text, no logos, no frame. "
PIECES = {
    # name: (prompt, key colour, ratio)
    "vines": ("Lush fresh green climbing vine branches with many leaves, hanging down from the top-left corner and trailing across, like a decoration framing a poster.", "magenta", "1:1"),
    "leaves": ("Five or six single fresh green leaves of different sizes floating apart from each other, spread out with space between them.", "magenta", "16:9"),
    "column": ("The top of a white marble Ionic column — the carved capital with its two spiral scrolls and a short piece of the fluted shaft below — seen straight from the front, like a pedestal.", "green", "16:9"),
    "clouds": ("A soft fluffy cluster of bright white cumulus clouds, wide and low, like a cloud bank.", "green", "16:9"),
    "sprig": ("One small elegant olive / laurel sprig with thin leaves, slightly curved.", "magenta", "1:1"),
}


def key(blob: bytes, colour: str) -> Image.Image:
    r, g, b = Image.open(io.BytesIO(blob)).convert("RGB").split()
    if colour == "green":
        rest = ImageChops.lighter(r, b)
        amount = ImageChops.subtract(g, rest)  # greener than red / blue
        clean = Image.merge("RGB", (r, ImageChops.darker(g, rest), b))
    else:  # magenta: red and blue both above green
        both = ImageChops.darker(r, b)
        amount = ImageChops.subtract(both, g)
        clean = Image.merge("RGB", (ImageChops.darker(r, ImageChops.lighter(g, b)), g, ImageChops.darker(b, ImageChops.lighter(g, r))))
    alpha = amount.point(lambda d: 255 if d < 40 else 0 if d > 110 else int(255 * (110 - d) / 70))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = clean.convert("RGBA")
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    return out.crop(box) if box else out


OUT.mkdir(parents=True, exist_ok=True)
for name in sys.argv[1:] or PIECES:
    prompt, colour, ratio = PIECES[name]
    bg = GREEN if colour == "green" else MAGENTA
    _p, blob, _usage = doodle._draw(f"{LOOK}{prompt} Isolated on a {bg} background everywhere around it.", ratio)
    (OUT / f"{name}.raw.png").write_bytes(blob)
    im = key(blob, colour)
    im.thumbnail((1400, 1400))
    im.save(OUT / f"{name}.png", optimize=True)
    print(name, im.size)
