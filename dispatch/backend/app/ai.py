"""AI agent — turns the template form into a polished Gemini generation prompt.

Uses Azure OpenAI (the v1 / OpenAI-compatible surface). If it is not configured
or the call fails, the router returns 503 and the frontend falls back to its
local template.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing
from app.config import get_settings
from app.database import get_db
from app.models import Brand, Product
from app.tenancy import current_workspace_id, owned

router = APIRouter(prefix="/ai", tags=["AI"])

SYSTEM_PROMPT = (
    "You are a world-class prompt engineer for AI image and video generation "
    "(gpt-image / Sora / Veo class models). Turn the user's brief into ONE "
    "long, richly detailed, ready-to-run generation prompt that a non-expert "
    "can paste straight into the model.\n"
    "\n"
    "OUTPUT FORMAT\n"
    "- Output ONLY the prompt text. No preamble, no explanation, no code fences.\n"
    "- Write it as labelled sections in ALL-CAPS headers followed by prose or "
    "short lines, e.g. SUBJECT, COMPOSITION & LAYOUT, TYPOGRAPHY, LIGHTING, "
    "COLOR PALETTE, STYLE & MOOD, DETAILS & TEXTURE, TECHNICAL & QUALITY, "
    "NEGATIVE / AVOID, ASPECT RATIO. Plain text headers only — no markdown "
    "symbols like # or *.\n"
    "\n"
    "LENGTH & DETAIL\n"
    "- Images / posters: 250-550 words. Be exhaustive and concrete — exact "
    "framing, camera angle and lens, materials and surface textures, background, "
    "props, every piece of on-image text spelled out verbatim in a TYPOGRAPHY "
    "section with its hierarchy, the lighting setup, a named colour palette with "
    "roles, and a NEGATIVE / AVOID list (no distorted faces, no extra fingers, "
    "no watermark, no unreadable tiny text, no random logos, no gibberish text).\n"
    "- Video: 180-320 words, a single continuous shot under ~20s. Describe the "
    "first-second hook, the shot progression beat by beat, camera movement and "
    "lens, subject action, wardrobe, environment, lighting, colour grade, "
    "pacing, and end with 'no on-screen text, no captions'.\n"
    "\n"
    "CRAFT\n"
    "- Honour the brand name, audience language, template, style and mood from "
    "the brief. If the brief names the brand, feature the brand name as real, "
    "correctly-spelled text where it fits the deliverable.\n"
    "- State the requested aspect ratio explicitly in the ASPECT RATIO section.\n"
    "- Keep it safe and appropriate for social platforms.\n"
    "\n"
    "PRODUCT ACCURACY — this is the part most briefs get wrong\n"
    "- If the brief lists this brand's actual products/offers, the scene MUST be "
    "grounded in those real facts: reference the specific product name, what it "
    "actually does, and its real selling points — in the SUBJECT, any on-image "
    "TYPOGRAPHY text, and the props/setting. Do not invent features, numbers, "
    "pricing, or claims that aren't in the product info given.\n"
    "- If NO product info is listed, do not invent a specific product either — "
    "keep the scene brand-appropriate and generic (e.g. a mood/lifestyle shot), "
    "and don't fabricate product names or claims."
)

REFINE_PROMPT = (
    "You are a world-class prompt engineer for AI image and video generation. "
    "You are given an existing detailed generation prompt and the user's "
    "feedback. Return ONE improved prompt that applies the feedback while "
    "keeping everything else intact.\n"
    "\n"
    "- Output ONLY the new prompt text — no preamble, headings chatter, quotes "
    "or markdown symbols.\n"
    "- Keep the same labelled-section structure, richness and length as the "
    "original (do not shorten it). Only change what the feedback asks for, and "
    "adjust any sections that must stay consistent with that change.\n"
    "- Keep the ASPECT RATIO and the NEGATIVE / AVOID section.\n"
    "- For video keep it a single continuous shot under ~20s ending with "
    "'no on-screen text, no captions'."
)

# Video has its own writer: the image format above (TYPOGRAPHY, COLOR PALETTE,
# 300+ words) overloads a 4-12s clip — Sora follows a short, timed shot plan
# with one subject, one action and one camera move far better, and garbles any
# text it's asked to draw.
VIDEO_SYSTEM_PROMPT = (
    "You write prompts for AI video models (Sora / Veo class) that make short "
    "social clips. Turn the user's brief into ONE ready-to-run prompt for a "
    "single clip.\n"
    "\n"
    "OUTPUT FORMAT — only the prompt text, no preamble, no markdown symbols, "
    "70-140 words, as these labelled lines:\n"
    "SHOT: format and length (e.g. 'vertical 9:16, 8 seconds'), one continuous "
    "shot, the lens and ONE camera move (slow push-in, orbit, tracking, "
    "handheld follow or locked-off).\n"
    "SUBJECT & SETTING: who or what is on screen (look, clothes, age range for "
    "people), where, time of day.\n"
    "ACTION: timed beats that fit the length — 0-2s: a scroll-stopping first "
    "image already in motion; then the main action; last 1-2s: settle and hold "
    "on the final image (the product, the result or the person's reaction). "
    "4s = one beat, 8s = two or three, 12s = three or four. Never more.\n"
    "LIGHT & LOOK: lighting, colour grade, style (e.g. photorealistic, "
    "commercial, warm natural light).\n"
    "SOUND: the music style and ambient sound; a voiceover or dialogue line "
    "only if the brief asks for one — quoted, short enough to say in the time.\n"
    "AVOID: no on-screen text, captions, subtitles, logos or watermarks; no "
    "readable phone or computer screens; no morphing objects, extra fingers or "
    "sudden cuts.\n"
    "\n"
    "WHAT MAKES A CLIP WORK\n"
    "- One subject, one main action, one camera move. Video models fall apart "
    "when a short clip is asked to show many things.\n"
    "- Describe only what the camera can see — never abstract words like "
    "'efficient', 'innovative' or 'seamless'.\n"
    "- Software, apps and services: don't try to show the screen (models draw "
    "unreadable UI). Show the real-life moment instead — the person's "
    "problem, then their relief or the result.\n"
    "- A Cambodian brand's clip should look local where it fits: Cambodian "
    "people, Phnom Penh streets, shops, markets, homes and offices.\n"
    "- Text, logos and the call to action are added on top of the clip later — "
    "never ask the model to draw them.\n"
    "- Product accuracy: if the brief lists the brand's real products, ground "
    "the scene in them and don't invent features, numbers or claims; if none "
    "are listed, keep the scene generic and don't invent a product.\n"
    "- Keep it safe and appropriate for social platforms."
)

VIDEO_REFINE_PROMPT = (
    "You write prompts for AI video models. You are given an existing video "
    "prompt and the user's feedback. Return ONE improved prompt that applies "
    "the feedback and keeps everything else.\n"
    "- Output ONLY the prompt text — no preamble or markdown symbols.\n"
    "- Keep the same labelled lines (SHOT, SUBJECT & SETTING, ACTION, LIGHT & "
    "LOOK, SOUND, AVOID) and stay within 70-140 words — one subject, one main "
    "action, one camera move, timed beats that fit the clip length.\n"
    "- Keep the AVOID line: no on-screen text, captions, logos or readable screens."
)

# The clip starts from an image (a product photo from the brand kit, or one
# the person attached): Sora uses it as the exact first frame.
_VIDEO_FIRST_FRAME = (
    "IMPORTANT: the clip starts from an attached image, used as its exact first "
    "frame. Write the prompt as that image coming to life: keep the product and "
    "everything in the picture exactly as it is (never redesign it), and "
    "describe only the motion — the camera move, light shifting across it, and "
    "gentle movement around it (a hand reaching in, steam, fabric, background "
    "life). Don't describe a different opening scene."
)


class PromptRequest(BaseModel):
    brand: str = ""
    brand_language: str = ""
    # When set, the brief is grounded in this brand's real Products (see
    # app/models.py's Product) — same idea as app/content_ai.py's daily
    # content generator, just for the image/video prompt writer instead.
    brand_id: int | None = None
    # The one product this image/video is about (a brand can have several) —
    # the brief then uses only it, so products never get mixed in one asset.
    product_id: int | None = None
    type: str = "image"          # image | video
    template: str = ""
    aspect_ratio: str = "1:1"
    seconds: int = 8             # video clip length
    style: str = "photorealistic"
    topic: str = ""
    mood: str = ""
    extra: str = ""
    # Refine mode: when both are set, improve prior_prompt using feedback.
    prior_prompt: str = ""
    feedback: str = ""
    # The user attached a reference image the model will edit / build on.
    has_reference: bool = False
    # Brand kit images (template / product photo / logo) go with the request
    # (app/brand_kit.py) — the prompt should carry only the new content.
    brand_kit: bool = False


class PromptResponse(BaseModel):
    prompt: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


def _user_brief(r: PromptRequest, products: list[Product]) -> str:
    lines = [
        f"Brand: {r.brand or 'unnamed brand'}"
        + (f" (audience language: {r.brand_language})" if r.brand_language else ""),
        f"Deliverable: {r.type}" + (f", {r.seconds} seconds long" if r.type == "video" else ""),
        f"Template: {r.template or 'general social asset'}",
        f"Aspect ratio: {r.aspect_ratio}",
        f"Visual style: {r.style}",
        f"Core message / topic: {r.topic or '(not specified — infer something sensible)'}",
    ]
    if r.mood:
        lines.append(f"Mood / tone: {r.mood}")
    if r.extra.strip():
        lines.append(f"Extra art direction: {r.extra.strip()}")
    if products:
        if r.product_id is not None and len(products) == 1:
            lines.append("\nTHE PRODUCT this asset is about — show and describe only this one:")
        elif len(products) > 1:
            lines.append(
                "\nThis brand has several products. The asset is about ONE of them — the one the "
                "topic names or fits best. Never mix products or their features in one asset:"
            )
        else:
            lines.append("\nThis brand's real product/offer on file (ground the scene in it):")
        for p in products:
            entry = f"- {p.name}"
            if p.description:
                entry += f": {p.description}"
            if p.highlights:
                entry += f" | highlights: {p.highlights}"
            lines.append(entry)
    if r.type == "video":
        if r.has_reference:
            lines.append(_VIDEO_FIRST_FRAME)
    elif r.brand_kit:
        lines.append(
            "IMPORTANT: the brand's own poster template, product photo and/or logo are "
            "attached to the image request separately, with their own instructions — the "
            "design, colours, layout and logo come from them. Write ONLY the content of "
            "the new poster, 80-160 words, as short labelled lines: HEADLINE (exact text, "
            "short), SUBHEADING / DETAILS (exact text, optional), SUBJECT & SCENE (what is "
            "shown), KEY MESSAGE. No style, colour, lighting, camera or layout sections."
        )
    elif r.has_reference:
        lines.append(
            "IMPORTANT: the user is attaching a REFERENCE IMAGE. Write the prompt as an "
            "EDIT / ENHANCE instruction that builds on that image — say what to keep from "
            "it (composition, subject, colours, product) and what to change, add, restyle "
            "or clean up. Do not describe a scene from scratch."
        )
    return "\n".join(lines)


def _messages(req: PromptRequest, products: list[Product]) -> list[dict]:
    video = req.type == "video"
    if req.prior_prompt.strip() and req.feedback.strip():
        user = (
            f"Existing prompt:\n{req.prior_prompt.strip()}\n\n"
            f"Feedback to apply:\n{req.feedback.strip()}"
        )
        return [
            {"role": "system", "content": VIDEO_REFINE_PROMPT if video else REFINE_PROMPT},
            {"role": "user", "content": user},
        ]
    return [
        {"role": "system", "content": VIDEO_SYSTEM_PROMPT if video else SYSTEM_PROMPT},
        {"role": "user", "content": _user_brief(req, products)},
    ]


@router.post("/prompt", response_model=PromptResponse)
def build_prompt(req: PromptRequest, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    if req.brand_id is not None:
        owned(db, Brand, req.brand_id, ws)
    cfg = get_settings()
    if not cfg.azure_openai_api_key or not cfg.azure_openai_endpoint:
        raise HTTPException(503, "AI service is not configured.")

    products = (
        db.scalars(select(Product).where(Product.brand_id == req.brand_id).order_by(Product.name)).all()
        if req.brand_id is not None
        else []
    )
    if req.product_id is not None:
        # Only a product of this brand counts — anything else is ignored, not an error.
        products = [p for p in products if p.id == req.product_id] or products
        if len(products) != 1:
            req.product_id = None

    billing.require(ws)
    base = cfg.azure_openai_endpoint.rstrip("/")
    url = f"{base}/chat/completions"
    body = {
        "model": cfg.azure_openai_deployment,
        "messages": _messages(req, list(products)),
        # Long, sectioned prompts — gpt-5-mini also spends tokens on reasoning.
        "max_completion_tokens": 6000,
    }
    try:
        resp = httpx.post(
            url,
            headers={
                "api-key": cfg.azure_openai_api_key,
                "Authorization": f"Bearer {cfg.azure_openai_api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=120.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(503, f"Could not reach the AI service: {exc}") from exc

    if resp.status_code >= 400:
        detail = resp.text[:300]
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except ValueError:
            pass
        raise HTTPException(502, f"AI service error: {detail}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError) as exc:
        raise HTTPException(502, "AI service returned an unexpected response.") from exc
    if not content:
        raise HTTPException(502, "AI service returned an empty prompt.")

    usage = data.get("usage") or {}
    billing.charge_text(data.get("model") or cfg.azure_openai_deployment, usage, "AI writing: prompt for an image / video")
    return PromptResponse(
        prompt=content,
        model=data.get("model", cfg.azure_openai_deployment),
        input_tokens=usage.get("prompt_tokens") or usage.get("input_tokens") or 0,
        output_tokens=usage.get("completion_tokens") or usage.get("output_tokens") or 0,
        total_tokens=usage.get("total_tokens") or 0,
    )


# ── "Format": shorten list lines for a phone (content_ai.shorten_list_lines) ──
class FormatIn(BaseModel):
    caption: str
    brand_id: int | None = None


@router.post("/format-caption")
def format_caption(payload: FormatIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Rewrite only the list items too long for one phone line; everything
    else comes back exactly as sent. Nothing to shorten = no AI call."""
    from app.content_ai import ContentAIError, long_list_lines, shorten_list_lines

    caption = payload.caption[:5000]
    brand = owned(db, Brand, payload.brand_id, ws) if payload.brand_id is not None else None
    if not long_list_lines(caption):
        return {"caption": caption, "shortened": 0}
    try:
        out = shorten_list_lines(caption, brand.lang if brand else "")
    except ContentAIError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"caption": out, "shortened": len(long_list_lines(caption))}
