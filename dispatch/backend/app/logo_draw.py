"""The line drawing of a brand's logo, for the "Logo · Drawing" intro (motion/src/logodraw.jsx):
the template draws these lines over a construction grid, then fills in the real logo.

From any uploaded logo picture — no vector file needed:
- what is logo: its opaque pixels (a transparent PNG), else the pixels that differ from the
  picture's plain background (a logo on white, a JPG);
- its lines: the shape's outline plus the edges inside it (where the colour changes), a few px
  thick, in dark ink on a see-through ground;
- both cropped to the logo itself, the same box, so the drawing and the logo line up exactly.

``line_art(logo)`` → {"line": data URI, "fill": data URI, "w": px, "h": px} or None (no logo /
nothing found).
"""

from __future__ import annotations

import base64
import io
import logging

log = logging.getLogger("app.logo_draw")

SIZE = 900  # the longest side the drawing is made at — sharp at 1080p, small to send
INK = (24, 36, 38)


def _open(logo: str):
    from PIL import Image

    if not logo or "," not in logo:
        return None
    return Image.open(io.BytesIO(base64.b64decode(logo.split(",", 1)[1]))).convert("RGBA")


def _mask(im):
    """Where the logo is: a transparent logo's opaque part, else what differs from its background."""
    from PIL import Image, ImageChops

    alpha = im.getchannel("A")
    lo, _hi = alpha.getextrema()
    if lo < 200:  # it has a see-through ground
        return alpha.point(lambda a: 255 if a > 110 else 0)
    # a solid ground: the colour in its corners
    w, h = im.size
    corners = [im.getpixel(p)[:3] for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    diff = ImageChops.difference(im.convert("RGB"), Image.new("RGB", im.size, bg)).convert("L")
    return diff.point(lambda d: 255 if d > 38 else 0)


def _parts(on, min_share: float = 0.006) -> list:
    """The logo's separate shapes (4-connected), biggest first — each a boolean mask; specks dropped."""
    import numpy as np
    from collections import deque

    h, w = on.shape
    seen = np.zeros_like(on, dtype=bool)
    parts = []
    total = on.sum() or 1
    for y0, x0 in zip(*np.nonzero(on)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        pix = []
        while q:
            y, x = q.popleft()
            pix.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and on[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(pix) / total >= min_share:
            m = np.zeros_like(on, dtype=bool)
            ys, xs = zip(*pix)
            m[list(ys), list(xs)] = True
            parts.append(m)
    return sorted(parts, key=lambda m: -m.sum())


def _outline(part):
    """The part's outer edge as an ordered list of (x, y) points — Moore-neighbour tracing,
    clockwise from its top-left pixel."""
    import numpy as np

    h, w = part.shape
    pad = np.zeros((h + 2, w + 2), dtype=bool)
    pad[1:-1, 1:-1] = part
    ys, xs = np.nonzero(pad)
    i = np.lexsort((xs, ys))[0]
    start = (int(xs[i]), int(ys[i]))
    ring = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]  # E, SE, S, SW, W, NW, N, NE
    pts, cur, back = [start], start, 4  # came from the west
    for _ in range(20000):
        for k in range(8):
            d = (back + 1 + k) % 8
            nx, ny = cur[0] + ring[d][0], cur[1] + ring[d][1]
            if pad[ny, nx]:
                back = (d + 4) % 8
                cur = (nx, ny)
                break
        else:
            break  # a single pixel
        if cur == start:
            break
        pts.append(cur)
    return [(x - 1, y - 1) for x, y in pts]


def _fit_circle(pts):
    """Least-squares circle through points (Kasa): (cx, cy, r, rms error)."""
    import numpy as np

    x, y = pts[:, 0], pts[:, 1]
    a = np.column_stack([x, y, np.ones_like(x)])
    b = x * x + y * y
    (c0, c1, c2), *_ = np.linalg.lstsq(a, b, rcond=None)
    cx, cy = c0 / 2, c1 / 2
    r = np.sqrt(max(1e-9, c2 + cx * cx + cy * cy))
    err = np.sqrt(np.mean((np.hypot(x - cx, y - cy) - r) ** 2))
    return cx, cy, r, err


def _min_circle(pts):
    """The smallest circle holding every point (an iterative Badoiu-Clarkson pass — close enough at
    this size): (cx, cy, r)."""
    import numpy as np

    c = pts.mean(axis=0)
    for i in range(1, 400):
        far = pts[np.argmax(np.hypot(*(pts - c).T))]
        c = c + (far - c) / (i + 1)
    return c[0], c[1], float(np.hypot(*(pts - c).T).max())


def guides(mask) -> dict:
    """The construction of THIS logo, measured from its shapes (the template draws it before the ink):
    - each part's own curves: its outline traced point by point, and every stretch that bends like
      a circle fitted with that circle — so a guide lies exactly on the logo's curve (a C's round,
      a B's bowls, an S's turns);
    - each part's straight edges: every long straight stretch, as a line carried past the logo;
    - each part's smallest holding circle, and one round the whole logo;
    - nodes where the curves and edges begin and end.
    In the art's own pixels (the template scales them with the logo)."""
    import numpy as np
    from PIL import Image

    W, H = mask.size
    k = 360 / max(W, H)  # measured at this size: fast, and fine enough for the curves
    small = mask.resize((max(1, round(W * k)), max(1, round(H * k))), Image.NEAREST)
    on = np.array(small) > 127
    out = {"circles": [], "lines": [], "nodes": []}
    if not on.any():
        return out

    def back(v: float) -> float:
        return round(float(v) / k, 1)

    ys, xs = np.nonzero(on)
    allc = _min_circle(np.column_stack([xs, ys]).astype(float)[:: max(1, len(xs) // 4000)])
    out["circles"].append([back(allc[0]), back(allc[1]), back(allc[2] + 2), "all"])
    size_all = max(on.shape)
    arcs, lines = [], []
    for part in _parts(on, 0.0015)[:12]:
        edge = np.array(_outline(part), dtype=float)
        if len(edge) < 24:
            continue
        py, px = np.nonzero(part)
        span = max(np.ptp(px), np.ptp(py)) + 1
        hold = _min_circle(edge)
        if span > size_all * 0.12:  # a part big enough to carry its own holding circle
            out["circles"].append([back(hold[0]), back(hold[1]), back(hold[2] + 1), "outer"])
        if span < size_all * 0.12:  # a small piece (a letter of a tagline): drawn, not constructed
            continue
        n = len(edge)
        win = max(14, int(n * 0.12))
        step = max(3, win // 3)
        for s in range(0, n, step):
            seg = edge[np.arange(s, s + win) % n]
            # straight? (the spread across its main direction is tiny)
            mid = seg.mean(axis=0)
            u, sv, vt = np.linalg.svd(seg - mid, full_matrices=False)
            length = sv[0] / np.sqrt(len(seg)) * 3.4
            if sv[1] / np.sqrt(len(seg)) < 0.45 and length > max(span * 0.3, size_all * 0.14):  # truly straight, and long
                d = vt[0]
                lines.append((mid, d, length))
                continue
            cx, cy, r, err = _fit_circle(seg)
            if not (max(span * 0.1, size_all * 0.04) < r < span * 1.2) or err > max(0.8, r * 0.025):
                continue
            ang = np.unwrap(np.arctan2(seg[:, 1] - cy, seg[:, 0] - cx))
            if abs(ang[-1] - ang[0]) < np.radians(70):  # too little of a circle to say
                continue
            arcs.append((cx, cy, r, seg[0], seg[-1]))
    # the same circle found from several windows: kept once
    kept = []
    for cx, cy, r, a, b in sorted(arcs, key=lambda c: -c[2]):
        if any(np.hypot(cx - x, cy - y) < max(3, 0.3 * r) and abs(r - rr) < max(3, 0.25 * r) for x, y, rr, *_ in kept):
            continue
        kept.append((cx, cy, r, a, b))
    for cx, cy, r, a, b in kept[:10]:
        out["circles"].append([back(cx), back(cy), back(r), "curve"])
        out["nodes"] += [[back(a[0]), back(a[1])], [back(b[0]), back(b[1])]]
    # straight edges: one line per direction and place, carried past the logo
    seen = []
    for mid, d, length in sorted(lines, key=lambda t: -t[2]):
        ang = np.arctan2(d[1], d[0]) % np.pi
        off = mid[0] * -np.sin(ang) + mid[1] * np.cos(ang)  # where the line sits across its direction
        if any(abs(ang - a2) < 0.1 and abs(off - o2) < 5 for a2, o2 in seen):
            continue
        seen.append((ang, off))
        reach = max(length * 1.2, size_all * 0.45)
        out["lines"].append([back(mid[0] - d[0] * reach), back(mid[1] - d[1] * reach), back(mid[0] + d[0] * reach), back(mid[1] + d[1] * reach)])
        if len(out["lines"]) >= 8:
            break
    out["nodes"] = out["nodes"][:40]
    return out


def line_art(logo: str | None) -> dict | None:
    from PIL import Image, ImageChops, ImageFilter

    try:
        im = _open(logo)
        if im is None:
            return None
        # always made at SIZE: a small logo traced as is gave dotty lines
        k = SIZE / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        mask = _mask(im)
        box = mask.getbbox()
        if not box:
            return None
        pad = 8
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
        im, mask = im.crop(box), mask.crop(box)
        # clean the mask a little (specks, jagged JPG edges)
        mask = mask.filter(ImageFilter.MedianFilter(3))
        thick = max(3, round(max(im.size) / 220))
        # 1. the outline of the shape
        outline = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(thick | 1)), mask.filter(ImageFilter.MinFilter(thick | 1)))
        # 2. the edges inside it — where the logo's colours change
        lum = im.convert("RGB").convert("L")
        inner = lum.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 48 else 0)
        inner = ImageChops.multiply(inner, mask.filter(ImageFilter.MinFilter(thick | 1)))  # inside only
        inner = inner.filter(ImageFilter.MaxFilter(max(3, thick - 1) | 1))
        lines = ImageChops.lighter(outline, inner).point(lambda v: 255 if v > 90 else 0).filter(ImageFilter.GaussianBlur(0.6))
        art = Image.new("RGBA", im.size, INK + (0,))
        art.putalpha(lines)

        def uri(pic) -> str:
            buf = io.BytesIO()
            pic.save(buf, "PNG", optimize=True)
            return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

        # the logo itself, on a clean see-through ground in the same box
        fill = im.copy()
        fill.putalpha(ImageChops.multiply(im.getchannel("A"), mask.filter(ImageFilter.GaussianBlur(0.8))))
        return {"line": uri(art), "fill": uri(fill), "w": im.width, "h": im.height, "guides": guides(mask)}
    except Exception as exc:  # noqa: BLE001 — the video still runs: the template draws the name instead
        log.warning("logo line art failed: %s", exc)
        return None
