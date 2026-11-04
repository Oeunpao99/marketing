"""The storyboard endpoints (Review first): /plan, its status, ▶ voice preview, the estimate, checked_script.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import base64
import json
import threading
import time
import uuid
from app import billing
from app.canvas_layouts import look as canvas_look
from app.database import SessionLocal, get_db
from app.models import Brand, GenerationJob, Product, TeamMember, Video
from app.poster import brand_rgb
from app.tenancy import current_workspace_id, get_current_user, owned
from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.motion.common import _line, log, music_tracks, router
from app.motion.templates.logodraw import SILENT_STYLES
from app.motion.templates.picture import PICTURE_ARTS, PICTURE_MAX, PICTURE_SAY_MAX, alias_art, apply_alias, clean_ink, clean_picture_cast
from app.motion.templates.podcast import clean_places
from app.motion.templates.lifestory import MAX_LIFE_PLACES, clean_hero
from app.motion.templates.presenter import clean_host
from app.motion.templates.parable import clean_duo
from app.motion.templates.illustrated import clean_lead
from app.motion.templates.street3d import clean_street
from app.motion.templates.canvas import _clean_asks, apply_theme, clean_theme
from app.motion.templates.custom import clean_look
from app.motion.screens import brand_screens, describe_screen
from app.motion.styles import SCREEN_STYLES, STYLES, final_ratio
from app.motion.own_script import MAX_STORY_SCENES, STORY_MAX_S, estimate_seconds, own_design, story_seconds
from app.motion.scenes import _clean_scene, clean_animals, clean_cast
from app.motion.story import write_script
from app.motion.voiceover import spoken_text, voice_pronunciations
from app.motion.jobs import DOODLE_DRAWINGS, DOODLE_SKETCHES
from app.motion.director import _style_of, attached_shots, pick_style, reference_shot


# ── API ───────────────────────────────────────────────────────────────────
class MotionIn(BaseModel):
    brand_id: int
    # Long prompts are fine (e.g. one written for a filmed video) — the AI
    # reads the topic out of the first part of it. Empty: "Make one for me" —
    # the AI picks the topic itself (write_script).
    idea: str = Field(default="", max_length=20000)
    product_id: int | None = None
    language: str = "Khmer"
    # Narrator: "female", "male", "brand" (the brand's own voice,
    # app/voice_clone.py), or "none" for a silent video.
    voice: str = "female"
    # Background music under the video (when tracks are installed).
    music: bool = True
    # What the video is for: a content goal (app/goals.py), "sell", "teach", a
    # template name ("versus", "poll", "quote") or "auto" — style_for picks
    # the template.
    goal: str = "auto"
    # A storyboard the person reviewed (POST /ai/motion/plan, then edited):
    # made exactly as it is — no new script. {"style", "mood"?, "scenes": [...]}
    script: dict | None = None
    # "16:9" = a wide video — only the templates laid out for it (WIDE_STYLES);
    # every other template is always vertical 9:16.
    ratio: str = "9:16"
    # An attached screenshot of the brand's own app (a media URL): the design
    # the video copies, and screenshot 1 it can show.
    ref_url: str = Field(default="", max_length=500)
    # More screenshots attached with it (up to 6 in all) — screenshots 2, 3…
    ref_urls: list[str] = Field(default_factory=list, max_length=6)
    # False = "Subtitles: Off" — the voice-over without its words on screen (any language)
    subtitles: bool = True
    # False = "No logo": a video without the brand — no logo, name, colours,
    # photos or products (Unbranded), e.g. a script about another product
    branded: bool = True


class PlanIn(BaseModel):
    brand_id: int
    idea: str = Field(
        min_length=1, max_length=20000
    )  # their story / script (MotionIn takes it after)
    product_id: int | None = None
    language: str = "Khmer"
    goal: str = "auto"
    music: bool = True
    length: str = "auto"  # "auto" | "60" | "120" | "300" | "600" — any template (up to 10 minutes)
    ratio: str = "auto"  # "auto" (the director picks) | "9:16" | "16:9" — see final_ratio
    ref_url: str = Field(default="", max_length=500)  # see MotionIn
    ref_urls: list[str] = Field(default_factory=list, max_length=6)  # see MotionIn
    branded: bool = True  # see MotionIn


# Storyboards being written (POST /plan → GET /plan/{id}): the work runs in a
# thread because the AI steps together (director, storyboard, Khmer editor,
# voice director) can take longer than the proxy in front of us waits (100 s →
# a 524). {id: {"ws", "status": running|done|failed, "result" | "error", "at"}}
_plans: dict[str, dict] = {}


_PLAN_KEEP = 3600  # seconds a finished storyboard waits to be picked up


class Unbranded:
    """A brand with its branding taken off — the "No logo" choice, for a video
    about something else (another product, a client's script): no name, no
    colours, no past posts, no products; the rest (its workspace, its voice,
    its pronunciations) from the real one."""

    name = ""
    colors = ["#2F6FD6"]
    slug = "unbranded"
    voice_examples = ""
    unbranded = True

    def __init__(self, brand):
        self._brand = brand

    def __getattr__(self, key):
        return getattr(self._brand, key)


def _build_plan(payload: PlanIn, ws: int, user_id: int, on_style=None, progress=None) -> dict:
    """The storyboard itself — the slow part (several AI calls). ``on_style``
    hears the template picked (and why) as soon as it's decided, for the page;
    ``progress(step, n, total)`` each step (write_script)."""
    db = SessionLocal()
    try:
        brand = db.get(Brand, payload.brand_id)
        all_products = list(
            db.scalars(
                select(Product).where(Product.brand_id == brand.id).order_by(Product.name)
            ).all()
        )
        products = [p for p in all_products if p.id == payload.product_id] or all_products
        if not payload.branded:  # "No logo": nothing of the brand in it
            brand, products = Unbranded(brand), []
        style, why, suggested = (
            pick_style(
                payload.idea,
                products,
                payload.product_id is not None,
                bool(payload.ref_url),
                payload.ratio,
            )
            if payload.goal in ("auto", "")
            else (_style_of(payload.goal, payload.product_id), "", None)
        )
        if on_style:
            on_style(style, why)
        shape = final_ratio(payload.ratio, style, suggested)
        from app import usage

        # every template goes to 10 minutes — the plan's longest video caps it (app/usage.py)
        seconds = story_seconds(
            payload.idea, payload.length, min(STORY_MAX_S, usage.longest(db, ws))
        )
        r, g, b = brand_rgb(brand)
        ref, design = reference_shot(db, payload.ref_url, f"#{r:02x}{g:02x}{b:02x}")
        more = attached_shots(payload.ref_url, payload.ref_urls) if ref else []
        for shot in more:  # what each one shows, so the storyboard knows where it belongs
            shot["note"] = describe_screen(base64.b64decode(shot["uri"].split(",", 1)[1]))
        shots = (
            ([ref] if ref else [])
            + more
            + (brand_screens(db, brand.id) if style in SCREEN_STYLES and payload.branded else [])
        )
        db.rollback()  # no transaction held open through the AI calls
        script = write_script(
            brand,
            products,
            payload.idea,
            payload.language,
            "",
            list(music_tracks()) if payload.music else [],
            style,
            seconds=seconds,
            shots=shots,
            design=design,
            wide=shape == "16:9",
            art=alias_art(payload.goal),
            progress=progress,
        )
        apply_alias(script, payload.goal)
        script["ratio"] = shape
        # a script that designs its own film, put in a fixed template: the page offers AI design
        # Picture story paints each scene from the script's own visuals — never "use AI design" for it
        misfit = style not in ("canvas", "picture") and own_design(payload.idea)
        return {
            "script": script,
            "target_seconds": seconds,
            "estimate_seconds": estimate_seconds(script),
            "why": why,
            "misfit": misfit,
        }
    finally:
        db.close()


def _run_plan(plan_id: str, payload: PlanIn, ws: int, user_id: int, model: str = "") -> None:
    from app.content_ai import ContentAIError

    billing.bind(
        ws, user_id, model
    )  # the AI calls in this thread are charged to them (and use their pick)
    try:
        # the template and why, as soon as they're picked — the page shows its thinking
        result = _build_plan(
            payload,
            ws,
            user_id,
            on_style=lambda style, why: _plans[plan_id].update(style=style, why=why),
            # the live line, like the weekly plan's: "Writing scene 12 of about 40"
            progress=lambda step, n=0, total=0: _plans[plan_id].update(
                step=step, **({"n": n, "total": total} if n or total else {})
            ),
        )
        _plans[plan_id].update(status="done", result=result)
    except ContentAIError as exc:
        _plans[plan_id].update(status="failed", error=str(exc))
    except Exception:  # noqa: BLE001 — the page shows it instead of waiting forever
        log.exception("storyboard %s failed", plan_id)
        _plans[plan_id].update(
            status="failed",
            error="The storyboard couldn't be written just now — try again in a moment.",
        )


@router.post("/plan")
def plan_motion(
    payload: PlanIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Start writing the storyboard for the person's own story — to review and
    edit before anything is voiced or rendered (POST /ai/motion with
    ``script``). Answers at once with an id; GET /plan/{id} until it's done."""
    owned(db, Brand, payload.brand_id, ws)
    if payload.product_id is not None:
        owned(db, Product, payload.product_id, ws)
    billing.require(ws, 0.0, db)
    from app import usage

    usage.check_length(db, ws, payload.length, story_seconds(payload.idea, "auto", STORY_MAX_S))
    now = time.time()
    for k in [k for k, v in _plans.items() if now - v["at"] > _PLAN_KEEP]:
        _plans.pop(k, None)
    plan_id = uuid.uuid4().hex
    _plans[plan_id] = {"ws": ws, "status": "running", "at": now}
    threading.Thread(
        target=_run_plan,
        args=(plan_id, payload, ws, user.id, billing.requested_model()),
        daemon=True,
        name=f"plan-{plan_id[:8]}",
    ).start()
    return {"plan_id": plan_id, "status": "running"}


@router.get("/voice-status")
def voice_status(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Whether the Gemini voice reads Khmer right now — the composer says so
    before a video is made, and who reads instead (Sreymom / Piseth). Counts
    the workspace's own Gemini key."""
    from app import gemini_keys, speech

    speech.use_workspace_key(gemini_keys.workspace_key(db, ws))
    return speech.gemini_status()


@router.get("/making/{job_id}")
def making(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """A Remotion video's "How it was made": the brief, and — for videos made
    since it's kept — the template, voice and every scene with its voice clip.
    Older videos have only the brief and the storyboard text (``making`` null)."""
    job = owned(db, GenerationJob, job_id, ws, "Generation job")
    brief, _, board = (job.prompt or "").partition("\n\nREMOTION STORYBOARD:\n")
    video = db.get(Video, job.video_id) if job.video_id else None
    return {
        "brief": brief.strip(),
        "storyboard": board.strip(),
        "making": json.loads(job.making) if job.making else None,
        "video": {"url": video.url, "seconds": video.duration_seconds} if video else None,
    }


@router.get("/plan/{plan_id}")
def plan_status(plan_id: str, ws: int = Depends(current_workspace_id)):
    """The storyboard once it's written: {"status": "running"} meanwhile,
    {"status": "done", "script", …} or {"status": "failed", "error"}."""
    job = _plans.get(plan_id)
    if not job or job["ws"] != ws:
        raise HTTPException(404, "This storyboard isn't here any more — write it again.")
    if job["status"] == "running":
        # what the AI has decided so far (the template and why) — the card shows it
        return {
            "status": "running",
            "style": job.get("style"),
            "why": job.get("why") or "",
            "step": job.get("step") or "",
            "n": job.get("n") or 0,
            "total": job.get("total") or 0,
        }
    if job["status"] == "failed":
        return {
            "status": "failed",
            "error": job.get("error") or "The storyboard couldn't be written.",
        }
    return {"status": "done", **job["result"]}


class SayIn(BaseModel):
    brand_id: int
    text: str = Field(min_length=1, max_length=PICTURE_SAY_MAX)  # a Picture story line can be long
    language: str = "Khmer"
    voice: str = "female"
    # the storyboard's template: Gemini acts the line the way the video will
    style: str = Field(default="", max_length=30)


@router.post("/say")
def say_line(
    payload: SayIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """One voice line read aloud (MP3), exactly as the video will say it —
    the storyboard's ▶ button, to hear a line before the video is made."""
    from app import speech, voice_clone

    brand = owned(db, Brand, payload.brand_id, ws)
    from app import gemini_keys

    tally = speech.use_workspace_key(
        gemini_keys.workspace_key(db, ws)
    )  # Khmer: ours, then theirs, then Azure
    narrator, clone = voice_clone.narrator_for(
        brand,
        payload.language,
        payload.voice if payload.voice != "none" else "female",
        payload.style or None,
    )
    if not narrator:
        raise HTTPException(503, "No voice service is set up on this server.")
    billing.require(ws, 0.0, db)
    text, _pieces = spoken_text(
        payload.text, voice_pronunciations(narrator, [payload.text], brand.pronunciations or [])
    )
    try:
        mp3, _words = speech.speak_timed(text, narrator)
        if clone:
            mp3 = voice_clone.convert(mp3, clone)
    except Exception as exc:  # noqa: BLE001 — the details are for the log, not the person
        log.warning("voice preview failed (%s): %s", narrator, exc)
        raise HTTPException(
            502, "That line couldn't be read just now — try again in a moment."
        ) from exc
    if (
        not narrator.startswith(("local:", "kokoro:")) and not tally["chars"]
    ):  # the local voices and their own key cost us nothing
        billing.charge(
            ws,
            "video",
            len(payload.text) * speech.price_per_char(narrator),
            user_id=user.id,
            model=narrator,
            note="Voice preview",
        )
    return Response(content=mp3, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


class EstimateIn(BaseModel):
    brand_id: int
    language: str = "Khmer"
    voice: str = "female"
    script: dict


PICTURE_GUESS = 0.02  # one AI picture, before any has been charged here


_picture_price: list = [0.0, 0.0]  # [price, when measured]


def picture_price(db: Session) -> float:
    """What one AI picture costs now: the average of the last 100 picture charges
    (any workspace), measured at most every 10 minutes — PICTURE_GUESS before any."""
    from app.models import CreditEntry

    if time.time() - _picture_price[1] > 600:
        recent = (
            select(CreditEntry.amount_usd)
            .where(CreditEntry.kind == "image", CreditEntry.amount_usd < 0)
            .order_by(CreditEntry.id.desc())
            .limit(100)
        )
        avg = db.scalar(select(func.avg(-recent.subquery().c.amount_usd)))
        _picture_price[:] = [float(avg) if avg else PICTURE_GUESS, time.time()]
    return _picture_price[0]


def pictures_to_paint(script: dict) -> int:
    """How many AI pictures making this storyboard paints (_make's doodle steps)."""
    from app import doodle

    style, scenes = script.get("style"), script.get("scenes") or []
    asked = sum(1 for sc in scenes if sc.get("draw") and not sc.get("image"))
    if style == "picture":
        return min(asked, PICTURE_MAX)
    if style == "doodle":
        return min(asked, DOODLE_SKETCHES)
    if style in ("presenter", "deck", "aiteam"):
        return min(asked, DOODLE_DRAWINGS)
    if style == "canvas":  # vector pictures (the default) are priced like a painted one
        pics = (script.get("theme") or {}).get("pictures")
        most = (
            doodle.MAX_PICTURES
            if pics == "sketch"
            else doodle.MAX_PAINTED
            if pics == "flat"
            else doodle.MAX_VECTORS
        )
        return min(
            most,
            sum(
                1
                for sc in scenes
                for L in sc.get("layers") or []
                if L.get("draw") and not L.get("src")
            ),
        )
    if style == "reaction":
        return len(script.get("cast") or []) + min(asked, doodle.MAX_MEME_PHOTOS)
    if style in ("podcast", "lifestory"):
        return len(script.get("places") or [])
    if style == "cartoon":
        return 1 if script.get("place") else 0
    return 0


@router.post("/estimate")
def estimate(
    payload: EstimateIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """About what "Make the video" will use, before it's pressed: the voice (every
    spoken line × the voice's price) and the AI pictures it paints — and what the
    workspace has left. In dollars; the page shows credits."""
    from app import gemini_keys, speech, voice_clone

    owned(db, Brand, payload.brand_id, ws)  # their own brand only
    speech.use_workspace_key(gemini_keys.workspace_key(db, ws))
    style = payload.script.get("style") or None
    chars = sum(len(str(sc.get("say") or "").strip()) for sc in payload.script.get("scenes") or [])
    narrator = None
    if payload.voice != "none" and chars:
        # the brand's own voice costs what its base voice does (turning it into theirs is free)
        narrator, _clone = voice_clone.narrator_for(
            None, payload.language, "female" if payload.voice == "brand" else payload.voice, style
        )
    voice_usd = (
        0.0
        if not narrator or narrator.startswith("local:")
        else chars * speech.price_per_char(narrator)
    )
    pictures = pictures_to_paint(payload.script)
    pictures_usd = pictures * picture_price(db)
    return {
        "voice": round(voice_usd, 6),
        "pictures": round(pictures_usd, 6),
        "picture_count": pictures,
        "total": round(voice_usd + pictures_usd, 6),
        "available": billing.balance(db, ws)["available"],
    }


def checked_script(raw: dict, products: list[Product]) -> dict:
    """A storyboard sent back by the page, cleaned scene by scene like the
    AI's own (lengths, icons, numbers) — the person may have edited it."""
    from app.content_ai import ContentAIError

    style = raw.get("style") if raw.get("style") in STYLES else "explainer"
    _prompt, allowed, _most, _must = STYLES[style]
    names = {p.name.strip().lower(): p.name for p in products}
    scenes = [
        sc
        for sc in (
            _clean_scene(r, names)
            for r in (raw.get("scenes") or [])[: MAX_STORY_SCENES + 2]
            if isinstance(r, dict)
        )
        if sc and sc["type"] in allowed
    ]
    if len(scenes) < (1 if style in SILENT_STYLES else 2):  # Logo · Drawing is one scene
        raise ContentAIError("The storyboard needs at least 2 scenes.")
    if style in SILENT_STYLES:  # its one scene, with the brand's name when the box was left empty
        scenes = scenes[:1]
    script = {"scenes": scenes, "style": style}
    if raw.get("language") in ("Khmer", "English"):
        script["language"] = raw["language"]
    if raw.get("ratio") in ("16:9", "9:16"):
        script["ratio"] = raw["ratio"]
    if style == "custom":
        script["look"] = clean_look(raw.get("look"), "#6366F1")
    if style == "cartoon":
        script["cast"], script["place"] = clean_cast(raw.get("cast")), _line(raw.get("place"), 400)
    if style in ("parable", "dialogue"):
        script["cast"] = clean_duo(raw.get("cast"))
    if style == "street3d":
        script["street"] = clean_street(
            raw.get("street") if isinstance(raw.get("street"), dict) else raw
        )
    if style == "illustrated":
        script["cast"] = clean_lead(raw.get("cast"))
    if style == "picture":
        script["cast"] = clean_picture_cast(raw.get("cast"))
        script["art"] = raw.get("art") if raw.get("art") in PICTURE_ARTS else "film"
        script["ink"] = clean_ink(raw.get("ink"))
    if style == "reaction":
        script["cast"] = clean_animals(raw.get("cast"))
    if style in ("presenter", "podcast"):
        script["host"] = clean_host(raw.get("host"), script.get("language", "Khmer") == "Khmer")
    if style == "podcast":
        script["places"] = clean_places(raw.get("places"))
    if style == "lifestory":
        script["hero"] = clean_hero(raw.get("hero"))
        script["places"] = clean_places(raw.get("places"), MAX_LIFE_PLACES)
    if style == "canvas":
        script["asks"] = _clean_asks(raw.get("asks"))
        t = raw.get("theme") if isinstance(raw.get("theme"), dict) else {}
        # a look from LOOKS keeps its name and its accent (the brand's colour, or the brief's)
        script["theme"] = (
            canvas_look(
                {
                    "look": t["name"],
                    "accent": t.get("a"),
                    "accent2": t.get("b") if t["name"] == "brand" else None,
                    "backgrounds": t.get("backgrounds"),
                    "pictures": t.get("pictures"),
                },
                "#3B82F6",
            )
            if t.get("name")
            else clean_theme(t)
        )
        script["scenes"] = [apply_theme(sc, script["theme"]) for sc in script["scenes"]]
    if raw.get("mood") in music_tracks():
        script["mood"] = raw["mood"]
    return script
