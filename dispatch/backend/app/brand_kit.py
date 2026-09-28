"""Brand kit — the logo, product photos and poster templates the image AI
builds on, so a generated poster carries the real logo, the real product and
a design the brand already likes.

Files are stored like every upload (media_blobs) but as ``BrandAsset`` rows,
not Library items. At generation time ``gather`` turns a selection (template,
product, logo) into reference images plus a prompt that tells the model what
each one is for — the image edit endpoint accepts several input images
(app/video.py ``generate_image``). Used by the AI Agent's image requests
(app/video.py ``create_image``) and Auto-generate's images
(app/content_scheduler.py, ``Automation.poster_kit``).
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException
from fastapi import UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.media import IMAGE_EXTS, delete_media, read_media, store_blob
from app.models import Brand, BrandAsset, Product
from app.tenancy import current_workspace_id, owned

router = APIRouter(prefix="/brand-kit", tags=["Brand kit"])

KINDS = {"logo", "product", "template"}
MAX_BYTES = 20 * 1024 * 1024
MAX_TEMPLATES = 12
MAX_PRODUCT_PHOTOS = 30


class AssetOut(BaseModel):
    id: int
    brand_id: int
    kind: str
    url: str
    name: str
    note: str
    product_id: int | None


class AssetPatch(BaseModel):
    name: str | None = None
    note: str | None = None
    product_id: int | None = None


def _out(a: BrandAsset) -> AssetOut:
    return AssetOut(id=a.id, brand_id=a.brand_id, kind=a.kind, url=a.url, name=a.name, note=a.note, product_id=a.product_id)


@router.get("", response_model=list[AssetOut])
def list_assets(
    brand_id: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    q = select(BrandAsset).join(Brand, Brand.id == BrandAsset.brand_id).where(Brand.workspace_id == ws)
    if brand_id is not None:
        q = q.where(BrandAsset.brand_id == brand_id)
    return [_out(a) for a in db.scalars(q.order_by(BrandAsset.kind, BrandAsset.id)).all()]


@router.post("", response_model=AssetOut, status_code=201)
def add_asset(
    file: UploadFile = File(...),
    brand_id: int = Form(...),
    kind: str = Form(...),
    name: str = Form(default=""),
    note: str = Form(default=""),
    product_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    owned(db, Brand, brand_id, ws)
    if kind not in KINDS:
        raise HTTPException(400, "Unknown brand-kit item.")
    original = file.filename or "image.png"
    ext = Path(original).suffix.lower() or mimetypes.guess_extension(file.content_type or "") or ""
    if ext not in IMAGE_EXTS - {".gif"} and not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Use a PNG, JPG or WEBP image.")
    if kind == "product":
        if product_id is None:
            raise HTTPException(400, "Pick which product this photo shows.")
        product = owned(db, Product, product_id, ws)
        if product.brand_id != brand_id:
            raise HTTPException(400, "That product belongs to another brand.")
    else:
        product_id = None

    existing = db.scalars(select(BrandAsset).where(BrandAsset.brand_id == brand_id, BrandAsset.kind == kind)).all()
    if kind == "template" and len(existing) >= MAX_TEMPLATES:
        raise HTTPException(400, f"A brand can keep up to {MAX_TEMPLATES} poster templates — remove one first.")
    if kind == "product" and len(existing) >= MAX_PRODUCT_PHOTOS:
        raise HTTPException(400, f"A brand can keep up to {MAX_PRODUCT_PHOTOS} product photos — remove one first.")

    data = bytearray()
    while chunk := file.file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Image too large (max 20 MB).")
    if not data:
        raise HTTPException(400, "The file is empty.")

    # One logo per brand: a new upload replaces the old one.
    if kind == "logo":
        for old in existing:
            delete_media(db, old.url)
            db.delete(old)
    # One photo per product: likewise.
    if kind == "product":
        for old in existing:
            if old.product_id == product_id:
                delete_media(db, old.url)
                db.delete(old)

    url = store_blob(db, bytes(data), ext or ".png", file.content_type)
    asset = BrandAsset(
        brand_id=brand_id,
        kind=kind,
        url=url,
        name=(name or Path(original).stem)[:120],
        note=note.strip(),
        product_id=product_id,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _out(asset)


@router.patch("/{asset_id}", response_model=AssetOut)
def edit_asset(
    asset_id: int, payload: AssetPatch, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    asset = owned(db, BrandAsset, asset_id, ws, "Brand-kit item")
    if payload.name is not None:
        asset.name = payload.name.strip()[:120]
    if payload.note is not None:
        asset.note = payload.note.strip()
    db.commit()
    db.refresh(asset)
    return _out(asset)


@router.delete("/{asset_id}", status_code=204)
def remove_asset(asset_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    asset = owned(db, BrandAsset, asset_id, ws, "Brand-kit item")
    delete_media(db, asset.url)
    db.delete(asset)
    db.commit()


# ── generation ────────────────────────────────────────────────────────────
def _template_part(n: int, note: str) -> str:
    return (
        f"IMAGE {n} — STYLE TEMPLATE. Design a NEW poster in the same design language: "
        "the same layout and grid (where the headline, visuals, logo and details sit), "
        "the same colour palette, the same illustration / rendering style, the same "
        "typography style and text hierarchy, the same decorative elements and mood. "
        "Do not copy its words, people or objects one-to-one — fill the layout with "
        "the new content described below. Any placeholder in it (e.g. 'LOGO PLACE', "
        "'QR CODE', '00.00', 'Your text here', lorem ipsum) is a slot, never text to "
        "print: put the real item there, or leave that area clean."
        + (f" What to keep from it: {note.strip()}" if note.strip() else "")
    )


def _product_part(n: int, name: str) -> str:
    return (
        f"IMAGE {n} — PRODUCT PHOTO{f' of {name}' if name else ''}. Show this exact "
        "product as the hero, true to its real shape, colours, label and details — "
        "you may relight it and place it in the new scene, but never redesign it or "
        "invent a different product."
    )


def _logo_part(n: int) -> str:
    return (
        f"IMAGE {n} — BRAND LOGO. Place it once, unchanged: same shape, colours and "
        "lettering, never redrawn or restyled. Put it where the template's logo "
        "sits (otherwise a top corner), legible, with clear space around it."
    )


def gather(
    db: Session,
    brand_id: int | None,
    *,
    template_id: int | None = None,
    product_id: int | None = None,
    logo: bool = False,
    extra: bytes | None = None,
) -> tuple[list[bytes], str]:
    """Reference images for one generation, in order, and the instructions
    that name each one. ``extra`` is a reference the person attached
    themselves (it goes last). Returns ([], "") when nothing is selected.
    Assets must belong to ``brand_id`` — callers pass an owned brand."""
    images: list[bytes] = []
    parts: list[str] = []

    def load(asset: BrandAsset | None) -> bytes | None:
        if asset is None or asset.brand_id != brand_id:
            return None
        return read_media(asset.url)

    if brand_id is not None and template_id is not None:
        t = db.get(BrandAsset, template_id)
        if t is not None and t.kind == "template" and (b := load(t)):
            images.append(b)
            parts.append(_template_part(len(images), t.note))
    if brand_id is not None and product_id is not None:
        photo = db.scalar(
            select(BrandAsset).where(
                BrandAsset.brand_id == brand_id, BrandAsset.kind == "product", BrandAsset.product_id == product_id
            )
        )
        if b := load(photo):
            product = db.get(Product, product_id)
            images.append(b)
            parts.append(_product_part(len(images), product.name if product else ""))
    if brand_id is not None and logo:
        lg = db.scalar(select(BrandAsset).where(BrandAsset.brand_id == brand_id, BrandAsset.kind == "logo"))
        if b := load(lg):
            images.append(b)
            parts.append(_logo_part(len(images)))
    if not images:
        return ([extra] if extra else []), ""
    if extra:
        images.append(extra)
        parts.append(f"IMAGE {len(images)} — the person's own reference: use it the way the brief says.")
    guide = (
        "You are given reference images from the brand's kit, in this order:\n"
        + "\n".join(f"- {p}" for p in parts)
        + "\nSpell every word on the poster exactly as written in the brief, and keep "
        "on-image text short. The result must look like a finished, professional "
        "social media poster from this brand.\n\nTHE NEW POSTER:\n"
    )
    return images, guide


def product_for_idea(db: Session, brand_id: int, idea: dict) -> int | None:
    """The product an auto-generated idea is about (its name appears in the
    title or caption) — only products that have a photo in the kit."""
    text = f"{idea.get('title', '')}\n{idea.get('caption', '')}".lower()
    rows = db.execute(
        select(Product.id, Product.name)
        .join(BrandAsset, BrandAsset.product_id == Product.id)
        .where(Product.brand_id == brand_id, BrandAsset.kind == "product")
    ).all()
    # Longest name first, so "AI Hub Pro" wins over "AI Hub".
    for pid, name in sorted(rows, key=lambda r: -len(r[1] or "")):
        if name and name.lower() in text:
            return pid
    return None
