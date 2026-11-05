"""Writing the storyboard (write_script) — the template's prompt, the Khmer editor and the voice-line passes.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import json
import random
from app.images.canvas_layouts import look as canvas_look
from app.models import Brand, Product
from app.images.poster import brand_rgb

from typing import TYPE_CHECKING

from app.video.motion.common import MUSIC_MOODS, _line, log
from app.video.motion.templates.picture import PICTURE_ARTS, PICTURE_MAX, PICTURE_MIN, PICTURE_STORY, STICK_COLOR_DRAWS, STICK_DRAWS, clean_ink, clean_picture_cast
from app.video.motion.templates.podcast import clean_places
from app.video.motion.templates.lifestory import MAX_LIFE_PLACES, clean_hero
from app.video.motion.templates.presenter import _host_intro, clean_host, host_greeting
from app.video.motion.templates.parable import clean_duo
from app.video.motion.templates.dialogue import DIALOGUE_STYLES
from app.video.motion.templates.illustrated import clean_lead
from app.video.motion.templates.street3d import clean_street
from app.video.motion.templates.canvas import _clean_asks, _plain, apply_theme, asks_status, clean_theme
from app.video.motion.templates.custom import clean_look
from app.video.motion.screens import _shots_prompt, locate_targets
from app.video.motion.styles import NARRATOR_STYLES, SCREEN_STYLES, SELLING_STYLES, STYLES, TALL_ONLY_TYPES
from app.video.motion.own_script import LONG_STORY_SCENES, MAX_STORY_SCENES, STORY_RULES, _keep_own_voice, _missing_onscreen, _only_story_numbers, own_moments, own_scenes, own_voice, story_language
from app.video.motion.scenes import _TEXT_FIELDS, _cast_names, _clean_scene, clean_animals, clean_cast


# "Make one for me": no topic given — each press asks for another angle, so
# pressing again gives a different video, not the same one reworded.
AUTO_ANGLES = (
    "the everyday problem it solves",
    "3 clear benefits",
    "how it works, in 3 simple steps",
    "3 mistakes people make without it",
    "before and after using it",
    "a common belief about it, and the truth",
)


AUTO_LABEL = "✨ Topic chosen by the AI"


TEACH_ANGLES = (
    "a surprising number about it",
    "how small choices about it add up over time",
    "two people making different choices",
    "the mistake most people make with it",
    "what most people get wrong about it, and the truth",
)


def _auto_topic(products: list[Product], style: str = "tech") -> str:
    if style not in SELLING_STYLES:
        topic = (
            f"a topic around {products[0].name}"
            if len(products) == 1
            else "a topic around what this brand does"
            if products
            else "a useful everyday topic for this brand's customers"
        )
        if style == "custom":
            return (
                "THE VIDEO IS ABOUT: no topic was given — choose it yourself: the most interesting thing to "
                f"show about {topic} right now — the product shown working when there are screenshots or "
                "products, else one useful idea. Stay within the product information."
            )
        if style == "trend":
            return (
                "THE VIDEO IS ABOUT: no topic was given — choose it yourself: what is changing in AI "
                f"and software that matters to this brand's customers ({topic}). Real trends only — never an ad."
            )
        if style == "pov":
            return (
                "THE VIDEO IS ABOUT: no topic was given — choose it yourself: one everyday moment "
                f"this brand's customers know too well ({topic}) — the one they would tag a friend on."
            )
        if style != "explainer":  # comparison / poll / quote: the template sets the angle
            return (
                f"THE VIDEO IS ABOUT: no topic was given — choose it yourself: {topic}. Pick what "
                "a Cambodian viewer would share, answer or want more of — never an ad."
            )
        return (
            "THE VIDEO IS ABOUT: no topic was given — choose it yourself. Teach "
            f"{topic}, told as {random.choice(TEACH_ANGLES)}. Pick what a Cambodian viewer "
            "would save and share — useful, surprising, never an ad."
        )
    angle = {"demo": "how it works, in 3 simple steps", "offer": "its offer and what you get"}.get(
        style
    ) or random.choice(AUTO_ANGLES)
    about = (
        f"the product {products[0].name}"
        if len(products) == 1
        else "the ONE product from the list that makes the most interesting video right now"
        if products
        else "the brand's main service"
    )
    return (
        "THE VIDEO IS ABOUT: no topic was given — choose it yourself. Make it about "
        f"{about}, told as {angle}. Pick the angle a Cambodian business owner would stop "
        "scrolling for, and stay strictly within the product information."
    )


NO_BRAND = (
    "(none — this video carries no brand: never add a company or brand name, logo or slogan of "
    "your own; a product or company the brief itself names may be mentioned as the brief does)"
)


def scenes_so_far(text: str) -> int:
    """How many scenes a storyboard's JSON has begun while it's still being
    written (streamed): the objects opened in its "scenes" list."""
    i = text.find('"scenes"')
    j = text.find("[", i) if i >= 0 else -1
    if j < 0:
        return 0
    depth = n = 0
    in_str = esc = False
    for ch in text[j + 1 :]:
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in "{[":
            n += depth == 0 and ch == "{"
            depth += 1
        elif ch in "}]":
            if depth == 0:
                break
            depth -= 1
    return n


def write_script(
    brand: Brand,
    products: list[Product],
    idea: str,
    language: str,
    learnings: str = "",
    moods: list[str] | None = None,
    style: str = "tech",
    job_id: int | None = None,
    seconds: int | None = None,
    shots: list[dict] | None = None,
    design: dict | None = None,
    wide: bool = False,
    voice: str = "",
    art: str = "",
    progress=None,
) -> dict:
    """The video's storyboard: one AI call, then for Khmer the same
    native-editor pass the captions get. {"scenes": [...]} — always starting
    with a hook and ending with a call to action. Raises ContentAIError.

    ``seconds`` = story mode: ``idea`` is the person's own story / script, to
    be followed scene by scene (keeping their sentences for the voice) at
    about that length — the storyboard they review before it's rendered."""
    from app.ai.content_ai import (
        ContentAIError,
        _chat,
        _fix_khmer_punctuation,
        _polish_khmer,
        writer_model,
    )

    # ``progress(step, n, total)``: the storyboard page's live line — "Writing scene 12 of about 40"
    say = progress or (lambda step, n=0, total=0: None)

    khmer = "khmer" in language.lower()
    model = writer_model(khmer)
    facts = (
        "\n".join(
            f"- {p.name}: {p.description or ''}"
            + (f" | highlights: {p.highlights}" if p.highlights else "")
            for p in products
        )
        or "(no product details — keep it about the topic, no specific claims)"
    )
    extra = STICK_DRAWS if art == "stickman" else STICK_COLOR_DRAWS if art == "stickcolor" else ""
    if (brand.voice_examples or "").strip():
        extra += (
            "\n\nTHE BRAND'S VOICE — its real posts, for tone and word choice only (never copy "
            "them):\n---\n" + brand.voice_examples.strip()[:2500] + "\n---"
        )
    if learnings.strip():
        extra += (
            "\n\nWHAT HAS WORKED FOR THIS BRAND (from its own results):\n"
            + learnings.strip()[:1500]
        )
    if moods:
        extra += (
            '\n\nBACKGROUND MUSIC: also return "mood" — the one that fits this story best: '
            + "; ".join(f"{m} ({MUSIC_MOODS[m]})" for m in moods)
            + "."
        )
    prompt, allowed, most, must = STYLES.get(style) or STYLES["tech"]
    if wide:
        allowed = tuple(t for t in allowed if t not in TALL_ONLY_TYPES)
        extra += (
            "\n\nTHIS VIDEO IS WIDE 16:9 — don't use "
            + ", ".join(f"`{t}`" for t in sorted(TALL_ONLY_TYPES))
            + " scenes."
        )
    own_colors = [c for c in (getattr(brand, "colors", None) or []) if isinstance(c, str)]
    if style == "canvas" and own_colors:
        extra += (
            "\n\nTHIS BRAND'S OWN COLOURS: "
            + ", ".join(own_colors)
            + ' — use "look": "brand" (the film in '
            "these colours) unless the brief asks for a different mood or names other colours."
        )
    if style in SCREEN_STYLES:
        extra += _shots_prompt(shots or [])
        if style == "appdemo":
            extra += "\n(In this template a `platform` scene shows one by its number in `shot`; with none, `shot` is 0 and a drawn app screen is shown.)"
        if design:
            extra += _design_prompt(design)
        if not shots:
            allowed = tuple(t for t in allowed if t != "screen")
        if len(shots or []) < 2:
            allowed = tuple(t for t in allowed if t != "stack")
    if style == "presenter":
        host = clean_host(None, khmer, voice)
        extra += (
            f'\n\nTHE HOST — return "host": {{name, gender}}. If the brief names the host (or asks for a '
            f'male / female one), use that; otherwise name "{host["name"]}", gender "{host["gender"]}". '
            f"THE GREETING (the hook's `say` starts with it, with her name and the brand): "
            f'"{host_greeting(host, brand.name, khmer)}"'
        )
    story = bool(seconds and idea.strip())
    extra += SCRIPT_CRAFT + (SCRIPT_CRAFT_STORY if story else "")
    if story:  # their own story: the video speaks its language, whatever the picker says
        language = story_language(idea, language)
        khmer = "khmer" in language.lower()
        model = writer_model(khmer)
    if story:
        count = max(5, min(MAX_STORY_SCENES, round(seconds / 6.5)))
        numbered = own_scenes(idea)
        if numbered:  # their own scene list — plus a scene for each moment a scene lists
            count = max(2, min(MAX_STORY_SCENES, numbered + own_moments(idea)))
        if style == "picture":
            # their own scene list: one picture per scene, none merged or dropped (a 12-scene
            # script came back as 6 — this count said 6 while the rule below said keep all 12);
            # else a picture holds ~20-30 s of the narration, not 6
            count = (
                max(2, min(PICTURE_MAX, numbered))
                if numbered
                else max(PICTURE_MIN, min(PICTURE_MAX, round(seconds / 25)))
            )
        most = count  # the person's story sets the length, not the template
        extra += (
            PICTURE_STORY.format(count=count, seconds=seconds)
            if style == "picture"
            else STORY_RULES.format(count=count, seconds=seconds)
        )
        if numbered:
            extra += (
                f"\nTHE SCRIPT IS WRITTEN SCENE BY SCENE ({numbered} numbered scenes): follow them in the same "
                "order — never merge two, never drop one (a scene whose visual doesn't fit a scene type is "
                "shown with the closest one). A numbered scene that lists several moments of its own "
                "(features one at a time, a reveal then its points) gets ONE scene per moment, in its "
                f"order; otherwise one scene. About {count} scenes in all. Its hook is scene 1; if the "
                "template needs a closing call to action, it is the last scene's own call to action or "
                "final line, not an extra scene. When a scene gives its own Voice line, "
                "`say` is THAT line, word for word — never write a voice line the script doesn't have, "
                "and never add the brand's name or a slogan it doesn't say. Its on-screen text stays "
                "exactly as written — every quoted line (On screen, Subtitle, features, final titles) is on "
                "screen. Sample content inside a screen (a typed caption, a chat, a name, a number) comes "
                "from THIS brief's subject — never an unrelated example (no coffee in a security film), "
                "and no made-up people's names."
            )
    target = count if story else 0

    def live(text: str) -> None:  # the scenes begun so far in the streamed answer
        n = scenes_so_far(text)
        if n:
            say(
                f"Writing scene {n}" + (f" of about {target}" if 0 < n <= target else ""),
                n,
                max(target, n),
            )

    say("Writing the storyboard…", 0, target)
    raw = _chat(
        [
            {"role": "system", "content": prompt + extra},
            {
                "role": "user",
                "content": f"BRAND: {brand.name or NO_BRAND}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\n"
                + (
                    f"THE VIDEO IS ABOUT: {idea.strip()[: 12000 if story else 4000]}"
                    if idea.strip()
                    else _auto_topic(products, style)
                ),
            },
        ],
        model,
        # AI design writes every layer of every scene — it needs more room
        # a long story (past LONG_STORY_SCENES scenes) needs the long budget too
        max_tokens=(32000 if count > LONG_STORY_SCENES or style == "canvas" else 16000)
        if story
        else (20000 if style == "canvas" else 9000),
        # A storyboard follows the template's recipe — it doesn't need long
        # reasoning; the default (medium) took 1-2 minutes on gpt-5-mini. The
        # Khmer editor pass after it still runs at high effort.
        effort="low",
        live=live if progress else None,
    )
    if story and own_scenes(idea):
        missing = _missing_onscreen(idea, raw)
        if missing:
            # their quoted on-screen lines are the brief's contract: one more pass with what's missing
            log.info(
                "storyboard: %d quoted line(s) missing — asking again: %s",
                len(missing),
                "; ".join(missing)[:200],
            )
            say(
                f"Adding {len(missing)} on-screen line{'s' if len(missing) != 1 else ''} the first draft missed…"
            )
            try:
                again = _chat(
                    [
                        {"role": "system", "content": prompt + extra},
                        {
                            "role": "user",
                            "content": f"BRAND: {brand.name or NO_BRAND}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\nTHE VIDEO IS ABOUT: {idea.strip()[:12000]}",
                        },
                        {
                            "role": "assistant",
                            "content": json.dumps(raw, ensure_ascii=False)[:60000],
                        },
                        {
                            "role": "user",
                            "content": "Your storyboard leaves out these on-screen lines of the script — each must be on screen, "
                            "character for character, in the scene where the script puts it (add a scene for a reveal or "
                            "a feature that has none):\n- "
                            + "\n- ".join(missing)
                            + "\nReturn the WHOLE storyboard again, same JSON.",
                        },
                    ],
                    model,
                    max_tokens=(32000 if count > LONG_STORY_SCENES or style == "canvas" else 16000),
                    effort="low",
                    live=live if progress else None,
                )
                if isinstance(again.get("scenes"), list) and len(
                    _missing_onscreen(idea, again)
                ) < len(missing):
                    raw = again
            except ContentAIError as exc:
                log.warning("storyboard: the second pass for missing lines failed: %s", exc)
    names = {p.name.strip().lower(): p.name for p in products}
    if style == "canvas":  # AI design's layouts are placed for the video's shape
        for r in raw.get("scenes") or []:
            if isinstance(r, dict):
                r["_wide"] = wide
    if len(allowed) == 1:  # a template with one scene type (Picture story's "shot"): a scene the
        # writer sent without its "type" is that one (Claude Sonnet left it out, 2026-11-05 — the
        # whole storyboard was thrown away)
        for r in raw.get("scenes") or []:
            if isinstance(r, dict) and not r.get("type"):
                r["type"] = allowed[0]
    scenes = [
        s
        for s in (_clean_scene(r, names) for r in (raw.get("scenes") or []) if isinstance(r, dict))
        if s and s["type"] in allowed
    ][: (MAX_STORY_SCENES + 2) if story else 14]
    if (
        style == "logodraw"
    ):  # Logo · Drawing: its one scene — the brand's name when the AI gave none
        draw = next((sc for sc in scenes if sc["type"] == "draw"), None) or {
            "type": "draw",
            "name": "",
            "tagline": "",
            "say": "",
        }
        draw["name"] = draw["name"] or _line(brand.name, 60)
        return {"scenes": [draw], "style": style, "language": language}
    if style == "canvas":
        # AI design: its own scenes in the brief's order (no hook / CTA types), and its checklist
        if len(scenes) < 2:
            log.warning(
                "AI design unusable: %d scenes back, %d kept",
                len(raw.get("scenes") or []),
                len(scenes),
            )
            raise ContentAIError("The AI didn't return a usable storyboard — try again.")
        r, g, b = brand_rgb(brand)
        theme_raw = raw.get("theme") if isinstance(raw.get("theme"), dict) else {}
        own = [c for c in (getattr(brand, "colors", None) or []) if isinstance(c, str)]
        theme = (
            canvas_look(
                theme_raw,
                own[0] if own else f"#{r:02x}{g:02x}{b:02x}",
                own[1] if len(own) > 1 else None,
                brand_default=bool(own),
            )
            if "look" in theme_raw or own
            else clean_theme(theme_raw, f"#{r:02x}{g:02x}{b:02x}")
        )
        if story:
            _keep_own_voice({"scenes": scenes}, idea)
        script = {
            "scenes": [apply_theme(sc, theme) for sc in scenes[: (count if story else most)]],
            "style": style,
            "asks": _clean_asks(raw.get("asks")),
            "theme": theme,
            "language": language,
        }
        if moods:
            script["mood"] = raw.get("mood") if raw.get("mood") in moods else moods[0]
        if khmer:  # the native editor polishes what the AI wrote — never the brief's quoted words
            quoted = {_plain(a.get("text")) for a in script["asks"] if a.get("text")}
            slots = [
                (L, k, n)
                for sc in script["scenes"]
                for L in sc["layers"]
                for k, n in (("text", 120), ("title", 50))
                if L.get(k)
                and _plain(L[k]) not in quoted
                and not any(q and q in _plain(L[k]) for q in quoted)
            ]
            if slots:
                say("Polishing the Khmer words…")
                fixed = _polish_khmer(
                    [obj[key] for obj, key, _ in slots],
                    model,
                    voice_examples=brand.voice_examples or "",
                    khmer_only="english" not in (brand.lang or "").lower(),
                    keep=[brand.name, *(p.name for p in products)],
                    effort="low",
                )
                for (obj, key, n), value in zip(slots, fixed):
                    obj[key] = _line(_fix_khmer_punctuation(value), n)
        if not (story and own_voice(idea)):
            _report(job_id, stage="polish", scenes=_board(script), asks=asks_status(script))
            say("Making the voice lines flow as one story…")
            _narrate(script, brand, products, model, khmer, own=story, narrator=story)
        _report(job_id, stage="pictures", scenes=_board(script), asks=asks_status(script))
        return script
    # A hook first and a call to action last, whatever came back.
    hooks = [s for s in scenes if s["type"] == "hook"]
    ctas = [s for s in scenes if s["type"] == "cta"]
    middle = [s for s in scenes if s["type"] not in ("hook", "cta")]
    if style == "poll":  # an answer is revealed after its question, never before
        asked = False
        kept = []
        for sc in middle:
            asked = asked or sc["type"] == "options"
            if sc["type"] != "reveal" or asked:
                kept.append(sc)
        middle = kept
    middle = middle[:most]
    if (
        style == "picture" and len(scenes) >= 2
    ):  # Picture story: its pictures in order, first to last
        hooks, ctas, middle = [scenes[0]], [scenes[-1]], scenes[1:-1][: max(0, most - 2)]
    if story and len(scenes) >= 2 and not (hooks and ctas):
        # their own script needn't open on a "hook" or end on a "cta" scene
        # type (a grand reveal, a tagline): it is kept as written, in its order
        log.info(
            "storyboard: their script kept in its own order (%s)",
            ", ".join(s["type"] for s in scenes),
        )
        hooks, ctas, middle = [scenes[0]], [scenes[-1]], scenes[1:-1][:most]
    if (
        not hooks
        or not ctas
        or not middle
        or (must and not story and not any(s["type"] == must for s in middle))
    ):
        log.warning(
            "storyboard unusable (%s): %d scenes back (%s), hook %s, cta %s",
            style,
            len(raw.get("scenes") or []),
            ", ".join(str(x.get("type")) for x in (raw.get("scenes") or []) if isinstance(x, dict))[
                :300
            ],
            bool(hooks),
            bool(ctas),
        )
        raise ContentAIError("The AI didn't return a usable storyboard — try again.")
    # the language it's made in — a pasted script's own (story_language), which
    # can differ from the picker: the voice and the Khmer word breaks follow it
    script = {"scenes": [hooks[0], *middle, ctas[0]], "style": style, "language": language}
    if story:  # a chart / number the story never gave becomes a plain statement of that line
        script["scenes"] = [_only_story_numbers(s, idea, allowed) for s in script["scenes"]]
        _keep_own_voice(script, idea)
    if style == "cartoon":
        script["cast"], script["place"] = clean_cast(raw.get("cast")), _line(raw.get("place"), 400)
    if style in ("parable", "dialogue"):
        script["cast"] = clean_duo(raw.get("cast"))
    if style == "street3d":
        script["street"] = clean_street(raw)
    if style == "illustrated":
        script["cast"] = clean_lead(raw.get("cast"))
    if style == "picture":  # its people, its art style, the colours of its words
        script["cast"] = clean_picture_cast(raw.get("cast"))
        script["art"] = raw.get("art") if raw.get("art") in PICTURE_ARTS else "film"
        script["ink"] = clean_ink(None)
    if style == "reaction":
        script["cast"] = clean_animals(raw.get("cast"))
    if style == "presenter":
        script["host"] = clean_host(raw.get("host"), khmer, voice)
    if style == "lifestory":
        script["hero"] = clean_hero(raw.get("hero"), voice)
        script["places"] = clean_places(raw.get("places"), MAX_LIFE_PLACES)
        n = len(script["places"])  # a moment in a place that wasn't given: the first one
        for sc in script["scenes"]:
            if sc["type"] == "moment" and sc["place"] > max(1, n):
                sc["place"] = 1
    if style == "podcast":
        script["host"] = clean_host(None, khmer, voice)
        script["places"] = clean_places(raw.get("places"))
        n = len(
            script["places"]
        )  # a visit to a place that wasn't given: the first one (or none — a plain backdrop)
        for sc in script["scenes"]:
            if sc["type"] == "visit" and sc["place"] > max(1, n):
                sc["place"] = 1
    if style == "custom":
        r, g, b = brand_rgb(brand)
        script["look"] = clean_look(raw.get("look"), f"#{r:02x}{g:02x}{b:02x}")
        if design:  # their own app's design wins over the AI's guess
            script["look"] = {**script["look"], **design["look"]}
    if shots:
        script["scenes"] = [
            sc for sc in script["scenes"] if sc["type"] != "screen" or sc["shot"] <= len(shots)
        ]
        locate_targets(script["scenes"], shots)
    if moods:
        script["mood"] = raw.get("mood") if raw.get("mood") in moods else moods[0]
    _report(
        job_id,
        stage="polish" if khmer or not (story and own_voice(idea)) else "pictures",
        scenes=_board(script),
        look=script.get("look"),
    )

    if khmer:
        # Every line — on screen and spoken — through the native editor
        # (correct words, natural phrasing, names untouched), put back in place.
        slots: list[tuple[dict, str, int]] = []
        for s in script["scenes"]:
            slots += [
                (s, key, n) for key, n in _TEXT_FIELDS[s["type"]] if key in s
            ]  # optional ones (a meme's bubble) may be missing
            slots += [(m, "text", 140) for m in s.get("messages", [])]
            slots += [(i, "text", 80) for i in s.get("items", [])]
            slots += [(x, "label", 30) for x in s.get("tiles", [])]  # Collage · Studio's cards
            slots += [
                (p, "name", 40)
                for p in (s.get("left"), s.get("right"))
                if isinstance(p, dict) and "name" in p
            ]
            if s["type"] == "split":
                for p in (s["left"], s["right"]):
                    slots += [(p, "label", 40)] + [
                        (p["points"], k, 60) for k in range(len(p["points"]))
                    ]
            if s["type"] == "options":
                slots += [(s["options"], k, 50) for k in range(len(s["options"]))]
            slots += [(ser, "name", 40) for ser in s.get("series", [])]
            if s["type"] == "product":
                slots += [(s["chips"], k, 30) for k in range(len(s["chips"]))]
            if s["type"] == "offer":
                slots += [(s["features"], k, 50) for k in range(len(s["features"]))]
            slots += [(n, "text", 90) for n in s.get("notes", [])]
            slots += [(m, "label", 30) for m in s.get("metrics", [])]
            if s["type"] == "agenda":  # Slides
                slots += [(s["entries"], k, 70) for k in range(len(s["entries"]))]
            if s["type"] == "keypoints":
                slots += [
                    (b, key, n)
                    for b in s["blocks"]
                    for key, n in (("title", 40), ("text", 120))
                    if b.get(key)
                ]
            if s["type"] == "barchart":
                slots += [(d, "label", 24) for d in s["data"]]
            if s["type"] == "twocol":
                for c in s["cols"]:
                    slots += [(c, "label", 34)] + [
                        (c["items"], k, 90) for k in range(len(c["items"]))
                    ]
            if s["type"] == "roadmap":
                slots += [
                    (st, key, n)
                    for st in s["stages"]
                    for key, n in (("title", 30), ("text", 100))
                    if st.get(key)
                ]
            if s["type"] == "overload":  # AI service: the to-dos
                slots += [(s["tasks"], k, 40) for k in range(len(s["tasks"]))]
            if s["type"] == "crew":  # AI service: each worker's role and job
                slots += [
                    (a, key, n) for a in s["agents"] for key, n in (("role", 24), ("task", 60))
                ]
            if s["type"] == "pipeline":
                slots += [(s["input"], "label", 30)] + [(o, "label", 30) for o in s["outputs"]]
            if s["type"] == "plans":
                slots += [
                    (x, key, n)
                    for x in s["tiers"]
                    for key, n in (("name", 20), ("note", 40))
                    if x.get(key)
                ]
            if s["type"] == "checklist":
                slots += [(s["checks"], k, 90) for k in range(len(s["checks"]))]
            if s["type"] in ("sectors", "ransom"):  # Cybersecurity: the businesses, the losses
                slots += [(x, "label", 40) for x in s.get("sectors") or s.get("losses") or []]
            if (
                s["type"] == "takeaway"
            ):  # Life story: the lessons, the prop's words, the ledger's lines
                slots += [(s["checks"], k, 70) for k in range(len(s["checks"]))]
            if s["type"] == "moment" and s.get("prop"):
                slots += [(s["prop"], "label", 24)] + [
                    (x, "text", 30) for x in s["prop"].get("lines") or []
                ]
            if s["type"] == "ledger":
                slots += [(x, "label", 30) for x in s["lines"]] + (
                    [(s["total"], "label", 30)] if s.get("total") else []
                )
            slots += [
                (x, key, n)
                for x in s.get("points", [])
                for key, n in (("title", 40), ("text", 100))
                if x.get(key)
            ]
            if s.get("sub"):
                slots += [(s, "sub", 100)]
            slots += [(n, "label", 40) for n in s.get("nodes", [])]
            slots += [(x, "label", 24) for x in s.get("tags", [])]
            if isinstance(s.get("center"), dict) and s["center"].get("title"):
                slots += [(s["center"], "title", 40)]
            slots += [
                (x, key, 40)
                for x in s.get("cards", [])
                if isinstance(x, dict)
                for key in ("title", "sub")
                if x.get(key)
            ]
            if s["type"] == "phones":
                slots += [(s["words"], k, 20) for k in range(len(s["words"]))]
            if s["type"] == "gallery":
                slots += [(s["tabs"], k, 14) for k in range(len(s["tabs"]))]
            if s["type"] in (
                "fork",
                "shops",
            ):  # Parable: the two paths' signs; 3D · Street: the two shops
                slots += [(x, "label", 40) for x in s["sides"]]
        # Story mode: the voice lines are the person's own sentences — kept.
        slots = [
            x for x in slots if x[0][x[1]] and (x[1] != "say" or style in DIALOGUE_STYLES)
        ]  # the voice lines: voice_script_khmer
        say("Polishing the Khmer words…")
        fixed = _polish_khmer(
            [obj[key] for obj, key, _ in slots],
            model,
            voice_examples=brand.voice_examples or "",
            khmer_only="english" not in (brand.lang or "").lower(),
            keep=[
                brand.name,
                *(p.name for p in products),
                *([script["host"]["name"]] if script.get("host") else []),
                *_cast_names(script),
            ],
            # Story mode: only the short on-screen words are left to edit (the
            # voice lines are the person's own) — the quick pass; at high effort
            # it took a minute and more, while the person waited on the plan.
            effort="low" if story else "high",
        )
        for (obj, key, n), value in zip(slots, fixed):
            obj[key] = _line(_fix_khmer_punctuation(value), n)
        # every spoken line rewritten to be heard, not read (story mode: a light touch) —
        # not a dialogue's: each line is that person's own, polished above with the words;
        # nor a script that gives its own Voice lines: those are said word for word (as in
        # English, below — a pasted script's "ដល់ម៉ោង ៩" came back "ត្រឹមម៉ោង ៩")
        spoken = (
            [s for s in script["scenes"] if s.get("say")]
            if style not in DIALOGUE_STYLES and not (story and own_voice(idea))
            else []
        )
        if spoken:
            say("Making the voice lines sound natural…")
            shows = [screen for screen, _ in script_lines({"scenes": spoken})]
            for s, line in zip(
                spoken,
                voice_script_khmer(
                    [s["say"] for s in spoken],
                    model,
                    [
                        brand.name,
                        *(p.name for p in products),
                        *([script["host"]["name"]] if script.get("host") else []),
                        *_cast_names(script),
                    ],
                    brand.voice_examples or "",
                    own=story,
                    shows=shows,
                    narrator=story or style in NARRATOR_STYLES,
                ),
            ):
                s["say"] = line
        _report(job_id, stage="pictures", scenes=_board(script))
    elif not (story and own_voice(idea)) and style not in DIALOGUE_STYLES:
        # English: the same storyteller pass — the lines linked into one spoken story
        say("Making the voice lines flow as one story…")
        _narrate(script, brand, products, model, False, own=story, narrator=story)
        _report(job_id, stage="pictures", scenes=_board(script))
    if style == "presenter" and not (story and own_voice(idea)):
        _host_intro(script, brand.name, khmer)
    return script


# ── The voice script: every Khmer voice line rewritten to be SPOKEN ────────
# How a professional scriptwriter writes the video — every template's first
# draft follows it (write_script), on top of the template's own scene recipe.
SCRIPT_CRAFT = (
    "\n\nWRITE IT LIKE A PROFESSIONAL SCRIPTWRITER — a story the viewer follows, never a list of "
    "features read out:\n"
    "- ONE PERSON, ONE MOMENT: open on someone the viewer recognises in a real moment (the shop "
    "owner answering messages at 11 pm, a mum choosing between two prices) and follow them to the "
    'end. Concrete details — a time, a place, a thing in their hand — never "businesses today".\n'
    "- AN ARC: the hook (a tension felt in 3 seconds) → the struggle (concrete, felt) → the turn "
    "(the moment it changes — the product) → how it works, shown through what it does FOR that "
    "person → the payoff (their day now) → the close, which calls back to the opening image or "
    "line, plus one clear action.\n"
    "- LINKED SCENES: each line hands off to the next, so the viewer never feels a reset. Use the "
    'real bridges of speech: a question the next scene answers, a turn ("But…", "That\'s '
    'when…", "So…"), time moving on ("By Friday…"), a word picked up from the line before. '
    "Read all the `say` lines in a row before answering: they must sound like ONE voice telling ONE "
    "story; rewrite any line that starts from zero or could be cut without losing anything.\n"
    "- SHOW, DON'T LIST: one idea a scene; a feature appears only as what it does for the person "
    '("Her phone stays quiet at midnight — the replies are already sent"), never "Feature: …".\n'
    "- SCREEN AND VOICE WORK TOGETHER: the screen carries the headline or the keyword; the voice "
    "says what it MEANS — never read the screen out loud.\n"
    "- RHYTHM: vary the length — a short punchy line (3-6 words) at the turn, after a longer one; "
    "the rule of three once at most; one real question to the viewer.\n"
    "- WRITTEN TO BE HEARD: the voice acts out the punctuation, so punctuate like a director — a "
    "comma where a speaker breathes, a dash (—) before the reveal or the payoff, a full stop to "
    'land a short line, one "!" at most in the whole video (on the real high point). Write how '
    'people talk ("you\'ll", "it\'s", "here\'s the thing"), never how a brochure reads.\n'
    '- NO ADVERTISING CLICHÉS: never "in today\'s fast-paced world", "Are you tired of…", '
    '"look no further", "say goodbye to", "game-changer", "revolutionize", "take it '
    'to the next level", "unlock", "seamless".\n'
)


SCRIPT_CRAFT_STORY = (
    "\nTHE PERSON'S OWN WORDS WIN: use the craft above only to shape and link what they wrote — "
    "never to add a person, a moment or a claim their script doesn't have.\n"
)


VOICE_SCRIPT_EN_PROMPT = (
    "You are a senior scriptwriter for short brand films. Below is a short video: for each scene, "
    "what the viewer SEES on screen and a DRAFT of what the narrator says. Rewrite the narration "
    "into ONE spoken story told by one warm, confident voice — the lines must flow into each "
    "other, never sound like separate captions. Viewers HEAR it; they don't read it.\n"
    "\n"
    "RULES:\n"
    "1. ONE STORY: the opening moment → the problem → the turn (the product) → what it does for "
    "the person → how life feels now → the close that echoes the opening, then the action. Each "
    'line carries on from the one before; a bridge ("But…", "So…", "That\'s when…", a '
    "question answered next) starts at most a third of the lines.\n"
    "2. TALK ABOUT THEIR LIFE, NOT THE SCREEN: the picture already shows the words, the lists and "
    "the numbers — never read them out; say what they MEAN. At most one feature a line.\n"
    "3. PLAIN ENGLISH (CEFR A2-B1): common words, sentences of max 14 words, 1-2 a line; one short "
    "punchy line (3-6 words) at the turn; one real question somewhere. No idioms, slang or "
    "buzzwords (leverage, seamless, unlock, elevate, game-changer, next level, revolutionize).\n"
    "4. Keep every fact, number, price, brand and product name EXACTLY. Never add a claim, a "
    "number or a feature the drafts don't have.\n"
    "5. Each line still belongs to its scene (it plays while that scene is shown) and is about the "
    "same length as its draft (±30%). No brackets, emoji, lists or abbreviations.\n"
    'Return JSON {"lines": [...]} — one line per scene, the same number, in the same order.'
)


VOICE_SCRIPT_PROMPT = (
    "You are a Cambodian storyteller and voice-over writer. Below is a short video: for each scene, "
    "what the viewer SEES on screen and a DRAFT of what the narrator says. The drafts sound robotic — "
    "a feature list read out, each line on its own. Rewrite the narration as ONE story told by one "
    "real person talking to a friend — natural, warm, alive. Viewers HEAR it; they don't read it.\n"
    "\n"
    "RULES:\n"
    "1. ONE STORY, start to end: a moment the viewer knows (a person, a time of day, a feeling) → "
    "what goes wrong → the turn (the product) → how it feels after → what to do now. Each line "
    "follows from the one before it — read in order, it must sound like one person talking, never "
    "separate captions. A connector (ហើយ, ប៉ុន្តែ, អ៊ីចឹង, ពេលនោះ, ចុះបើ…) starts AT MOST a third of "
    "the lines; most lines simply carry on from the last thought, the way people really talk.\n"
    "2. TALK ABOUT THEIR LIFE, NOT THE SCREEN: the picture already shows the table, the board, the "
    'apps, the numbers — never describe or list them ("this table has name, product, status…"). '
    'Say what it MEANS for the viewer ("no more scrolling through chats to find who paid"). At '
    "most one feature named per line.\n"
    "3. Spoken Khmer, not written Khmer: the words a Phnom Penh presenter actually says. Drop "
    "formal, bookish constructions (stacked ការ… nouns, នៃ, ដែលជា, ក្នុងការ…, long noun chains). "
    "Particles where they fit (ណា, ហ្នឹង, ទេ, មែនទេ) — never forced.\n"
    "4. Sentences that flow: mostly 8-18 words, 1-3 per line; somewhere one short punchy line (3-6 "
    "words) and one real question to the viewer. Never a run of tiny fragments.\n"
    "5. Written the way good Khmer is written: words joined, a SPACE only where a sentence "
    "naturally pauses — between clauses, about every 6-12 words. End every sentence with ។, ! only "
    "where the voice lifts, ? only for a real question.\n"
    "6. Keep every fact, number, price, brand and product name EXACTLY (numbers may stay as "
    "digits). Never add a claim, a number or a feature the drafts don't have. No brackets, "
    "slashes, emoji, lists or abbreviations.\n"
    '7. Correct Khmer — real, common words only, each one MEANING what you intend ("important" '
    "is សំខាន់, never ចាំ). Before answering, re-read every line: any word that is rare, misspelt, "
    "made up or that a market seller wouldn't say — replace it with a plain common word.\n"
    '8. The viewer is បង — NEVER អ្នក ("you") anywhere. Khmer usually needs no "you" at all: '
    'leave it out ("សន្សំម៉ោងបានច្រើន", not "អ្នកសន្សំម៉ោង"); say បង only 2-3 times in the whole '
    'narration, never at the start of every line, never "បង," with a comma. អ្នក inside a word '
    "(អ្នកលក់, អ្នកទិញ) is fine.\n"
    "9. Each line still belongs to its scene (it plays while that scene is shown) and is about "
    "the same length as its draft (±30%).\n"
    'Return JSON {"lines": [...]} — one line per scene, the same number, in the same order.'
)


VOICE_SCRIPT_NARRATOR = (
    "\n\nA STORYTELLER NARRATES THIS (a lesson or the person's own story): rule 8 changes — "
    "speak to the audience the way the material does; អ្នក for everyone is fine here, as long as "
    "it stays the same through the whole narration. Keep the people's names exactly as written."
)


VOICE_SCRIPT_LIGHT = (
    "\n\nTHESE ARE THE PERSON'S OWN SCRIPT LINES: keep their meaning, their order and as much of "
    "their wording as you can — only make them speakable (shorter sentences, marked breaths, a "
    "formal word swapped for the spoken one where it reads stiffly)."
)


def voice_script_khmer(
    lines: list[str],
    model: str,
    keep: list[str],
    voice_examples: str = "",
    own: bool = False,
    shows: list[str] | None = None,
    narrator: bool = False,
) -> list[str]:
    """The Khmer voice lines rewritten as one spoken story (VOICE_SCRIPT_PROMPT)
    — ``shows`` is what each line's scene puts on screen, so the narration
    stops describing it. Best effort: on any failure the lines are kept."""
    from app.ai.content_ai import ContentAIError, _chat, _fix_khmer_punctuation

    if not lines:
        return lines
    system = (
        VOICE_SCRIPT_PROMPT
        + (VOICE_SCRIPT_LIGHT if own else "")
        + (VOICE_SCRIPT_NARRATOR if narrator else "")
    )
    if keep:
        system += "\n\nNames to copy EXACTLY as written: " + ", ".join(k for k in keep if k)
    if voice_examples.strip():
        system += (
            "\n\nHow this brand talks (its real posts — tone only):\n---\n"
            + voice_examples.strip()[:2000]
            + "\n---"
        )
    try:
        out = _chat(
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"scenes": [{"shows": sh, "draft": line} for sh, line in zip(shows, lines)]}
                        if shows and len(shows) == len(lines)
                        else {"lines": lines},
                        ensure_ascii=False,
                    ),
                },
            ],
            model,
            max_tokens=24000,
            # meaning and spelling matter more than speed — but their own story only
            # needs a light touch, and at high effort it kept them waiting minutes
            effort="medium" if own else "high",
        )
    except ContentAIError:
        return lines
    new = out.get("lines") if isinstance(out, dict) else None
    if not (
        isinstance(new, list)
        and len(new) == len(lines)
        and all(isinstance(x, str) and x.strip() for x in new)
    ):
        return lines
    fix = (lambda x: x) if narrator else _bong  # a storyteller may say អ្នក to everyone
    return [_line(fix(_fix_khmer_punctuation(x.strip())), 300) for x in new]


def voice_script_english(
    lines: list[str], model: str, keep: list[str], own: bool = False, shows: list[str] | None = None
) -> list[str]:
    """The English voice lines rewritten as one linked spoken story
    (VOICE_SCRIPT_EN_PROMPT) — the pass Khmer has always had. Best effort:
    on any failure the lines are kept."""
    from app.ai.content_ai import ContentAIError, _chat

    if not lines:
        return lines
    system = VOICE_SCRIPT_EN_PROMPT + (VOICE_SCRIPT_LIGHT if own else "")
    if keep:
        system += "\n\nNames to copy EXACTLY as written: " + ", ".join(k for k in keep if k)
    try:
        out = _chat(
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"scenes": [{"shows": sh, "draft": line} for sh, line in zip(shows, lines)]}
                        if shows and len(shows) == len(lines)
                        else {"lines": lines},
                        ensure_ascii=False,
                    ),
                },
            ],
            model,
            max_tokens=12000,
            effort="low",
        )
    except ContentAIError:
        return lines
    new = out.get("lines") if isinstance(out, dict) else None
    if not (
        isinstance(new, list)
        and len(new) == len(lines)
        and all(isinstance(x, str) and x.strip() for x in new)
    ):
        return lines
    return [_line(x.strip(), 300) for x in new]


def _narrate(
    script: dict, brand: Brand, products: list, model: str, khmer: bool, own: bool, narrator: bool
) -> None:
    """Every voice line rewritten as one linked spoken story, in place —
    Khmer (voice_script_khmer) or English (voice_script_english)."""
    spoken = [s for s in script["scenes"] if s.get("say")]
    if not spoken:
        return
    shows = [screen for screen, _ in script_lines({"scenes": spoken})]
    keep = [brand.name, *(p.name for p in products)]
    if khmer:
        new = voice_script_khmer(
            [s["say"] for s in spoken],
            model,
            keep,
            brand.voice_examples or "",
            own=own,
            shows=shows,
            narrator=narrator,
        )
    else:
        new = voice_script_english([s["say"] for s in spoken], model, keep, own=own, shows=shows)
    for s, line in zip(spoken, new):
        s["say"] = line


# អ្នក as part of a noun (seller, buyer, who, user, …) — never "you"; the rest of
# the time a voice line's អ្នក is "you", and our viewer is បង (VOICE_SCRIPT_PROMPT rule 8).
_ANAK_WORDS = (
    "ទាំង",
    "រាល់គ្នា",
    "លក់",
    "ទិញ",
    "ប្រើ",
    "គ្រប់គ្រង",
    "ជំនាញ",
    "ណា",
    "ផ្សេង",
    "ដទៃ",
    "ផលិត",
    "ធ្វើការ",
    "ស្រុក",
    "នាំ",
    "បើកបរ",
    "ដឹក",
    "ជិតខាង",
    "មាន",
    "ក្រ",
    "រៀន",
    "សិក្សា",
    "និពន្ធ",
    "បង្កើត",
    "គាំទ្រ",
    "ចូលរួម",
    "មើល",
    "តាមដាន",
    "ទទួល",
    "ផ្គត់ផ្គង់",
    "វិនិយោគ",
    "បម្រើ",
    "ជំនួញ",
    "អាជីវកម្ម",
    "ថែទាំ",
    "ច្នៃ",
    "រចនា",
    "ប្រកួត",
    "ដំណើរ",
    "ធានា",
    "កាសែត",
    "ឧបត្ថម្ភ",
    "ចាប់ផ្ដើម",
    "ចាប់ផ្តើម",
    "នយោបាយ",
    "ស្ម័គ្រចិត្ត",
)


def _bong(line: str) -> str:
    """អ្នក meaning "you" → បង; អ្នក in a noun (អ្នកលក់, អ្នកទិញ…) stays."""
    out, i = [], 0
    while (j := line.find("អ្នក", i)) >= 0:
        rest = line[j + 4 :]
        out.append(line[i:j] + ("អ្នក" if rest.startswith(_ANAK_WORDS) else "បង"))
        i = j + 4
    return "".join(out) + line[i:]


if TYPE_CHECKING:  # loaded after this module — app/video/motion/__init__.py binds these (_link)
    from app.video.motion.summary import _board, script_lines
    from app.video.motion.jobs import _report
    from app.video.motion.director import _design_prompt
