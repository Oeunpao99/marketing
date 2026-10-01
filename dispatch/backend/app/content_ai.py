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
import re
import unicodedata
from datetime import date

import httpx

from app import billing
from app.config import get_settings
from app.models import Product
from app.poster import clean_poster

# Content pillars — WHAT a post is about — key → (label, recipe). A feed of
# nothing but product pitches bores people, so most pillars give the reader
# something on its own (a tip, a laugh, a question, a local moment) and only
# SELLING_PILLARS pitch the product. Stored on Draft/Post.pillar and compared
# by app/learning.py, so don't rename a key once it's in use.
PILLARS: dict[str, tuple[str, str]] = {
    "educate": (
        "Education / tips",
        "useful know-how about the brand's field (for a tech brand: the technology "
        "itself) — a tip, a mistake to avoid, how something works, a quick "
        "checklist — worth saving even if they never buy; about the subject, not "
        "the product",
    ),
    "trend": (
        "What's new",
        "raise awareness of a newer technology, method or shift in the brand's "
        "field — what it is, in plain words, and why people are starting to use it; "
        "only developments you are sure are real and already available — no "
        "invented launches, version numbers, dates or figures, and don't claim "
        "anything is 'just released'",
    ),
    "comparison": (
        "Comparison",
        "an honest side-by-side the audience wonders about — the old way vs the new "
        "way, option A vs option B (e.g. cloud vs on-premise) — with who each one "
        "suits; general approaches, never named competitors",
    ),
    "benefit": (
        "Why it matters",
        "the real benefits of a technology or practice in the brand's field — what "
        "it changes for a business or a person (time, cost, safety, growth), with "
        "an everyday example; the benefit of the idea, not of the product",
    ),
    "quote": (
        "Quote",
        "a short, strong quote about the field, work or progress, plus 1-2 lines "
        "on what it means for the reader; only a well-known quote whose exact "
        "wording and author you are certain of — otherwise an original line in the "
        "brand's voice with no author named",
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
# The rhythm: at least this many awareness days between two selling days, so
# people get value from the page before it pitches again.
SELLING_GAP_DAYS = 2


def selling_days(days: list[date], last_selling: date | None) -> list[date]:
    """Which of ``days`` may carry a selling post, given the day of the
    brand's last one — the first day more than SELLING_GAP_DAYS after it,
    then every SELLING_GAP_DAYS + 1 days."""
    out: list[date] = []
    for d in sorted(days):
        if last_selling is None or (d - last_selling).days > SELLING_GAP_DAYS:
            out.append(d)
            last_selling = d
    return out

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
        "(for a selling pillar the steps use the product's capabilities; "
        "otherwise general steps anyone can follow)",
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
    "- meme: ONLY for the relatable pillar — the post goes out as a meme poster "
    "(setup text above a funny photo), the kind people share. An object "
    '{"top": "...", "scene": "..."}: top = the setup text drawn above the photo, '
    "in the brand's audience language, 1-2 short lines (max 70 characters, a \\n "
    "between setup and punchline line, e.g. 'Customer: \"Price?\" at 2 AM\\nMe, the "
    "shop owner:'); scene = in English, one sentence describing the photo that is "
    "the punchline — a candid, funny, relatable reaction (a person or an animal), "
    "with no words in it. Keep it kind: laugh with the audience, never at a group "
    "of people. For every other pillar: null.\n"
    "- poster: ONLY for educate, benefit, comparison, trend, quote and community "
    "— the post's image is a designed poster for its topic, and this is the text "
    "drawn on it, in the brand's audience language. Poster text is read in a "
    "second: short, plain, no emoji, no hashtags, no full stops at the end of "
    "points. Khmer poster text: put a zero-width space (\\u200b) between words, "
    "so lines break between words, not inside one. An object "
    '{"headline": "...", "points": ["..."], "left_title": "", "left": [], '
    '"right_title": "", "right": [], "author": "", "scene": "..."}:\n'
    "  - educate: headline = the promise (max 60 chars); points = 3-4 steps or "
    "tips, max 45 chars each.\n"
    "  - benefit: headline (max 60 chars); points = 3 benefits, max 45 chars each.\n"
    "  - comparison: headline = 'A vs B' (max 50 chars); left_title / right_title "
    "= the two sides, max 18 chars each (the old or usual way on the left); "
    "left / right = 3 short points each, max 32 chars, matching each other line "
    "by line.\n"
    "  - trend: headline = what it is (max 60 chars); points = one line in plain "
    "words on why it matters (max 100 chars).\n"
    "  - quote: headline = the quote itself (max 160 chars); author = its author, "
    "or the brand's name for an original line.\n"
    "  - community: headline = the question (max 60 chars); points = 2-4 answer "
    "options, max 32 chars each.\n"
    "  scene (every pillar here) = in English, one sentence describing the "
    "photo for the poster: a REAL moment in Cambodia that shows the idea — who "
    "(e.g. a woman running a phone-case stall, a young coffee-cart owner, a "
    "family noodle shop, a tuk-tuk driver, a tailor), where (a Phnom Penh "
    "street, Russian Market, a riverside café, a home shop in Siem Reap), doing "
    "what, and the light (morning sun, neon at night, rain). A different place "
    "and person for each idea. NEVER office workers around a laptop, people "
    "pointing at a screen, handshakes, or posed smiling teams. No readable text, "
    "screens or logos in it. Unused fields stay empty. For every other pillar: null.\n"
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
    "THE VOICE — every caption: an experienced expert who knows Cambodian "
    "small businesses, talking to one owner. Short, specific, confident, calm — "
    "never hype, never filler, never a lecture. Every sentence earns its place; "
    "if a line could be cut without losing anything, cut it.\n"
    "\n"
    "VALUE STRUCTURE — every pillar that doesn't sell (all but product, proof "
    "and promotion). These build awareness and trust — the reader gets "
    "something from the post itself, and it must still be worth posting if the "
    "brand's name were removed:\n"
    "1. A REAL MOMENT (first line): one concrete scene a Cambodian shop owner "
    "lives — who, when, what happened — e.g. 'It's 10 PM. Three customers ask "
    "the price. You're still cooking dinner.' Never a generic question like "
    "'Want to grow your business?' or 'Do you know AI?'.\n"
    "2. THE EXPERT INSIGHT (1-2 lines): what someone who has seen this many "
    "times knows — the cause, the mistake, or what actually works. Specific, "
    "not obvious.\n"
    "3. Only if it helps: up to 3 very short points or steps. Most posts need "
    "no list at all.\n"
    "4. One closing line per the goal — a question that's easy to answer, "
    "'save this', or nothing. Don't end every post with 'Comment below'.\n"
    "Don't name or describe the product, its features or its price — no sell. "
    "behind_scenes may talk about the brand itself.\n"
    "25-70 words. General advice and well-known facts are fine; never invent "
    "statistics, studies, customers or quotes.\n"
    "\n"
    "CAPTION STRUCTURE — the selling pillars (product, proof, promotion). A "
    "reader who has never heard of the product must finish it knowing what "
    "problem it solves and what it actually does:\n"
    "1. A REAL MOMENT (first line): the customer's pain as a concrete scene, "
    "in their words — never a bland 'Meet X, your intelligent …' intro.\n"
    "2. Why it matters (1 line): what that moment costs them — the lost sale, "
    "the late night, the customer who went elsewhere.\n"
    "3. The fix (1 line): name the product and say plainly what it does.\n"
    "4. A ✓ list of exactly 3 of its REAL capabilities from the product info — "
    "each a short line: the capability + what it means for them (e.g. '✓ "
    "Replies 24/7 — nobody waits till morning'). Specific, never vague ('saves "
    "time', 'grows your business'). Pick the ones that answer the moment.\n"
    "5. Call to action, one line.\n"
    "40-90 words. Different ideas should feature different capabilities where "
    "the product info has enough of them.\n"
    "\n"
    "CAPTION FORMAT — social posts are plain text: no markdown, no **bold**, "
    "no # headings. Make it easy to scan on a phone:\n"
    "- The hook alone on the first line.\n"
    "- A blank line between every block — never one dense paragraph.\n"
    "- A list only where it helps (selling pillars always have one): one per "
    "line starting with '✓ ' (how_to steps may use '1.' '2.' '3.'), parallel in "
    "form, short enough to read at a glance, with no full stop at the end. "
    "Vary the shape across a batch — at most half the ideas use a list; the "
    "rest are 2-4 short lines of plain text.\n"
    "- The call to action alone on the last line (before any hashtags); put "
    "👉 before a link.\n"
    "- 0-3 emoji in total, each with a purpose. No hashtag spam — at most "
    "2-3 relevant ones at the very end.\n"
    "\n"
    "Ideas must be genuinely distinct from each other: a DIFFERENT pillar and "
    "angle for each idea where you can, and mixed goals. The RHYTHM: build "
    "awareness first — about 2 days of non-selling posts (educate, trend, "
    "comparison, benefit, quote, ...) — then one selling post (product, "
    "proof, promotion), then awareness again. The brief says how many selling "
    "ideas this batch may have and on which days — never more; 0 means every "
    "idea is a non-selling pillar. At most one promotion per 5 ideas. "
    "If the brief lists the pillars of recent posts, don't repeat them — fill "
    "what's missing. If what has worked for this brand favours a pillar, lean "
    "towards it but keep the mix. If the brief gives SUBJECTS for this batch, "
    "build each idea around one of them, one subject per idea (the pillar, "
    "angle and goal still apply — a subject is what it's about, the pillar is "
    "what kind of post it is), and return it as the idea's \"subject\", copied "
    "exactly; a subject marked [product] goes to the selling idea. Without "
    "SUBJECTS, \"subject\" is \"\". Stay grounded in the product info given — "
    "don't invent products, prices, free trials, discounts, links or claims "
    "that weren't provided; if the offer or link isn't in the product info, "
    "use a call to action that doesn't need one (e.g. 'send us a message').\n"
    "\n"
    "Respond with ONLY a JSON object: "
    '{"ideas": [{"pillar": "...", "subject": "...", "goal": "...", "angle": "...", "title": "...", '
    '"insight": "...", "caption": "...", "meme": null, "poster": null, "fit_score": 0}, ...]} '
    "— no prose, no markdown fences."
)

# Ideas scoring below this are dropped before they ever reach a Draft row —
# app/content_scheduler.py's self-eval step (see AutoPage's "proposed" flow).
MIN_FIT_SCORE = 45


class ContentAIError(RuntimeError):
    pass


# Thai characters accidentally emitted by multilingual tokenizers
THAI_TO_KHMER: dict[str, str] = {
    "อัตโนมัติ": "ស្វ័យប្រវត្តិ",
    "ทีม": "ក្រុមការងារ",
    "ระบบ": "ប្រព័ន្ធ",
    "ลูกค้า": "អតិថិជន",
}

# Dangerous literal machine-translation calques from English
CALQUE_REPLACEMENTS: list[tuple[str, str]] = [
    (r"Comment\s+មកសួរច្បាប់\s+មកជម្រាប", "Comment ប្រាប់ខាងក្រោម"),
    (r"Comment\s+មកសួរច្បាប់", "Comment ខាងក្រោម"),
    (r"មកសួរច្បាប់", "ខាងក្រោម"),
    (r"សួរច្បាប់", "ខាងក្រោម"),
    (r"សុំច្បាប់", "ខាងក្រោម"),
    (r"មកជម្រាប", "ប្រាប់"),
    (r"តោះមើលផ្នែកដែលខុសគ្នា", "មួយណាស្រួលជាង?"),
    (r"ទប់ស្កាត់\s+lead", "មិនឱ្យបាត់បង់ lead"),
    (r"កម្រិតឆ្លើយតបសកម្ម", "ឆ្លើយតបរហ័ស"),
]


def _fix_khmer_punctuation(text: str) -> str:
    """Clean Khmer text: fix punctuation, replace machine-translated calques,
    and strip/replace accidental Thai script bleed."""
    if not text:
        return text
    # 1. Fix Devanagari danda
    text = text.replace("।", "។").replace("॥", "៕")
    # 2. Fix Thai script bleed
    for th, kh in THAI_TO_KHMER.items():
        text = text.replace(th, kh)
    text = re.sub(r"[\u0e00-\u0e7f]+", "", text)
    # 3. Any other script's letters (Korean, Bengali, Chinese, ... seen in real
    # output) \u2014 a Khmer post only ever needs Khmer and Latin letters.
    text = "".join(ch for ch in text if not _foreign_letter(ch))
    # 4. Fix common catastrophic machine-translation calques
    for pat, rep in CALQUE_REPLACEMENTS:
        text = re.sub(pat, rep, text)
    return text


def _foreign_letter(ch: str) -> bool:
    """A letter or vowel sign from a script other than Khmer and Latin."""
    if ch.isascii() or unicodedata.category(ch)[0] not in "LM":
        return False
    return not unicodedata.name(ch, "").startswith(("KHMER", "LATIN", "COMBINING"))


def has_foreign_letters(text: str) -> bool:
    return any(_foreign_letter(ch) for ch in text or "")


# What makes Khmer read as "translated" — shared by the writer (KHMER_GUIDE)
# and the second-pass native editor (POLISH_PROMPT).
KHMER_NATURAL = (
    "WHAT MAKES KHMER SOUND ROBOTIC / TRANSLATED — AVOID AT ALL COSTS:\n"
    "- CRITICAL BANNED LITERAL TRANSLATIONS (Calques from English that sound bizarre or wrong in Khmer):\n"
    "  * NEVER translate 'leave a comment' as anything with 'ច្បាប់' (ច្បាប់ = law or leave of absence/day off!). "
    "'Comment មកសួរច្បាប់' or 'សុំច្បាប់' is completely wrong. Write 'Comment ខាងក្រោម', 'Comment ប្រាប់ខាងក្រោមមកបង', "
    "or 'សាក Comment មតិបងៗមើល៍'.\n"
    "  * NEVER translate 'let us know' as 'មកជម្រាប'. Write 'ប្រាប់', 'ចែករំលែក', or 'ឱ្យដឹង'.\n"
    "  * NEVER translate 'reminder / remind' as 'ការចងចាំ' (ការចងចាំ = human brain memory!). Write 'ការរំលឹក', 'សាររំលឹក', or 'ផ្ញើសាររំលឹក'.\n"
    "  * NEVER translate 'prevent losing leads' as 'ទប់ស្កាត់ lead' (ទប់ស្កាត់ = crackdown/suppression/prevention of crime/disease!). "
    "Write 'មិនឱ្យបាត់បង់ភ្ញៀវ', 'តាមភ្ញៀវជាប់', or 'កុំឱ្យរបូតភ្ញៀវ'.\n"
    "  * NEVER translate 'active response' as 'កម្រិតឆ្លើយតបសកម្ម'. Write 'ឆ្លើយតបរហ័សទាន់ចិត្ត', 'ឆ្លើយភ្ញៀវភ្លាមៗ មិនឱ្យចាំយូរ'.\n"
    "  * NEVER translate 'let's look at the differences' as 'តោះមើលផ្នែកដែលខុសគ្នា'. Write 'មួយណាស្រួលជាង?', 'ខុសគ្នាយ៉ាងម៉េចខ្លះ?', 'មកប្រៀបធៀបគ្នាទាំងអស់គ្នា៖'.\n"
    "  * NEVER write 'បទពិសោធន៍អ្នករបៀបណា?'. Write 'ចុះសម្រាប់បងៗវិញ?', 'ចុះអាជីវកម្មបងវិញ?', 'តើបងៗធ្លាប់ជួបបញ្ហានេះដែរទេ?'.\n"
    "  * NEVER write 'កើតការយឺតយ៉ាវ'. Write 'ឆ្លើយភ្ញៀវមិនទាន់', 'ស្ទះសារ', 'រង់ចាំយូរ'.\n"
    "  * NEVER translate 'closing sales / sales deals' as 'ការទិញលក់'. Write 'ការលក់' or 'បិទការលក់'.\n"
    "  * NEVER write 'ល្អសម្រាប់ទិញម្ដងម្កាល'. Write 'សមស្របសម្រាប់អាជីវកម្មទើបចាប់ផ្ដើម ឬមានភ្ញៀវឆាតតិច'.\n"
    "  * NEVER write 'សម្រេចចិត្តយឺតច្រើនដង'. Write 'ភ្ញៀវចាំយូរ អាចប្ដូរចិត្តទៅទិញកន្លែងផ្សេង'.\n"
    "- PRONOUNS & ADDRESS: Default to 'បង' (singular customer) or 'បងៗ' (the whole audience). Refer to the brand as 'យើង', 'ហាងយើង', "
    "or the brand name. NEVER address the audience as 'អ្នក' or 'របស់អ្នក' in social posts — 'អ្នក' sounds like Google Translate or a textbook.\n"
    "- NATURAL QUESTIONS: Do NOT start questions with 'តើ'. End questions naturally with '...ទេ?', '...មែនទេ?', '...អត់?', '...មួយណាជាង?'.\n"
    "- SCRIPT PURITY: Write strictly in Khmer script (or Latin script for tech terms). NEVER mix Thai characters (e.g. NEVER write Thai words like 'อัตโนมัติ' or 'ทีม'; write Khmer 'ស្វ័យប្រវត្តិ', 'ក្រុមការងារ' or 'Staff').\n"
    "- FORMAL REGISTER FILLERS TO AVOID: នូវ, ត្រូវបាន (passive), ធ្វើការ + verb (write ឆ្លើយ not ធ្វើការឆ្លើយតប), stacked ការ-nouns (ការធ្វើឲ្យប្រសើរឡើងនូវ…), ក្នុងការ, ដែលជា, ជាមួយនឹង.\n"
    "- Product-definition sentences ('X គឺជា…ដែល…', 'X គឺជាដំណោះស្រាយ…'); say what it does for them instead ('X ជួយ…', 'មាន X ហើយ មិនបាច់…ទៀតទេ').\n"
    "- Ad-copy clichés nobody says out loud: យើងខ្ញុំមានសេចក្តីរីករាយ…, អតិថិជនជាទីគោរព, ដំណោះស្រាយដ៏ល្អឥតខ្ចោះ, បដិវត្តន៍, ដ៏អស្ចារ្យ / ទំនើបបំផុត in every line, លើកកម្ពស់អាជីវកម្ម, នាំមកនូវបទពិសោធន៍ថ្មី.\n"
    "- LATIN TECH TERMS: Keep words Cambodian social pages write in Latin: Inbox, Message, Comment, Share, Page, Live, Order, Staff, Link, AI, Follow-up, 24/7, Facebook, TikTok, Telegram.\n"
    "- PUNCTUATION: Use Khmer khan (។) to end sentences where appropriate, never English dot (.). Never put ។ after a question mark or after list bullets.\n"
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

# Examples in the voice we want across different post types (comparison, selling, shop):
KHMER_EXAMPLE = (
    "# EXAMPLE 1 — COMPARISON POST (Manual vs Automated / Old way vs New way):\n"
    "Follow-up ភ្ញៀវដោយដៃ vs ប្រើប្រព័ន្ធស្វ័យប្រវត្តិ — មួយណាស្រួលជាងសម្រាប់អាជីវកម្មបង? 🤔\n"
    "\n"
    "👉 ឆ្លើយដោយដៃ (Manual)៖\n"
    "• សមស្របសម្រាប់អាជីវកម្មទើបចាប់ផ្ដើម ឬភ្ញៀវឆាតតិច\n"
    "• ងាយស្ទះសារ ឆ្លើយភ្ញៀវមិនទាន់ពេល Message ចូលច្រើន\n"
    "• ភ្ញៀវរង់ចាំយូរ អាចប្ដូរចិត្តទៅទិញកន្លែងផ្សេង\n"
    "\n"
    "👉 ប្រើស្វ័យប្រវត្តិ (Automated)៖\n"
    "• ឆ្លើយតបភ្ញៀវភ្លាមៗ 24/7 តាមសំណួរញឹកញាប់\n"
    "• ជួយ Follow-up និងផ្ញើសាររំលឹកភ្ញៀវស្វ័យប្រវត្តិ មិនឱ្យបាត់បង់ភ្ញៀវ\n"
    "• ទុកពេលឱ្យក្រុមការងារផ្ដោតលើការបិទការលក់សំខាន់ៗ\n"
    "\n"
    "ចុះសម្រាប់បងៗវិញ ពេញចិត្តវិធីមួយណាជាង?\n"
    "Comment \"ដៃ\" ឬ \"ស្វ័យប្រវត្តិ\" ចែករំលែកខាងក្រោមបានណា 👇\n"
    "---\n"
    "# EXAMPLE 2 — SELLING / PRODUCT SPOTLIGHT (Chumnouykar AI):\n"
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
    "# EXAMPLE 3 — SHOP SELLING (Online store):\n"
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
    "TikTok, Messenger, AI, chatbot, app, link, inbox, page, Follow-up) in the Latin form "
    "Cambodians normally write them in — don't force Khmer transliterations of them.\n"
    "- Short sentences and short paragraphs; line breaks between ideas; emoji "
    "sparingly, the way local pages use them.\n"
    "- Correct Khmer spelling. Khmer doesn't put spaces between every word — only "
    "between phrases/clauses.\n"
    "- Prices and numbers the way local posts write them (e.g. $5, 20,000 ៛, 24/7).\n"
    "- Write the call to action (at the strength the idea's goal calls for) the way "
    "local pages do — e.g. inviting people to inbox the page or comment below — "
    "never a stiff, translated one.\n"
    "- The title and insight are for the internal team: write the title in Khmer "
    "too, but the insight may be in English.\n"
    "- In Khmer the CAPTION STRUCTURE is a guide, not a form to fill: merge 'why "
    "it hurts' into the hook when that sounds more natural, and keep ✓ lines as "
    "short spoken phrases. If the brand's real captions are given, their voice "
    "wins over everything here.\n"
    "\n" + KHMER_NATURAL + "\n" + KHMER_SELLING + "\n"
    "Khmer captions with the right voice and layout — examples from OTHER "
    "brands: copy only their tone, wording style and rhythm; take facts, offers, "
    "prices and product names ONLY from this brand's product info above, and "
    "don't make every caption look like them:\n---\n"
    + KHMER_EXAMPLE + "\n---"
)

MIXED_GUIDE = (
    "\n\nLANGUAGE — this brand's audience mixes Khmer and English: write the caption "
    "mainly in natural spoken Khmer, with English only for the terms Cambodians "
    "normally say in English (app names, tech words, product names, Follow-up, AI).\n"
    "\n" + KHMER_NATURAL + "\n" + KHMER_SELLING
)


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


def _chat(messages: list[dict], model: str, max_tokens: int = 4000, effort: str = "") -> dict:
    """One JSON-mode chat completion against Azure OpenAI; returns the parsed
    JSON object the model replied with. ``effort``: the reasoning effort
    ("low" … "high") for reasoning models; "" = the model's default."""
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
                **({"reasoning_effort": effort} if effort else {}),
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
    "You are an expert native Cambodian copy editor who manages social media for top local "
    "brands in Phnom Penh. You'll receive Khmer social media captions that were drafted from English prompts. "
    "Many have awkward, robotic, word-by-word machine translations. Your job is to rewrite each caption "
    "so it sounds 100% natural, warm, and authentic — the way real Cambodian page admins and sellers chat with followers.\n"
    "\n"
    "CORRECTNESS FIRST — check every caption word by word before anything else:\n"
    "- Every Khmer word must be a real, correctly spelled word that fits its meaning. Typical errors "
    "in these drafts: misspellings (ជំហាន់ → ជំហាន, ថែរក្សភាព → ថែរក្សា, ចូលមាសួរ → ចូលមកសួរ), a "
    "real word in the wrong meaning (ទិដ្ឋាការ = visa, not phone number → លេខទូរសព្ទ; កាប់ = chop → "
    "ប្រមូល / តាមដាន leads; ពត៌មាន → ព័ត៌មាន; សំនួរ → សំណួរ), and invented words or nonsense phrases (e.g. 'AI chatbots សាច់ភ្លឺ').\n"
    "- Any letter from another script — Korean (환), Thai (โพสต์, นะ), Bengali (া), Chinese — is an "
    "error: rewrite that word in Khmer.\n"
    "- No doubled words (បានបាន), no broken half-English words, no sentence fragments.\n"
    "- Every sentence must make complete sense on first reading. If you can't tell what a sentence "
    "means, rewrite it simply from the caption's idea — or drop it if the caption works without it.\n"
    "- Prefer short, common, everyday words over rare or literary ones: simple and correct beats "
    "fancy and wrong.\n"
    "- Numbered lists count 1, 2, 3 — never repeat a number.\n"
    "- Keep each caption as short as it came, or shorter — never add lines, lists, emoji or a "
    "second call to action. Short and correct is the goal.\n"
    "\n"
    "CRITICAL EDITING RULES:\n"
    "- Read each line out loud: if a Cambodian would never say it that way, rebuild the sentence into natural spoken Khmer.\n"
    "- Eradicate literal English calques (e.g. NEVER allow 'សួរច្បាប់', 'មកជម្រាប', 'ការចងចាំ' for reminders, 'កម្រិតឆ្លើយតបសកម្ម', 'ទប់ស្កាត់ lead', 'តោះមើលផ្នែកដែលខុសគ្នា').\n"
    "- Ensure natural audience address: use 'បង' / 'បងៗ' (never 'អ្នក' or 'របស់អ្នក').\n"
    "- Remove any Thai script/words (e.g. ทีม → ក្រុមការងារ/Staff, อัตโนมัติ → ស្វ័យប្រវត្តិ).\n"
    "- Keep every factual detail, product name, price, number, link and hashtag exactly as given — don't invent offers or urgency.\n"
    "- Keep brand, product and tech terms in Latin script (Inbox, Message, Comment, Follow-up, AI, Facebook, TikTok, Telegram).\n"
    "- Keep the clean structure: hook first, blank lines between blocks, list items short and punchy, and friendly CTA last.\n"
    "\n" + KHMER_NATURAL + "\n" + KHMER_SELLING + "\n"
    "Some items are short titles or poster lines, not full captions: correct them the same way but "
    "keep them just as short, with no added emoji or calls to action.\n"
    'Respond with ONLY a JSON object: {"captions": ["...", ...]} — same count and '
    "order as the input."
)


# A Khmer-only brand (not "Khmer + English"): English only where Cambodians
# really write it, so posts don't drift into half-English.
KHMER_ONLY_NOTE = (
    "\n\nThis brand writes in KHMER ONLY: use Khmer words wherever a common Khmer word exists "
    "(ភ្ញៀវ not lead/customer, រក្សាទុក not Save, តាមដាន not Follow, ម៉ោងមមាញឹក not peak, និន្នាការ "
    "not trend). Keep Latin only for brand/product names, app names and the few tech words "
    "listed above (AI, Inbox, Message, Comment, Facebook, Telegram, TikTok, 24/7)."
)


def _polish_khmer(
    captions: list[str], model: str, voice_examples: str = "", khmer_only: bool = False, keep: list[str] | None = None
) -> list[str]:
    """Second pass for Khmer: a separate 'native editor' call that checks
    correctness (real words, spelling, no foreign letters, sentences that make
    sense) and rewrites for natural local phrasing — at high reasoning effort,
    since a small model writing Khmer slips on exactly these. Best-effort — on
    any failure the original captions are kept rather than losing the batch."""
    try:
        data = _chat(
            [
                {
                    "role": "system",
                    "content": POLISH_PROMPT
                    + (KHMER_ONLY_NOTE if khmer_only else "")
                    + (
                        "\n\nNames to copy EXACTLY as written, never translated or respelled: "
                        + ", ".join(k for k in keep if k)
                        if keep
                        else ""
                    )
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
            # High effort: the editor reasons through each line (most of this
            # budget is that hidden reasoning, billed only as used).
            max_tokens=24000,
            effort="high",
        )
        out = data.get("captions") if isinstance(data, dict) else None
        if isinstance(out, list) and len(out) == len(captions) and all(isinstance(c, str) and c.strip() for c in out):
            return [_fix_khmer_punctuation(c.strip()) for c in out]
    except ContentAIError:
        pass
    return [_fix_khmer_punctuation(c) for c in captions]


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
    subjects: list[str] | None = None,
    selling_days: list[date] | None = None,
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
    if selling_days is not None:
        lines.append(
            "Selling ideas allowed in this batch: 0 — awareness days, every idea a non-selling pillar"
            if not selling_days
            else f"Selling ideas allowed in this batch: at most {len(selling_days)}, only on "
            + ", ".join(f"{d.isoformat()} ({d.strftime('%A')})" for d in selling_days)
        )
    if subjects:
        names = [p.name for p in products]
        lines.append(
            "SUBJECTS for this batch (one per idea): "
            + "; ".join(f"{s} [product]" if is_selling_subject(s, names) else s for s in subjects)
        )
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


# A subject about the brand's own product belongs on a selling day (the
# awareness posts can't name the product) — told by these words or a product's
# name in it, e.g. the "How to use our product" preset.
_SELLING_SUBJECT_WORDS = ("product", "our ", "offer", "promotion", "discount", "price", "demo", "feature")


def is_selling_subject(subject: str, product_names: list[str] | tuple = ()) -> bool:
    low = f" {subject.lower()} "
    return any(w in low for w in _SELLING_SUBJECT_WORDS) or any(
        n and len(n) > 2 and n.lower() in low for n in product_names
    )


def _rotate(subs: list[str], n: int, offset: int, scores: dict[str, float]) -> list[str]:
    """``n`` distinct subjects from a rotation where proven ones (scores ≥
    SUBJECT_FAVOUR) come round twice per cycle and the rest once — so what
    gets engagement is written about more, and everything still gets a turn."""
    if not subs or n < 1:
        return []
    cycle = subs + [s for s in subs if scores.get(s, 0) >= SUBJECT_FAVOUR]
    out: list[str] = []
    for i in range(len(cycle)):
        s = cycle[(offset + i) % len(cycle)]
        if s not in out:
            out.append(s)
        if len(out) == n:
            break
    return out


# A subject whose posts get this many times the brand's usual engagement
# (learning.py subject_scores) comes round twice as often.
SUBJECT_FAVOUR = 1.25


def pick_subjects(
    subjects: list[str] | None,
    count: int,
    offset: int,
    selling_slots: int | None = None,
    product_names: list[str] | tuple = (),
    scores: dict[str, float] | None = None,
) -> list[str]:
    """The next ``count`` subjects from the person's list, starting at
    ``offset`` and wrapping round — so each day / batch covers different
    ones and the whole list comes round in turn. [] when none are set.

    ``selling_slots`` (how many selling ideas the batch may have, see
    selling_days): product subjects only fill those, the other subjects the
    awareness ideas; None = no split. ``scores`` (learning.py
    subject_scores) brings the subjects that get engagement round more often."""
    subs = [s.strip() for s in subjects or [] if s and s.strip()]
    if not subs or count < 1:
        return []
    scores = scores or {}
    if selling_slots is None:
        return _rotate(subs, min(count, len(subs)), offset, scores)
    selling = [s for s in subs if is_selling_subject(s, product_names)]
    value = [s for s in subs if s not in selling] or subs  # only product subjects ticked
    out = _rotate(selling, min(selling_slots, count), offset, scores)
    return out + [s for s in _rotate(value, count, offset, scores) if s not in out][: count - len(out)]


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
    subjects: list[str] | None = None,
    selling_days: list[date] | None = None,
) -> list[dict]:
    """``week=True``: plan ideas spread over a week (app/weekly.py) rather
    than one day's batch — ``days`` are the plan days, and each idea comes
    back with the ``day`` (ISO date) it's for, or "" if the AI gave none.
    ``recent_pillars`` (newest first) lets a daily batch rotate pillars.
    ``selling_days`` (see selling_days()) caps the product posts: at most one
    per listed day, none when it's empty; None = no cap."""
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
                    brand_name, brand_lang, products, topic_source, count, voice_examples, learnings, days, recent_pillars, subjects,
                    selling_days,
                ),
            },
        ],
        model,
        # The budget covers the model's hidden reasoning too (~2.5k tokens
        # here) — at 4k it sometimes ran out before writing any JSON.
        max_tokens=10000,
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
        # Back to the person's exact wording (learning.py groups by it).
        said = str(idea.get("subject") or "").replace("[product]", "").strip().lower()
        subject = next((s for s in subjects or [] if s.strip().lower() == said), "")
        # Relatable ideas go out as a meme poster (app/meme.py).
        meme = idea.get("meme") if pillar == "relatable" else None
        meme = (
            {"top": str(meme.get("top") or "").strip()[:140], "scene": str(meme.get("scene") or "").strip()[:500]}
            if isinstance(meme, dict)
            else None
        )
        if meme and not (meme["top"] and meme["scene"]):
            meme = None
        # Topic posters (app/poster.py) — None when unusable, the post then gets a plain photo.
        poster = clean_poster(pillar, idea.get("poster"))
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
                "subject": subject.strip()[:80],
                "day": day if day in day_isos else "",
                "meme": meme,
                "poster": poster,
            }
        )
    if not cleaned:
        raise ContentAIError("AI service returned no usable ideas.")
    if selling_days is not None:
        cleaned = _keep_rhythm(cleaned, selling_days)

    # Self-eval filter: drop weakly-grounded ideas before they ever become a
    # Draft. If every idea in this batch fails the bar, keep the single
    # best-scoring one anyway rather than silently writing nothing today.
    survivors = [i for i in cleaned if i["fit_score"] >= MIN_FIT_SCORE]
    result = survivors or [max(cleaned, key=lambda i: i["fit_score"])]

    if khmer:
        # Every piece of Khmer a reader sees goes through the editor in one
        # call — captions, titles, meme text and poster lines — as a flat
        # list, put back in place by position afterwards.
        slots: list[tuple[dict, str, int | None]] = []
        for idea in result:
            slots += [(idea, "caption", None), (idea, "title", None)]
            if idea.get("meme"):
                slots.append((idea["meme"], "top", None))
            if p := idea.get("poster"):
                slots += [(p, k, None) for k in ("headline", "left_title", "right_title") if p[k]]
                slots += [(p, k, n) for k in ("points", "left", "right") for n in range(len(p[k]))]
        texts = [obj[key] if n is None else obj[key][n] for obj, key, n in slots]
        names = [brand_name, *(p.name for p in products)]
        polished = _polish_khmer(
            texts, model, voice_examples, khmer_only="english" not in (brand_lang or "").lower(), keep=names
        )
        for (obj, key, n), text in zip(slots, polished, strict=True):
            if n is None:
                obj[key] = text
            else:
                obj[key][n] = text
    return result


def _keep_rhythm(ideas: list[dict], allowed: list[date]) -> list[dict]:
    """Hold a batch to its selling days: the best-scoring selling ideas up to
    one per allowed day (moved onto a free allowed day if the AI put them
    elsewhere), the rest dropped — unless that would leave nothing at all."""
    free = [d.isoformat() for d in allowed]
    selling = sorted((i for i in ideas if i["pillar"] in SELLING_PILLARS), key=lambda i: -i["fit_score"])
    keep = []
    for idea in selling:
        if not free:
            break
        if idea["day"] not in free:
            idea["day"] = free[0]
        free.remove(idea["day"])
        keep.append(id(idea))
    out = [i for i in ideas if i["pillar"] not in SELLING_PILLARS or id(i) in keep]
    return out or ideas


def image_prompt_for_idea(brand_name: str, brand_lang: str, idea: dict, products: list[Product]) -> str:
    """A short image-generation brief for one already-written idea — grounded
    in the same product facts the idea itself was written from, used by
    app/content_scheduler.py's auto-media step."""
    from app.poster import CAMBODIA_PHOTO

    lines = [
        f"A scroll-stopping social media photo for {brand_name}, vertical 9:16.",
        CAMBODIA_PHOTO,
        f"Post topic: {idea.get('title', '')}.",
        f"Caption it goes with (for the idea only — show the moment it describes): {idea.get('caption', '')[:300]}",
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
