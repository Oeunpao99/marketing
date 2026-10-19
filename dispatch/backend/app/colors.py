"""A brand's colours, read from its logo (app/brand_kit.py, on upload).

The logo's strongest colours: transparent, near-white, near-black and grey
pixels are left out (backgrounds, outlines, text), the rest grouped into a
few colours and ranked by how much of the logo they cover. Two colours that
look alike count once. A black-and-white logo gives [] — the Brand kit then
asks the person to pick theirs.
"""

import colorsys
import io

from PIL import Image


def _hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb[:3])


def detect_colors(blob: bytes, most: int = 2) -> list[str]:
    try:
        im = Image.open(io.BytesIO(blob)).convert("RGBA")
    except Exception:  # noqa: BLE001 — not a picture we can read: no colours
        return []
    im.thumbnail((160, 160))
    keep = []
    for r, g, b, a in im.getdata():
        if a < 128:
            continue
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if l > 0.92 or l < 0.08 or s < 0.25:  # white, black, grey
            continue
        keep.append((r, g, b))
    if len(keep) < 30:  # too little colour to call it the brand's
        return []
    strip = Image.new("RGB", (len(keep), 1))
    strip.putdata(keep)
    pal = strip.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    palette = pal.getpalette()
    ranked = sorted(pal.getcolors(), reverse=True)  # [(count, index)]
    out: list[tuple] = []
    for count, idx in ranked:
        if count < len(keep) * 0.05:
            break
        rgb = tuple(palette[idx * 3 : idx * 3 + 3])
        hue, light, sat = colorsys.rgb_to_hls(*(v / 255 for v in rgb))
        alike = any(
            min(abs(hue - h2), 1 - abs(hue - h2)) < 0.06 and abs(light - l2) < 0.2
            for h2, l2, _ in (colorsys.rgb_to_hls(*(v / 255 for v in o)) for o in out)
        )
        if not alike:
            out.append(rgb)
        if len(out) >= most:
            break
    return [_hex(c) for c in out]
