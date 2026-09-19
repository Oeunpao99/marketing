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

from app.config import get_settings
from app.database import get_db
from app.models import Product

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


class PromptRequest(BaseModel):
    brand: str = ""
    brand_language: str = ""
    # When set, the brief is grounded in this brand's real Products (see
    # app/models.py's Product) — same idea as app/content_ai.py's daily
    # content generator, just for the image/video prompt writer instead.
    brand_id: int | None = None
    type: str = "image"          # image | video
    template: str = ""
    aspect_ratio: str = "1:1"
    style: str = "photorealistic"
    topic: str = ""
    mood: str = ""
    extra: str = ""
    # Refine mode: when both are set, improve prior_prompt using feedback.
    prior_prompt: str = ""
    feedback: str = ""
    # The user attached a reference image the model will edit / build on.
    has_reference: bool = False


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
        f"Deliverable: {r.type}",
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
        lines.append("\nThis brand's real products/offers on file (ground the scene in these):")
        for p in products:
            entry = f"- {p.name}"
            if p.description:
                entry += f": {p.description}"
            if p.highlights:
                entry += f" | highlights: {p.highlights}"
            lines.append(entry)
    if r.has_reference:
        lines.append(
            "IMPORTANT: the user is attaching a REFERENCE IMAGE. Write the prompt as an "
            "EDIT / ENHANCE instruction that builds on that image — say what to keep from "
            "it (composition, subject, colours, product) and what to change, add, restyle "
            "or clean up. Do not describe a scene from scratch."
        )
    return "\n".join(lines)


def _messages(req: PromptRequest, products: list[Product]) -> list[dict]:
    if req.prior_prompt.strip() and req.feedback.strip():
        user = (
            f"Existing prompt:\n{req.prior_prompt.strip()}\n\n"
            f"Feedback to apply:\n{req.feedback.strip()}"
        )
        return [
            {"role": "system", "content": REFINE_PROMPT},
            {"role": "user", "content": user},
        ]
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _user_brief(req, products)},
    ]


@router.post("/prompt", response_model=PromptResponse)
def build_prompt(req: PromptRequest, db: Session = Depends(get_db)):
    cfg = get_settings()
    if not cfg.azure_openai_api_key or not cfg.azure_openai_endpoint:
        raise HTTPException(503, "AI service is not configured.")

    products = (
        db.scalars(select(Product).where(Product.brand_id == req.brand_id).order_by(Product.name)).all()
        if req.brand_id is not None
        else []
    )

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
    return PromptResponse(
        prompt=content,
        model=data.get("model", cfg.azure_openai_deployment),
        input_tokens=usage.get("prompt_tokens") or usage.get("input_tokens") or 0,
        output_tokens=usage.get("completion_tokens") or usage.get("output_tokens") or 0,
        total_tokens=usage.get("total_tokens") or 0,
    )
