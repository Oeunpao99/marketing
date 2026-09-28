"""Daily content ideas — analyzes a brand's products and writes N post ideas.

Used by ``app/content_scheduler.py`` (the automated daily run) and the
"Generate now" button on the Auto-generate page. One Azure OpenAI chat call,
asked to return strict JSON: a list of ``{goal, angle, title, insight,
caption}`` ideas, one candidate day's worth of content per brand. Each caption
is written for a goal (GOALS — sets the call-to-action strength) with a
marketing angle (ANGLES), so a batch isn't the same generic caption N times.
"""

from __future__ import annotations

import json

import httpx

from app import billing
from app.config import get_settings
from app.models import Product

# Marketing angles a caption can be written with — key → (label, recipe).
# The key is stored on Draft/Post.angle and app/learning.py compares them, so
# don't rename a key once it's in use (labels are free to change).
# Every angle follows the same CAPTION STRUCTURE (pain → cost → product →
# ✓ capabilities → example → CTA); the angle only changes how it's told.
ANGLES: dict[str, tuple[str, str]] = {
    "problem_solution": (
        "Problem → Solution",
        "hook = the pain stated plainly, the way the customer would say it",
    ),
    "direct_offer": (
        "Direct offer",
        "hook = the outcome they want as a question; the example is a flow "
        "line (e.g. 'Customer asks → AI answers → AI sells.'); end on the offer "
        "with a strong call to action",
    ),
    "engagement": (
        "Engagement question",
        "hook = a relatable question; after the list, ask which point matters "
        "most to them and invite a comment",
    ),
    "story": (
        "Story / scenario",
        "hook and 'why it hurts' told as one vivid moment from the customer's "
        "day (e.g. a message arriving at 2 AM that nobody answers); the example "
        "is the same moment with the product",
    ),
    "short_hook": (
        "Short & punchy",
        "the tightest version: every block one short line and a 3-item list",
    ),
    "how_to": (
        "Tip / how-to",
        "hook = a problem they can fix today; the list is 3-5 numbered steps "
        "that use the product's capabilities",
    ),
    "social_proof": (
        "Social proof",
        "hook = a use case or result — ONLY facts given in the product info, "
        "never invented numbers, testimonials or clients",
    ),
}

# What each idea is for — decides how hard the call to action pushes.
GOALS: dict[str, str] = {
    "awareness": "soft or no call to action — just make the brand memorable",
    "engagement": "end with a question or an invitation to comment/share, not a sales pitch",
    "leads": "invite them to message/inbox the page or sign up — low commitment",
    "sales": "a clear, direct call to action with the offer (buy, order, start the trial), "
    "including the link if one is in the product info",
}

_ANGLE_LIST = "\n".join(f"  - {k} ({label}): {recipe}." for k, (label, recipe) in ANGLES.items())
_GOAL_LIST = "\n".join(f"  - {k}: {cta}." for k, cta in GOALS.items())

SYSTEM_PROMPT = (
    "You are the content strategist for a social media team. Given a brand, "
    "its products/offers, and where topics should come from, write concrete, "
    "publish-ready post ideas for ONE day. You are a marketer, not a text "
    "generator: every caption is written for one goal, with one angle.\n"
    "\n"
    "For each idea return:\n"
    "- goal: what this post is for — one of:\n" + _GOAL_LIST + "\n"
    "- angle: the marketing angle — one of:\n" + _ANGLE_LIST + "\n"
    "- title: a short, specific working title (under 70 chars) — not a generic "
    "label like 'Product tip'.\n"
    "- insight: 1-2 sentences on WHY this goal and angle, for the human "
    "reviewing it — the audience need, trend, or product fact it plays off.\n"
    "- caption: a ready-to-post caption in the brand's audience language, "
    "built on the CAPTION STRUCTURE below, told the chosen angle's way, with "
    "the goal's call-to-action strength.\n"
    "- fit_score: your OWN honest 0-100 self-check of this specific idea — "
    "how directly it's grounded in the product facts actually given (not "
    "generic brand-appropriate filler), and how clear/specific the angle is. "
    "100 = built directly from a real product fact provided. Below ~40 = "
    "you're mostly guessing or being generic. Score each idea independently "
    "and honestly — don't inflate it. A caption whose ✓ list doesn't name "
    "specific capabilities from the product info scores below 40.\n"
    "\n"
    "CAPTION STRUCTURE — every caption, every angle. A reader who has never "
    "heard of the product must finish it knowing what problem it solves and "
    "what it actually does:\n"
    "1. Hook (first line): the customer's pain or wish in their own words — "
    "never a bland 'Meet X, your intelligent …' intro.\n"
    "2. Why it hurts (1 line): what that problem costs them — lost sales, "
    "wasted hours, missed customers, stress.\n"
    "3. The fix (1 line): name the product and say plainly what it is.\n"
    "4. What it does: a ✓ list of 3-5 of its REAL capabilities taken from the "
    "product info — each line = the capability + what it means for the "
    "customer (e.g. '✓ Replies to every message 24/7 — no customer waits "
    "till morning'). Specific features, never vague lines like 'saves time' "
    "or 'grows your business'. Pick the capabilities that answer the hook's pain.\n"
    "5. Example (1-2 lines): the product at work in a real situation, or a "
    "flow line (A → B → C).\n"
    "6. Call to action.\n"
    "Roughly 60-150 words. Different ideas should feature different "
    "capabilities where the product info has enough of them.\n"
    "\n"
    "CAPTION FORMAT — social posts are plain text: no markdown, no **bold**, "
    "no # headings. Make it easy to scan on a phone:\n"
    "- The hook alone on the first line.\n"
    "- A blank line between every block — never one dense paragraph.\n"
    "- The capability list: one per line starting with '✓ ' (how_to steps may "
    "use '1.' '2.' '3.'), parallel in form, short enough to read at a glance, "
    "with no full stop at the end.\n"
    "- Where it fits, one short flow line with arrows that sums up the value "
    "(A → B → C).\n"
    "- The call to action alone on the last line (before any hashtags); put "
    "👉 before a link.\n"
    "- 0-3 emoji in total, each with a purpose. No hashtag spam — at most "
    "2-3 relevant ones at the very end.\n"
    "\n"
    "Ideas must be genuinely distinct from each other: use a DIFFERENT angle "
    "for each idea where you can, and mix goals across the batch (not every "
    "post should be a sales pitch). Stay grounded in the product info given — "
    "don't invent products, prices, free trials, discounts, links or claims "
    "that weren't provided; if the offer or link isn't in the product info, "
    "use a call to action that doesn't need one (e.g. 'send us a message').\n"
    "\n"
    "Respond with ONLY a JSON object: "
    '{"ideas": [{"goal": "...", "angle": "...", "title": "...", "insight": "...", '
    '"caption": "...", "fit_score": 0}, ...]} '
    "— no prose, no markdown fences."
)

# Ideas scoring below this are dropped before they ever reach a Draft row —
# app/content_scheduler.py's self-eval step (see AutoPage's "proposed" flow).
MIN_FIT_SCORE = 45


class ContentAIError(RuntimeError):
    pass


# What makes Khmer read as "translated" — shared by the writer (KHMER_GUIDE)
# and the second-pass native editor (POLISH_PROMPT).
KHMER_NATURAL = (
    "What makes Khmer sound translated or stiff — avoid all of it:\n"
    "- English sentence order and English idioms carried over ('take your "
    "business to the next level', 'game-changer', 'unlock'); say the idea the "
    "way a Cambodian would say it out loud.\n"
    "- Formal / written-register filler: នូវ, ត្រូវបាន (passive), ធ្វើការ + verb "
    "(write ឆ្លើយ, not ធ្វើការឆ្លើយតប), stacked ការ-nouns (ការធ្វើឲ្យប្រសើរឡើងនូវ…), "
    "ក្នុងការ, ដែលជា, ជាមួយនឹង when a simpler word works.\n"
    "- Repeating របស់អ្នក in every sentence — once is enough; drop it when the "
    "owner is obvious.\n"
    "- Mixing ways of addressing the reader: pick one (អ្នក, or បង for a "
    "friendly shop voice; លោកអ្នក only for a formal brand) and keep it — follow "
    "the brand's real captions if given.\n"
    "- Starting every question with តើ; end questions naturally (…ទេ? …មែនទេ? "
    "…អត់?) and use តើ only when it reads naturally.\n"
    "Do: short spoken sentences; everyday words (ឆ្លើយ, ជួយ, លក់, ទិញ, ឆាប់, "
    "ស្រួល); keep the words local pages write in English in Latin script — "
    "Inbox, Message, Comment, Share, Page, Live, Order, Staff, Link, AI, app, "
    "Facebook, TikTok, Telegram; ។ ends a sentence (never '.' and not after "
    "✓ list lines or after a '?').\n"
)

KHMER_EXAMPLE = (
    "តើអ្នកកំពុងបាត់បង់អតិថិជន ព្រោះមិនអាចឆ្លើយ Inbox ទាន់មែនទេ?\n"
    "\n"
    "Chumnouykar AI ជួយអាជីវកម្មរបស់អ្នក៖\n"
    "\n"
    "✓ ឆ្លើយអតិថិជន 24/7\n"
    "✓ ណែនាំផលិតផលដោយ AI\n"
    "✓ ប្រមូលព័ត៌មានអតិថិជន\n"
    "✓ ជួយបង្កើត Order\n"
    "✓ មិនចាំបាច់ឲ្យ Staff ឆ្លើយគ្រប់ Message\n"
    "\n"
    "អតិថិជនសួរ → AI ឆ្លើយ → AI ជួយលក់។\n"
    "\n"
    "សាកល្បង FREE 14 ថ្ងៃ ដោយមិនត្រូវការកាតឥណទាន។"
)

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
    "- Write the call to action (at the strength the idea's goal calls for) the way "
    "local pages do — e.g. inviting people to inbox the page or comment below — "
    "not a stiff translated one.\n"
    "- The title and insight are for the internal team: write the title in Khmer "
    "too, but the insight may be in English.\n"
    "\n" + KHMER_NATURAL + "\n"
    "A Khmer direct_offer caption with the right voice and layout — it is an "
    "example from another brand: copy only its tone, wording style and "
    "structure; take facts, offers and product names ONLY from this brand's "
    "product info above, and don't make every caption look like it:\n---\n"
    + KHMER_EXAMPLE + "\n---"
)

MIXED_GUIDE = (
    "\n\nLANGUAGE — this brand's audience mixes Khmer and English: write the caption "
    "mainly in natural spoken Khmer, with English only for the terms Cambodians "
    "normally say in English (app names, tech words, product names).\n"
    "\n" + KHMER_NATURAL
)


def _fix_khmer_punctuation(text: str) -> str:
    """Models sometimes emit the Devanagari danda (। ॥) where Khmer uses its
    own khan (។ ៕) — visually close, but wrong to a Khmer reader."""
    return text.replace("।", "។").replace("॥", "៕")


def _is_khmer(brand_lang: str) -> bool:
    return "khmer" in (brand_lang or "").lower() or any("ក" <= ch <= "៿" for ch in brand_lang or "")


WEEK_GUIDE = (
    "\n\nTHIS IS A WEEK PLAN, not one day: the ideas are spread across the coming "
    "week, one per post slot. Rotate products and angles so the week feels "
    "varied — no two neighbouring ideas on the same product or format."
)


def _system_prompt(brand_lang: str, week: bool = False) -> str:
    base = SYSTEM_PROMPT.replace("for ONE day", "for ONE week") + WEEK_GUIDE if week else SYSTEM_PROMPT
    if not _is_khmer(brand_lang):
        return base
    mixed = "english" in (brand_lang or "").lower()
    return base + (MIXED_GUIDE if mixed else KHMER_GUIDE)


def _chat(messages: list[dict], model: str, max_tokens: int = 4000) -> dict:
    """One JSON-mode chat completion against Azure OpenAI; returns the parsed
    JSON object the model replied with."""
    cfg = get_settings()
    if not cfg.azure_openai_api_key or not cfg.azure_openai_endpoint:
        raise ContentAIError("AI service is not configured.")
    try:
        billing.require_current()
    except billing.OutOfCredit as exc:
        raise ContentAIError(str(exc)) from exc
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
        data = resp.json()
        billing.charge_text(data.get("model") or model, data.get("usage"), _note(messages))
        content = data["choices"][0]["message"]["content"].strip()
        return json.loads(content)
    except (KeyError, IndexError, AttributeError, ValueError) as exc:
        raise ContentAIError("AI service returned an unexpected response.") from exc


def _note(messages: list[dict]) -> str:
    """A short "what was this for" line for the credit ledger: the start of
    the system prompt's first sentence."""
    system = next((m.get("content") for m in messages if m.get("role") == "system"), "") or ""
    first = str(system).strip().split("\n")[0].split(". ")[0]
    return f"AI writing: {first[:120]}" if first else "AI writing"


POLISH_PROMPT = (
    "You are a native Cambodian copy editor who runs social media pages for local "
    "brands. You'll get Khmer social media captions written by another writer. "
    "Rewrite each one so it reads like a real Cambodian page admin wrote it: "
    "natural everyday spoken Khmer, correct spelling, no word-by-word translation "
    "feel, no stiff formal/literary wording. Keep every fact, product name, price, "
    "number, link and hashtag exactly as given — don't add claims. Keep brand, "
    "product and app names (Facebook, Telegram, TikTok, AI, …) in Latin script. "
    "Keep the layout exactly: same line breaks and blank lines, the same ✓ / "
    "numbered list lines, arrows, emoji, link and call to action — improve the "
    "wording inside them, not the structure.\n"
    "\n" + KHMER_NATURAL + "\n"
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
    week: bool = False,
) -> list[dict]:
    """``week=True``: plan ideas spread over a week (app/weekly.py) rather
    than one day's batch."""
    cfg = get_settings()
    khmer = _is_khmer(brand_lang)
    # Khmer quality depends heavily on the model — a Khmer brand can use its own
    # (stronger) deployment via AZURE_OPENAI_KHMER_DEPLOYMENT.
    model = (cfg.azure_openai_khmer_deployment if khmer else "") or cfg.azure_openai_deployment
    parsed = _chat(
        [
            {"role": "system", "content": _system_prompt(brand_lang, week)},
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
        angle = str(idea.get("angle") or "").strip().lower()
        goal = str(idea.get("goal") or "").strip().lower()
        cleaned.append(
            {
                "title": title[:200],
                "insight": str(idea.get("insight") or "").strip(),
                "caption": caption,
                "fit_score": max(0, min(100, fit_score)),
                # Unknown values are dropped rather than stored — learning.py
                # groups by these, so a typo would become its own "angle".
                "angle": angle if angle in ANGLES else "",
                "goal": goal if goal in GOALS else "",
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


def video_prompt_for_idea(brand_name: str, brand_lang: str, idea: dict, products: list[Product]) -> str:
    """An 8-second video brief for one already-written idea — the video twin of
    ``image_prompt_for_idea``, used by auto-generate's daily video."""
    lines = [
        f"An 8-second, vertical 9:16 cinematic social video for {brand_name}"
        + (f" (audience: {brand_lang})" if brand_lang else "")
        + ", made for Reels / TikTok / Shorts. One continuous shot, no cuts.",
        f"Post topic: {idea.get('title', '')}.",
        f"Caption it goes with: {idea.get('caption', '')[:300]}",
    ]
    if products:
        lines.append("Real product facts to stay accurate to (don't invent others):")
        for p in products:
            entry = f"- {p.name}"
            if p.description:
                entry += f": {p.description[:300]}"
            lines.append(entry)
    lines.append(
        "Open on a strong, scroll-stopping visual in the first second; one clear subject and "
        "action; smooth, deliberate camera movement (slow push-in, orbit or tracking shot); "
        "premium commercial lighting; photorealistic. Upbeat background music and natural ambient "
        "sound, no voiceover or dialogue. No on-screen text, captions, logos or watermarks."
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
