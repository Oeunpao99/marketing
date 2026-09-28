"""Daily content ideas — analyzes a brand's products and writes N post ideas.

Used by ``app/content_scheduler.py`` (the automated daily run) and the
"Generate now" button on the Auto-generate page. One Azure OpenAI chat call,
asked to return strict JSON: a list of ``{pillar, goal, angle, title,
insight, caption}`` ideas, one candidate day's worth of content per brand.
Each idea is about a content pillar (PILLARS — what the post is about; most
are NOT product pitches, so a feed isn't all ads), written for a goal (GOALS —
sets the call-to-action strength) with a marketing angle (ANGLES — how it's
told), so a batch isn't the same generic caption N times.
"""

from __future__ import annotations

import json
from datetime import date

import httpx

from app import billing
from app.config import get_settings
from app.models import Product

# Content pillars — WHAT a post is about — key → (label, recipe). A feed of
# nothing but product pitches bores people, so most pillars give the reader
# something on its own (a tip, a laugh, a question, a local moment) and only
# SELLING_PILLARS pitch the product. Stored on Draft/Post.pillar and compared
# by app/learning.py, so don't rename a key once it's in use.
PILLARS: dict[str, tuple[str, str]] = {
    "educate": (
        "Education / tips",
        "useful know-how from the audience's world — a tip, a mistake to avoid, how "
        "something works, a quick checklist — worth saving even if they never buy",
    ),
    "local_moment": (
        "Local moment",
        "tie into what's happening for a Cambodian audience on or near that day — a "
        "holiday or festival, payday (15th / end of month), the season, a school "
        "term — only moments you are sure of from the dates and topic source given; "
        "never guess the date of a moveable holiday",
    ),
    "relatable": (
        "Relatable / fun",
        "an everyday moment the audience knows too well, told with light humour or "
        "warmth — the kind of post people tag a friend on",
    ),
    "community": (
        "Community / question",
        "get the audience talking: a this-or-that, a poll-style question, ask for "
        "their tip or opinion — easy to answer in one comment",
    ),
    "behind_scenes": (
        "Behind the scenes",
        "the people, process and values behind the brand — how things are made or "
        "done, a day at work, why the brand exists; only details given in the brand "
        "or product info",
    ),
    "product": (
        "Product spotlight",
        "one product or feature at work — a demo, a use case, a how-to that uses it",
    ),
    "proof": (
        "Customer proof",
        "a customer situation or result — ONLY facts given in the product info, "
        "never invented numbers, testimonials or clients",
    ),
    "promotion": (
        "Promotion / offer",
        "the direct sell: the offer, why now, and a clear way to buy or sign up",
    ),
}
# The pillars that pitch the product (the CAPTION STRUCTURE below); the rest use
# the VALUE STRUCTURE. A batch keeps these to about 1 in 3.
SELLING_PILLARS = ("product", "proof", "promotion")

_PILLAR_LIST = "\n".join(
    f"  - {k} ({label}{', sells' if k in SELLING_PILLARS else ''}): {recipe}."
    for k, (label, recipe) in PILLARS.items()
)

# Marketing angles a caption can be written with — key → (label, recipe).
# The key is stored on Draft/Post.angle and app/learning.py compares them, so
# don't rename a key once it's in use (labels are free to change).
# The angle only changes how a post is told; the pillar picks the structure.
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
    "generator: every post is about one pillar, written for one goal, with one "
    "angle.\n"
    "\n"
    "People follow a page for what it gives them, not for ads. A feed where "
    "every post pitches the product gets ignored — so most posts should be "
    "worth reading even for someone who never buys, and only some sell.\n"
    "\n"
    "For each idea return:\n"
    "- pillar: what the post is about — one of:\n" + _PILLAR_LIST + "\n"
    "- goal: what this post is for — one of:\n" + _GOAL_LIST + "\n"
    "- angle: how it's told — one of:\n" + _ANGLE_LIST + "\n"
    "  Pick the angle that suits the pillar (direct_offer only for promotion; "
    "social_proof only for proof).\n"
    "- title: a short, specific working title (under 70 chars) — not a generic "
    "label like 'Product tip'.\n"
    "- insight: 1-2 sentences on WHY this pillar, goal and angle, for the human "
    "reviewing it — the audience need, moment, or product fact it plays off.\n"
    "- caption: a ready-to-post caption in the brand's audience language, "
    "built on the structure for its pillar below, told the chosen angle's way, "
    "with the goal's call-to-action strength.\n"
    "- fit_score: your OWN honest 0-100 self-check of this specific idea. For a "
    "selling pillar: how directly it's grounded in the product facts actually "
    "given — a caption whose ✓ list doesn't name specific capabilities from the "
    "product info scores below 40. For any other pillar: how clearly it serves "
    "THIS brand's audience (the people who'd buy these products) and how "
    "specific and genuinely useful or engaging it is — generic filler that any "
    "page could post, or a tip with invented statistics, scores below 40. "
    "100 = excellent; below ~40 = you're mostly guessing or being generic. "
    "Score each idea independently and honestly — don't inflate it.\n"
    "\n"
    "VALUE STRUCTURE — every pillar that doesn't sell (educate, local_moment, "
    "relatable, community, behind_scenes). The reader gets something from the "
    "post itself:\n"
    "1. Hook (first line): about the reader's world, not the product.\n"
    "2. The value: the tip or steps, the moment, the question, the story — "
    "specific and concrete, the part people save, share or answer.\n"
    "3. Brand touch (optional): at most one light line that connects it back to "
    "the brand — never a ✓ feature list, never a hard sell.\n"
    "4. Call to action per the goal — usually a question, 'save this' or "
    "'share with a friend'.\n"
    "Roughly 40-120 words. General advice and well-known facts are fine; "
    "never invent statistics, studies or quotes.\n"
    "\n"
    "CAPTION STRUCTURE — the selling pillars (product, proof, promotion). A "
    "reader who has never heard of the product must finish it knowing what "
    "problem it solves and what it actually does:\n"
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
    "- A list (selling pillars always have one): one per line starting with "
    "'✓ ' (how_to steps may "
    "use '1.' '2.' '3.'), parallel in form, short enough to read at a glance, "
    "with no full stop at the end.\n"
    "- Where it fits, one short flow line with arrows that sums up the value "
    "(A → B → C).\n"
    "- The call to action alone on the last line (before any hashtags); put "
    "👉 before a link.\n"
    "- 0-3 emoji in total, each with a purpose. No hashtag spam — at most "
    "2-3 relevant ones at the very end.\n"
    "\n"
    "Ideas must be genuinely distinct from each other: a DIFFERENT pillar and "
    "angle for each idea where you can, and mixed goals. The PILLAR MIX: at "
    "most about 1 in 3 ideas from a selling pillar (product, proof, promotion), "
    "and never two selling ideas in a row; at most one promotion per 5 ideas. "
    "If the brief lists the pillars of recent posts, don't repeat them — fill "
    "what's missing. If what has worked for this brand favours a pillar, lean "
    "towards it but keep the mix. Stay grounded in the product info given — "
    "don't invent products, prices, free trials, discounts, links or claims "
    "that weren't provided; if the offer or link isn't in the product info, "
    "use a call to action that doesn't need one (e.g. 'send us a message').\n"
    "\n"
    "Respond with ONLY a JSON object: "
    '{"ideas": [{"pillar": "...", "goal": "...", "angle": "...", "title": "...", '
    '"insight": "...", "caption": "...", "fit_score": 0}, ...]} '
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
    "- Product-definition sentences ('X គឺជា…ដែល…', 'X គឺជាដំណោះស្រាយ…'); say what "
    "it does for them instead ('X ជួយ…', 'មាន X ហើយ មិនបាច់…ទៀតទេ').\n"
    "- Ad-copy clichés nobody says out loud: យើងខ្ញុំមានសេចក្តីរីករាយ…, "
    "អតិថិជនជាទីគោរព, ដំណោះស្រាយដ៏ល្អឥតខ្ចោះ, បដិវត្តន៍, ដ៏អស្ចារ្យ / ទំនើបបំផុត in "
    "every line, លើកកម្ពស់អាជីវកម្ម, នាំមកនូវបទពិសោធន៍ថ្មី.\n"
    "- Every sentence the same length and shape (the tell-tale machine rhythm); "
    "mix a short punchy line with a longer one.\n"
    "Do: short spoken sentences; everyday words (ឆ្លើយ, ជួយ, លក់, ទិញ, ឆាប់, "
    "ស្រួល, ភ្ញៀវ for a shop's customers); keep the words local pages write in "
    "English in Latin script — Inbox, Message, Comment, Share, Page, Live, Order, "
    "Staff, Link, AI, app, Facebook, TikTok, Telegram; ។ ends a sentence (never "
    "'.' and not after ✓ list lines or after a '?').\n"
)

# How Cambodian online sellers actually write a selling post — the voice the
# captions were missing (they read like a translated brochure).
KHMER_SELLING = (
    "HOW CAMBODIAN PAGES SELL — write like the page admin chatting with followers:\n"
    "- Talk to one person. A shop / friendly brand calls the reader បង (or បងៗ to "
    "the whole audience) and itself យើង / ហាងយើង; use អ្នក only if the brand's real "
    "captions do.\n"
    "- Spoken particles give it life — use a few where they fit, never in every "
    "line: ណា, ហ្នឹង, ហើយ, ទៀត, ណាស់, សោះ, ម៉ង, បាន (e.g. 'Inbox មកបានណា', "
    "'មិនដូចរូបសោះ', 'ស្រួលណាស់').\n"
    "- Hook with a moment they recognise, in their words ('Inbox ចូលច្រើន តែឆ្លើយ"
    "មិនទាន់?', 'បងៗធ្លាប់ជួបទេ?…'), not a slogan.\n"
    "- Benefits as plain results they can picture ('ភ្ញៀវមិនបាច់រង់ចាំ', "
    "'មិនបាច់អង្គុយឆ្លើយ Message ដល់យប់'), not abstract nouns.\n"
    "- Offer lines local buyers look for — ONLY when the product info gives them: "
    "the price ('តម្លៃត្រឹមតែ $8'), promotion, ដឹកដល់ផ្ទះ / ទូទាំងប្រទេស, COD "
    "(ទទួលទំនិញសិន ទើបបង់លុយ), stock or time limit. Never invent any of these.\n"
    "- The call to action the way local pages say it: 'Inbox មកឥឡូវនេះបាន', "
    "'Comment ប្រាប់ពណ៌ដែលបងចង់បាន', 'ចុច Link ខាងក្រោម 👇', 'កុំឲ្យខកខាន' "
    "(only when there's a real deadline). One CTA, friendly, not pushy.\n"
    "- Read it out loud in your head as a Phnom Penh seller on Facebook Live — if "
    "a line sounds like a government notice or a translated brochure, rewrite it.\n"
)

# Two captions from OTHER brands in the voice we want (a service and a shop) —
# the model copies examples more than it follows rules, so these must follow
# every rule above.
KHMER_EXAMPLE = (
    "Inbox ចូលច្រើន តែឆ្លើយមិនទាន់? 😥\n"
    "\n"
    "ភ្ញៀវសួរតម្លៃហើយរង់ចាំយូរ គេក៏ទៅទិញហាងផ្សេងបាត់។\n"
    "\n"
    "Chumnouykar AI ជួយឆ្លើយជំនួសបង 24ម៉ោង៖\n"
    "\n"
    "✓ ឆ្លើយភ្ញៀវភ្លាមៗ ទោះពាក់កណ្ដាលអធ្រាត្រ\n"
    "✓ ណែនាំទំនិញឲ្យត្រូវនឹងអ្វីដែលភ្ញៀវចង់បាន\n"
    "✓ កត់ឈ្មោះ លេខទូរសព្ទ អាសយដ្ឋានឲ្យស្រាប់\n"
    "✓ ជួយកត់ Order ភ្លាម មិនបាច់ចាំ Staff\n"
    "\n"
    "ភ្ញៀវសួរ → AI ឆ្លើយ → បានលក់។\n"
    "\n"
    "សាកប្រើ FREE 14 ថ្ងៃ មិនបាច់ប្រើកាតធនាគារ 👉 Inbox មកឥឡូវនេះបាន!\n"
    "---\n"
    "បងៗធ្លាប់ជួបទេ? ទិញអាវតាមអនឡាញ ពេលមកដល់មិនដូចរូបសោះ 😅\n"
    "\n"
    "នៅហាងយើង រូបថតផ្ទាល់ពីទំនិញពិតៗ ✨\n"
    "\n"
    "✓ ក្រណាត់ត្រជាក់ ពាក់មិនក្ដៅ\n"
    "✓ មានទំហំ S ដល់ XL\n"
    "✓ ដឹកដល់ផ្ទះ ទូទាំងប្រទេស\n"
    "✓ ទទួលទំនិញសិន ទើបបង់លុយ (COD)\n"
    "\n"
    "តម្លៃត្រឹមតែ $8 ប៉ុណ្ណោះ\n"
    "\n"
    "ចង់បានពណ៌ណា Comment ប្រាប់ ឬ Inbox មកបានណា 👇"
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
    "- In Khmer the CAPTION STRUCTURE is a guide, not a form to fill: merge 'why "
    "it hurts' into the hook when that sounds more natural, and keep ✓ lines as "
    "short spoken phrases. If the brand's real captions are given, their voice "
    "wins over everything here.\n"
    "\n" + KHMER_NATURAL + "\n" + KHMER_SELLING + "\n"
    "Two Khmer captions with the right voice and layout — examples from OTHER "
    "brands: copy only their tone, wording style and rhythm; take facts, offers, "
    "prices and product names ONLY from this brand's product info above, and "
    "don't make every caption look like them. Both are selling posts; a "
    "non-selling pillar keeps the same voice but follows the VALUE STRUCTURE — "
    "no ✓ feature list, no pitch:\n---\n"
    + KHMER_EXAMPLE + "\n---"
)

MIXED_GUIDE = (
    "\n\nLANGUAGE — this brand's audience mixes Khmer and English: write the caption "
    "mainly in natural spoken Khmer, with English only for the terms Cambodians "
    "normally say in English (app names, tech words, product names).\n"
    "\n" + KHMER_NATURAL + "\n" + KHMER_SELLING
)


def _fix_khmer_punctuation(text: str) -> str:
    """Models sometimes emit the Devanagari danda (। ॥) where Khmer uses its
    own khan (។ ៕) — visually close, but wrong to a Khmer reader."""
    return text.replace("।", "។").replace("॥", "៕")


def _is_khmer(brand_lang: str) -> bool:
    return "khmer" in (brand_lang or "").lower() or any("ក" <= ch <= "៿" for ch in brand_lang or "")


WEEK_GUIDE = (
    "\n\nTHIS IS A WEEK PLAN, not one day: the ideas are spread across the coming "
    "week, one per post slot. Build it like a content calendar: rotate pillars, "
    "products and angles so the week feels varied — no two neighbouring ideas "
    "on the same pillar, product or format, selling ideas spread apart, and a "
    "local_moment on the day it belongs to when one falls in the week. Give "
    'each idea a "day": the date (YYYY-MM-DD) from the plan days in the brief '
    "that it is written for, filling the days evenly in date order."
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
    "feel, no stiff formal/literary wording. Read each line out loud in your head — "
    "if a Cambodian seller wouldn't say it that way, rebuild the sentence, don't "
    "just swap words; a line that already sounds natural stays as it is.\n"
    "Keep every fact, product name, price, number, link and hashtag exactly as "
    "given — don't add claims, offers or urgency. Keep brand, product and app "
    "names (Facebook, Telegram, TikTok, AI, …) in Latin script. Keep the overall "
    "shape: hook first, blank lines between blocks, the same ✓ / numbered list "
    "items (reword them freely, shorter is better), arrows, emoji, link, and the "
    "call to action last. You may merge or split sentences inside a block and cut "
    "filler words.\n"
    "\n" + KHMER_NATURAL + "\n" + KHMER_SELLING + "\n"
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
    days: list[date] | None = None,
    recent_pillars: list[str] | None = None,
) -> str:
    lines = [
        f"Brand: {brand_name}" + (f" (write in: {brand_lang})" if brand_lang else ""),
        f"How many ideas: {count}",
        f"Where topics should come from: {topic_source or 'general good judgement for this brand'}",
    ]
    if days:
        lines.append(
            ("Plan days: " if len(days) > 1 else "Posting on: ")
            + ", ".join(f"{d.isoformat()} ({d.strftime('%A')})" for d in days)
        )
    recent = [PILLARS[p][0] for p in recent_pillars or [] if p in PILLARS]
    if recent:
        lines.append("Pillars of this brand's most recent AI posts (newest first): " + ", ".join(recent))
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
    days: list[date] | None = None,
    recent_pillars: list[str] | None = None,
) -> list[dict]:
    """``week=True``: plan ideas spread over a week (app/weekly.py) rather
    than one day's batch — ``days`` are the plan days, and each idea comes
    back with the ``day`` (ISO date) it's for, or "" if the AI gave none.
    ``recent_pillars`` (newest first) lets a daily batch rotate pillars."""
    cfg = get_settings()
    khmer = _is_khmer(brand_lang)
    # Khmer quality depends heavily on the model — a Khmer brand can use its own
    # (stronger) deployment via AZURE_OPENAI_KHMER_DEPLOYMENT.
    model = (cfg.azure_openai_khmer_deployment if khmer else "") or cfg.azure_openai_deployment
    parsed = _chat(
        [
            {"role": "system", "content": _system_prompt(brand_lang, week)},
            {
                "role": "user",
                "content": _brief(
                    brand_name, brand_lang, products, topic_source, count, voice_examples, learnings, days, recent_pillars
                ),
            },
        ],
        model,
    )
    day_isos = {d.isoformat() for d in days or []}

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
        pillar = str(idea.get("pillar") or "").strip().lower()
        day = str(idea.get("day") or "").strip()[:10]
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
                "pillar": pillar if pillar in PILLARS else "",
                "day": day if day in day_isos else "",
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


def video_prompt_for_idea(
    brand_name: str, brand_lang: str, idea: dict, products: list[Product], first_frame: bool = False
) -> str:
    """An 8-second video brief for one already-written idea — the video twin of
    ``image_prompt_for_idea``, used by auto-generate's daily video. Written as
    a short timed shot plan (one subject, one action, one camera move), which
    Sora follows far better than a long description. ``first_frame``: the clip
    starts from the product's brand-kit photo."""
    lines = [
        f"SHOT: vertical 9:16, 8 seconds, one continuous shot for {brand_name}'s "
        "Reels / TikTok / Shorts; one smooth camera move (slow push-in, orbit or tracking).",
        f"TOPIC: {idea.get('title', '')}.",
        f"CAPTION IT GOES WITH (for the idea only — don't show its words): {idea.get('caption', '')[:300]}",
    ]
    if products:
        lines.append("Real product facts to stay accurate to (don't invent others):")
        for p in products:
            entry = f"- {p.name}"
            if p.description:
                entry += f": {p.description[:300]}"
            lines.append(entry)
    if first_frame:
        lines.append(
            "START: the clip opens on the attached product photo as its exact first frame — keep the "
            "product exactly as shown and bring the picture to life with the camera move, light "
            "shifting across it and gentle movement around it."
        )
    lines.append(
        "ACTION: 0-2s a scroll-stopping image already in motion; 2-6s one clear action by one "
        "subject; 6-8s settle and hold on the final image (the product, the result or a happy "
        "reaction). Show real-life moments, not phone or computer screens; Cambodian people and "
        "places where people appear."
    )
    lines.append(
        "LOOK & SOUND: premium commercial lighting, photorealistic; upbeat background music and "
        "natural ambient sound, no voiceover or dialogue.\n"
        "AVOID: on-screen text, captions, logos, watermarks, readable screens, morphing objects, "
        "sudden cuts."
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
    "listed feature. Many captions aren't about the product at all (tips, holidays, "
    "questions, everyday moments): general advice and common knowledge are fine "
    "there — flag only claims about this brand or its products, and made-up "
    "statistics, studies or quotes. Write each issue in short plain English, "
    "quoting the claim.\n"
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
