"""Small image fixes with ffmpeg (from imageio-ffmpeg — there's no Pillow here).

- ``fit_cover``: exactly W×H, scaled to fill and centre-cropped — a video's
  first frame must match the clip's size (Sora rejects anything else).
- ``shrink``: a JPEG no bigger than ``max_side`` — for showing an image to a
  chat model without paying for a huge upload.
"""

from __future__ import annotations

import os
import subprocess
import tempfile


class ImageError(RuntimeError):
    pass


def _ffmpeg() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(data: bytes, vf: str, out_name: str, extra: list[str] | None = None) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "in"), os.path.join(tmp, out_name)
        with open(src, "wb") as f:
            f.write(data)
        args = [_ffmpeg(), "-hide_banner", "-y", "-i", src, "-vf", vf, "-frames:v", "1", *(extra or []), out]
        res = subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=60)
        if res.returncode != 0 or not os.path.exists(out):
            raise ImageError(f"Couldn't read that image ({res.stderr.strip().splitlines()[-1:] or ['unknown error']})")
        with open(out, "rb") as f:
            return f.read()


def fit_cover(data: bytes, width: int, height: int) -> bytes:
    """PNG of exactly ``width``×``height``: fill the frame, crop the overflow."""
    return _run(
        data,
        f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1",
        "fit.png",
    )


def shrink(data: bytes, max_side: int = 1536) -> bytes:
    """JPEG whose longer side is at most ``max_side`` (never upscaled)."""
    return _run(
        data,
        f"scale='min({max_side},iw)':'min({max_side},ih)':force_original_aspect_ratio=decrease",
        "small.jpg",
        ["-q:v", "3"],
    )
