"""Daily content ideas — analyzes a brand's products and writes N post ideas.

Used by ``app/content_scheduler.py`` (the automated daily run) and the
"Generate now" button on the Auto-generate page. One Azure OpenAI chat call,
asked to return strict JSON: a list of ``{title, insight, caption}`` ideas,
one candidate day's worth of content per brand.
"""

from __future__ import annotations

import json

import httpx

from app.config import get_settings
from app.models import Product

SYSTEM_PROMPT = (
    "You are the content strategist for a social media team. Given a brand, "
    "its products/offers, and where topics should come from, write concrete, "
    "publish-ready post ideas for ONE day.\n"
    "\n"
    "For each idea return:\n"
    "- title: a short, specific working title (under 70 chars) — not a generic "
    "label like 'Product tip'.\n"
    "- insight: 1-2 sentences on WHY this angle, for the human reviewing it — "
    "the audience need, trend, or product fact it plays off.\n"
    "- caption: a ready-to-post caption in the brand's audience language, "
    "written in that platform's voice (short paragraphs, natural, not "
    "salesy), ending with a light call to action. No hashtags spam — at most "
    "2-3 relevant ones at the end.\n"
    "- fit_score: your OWN honest 0-100 self-check of this specific idea — "
    "how directly it's grounded in the product facts actually given (not "
    "generic brand-appropriate filler), and how clear/specific the angle is. "
    "100 = built directly from a real product fact provided. Below ~40 = "
    "you're mostly guessing or being generic. Score each idea independently "
    "and honestly — don't inflate it.\n"
    "\n"
    "Ideas must be genuinely distinct from each other (different angle, "
    "product, or format each) and grounded in the product info given — don't "
    "invent products or claims that weren't provided.\n"
    "\n"
    "Respond with ONLY a JSON object: "
    '{"ideas": [{"title": "...", "insight": "...", "caption": "...", '
    '"fit_score": 0}, ...]} '
    "— no prose, no markdown fences."
)

# Ideas scoring below this are dropped before they ever reach a Draft row —
# app/content_scheduler.py's self-eval step (see AutoPage's "proposed" flow).
MIN_FIT_SCORE = 45


class ContentAIError(RuntimeError):
    pass


def _brief(brand_name: str, brand_lang: str, products: list[Product], topic_source: str, count: int) -> str:
    lines = [
        f"Brand: {brand_name}" + (f" (write in: {brand_lang})" if brand_lang else ""),
        f"How many ideas: {count}",
        f"Where topics should come from: {topic_source or 'general good judgement for this brand'}",
    ]
    if products:
        lines.append("\nProducts / offers on file:")
        for p in products:
            entry = f"- {p.name}"
            if p.description:
                entry += f": {p.description}"
            if p.highlights:
                entry += f" | highlights: {p.highlights}"
            lines.append(entry)
    else:
        lines.append(
            "\nNo product info on file yet — write general brand-appropriate ideas "
            "and note in each insight that adding product details would sharpen it."
        )
    return "\n".join(lines)


def generate_ideas(
    brand_name: str,
    brand_lang: str,
    products: list[Product],
    topic_source: str,
    count: int,
) -> list[dict]:
    cfg = get_settings()
    if not cfg.azure_openai_api_key or not cfg.azure_openai_endpoint:
        raise ContentAIError("AI service is not configured.")

    base = cfg.azure_openai_endpoint.rstrip("/")
    url = f"{base}/chat/completions"
    body = {
        "model": cfg.azure_openai_deployment,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _brief(brand_name, brand_lang, products, topic_source, count)},
        ],
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 4000,
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
        raise ContentAIError(f"Could not reach the AI service: {exc}") from exc

    if resp.status_code >= 400:
        detail = resp.text[:300]
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except ValueError:
            pass
        raise ContentAIError(f"AI service error: {detail}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError) as exc:
        raise ContentAIError("AI service returned an unexpected response.") from exc

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ContentAIError("AI service returned malformed JSON.") from exc

    ideas = parsed.get("ideas") if isinstance(parsed, dict) else None
    if not isinstance(ideas, list) or not ideas:
        raise ContentAIError("AI service returned no ideas.")

    cleaned = []
    for idea in ideas[:count]:
        if not isinstance(idea, dict):
            continue
        title = str(idea.get("title") or "").strip()
        caption = str(idea.get("caption") or "").strip()
        if not title or not caption:
            continue
        try:
            fit_score = int(idea.get("fit_score", 0))
        except (TypeError, ValueError):
            fit_score = 0
        cleaned.append(
            {
                "title": title[:200],
                "insight": str(idea.get("insight") or "").strip(),
                "caption": caption,
                "fit_score": max(0, min(100, fit_score)),
            }
        )
    if not cleaned:
        raise ContentAIError("AI service returned no usable ideas.")

    # Self-eval filter: drop weakly-grounded ideas before they ever become a
    # Draft. If every idea in this batch fails the bar, keep the single
    # best-scoring one anyway rather than silently writing nothing today.
    survivors = [i for i in cleaned if i["fit_score"] >= MIN_FIT_SCORE]
    return survivors or [max(cleaned, key=lambda i: i["fit_score"])]


def image_prompt_for_idea(brand_name: str, brand_lang: str, idea: dict, products: list[Product]) -> str:
    """A short image-generation brief for one already-written idea — grounded
    in the same product facts the idea itself was written from, used by
    app/content_scheduler.py's auto-media step."""
    lines = [
        f"Create a photorealistic, scroll-stopping social media image for {brand_name}"
        + (f" (audience: {brand_lang})" if brand_lang else "")
        + ", vertical 9:16, optimized for Reels/TikTok/Shorts.",
        f"Post topic: {idea.get('title', '')}.",
        f"Caption it goes with: {idea.get('caption', '')[:300]}",
    ]
    if products:
        lines.append("Real product facts to stay accurate to (don't invent others):")
        for p in products:
            entry = f"- {p.name}"
            if p.description:
                entry += f": {p.description}"
            lines.append(entry)
    lines.append(
        "Strong composition, high contrast, clean margin around the subject "
        "for live text overlays. No on-image text or logos."
    )
    return "\n".join(lines)
