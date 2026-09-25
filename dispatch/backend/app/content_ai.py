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


KHMER_GUIDE = (
    "\n\nKHMER LANGUAGE — this brand posts in Khmer for a Cambodian audience:\n"
    "- Write the way a Cambodian brand's social media admin actually talks to "
    "followers on Facebook, TikTok and Telegram: natural, everyday spoken Khmer, "
    "warm and polite — not formal, literary, news-style or government language.\n"
    "- Think and compose directly in Khmer. Never translate an English sentence "
    "word by word; if a phrase would sound odd said out loud in Phnom Penh, rephrase it.\n"
    "- Keep brand names, product names and app/tech words (Facebook, Telegram, "
    "TikTok, Messenger, AI, chatbot, app, link, inbox, page) in the Latin form "
    "Cambodians normally write them in — don't force Khmer transliterations of them.\n"
    "- Short sentences and short paragraphs; line breaks between ideas; emoji "
    "sparingly, the way local pages use them.\n"
    "- Correct Khmer spelling. Khmer doesn't put spaces between every word — only "
    "between phrases/clauses.\n"
    "- Prices and numbers the way local posts write them (e.g. $5, 20,000 ៛, 24/7).\n"
    "- End with a natural local call to action (e.g. inviting people to inbox the "
    "page or send a message), not a stiff translated one.\n"
    "- The title and insight are for the internal team: write the title in Khmer "
    "too, but the insight may be in English."
)

MIXED_GUIDE = (
    "\n\nLANGUAGE — this brand's audience mixes Khmer and English: write the caption "
    "mainly in natural spoken Khmer, with English only for the terms Cambodians "
    "normally say in English (app names, tech words, product names)."
)


def _fix_khmer_punctuation(text: str) -> str:
    """Models sometimes emit the Devanagari danda (। ॥) where Khmer uses its
    own khan (។ ៕) — visually close, but wrong to a Khmer reader."""
    return text.replace("।", "។").replace("॥", "៕")


def _is_khmer(brand_lang: str) -> bool:
    return "khmer" in (brand_lang or "").lower() or any("ក" <= ch <= "៿" for ch in brand_lang or "")


def _system_prompt(brand_lang: str) -> str:
    if not _is_khmer(brand_lang):
        return SYSTEM_PROMPT
    mixed = "english" in (brand_lang or "").lower()
    return SYSTEM_PROMPT + (MIXED_GUIDE if mixed else KHMER_GUIDE)


def _chat(messages: list[dict], model: str, max_tokens: int = 4000) -> dict:
    """One JSON-mode chat completion against Azure OpenAI; returns the parsed
    JSON object the model replied with."""
    cfg = get_settings()
    if not cfg.azure_openai_api_key or not cfg.azure_openai_endpoint:
        raise ContentAIError("AI service is not configured.")
    url = f"{cfg.azure_openai_endpoint.rstrip('/')}/chat/completions"
    try:
        resp = httpx.post(
            url,
            headers={
                "api-key": cfg.azure_openai_api_key,
                "Authorization": f"Bearer {cfg.azure_openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "max_completion_tokens": max_tokens,
            },
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
    try:
        content = resp.json()["choices"][0]["message"]["content"].strip()
        return json.loads(content)
    except (KeyError, IndexError, AttributeError, ValueError) as exc:
        raise ContentAIError("AI service returned an unexpected response.") from exc


POLISH_PROMPT = (
    "You are a native Cambodian copy editor who runs social media pages for local "
    "brands. You'll get Khmer social media captions written by another writer. "
    "Rewrite each one so it reads like a real Cambodian page admin wrote it: "
    "natural everyday spoken Khmer, correct spelling, no word-by-word translation "
    "feel, no stiff formal/literary wording. Keep every fact, product name, price, "
    "number, link and hashtag exactly as given — don't add claims. Keep brand, "
    "product and app names (Facebook, Telegram, TikTok, AI, …) in Latin script. "
    "Keep roughly the same length and structure (line breaks, call to action).\n"
    'Respond with ONLY a JSON object: {"captions": ["...", ...]} — same count and '
    "order as the input."
)


def _polish_khmer(captions: list[str], model: str, voice_examples: str = "") -> list[str]:
    """Second pass for Khmer: a separate 'native editor' call that rewrites the
    captions for natural local phrasing. Best-effort — on any failure the
    original captions are kept rather than losing the batch."""
    try:
        data = _chat(
            [
                {
                    "role": "system",
                    "content": POLISH_PROMPT
                    + (
                        "\n\nThis brand's real captions, for voice reference only:\n---\n"
                        + voice_examples.strip()[:3000]
                        + "\n---"
                        if voice_examples and voice_examples.strip()
                        else ""
                    ),
                },
                {"role": "user", "content": json.dumps({"captions": captions}, ensure_ascii=False)},
            ],
            model,
        )
        out = data.get("captions") if isinstance(data, dict) else None
        if isinstance(out, list) and len(out) == len(captions) and all(isinstance(c, str) and c.strip() for c in out):
            return [c.strip() for c in out]
    except ContentAIError:
        pass
    return captions


def _brief(
    brand_name: str,
    brand_lang: str,
    products: list[Product],
    topic_source: str,
    count: int,
    voice_examples: str = "",
    learnings: str = "",
) -> str:
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
    if voice_examples and voice_examples.strip():
        lines.append(
            "\nReal captions this brand has posted — match their voice, wording, "
            "length and tone closely. Use them ONLY as a style reference: never "
            "copy facts, prices or claims from them unless they also appear in "
            "the product info above.\n---\n" + voice_examples.strip()[:3000] + "\n---"
        )
    if learnings and learnings.strip():
        # app/learning.py — measured from this brand's own published posts.
        lines.append("\n" + learnings.strip()[:3000])
    return "\n".join(lines)


def generate_ideas(
    brand_name: str,
    brand_lang: str,
    products: list[Product],
    topic_source: str,
    count: int,
    voice_examples: str = "",
    learnings: str = "",
) -> list[dict]:
    cfg = get_settings()
    khmer = _is_khmer(brand_lang)
    # Khmer quality depends heavily on the model — a Khmer brand can use its own
    # (stronger) deployment via AZURE_OPENAI_KHMER_DEPLOYMENT.
    model = (cfg.azure_openai_khmer_deployment if khmer else "") or cfg.azure_openai_deployment
    parsed = _chat(
        [
            {"role": "system", "content": _system_prompt(brand_lang)},
            {"role": "user", "content": _brief(brand_name, brand_lang, products, topic_source, count, voice_examples, learnings)},
        ],
        model,
    )

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
    result = survivors or [max(cleaned, key=lambda i: i["fit_score"])]

    if khmer:
        polished = _polish_khmer([i["caption"] for i in result], model, voice_examples)
        for idea, caption in zip(result, polished):
            idea["caption"] = _fix_khmer_punctuation(caption)
            idea["title"] = _fix_khmer_punctuation(idea["title"])
    return result


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


FACT_CHECK_PROMPT = (
    "You fact-check social media captions for a brand before they're posted. "
    "You get the brand's product information (the ONLY source of truth) and a "
    "list of captions, which may be in Khmer, English or both. For each caption, "
    "list every specific factual claim that is NOT supported by the product "
    "information: prices, discounts, numbers, features, integrations, guarantees, "
    "results, availability, awards or comparisons. Ignore tone, opinions, "
    "greetings, calls to action and general benefits that follow directly from a "
    "listed feature. Write each issue in short plain English, quoting the claim.\n"
    'Respond with ONLY a JSON object: {"results": [["issue", ...], ...]} — one '
    "list per caption, same order; an empty list means nothing unsupported."
)


def _product_facts(products: list[Product]) -> str:
    if not products:
        return "(no product information on file)"
    out = []
    for p in products:
        entry = f"- {p.name}"
        if p.description:
            entry += f": {p.description}"
        if p.highlights:
            entry += f" | highlights: {p.highlights}"
        out.append(entry)
    return "\n".join(out)


def fact_check(captions: list[str], products: list[Product], model: str | None = None) -> list[list[str]] | None:
    """For each caption, the claims that aren't backed by the product info.
    Returns None when the check itself couldn't run — callers treat that as
    "not checked", never as "all clear"."""
    if not captions:
        return []
    cfg = get_settings()
    try:
        data = _chat(
            [
                {"role": "system", "content": FACT_CHECK_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"product_information": _product_facts(products), "captions": captions},
                        ensure_ascii=False,
                    ),
                },
            ],
            model or cfg.azure_openai_deployment,
            max_tokens=2000,
        )
    except ContentAIError:
        return None
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list) or len(results) != len(captions):
        return None
    cleaned = []
    for r in results:
        items = r if isinstance(r, list) else []
        cleaned.append([str(x).strip()[:300] for x in items if str(x).strip()][:6])
    return cleaned
