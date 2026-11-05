"""The image studio's art styles: the looks of the Remotion templates whose
pictures people like best (Stick figures, Stick figures · Colour, Doodle notes,
Picture story's film / painted / illustration / 3D), for one image. The style
goes in front of the person's prompt, for the image model only; the job keeps
the prompt as typed. Khmer words still go on afterwards, typeset by the server
(app/images/text_overlay.py), the same as for any other image.
"""

from app.images.doodle import PICTURE_ARTS

ARTS = {
    "stickman": PICTURE_ARTS["stickman"],
    "stickcolor": PICTURE_ARTS["stickcolor"],
    # Doodle notes' ink sketch (app/images/doodle.py STYLE), for a whole picture
    "doodle": "A simple hand-drawn doodle illustration in black ink on a plain pure white background, "
    "like a quick pen sketch in a notebook: loose confident black outlines, a little cross-hatching and "
    "a few short motion / emotion strokes, no colour, no grey fill, no shading gradients, no paper "
    "texture. Cute, slightly exaggerated cartoon people with round heads and simple faces that show "
    "the feeling clearly, with plenty of white space.",
    "painted": PICTURE_ARTS["painted"],
    "film": PICTURE_ARTS["film"],
    "illustration": PICTURE_ARTS["illustration"],
    "3d": PICTURE_ARTS["3d"],
}

RULE = (
    " Where people or places appear and the request doesn't say otherwise, set it in Cambodia. "
    "Add no writing, letters or logos the request doesn't ask for.\n\nThe picture: "
)


def guide(art: str) -> str:
    """What goes in front of the prompt for ``art`` — "" for none / unknown."""
    style = ARTS.get((art or "").strip().lower())
    return f"Art style: {style}{RULE}" if style else ""
