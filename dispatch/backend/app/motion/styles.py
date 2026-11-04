"""The template registry: STYLES (prompt, scene types, size, the must-have scene), wide / tall, goals → templates, aliases' guide, the director's template guide.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import random

from app.motion.templates.sell import SELL_PROMPT, TECH_TYPES
from app.motion.templates.teach import EXPLAINER_TYPES, TEACH_PROMPT
from app.motion.templates.versus import VERSUS_PROMPT, VERSUS_TYPES
from app.motion.templates.poll import POLL_PROMPT, POLL_TYPES
from app.motion.templates.logodraw import LOGODRAW_PROMPT, LOGODRAW_TYPES
from app.motion.templates.quote import QUOTE_PROMPT, QUOTE_TYPES
from app.motion.templates.testimonial import TESTIMONIAL_PROMPT, TESTIMONIAL_TYPES
from app.motion.templates.trend import TREND_PROMPT, TREND_TYPES
from app.motion.templates.pov import POV_PROMPT, POV_TYPES
from app.motion.templates.demo import DEMO_PROMPT, DEMO_TYPES
from app.motion.templates.offer import OFFER_PROMPT, OFFER_TYPES
from app.motion.templates.spotlight import SPOTLIGHT_PROMPT, SPOTLIGHT_TYPES
from app.motion.templates.productfx import PRODUCTFX_PROMPT, PRODUCTFX_TYPES
from app.motion.templates.appdemo import APPDEMO_PROMPT, APPDEMO_TYPES
from app.motion.templates.countdown import COUNTDOWN_PROMPT, COUNTDOWN_TYPES
from app.motion.templates.thisorthat import THISORTHAT_PROMPT, THISORTHAT_TYPES
from app.motion.templates.reviews import REVIEWS_PROMPT, REVIEWS_TYPES
from app.motion.templates.hottake import HOTTAKE_PROMPT, HOTTAKE_TYPES
from app.motion.templates.casestudy import CASESTUDY_PROMPT, CASESTUDY_TYPES
from app.motion.templates.faq import FAQ_PROMPT, FAQ_TYPES
from app.motion.templates.report import REPORT_PROMPT, REPORT_TYPES
from app.motion.templates.tips import TIPS_PROMPT, TIPS_TYPES
from app.motion.templates.clarity import CLARITY_PROMPT, CLARITY_TYPES
from app.motion.templates.launch import LAUNCH_PROMPT, LAUNCH_TYPES
from app.motion.templates.cyber import CYBER_PROMPT, CYBER_TYPES
from app.motion.templates.fintech import FINTECH_PROMPT, FINTECH_TYPES
from app.motion.templates.skylaunch import SKYLAUNCH_PROMPT, SKYLAUNCH_TYPES
from app.motion.templates.unveil import UNVEIL_PROMPT, UNVEIL_TYPES
from app.motion.templates.gridcards import GRID_PROMPT, GRID_TYPES
from app.motion.templates.techflow import TECHFLOW_PROMPT, TECHFLOW_TYPES
from app.motion.templates.neural_paper import NEURAL_PROMPT, NEURAL_TYPES, PAPER_PROMPT, PAPER_TYPES
from app.motion.templates.doodle import DOODLE_PROMPT, DOODLE_TYPES
from app.motion.templates.picture import PICTURE_MAX, PICTURE_PROMPT, PICTURE_TYPES, STYLE_ALIASES
from app.motion.templates.cartoon import CARTOON_PROMPT, CARTOON_TYPES
from app.motion.templates.reaction import REACTION_PROMPT, REACTION_TYPES
from app.motion.templates.studio import STUDIO_PROMPT, STUDIO_TYPES
from app.motion.templates.podcast import PODCAST_PROMPT, PODCAST_TYPES
from app.motion.templates.lifestory import LIFE_PROMPT, LIFE_TYPES
from app.motion.templates.presenter import PRESENTER_PROMPT, PRESENTER_TYPES
from app.motion.templates.lesson import LESSON_PROMPT, LESSON_TYPES
from app.motion.templates.parable import PARABLE_PROMPT, PARABLE_TYPES
from app.motion.templates.dialogue import DIALOGUE_PROMPT, DIALOGUE_TYPES
from app.motion.templates.illustrated import ILL_PROMPT, ILL_TYPES
from app.motion.templates.deck import DECK_PROMPT, DECK_TYPES
from app.motion.templates.aiteam import AITEAM_PROMPT, AITEAM_TYPES
from app.motion.templates.saashub import SAASHUB_PROMPT, SAASHUB_TYPES
from app.motion.templates.street3d import STREET_PROMPT, STREET_TYPES
from app.motion.templates.rise import RISE_PROMPT, RISE_TYPES
from app.motion.templates.canvas import CANVAS_PROMPT, CANVAS_TYPES
from app.motion.templates.showcase import SHOWCASE_PROMPT, SHOWCASE_TYPES
from app.motion.templates.training import TRAINING_PROMPT, TRAINING_TYPES
from app.motion.templates.custom import CUSTOM_PROMPT, CUSTOM_TYPES


# style → (story prompt, scene types, most scenes between the hook and the
# call to action, a scene type the story must have)
STYLES = {
    "tech": (SELL_PROMPT, TECH_TYPES, 8, None),
    "explainer": (TEACH_PROMPT, EXPLAINER_TYPES, 8, None),
    "versus": (VERSUS_PROMPT, VERSUS_TYPES, 7, None),
    "poll": (POLL_PROMPT, POLL_TYPES, 6, "options"),
    "quote": (QUOTE_PROMPT, QUOTE_TYPES, 3, "quote"),
    "testimonial": (TESTIMONIAL_PROMPT, TESTIMONIAL_TYPES, 7, "customer"),
    "trend": (TREND_PROMPT, TREND_TYPES, 6, "news"),
    "pov": (POV_PROMPT, POV_TYPES, 5, "notify"),
    "demo": (DEMO_PROMPT, DEMO_TYPES, 7, "step"),
    "offer": (OFFER_PROMPT, OFFER_TYPES, 5, "offer"),
    "spotlight": (SPOTLIGHT_PROMPT, SPOTLIGHT_TYPES, 5, "offer"),
    "productfx": (PRODUCTFX_PROMPT, PRODUCTFX_TYPES, 5, "offer"),
    "appdemo": (APPDEMO_PROMPT, APPDEMO_TYPES, 4, None),
    "showcase": (SHOWCASE_PROMPT, SHOWCASE_TYPES, 7, None),
    "launch": (LAUNCH_PROMPT, LAUNCH_TYPES, 7, None),
    "unveil": (UNVEIL_PROMPT, UNVEIL_TYPES, 6, None),
    "skylaunch": (SKYLAUNCH_PROMPT, SKYLAUNCH_TYPES, 6, None),
    "logodraw": (LOGODRAW_PROMPT, LOGODRAW_TYPES, 1, None),
    "fintech": (FINTECH_PROMPT, FINTECH_TYPES, 5, None),
    "cyber": (CYBER_PROMPT, CYBER_TYPES, 7, None),
    "gridcards": (GRID_PROMPT, GRID_TYPES, 5, "fanout"),
    "techflow": (TECHFLOW_PROMPT, TECHFLOW_TYPES, 6, None),
    "canvas": (CANVAS_PROMPT, CANVAS_TYPES, 12, "canvas"),
    "neural": (NEURAL_PROMPT, NEURAL_TYPES, 8, None),
    "paper": (PAPER_PROMPT, PAPER_TYPES, 8, None),
    "doodle": (DOODLE_PROMPT, DOODLE_TYPES, 7, "doodle"),
    "cartoon": (CARTOON_PROMPT, CARTOON_TYPES, 10, "talk"),
    "lesson": (LESSON_PROMPT, LESSON_TYPES, 8, "whiteboard"),
    "rise": (RISE_PROMPT, RISE_TYPES, 8, "climb"),
    "reaction": (REACTION_PROMPT, REACTION_TYPES, 3, None),
    "studio": (STUDIO_PROMPT, STUDIO_TYPES, 4, None),
    "presenter": (PRESENTER_PROMPT, PRESENTER_TYPES, 7, None),
    "podcast": (PODCAST_PROMPT, PODCAST_TYPES, 10, "visit"),
    "lifestory": (LIFE_PROMPT, LIFE_TYPES, 10, "moment"),
    "parable": (PARABLE_PROMPT, PARABLE_TYPES, 9, "tale"),
    "dialogue": (DIALOGUE_PROMPT, DIALOGUE_TYPES, 11, "line"),
    "street3d": (STREET_PROMPT, STREET_TYPES, 5, "shops"),
    "illustrated": (ILL_PROMPT, ILL_TYPES, 10, "wide"),
    "aiteam": (AITEAM_PROMPT, AITEAM_TYPES, 6, "crew"),
    "saashub": (SAASHUB_PROMPT, SAASHUB_TYPES, 6, "hub"),
    "picture": (PICTURE_PROMPT, PICTURE_TYPES, PICTURE_MAX, "shot"),
    "deck": (DECK_PROMPT, DECK_TYPES, 14, None),
    "clarity": (CLARITY_PROMPT, CLARITY_TYPES, 8, None),
    "countdown": (COUNTDOWN_PROMPT, COUNTDOWN_TYPES, 7, "rank"),
    "thisorthat": (THISORTHAT_PROMPT, THISORTHAT_TYPES, 6, "choice"),
    "reviews": (REVIEWS_PROMPT, REVIEWS_TYPES, 6, None),
    "tips": (TIPS_PROMPT, TIPS_TYPES, 7, "tip"),
    "hottake": (HOTTAKE_PROMPT, HOTTAKE_TYPES, 5, "take"),
    "casestudy": (CASESTUDY_PROMPT, CASESTUDY_TYPES, 6, "client"),
    "faq": (FAQ_PROMPT, FAQ_TYPES, 5, "qa"),
    "report": (REPORT_PROMPT, REPORT_TYPES, 5, None),
    "custom": (CUSTOM_PROMPT, CUSTOM_TYPES, 8, None),
    "training": (TRAINING_PROMPT, TRAINING_TYPES, 12, None),
}


# The templates laid out for 16:9 too (motion/src/training.jsx, saas.jsx wide scenes);
# every other template is always vertical. Scenes drawn only for a tall frame are
# left out of a wide video.
WIDE_STYLES = {
    "logodraw",
    "cyber",
    "picture",
    "deck",
    "aiteam",
    "saashub",
    "illustrated",
    "street3d",
    "dialogue",
    "parable",
    "podcast",
    "lifestory",
    "presenter",
    "neural",
    "paper",
    "doodle",
    "cartoon",
    "lesson",
    "rise",
    "training",
    "custom",
    "demo",
    "offer",
    "spotlight",
    "productfx",
    "trend",
    "pov",
    "showcase",
    "launch",
    "unveil",
    "skylaunch",
    "fintech",
    "gridcards",
    "techflow",
    "canvas",
    "clarity",
    "countdown",
    "thisorthat",
    "reviews",
    "tips",
    "hottake",
    "casestudy",
    "faq",
    "report",
}


TALL_ONLY_TYPES = {"problem", "chat", "product", "point"}


def final_ratio(asked: str, style: str, suggested: str | None = None) -> str:
    """The video's shape: "16:9" only for a template that has a wide layout —
    asked for, or the director's suggestion when the Size is Auto."""
    if style not in WIDE_STYLES:
        return "9:16"
    if style == "deck":  # slides are always wide
        return "16:9"
    if asked == "16:9":
        return "16:9"
    if asked == "auto":
        return (
            suggested
            if suggested in ("16:9", "9:16")
            else ("16:9" if style in ("training", "picture") else "9:16")
        )
    return "9:16"


SCREEN_STYLES = {
    "custom",
    "demo",
    "appdemo",
    "showcase",
    "launch",
    "unveil",
    "skylaunch",
    "clarity",
    "canvas",
    "reaction",
    "productfx",
}  # the stories that can show the brand's screenshots


# The templates that sell (the auto topic picks a product, not a teaching topic).
SELLING_STYLES = {
    "tech",
    "demo",
    "offer",
    "spotlight",
    "productfx",
    "street3d",
    "appdemo",
    "showcase",
    "launch",
    "unveil",
    "skylaunch",
    "fintech",
    "gridcards",
}


# Content goals (app/goals.py) → templates. A goal with several takes one at
# random per video, so a week's plan doesn't repeat the same look.
GOAL_STYLES = {
    "sell": ("tech",),
    "solution": (
        "tech",
        "demo",
        "custom",
        "showcase",
        "clarity",
        "gridcards",
        "cartoon",
        "appdemo",
        "aiteam",
        "saashub",
        "skylaunch",
    ),
    "conversion": (
        "offer",
        "spotlight",
        "productfx",
        "tech",
        "launch",
        "skylaunch",
        "fintech",
        "reviews",
        "casestudy",
        "unveil",
        "studio",
        "street3d",
        "saashub",
    ),
    "teach": ("explainer",),
    "education": (
        "explainer",
        "training",
        "custom",
        "clarity",
        "tips",
        "gridcards",
        "techflow",
        "neural",
        "paper",
        "doodle",
        "cartoon",
        "lesson",
        "presenter",
        "podcast",
        "parable",
        "illustrated",
        "lifestory",
    ),
    "reach": (
        "pov",
        "explainer",
        "countdown",
        "thisorthat",
        "hottake",
        "doodle",
        "cartoon",
        "lesson",
        "rise",
        "reaction",
        "podcast",
        "parable",
        "dialogue",
        "lifestory",
    ),
    "awareness": (
        "logodraw",
        "cyber",
        "trend",
        "custom",
        "clarity",
        "showcase",
        "report",
        "unveil",
        "canvas",
        "studio",
        "presenter",
        "illustrated",
        "aiteam",
        "saashub",
    ),
    "authority": ("versus", "report", "casestudy", "hottake", "clarity", "techflow", "cyber"),
    "engagement": ("poll", "thisorthat", "faq", "countdown", "hottake", "reaction", "dialogue"),
    "followers": (
        "quote",
        "explainer",
        "tips",
        "countdown",
        "hottake",
        "doodle",
        "lesson",
        "rise",
        "presenter",
        "podcast",
        "parable",
        "lifestory",
    ),
    "trust": ("testimonial", "reviews", "casestudy", "faq", "report", "cyber"),
}


def style_for(goal: str) -> str:
    """The template for a content goal; "auto" / unknown = explainer unless
    the brief is clearly a sale (the caller decides that with a product
    chosen). A template name itself ("versus", "poll", …) is taken as is."""
    goal = (goal or "").lower()
    if goal in STYLE_ALIASES:
        return STYLE_ALIASES[goal][0]
    return goal if goal in STYLES else random.choice(GOAL_STYLES.get(goal, ("explainer",)))


# The templates told by a narrator to everyone (not a shop talking to its customer, បង).
NARRATOR_STYLES = {
    "picture",
    "explainer",
    "training",
    "quote",
    "doodle",
    "lesson",
    "rise",
    "parable",
    "illustrated",
    "lifestory",
    "countdown",
    "tips",
    "hottake",
    "report",
}


# ── The director: Story "Auto" reads the brief and picks the template ──────
# What each template is for, in the words the director chooses by.
TEMPLATE_GUIDE = {
    "custom": "SaaS, software, an app, an AI tool, a platform (Power Apps, a CRM…), B2B tech — product UI, dashboards, flows, the brand's screenshots",
    "demo": "showing HOW to use a software product, step by step in an app window",
    "hottake": "a bold opinion about the industry — a common belief struck out, the take, agree or disagree",
    "casestudy": "one customer's story with numbers — their problem, what they did, before → after, their quote",
    "faq": "the questions customers ask, each answered — chat bubbles, the answer typing itself",
    "report": "numbers about the topic with their source — bars, a percent ring, a big number",
    "countdown": "a TOP 5 / ranked list of tips, mistakes, tools or ideas — counting down to the best one",
    "thisorthat": "A-or-B choices the audience answers in the comments — this or that, which one are you",
    "reviews": "social proof — real reviews, a rating, the customers who use it (only when the brief gives them)",
    "tips": 'practical tips people save — 3-5 numbered tip cards and a "save this" ask',
    "clarity": "explaining what a software product does and why it matters — calm, white and light blue: the mess of tools today, the product, how it works",
    "launch": 'launching a product or a new feature — a cinematic launch film: the one click that does the job, the product\'s screens, "now live"',
    "fintech": "a money product — a wallet or payment app, a bank card, crypto, savings, remittance — a black card in a burst of light with gold coins, a 3D wallet with its balances rising out",
    "cyber": "cybersecurity, IT security, an MSSP or SOC, network protection — a dark command room: the network as glowing lines on a turning globe, a hooded attacker blocked by the brand's shield, a live threat console, the SOC wall, a padlock closing",
    "logodraw": "a short logo intro — the brand's own logo drawn from scratch on a drafting grid, then filled in, with its name and a tagline; no voice",
    "skylaunch": "launching a SaaS, app or website with its REAL screen — a prompt box typing the request, the screen in a browser window with the camera flying in, a pointer clicking Publish, on bright sky-blue light",
    "unveil": "unveiling a product or a new feature in a light, elegant way — one big word, the app card coming into focus, a field typing itself, a check with confetti",
    "gridcards": "how a product or service solves an everyday problem — the repetitive work today, then one input becoming several results (a post, a price poster, a caption), clear and friendly",
    "techflow": "explaining HOW a technology works step by step (the internet, email, payments, AI, apps) — devices, data packets travelling, addresses, lookups, the path, a recap",
    "deck": "a slide deck / presentation (a pitch, a lesson, a report, a training, a plan) — clean slides with a cover, an agenda, key points, big numbers, charts, two columns, quotes, a roadmap and a closing slide, to present or download as a PDF",
    "aiteam": "introducing an AI-as-a-service — an AI product people subscribe to instead of hiring (an AI marketing team, assistant, bookkeeper, support agent): the work piling up, AI workers each doing a job, one input becoming finished work, the owner approving with one tap, results, plans and prices",
    "saashub": "introducing a modern SaaS platform / cloud suite / workflow automation service — scattered tool chaos, the central cloud hub connecting all apps, automated trigger flows, real-time ROI metrics dashboard, and simple subscription plans",
    "picture": "a narrated story told over full-screen AI pictures (a cinematic film still, a painted anime film, an illustration or a 3D film) with a short line of text on each — a motivational story, a true story, a documentary, a YouTube-style script read over pictures; long pasted scripts up to 10 minutes",
    "illustrated": "a calm documentary story of everyday Cambodian life in a muted hand-drawn look — one person through the market, a street of shophouses, a bank, home, the rice fields; close-ups of them with an ATM, a phone, money, a paper; explainers about money, banking, payments, health, work, a service in people's lives",
    "street3d": "a shop or business shown as the full one on its street, in real 3D — two shophouses side by side at dusk, the rival empty with its shutter half down, the brand's lit up with its name on the sign, people walking in, a number counting, customers' messages; for a café, a restaurant, a shop, a service that wants more customers",
    "dialogue": "two people really talking, each in their own voice — two friends, a seller and a customer, a boss and a worker, a parent and a child — short lines back and forth in an everyday Cambodian place, speech bubbles, a turn and a takeaway; a conversation, a sketch, a Q&A between two people",
    "parable": "a parable with a lesson — two people start the same (the same job, shop, money, chance) and choose differently; one stays stuck, the other gets ahead; told like a fable with two flat-cartoon villagers in Cambodian places, a number counting up, a split 'poor vs rich' moment, the moral; money, work, business, marketing, habits",
    "rise": "mindset / motivation — encouraging people to live their best life: small habits, a fresh start, believing in yourself; a person climbing stairs as night turns to sunrise",
    "lesson": "teaching one idea step by step with a cartoon teacher and a pointer stick at a whiteboard — the maths (a sum, bars), steps, a list — then 2-3 example people who do it differently; money, business, health, study",
    "cartoon": "a little story with two cartoon characters talking in one everyday place (a shop, a market, an office, home) — speech bubbles, thought clouds, a business or life problem and its fix, part 1 / part 2 series",
    "podcast": "a storytelling podcast episode — the host talks from a cosy studio desk with a mic, then the video cuts to the places the story happens (a park, a home office, a market) where the host acts it out; a personal story, a choice, a life / work / money lesson, told first person",
    "lifestory": "one person's money or life journey told as a warm animated story — a cartoon person in a krama in cosy Cambodian rooms: the salary envelope, the debts written in a notebook, a bill stamped PAID month by month, a calendar, savings growing in a jar, the lesson; budgeting, paying off debt, saving, a small business, a habit that changed things",
    "presenter": "the brand's own host presents a topic to camera — a friendly robot assistant in the brand's T-shirt at a desk greets ('Hi, I'm Kalyan, the brand's personal assistant'), brings today's topic and explains it point by point; daily tips, news, how-tos, explainers in a personal, talk-show way",
    "studio": "an elegant editorial showcase — big thin words on a soft light set, the brand's photos as a collage of cards, green vines and a stone column; for an academy / school, a design studio, a premium shop or service showing its work and inviting people in",
    "reaction": "a short funny reaction meme (8-20 s) — a relatable situation on screen (a screenshot, few followers, a customer asking 'price?'), a meme caption on top, cut-out cats / dogs popping their mouths or freezing in shock; for reach and shares",
    "doodle": "a self-improvement / mindset / life lesson told calmly (overthinking, habits, money, stress, work, relationships) — grid paper, a bold Khmer headline with orange key words, a hand-drawn sketch of the feeling in every scene",
    "paper": "an AI / tech concept explained simply on graph paper (what is machine learning, deep learning, an API…) — editorial, navy and orange, icons and maths floating around",
    "neural": "a tech or AI explainer / lesson / history with a motivating message — a big question, before vs after with AI, a timeline, two people who chose differently, a quote to remember",
    "canvas": "a brief that asks for its OWN look or scenes — an event / LED-screen film, a cinematic launch with acts and colours of its own, or anything no template fits: the AI designs every scene",
    "showcase": "a bright, polished promo / launch video for a SaaS or app — the tools it connects, its table and board views, who it is for",
    "training": "a team training, an internal presentation, a workshop, a lesson or a long talk with parts / sections — chapters, key points, checklists, recap",
    "explainer": "a story with people — characters with feelings (stick figures), everyday life, money and life lessons, a tale that teaches",
    "testimonial": "a customer's story or case study — who they are, before → after, their result",
    "tech": "selling a product or service of a shop / business — the problem, the product working, proof, buy now",
    "offer": "a promotion, a price, a discount, a package — one clear offer and action",
    "appdemo": "a mobile app shown like a bank / fintech launch film — soft glassy 3D, its screens as cards fanned in space, a tilted phone floating with the app's own screenshot on it, a big warm headline; for an app, a wallet, a booking or delivery app",
    "productfx": "one physical product, its real photo cut out and floating over bold shape effects — a colour blob, a burst of rings and splashes, callouts to 3 features, a spinning price badge, one action; for paint, a drink, cosmetics, a gadget, any product with a photo (brand kit or attached)",
    "spotlight": "a physical product shown like a launch film — its photo on a real 3D box turning under a spotlight, 3 reasons to want it, its price card, one action; for a drink, snack, cosmetic, gadget or any product with a photo in the brand kit",
    "versus": "a comparison — old way vs new way, option A vs B, myths vs facts",
    "poll": "a quiz or questions for the audience to answer in the comments",
    "quote": "inspiring quotes or short lessons worth following",
    "trend": "news — what's new in AI / tech / the industry and what it means (NOT a lesson or a how-to — those are training or explainer)",
    "pov": 'a funny or relatable everyday moment ("POV: …") people tag friends on',
}
