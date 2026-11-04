"""Making the video: POST /ai/motion, the weekly plan's make_motion, and _make (script → pictures → voice → render).

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import json
import subprocess
import threading
from app.billing import billing
from app.core.database import SessionLocal, get_db
from app.storage.media import read_media, store_blob
from app.models import Brand, GenerationJob, Product, TeamMember, Video
from app.images.poster import brand_rgb
from app.core.tenancy import current_workspace_id, get_current_user, owned
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from typing import TYPE_CHECKING

from app.video.motion.common import log, music_tracks, not_ready, router
from app.video.motion.templates.logodraw import SILENT_STYLES
from app.video.motion.templates.picture import PICTURE_MAX, alias_art, apply_alias
from app.video.motion.templates.dialogue import DIALOGUE_STYLES, dialogue_voices
from app.video.motion.screens import brand_screens, describe_screen
from app.video.motion.styles import SCREEN_STYLES, final_ratio
from app.video.motion.own_script import STORY_MAX_S, estimate_seconds, story_seconds
from app.video.motion.story import AUTO_LABEL, write_script
from app.video.motion.summary import _board, making_of, script_lines
from app.video.motion.props import _brand_pictures, _data_uri, build_props, length_of, pick_pictures
from app.video.motion.voiceover import add_voice
from app.video.motion.jobs import DOODLE_SKETCHES, Stopped, _check, _finish_doodles, _progress, _report, _start_doodles, _stopped, share_post_picture
from app.video.motion.rendering import refuse_if_busy, render
from app.video.motion.review import _sketch, review_design
from app.video.motion.director import _shot_from_blob, _style_of, attached_shots, pick_style, reference_shot
from app.video.motion.plan import MotionIn, Unbranded, checked_script


@router.post("", status_code=201)
def create_motion(
    payload: MotionIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Start a motion video; the page polls GET /ai/video/{id}."""
    from app.video.video import _out

    reason = not_ready()
    if reason:
        raise HTTPException(503, f"Motion videos aren't set up on this server yet. {reason}")
    owned(db, Brand, payload.brand_id, ws)
    if payload.product_id is not None:
        owned(db, Product, payload.product_id, ws)
    billing.require(ws, 0.0, db)
    from app.billing import usage

    # how long it will run: the reviewed storyboard's estimate, else the brief's
    plan_s = (
        estimate_seconds(payload.script)
        if payload.script and payload.script.get("scenes")
        else min(story_seconds(payload.idea or "", "auto", STORY_MAX_S), usage.longest(db, ws))
    )
    units = usage.video_units(plan_s)
    usage.require_video(db, ws, units, plan_s if payload.script else None)
    refuse_if_busy(db, "motion")
    job = GenerationJob(
        workspace_id=ws,
        user_id=user.id,
        brand_id=payload.brand_id,
        kind="motion",
        prompt=payload.idea.strip(),
        aspect_ratio="16:9"
        if payload.ratio == "16:9"
        else "9:16",  # "auto": set once the template is known
        seconds=0,
        provider="remotion",
        status="queued",
        units=units,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    threading.Thread(
        target=_make,
        args=(
            job.id,
            payload.product_id,
            payload.language,
            payload.voice,
            "",
            payload.music,
            payload.goal,
            payload.script,
            payload.ratio,
            payload.ref_url,
            billing.requested_model(),
        ),
        kwargs={
            "ref_urls": payload.ref_urls,
            "branded": payload.branded,
            "subtitles": payload.subtitles,
        },
        daemon=True,
        name=f"motion-{job.id}",
    ).start()
    return _out(job, None)


def make_motion(
    brand_id: int,
    idea: str,
    language: str,
    voice: str = "female",
    product_id: int | None = None,
    caption: str = "",
    goal: str = "auto",
) -> int | None:
    """Make one motion video now (blocking, 1-3 min) — the weekly plan's
    video posts. Recorded as a generation like any other, so it's in the
    Library too; ``caption`` (the post's) becomes the Library caption.
    Returns the Video id, or None when it couldn't be made."""
    if not_ready():
        return None
    db = SessionLocal()
    try:
        brand = db.get(Brand, brand_id)
        from app.billing import usage

        # the plan's videos this month: used up → the post goes out without its video
        try:
            usage.require_video(db, brand.workspace_id, 1)
        except HTTPException as exc:
            log.info(
                "weekly plan video skipped for workspace %s: %s", brand.workspace_id, exc.detail
            )
            return None
        job = GenerationJob(
            workspace_id=brand.workspace_id,
            brand_id=brand_id,
            kind="motion",
            prompt=idea.strip()[:20000],
            aspect_ratio="9:16",
            seconds=0,
            provider="remotion",
            status="queued",
            units=1,
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()
    _make(job_id, product_id, language, voice, caption, True, goal)
    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        return job.video_id if job is not None and job.status == "succeeded" else None
    finally:
        db.close()


def _make(
    job_id: int,
    product_id: int | None,
    language: str,
    voice: str = "none",
    caption: str = "",
    music: bool = True,
    goal: str = "auto",
    reviewed: dict | None = None,
    ratio: str = "9:16",
    ref_url: str = "",
    model: str = "",
    ref_urls: list[str] | None = None,
    branded: bool = True,
    subtitles: bool = True,
) -> None:
    from app.ai.content_ai import ContentAIError
    from app.video.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        billing.bind(
            job.workspace_id, job.user_id, model
        )  # the script is an AI call — written by the model they picked
        job.status = "running"
        db.commit()
        _report(job_id, stage="story")  # also marks the job as alive in this process (video._tick)
        brand = db.get(Brand, job.brand_id)
        all_products = list(
            db.scalars(
                select(Product).where(Product.brand_id == brand.id).order_by(Product.name)
            ).all()
        )
        # A chosen product: the script is about it alone.
        products = (
            [p for p in all_products if p.id == product_id] or all_products
            if product_id is not None
            else all_products
        )
        try:
            from app.ai.learning import brand_learnings

            learned = brand_learnings(db, brand.id).get("prompt") or ""
        except Exception:  # noqa: BLE001 — a video without learnings beats no video
            learned = ""
        if not branded:  # "No logo": nothing of the brand in it
            brand, all_products, products, learned, product_id = Unbranded(brand), [], [], "", None
        try:
            _check(job_id)
            moods = list(music_tracks()) if music else []
            if reviewed:
                # The storyboard the person reviewed — made as it is.
                script = checked_script(reviewed, all_products)
                if not music:
                    script.pop("mood", None)
                elif "mood" not in script and moods:
                    script["mood"] = moods[0]
                _report(
                    job_id,
                    stage="pictures",
                    style=script["style"],
                    scenes=_board(script),
                    look=script.get("look"),
                )
            else:
                if goal in ("auto", "") and job.prompt.strip():
                    style, why, suggested = pick_style(
                        job.prompt, products, product_id is not None, bool(ref_url), ratio
                    )
                else:
                    style, why, suggested = _style_of(goal, product_id), "", None
                shape = final_ratio(ratio, style, suggested)
                _report(job_id, stage="story", style=style, why=why)
                r, g, b = brand_rgb(brand)
                ref, design = reference_shot(db, ref_url, f"#{r:02x}{g:02x}{b:02x}")
                more = attached_shots(ref_url, ref_urls) if ref else []
                for shot in more:  # what each one shows, so the storyboard knows where it belongs
                    shot["note"] = describe_screen(base64.b64decode(shot["uri"].split(",", 1)[1]))
                shots = (
                    ([ref] if ref else [])
                    + more
                    + (brand_screens(db, brand.id) if style in SCREEN_STYLES and branded else [])
                )
                script = write_script(
                    brand,
                    products,
                    job.prompt,
                    language,
                    learned,
                    moods,
                    style,
                    job_id=job_id,
                    shots=shots,
                    design=design,
                    wide=shape == "16:9",
                    voice=voice,
                    art=alias_art(goal),
                )
                apply_alias(script, goal)
                script["ratio"] = shape
            _check(job_id)
            # a reviewed storyboard keeps the shape it was planned in
            script["ratio"] = script.get("ratio") or final_ratio(ratio, script["style"])
            if job.aspect_ratio != script["ratio"]:
                job.aspect_ratio = script["ratio"]
                db.commit()
            by_product, order, logo = _brand_pictures(db, brand.id) if branded else ({}, [], None)
            ref_shot = (
                _shot_from_blob(read_media(ref_url) or b"", "reference") if ref_url else None
            )  # screenshot 1, as planned
            more_now = (
                attached_shots(ref_url, ref_urls) if ref_shot else []
            )  # screenshots 2, 3… as planned
            shots_now = (
                ([ref_shot] if ref_shot else [])
                + more_now
                + (
                    brand_screens(db, brand.id)
                    if script.get("style") in SCREEN_STYLES and branded
                    else []
                )
            )
            if script.get("style") == "logodraw" and ref_url:
                # Logo · Drawing: a logo picture attached on the Make page is the one drawn — a
                # client's or a new logo, not the brand kit's (the user, 2026-10-30)
                attached = _data_uri(read_media(ref_url) or b"", 512, keep_alpha=True)
                if attached:
                    logo = attached
            if (
                script.get("style") == "productfx" and ref_url
            ):  # Product showcase: the photo they attached IS the product
                attached = _data_uri(read_media(ref_url) or b"", 1280, keep_alpha=True)
                if attached:
                    order = [attached, *order]
                    product_id = None
            pick_pictures(script, all_products, by_product, order, product_id, shots_now)
            if script.get("style") == "productfx":
                from app.images import cutout

                _report(job_id, stage="pictures")
                for sc in script["scenes"]:
                    if not sc.get("image"):
                        continue
                    screen = cutout.screen_kind(sc["image"])
                    if screen:  # an app's screenshot: shown in a laptop / phone, never cut out
                        sc["screen"] = screen
                        continue
                    cut = cutout.cut(sc["image"])
                    if cut:
                        sc["image"], sc["cut"] = cut, True
                _check(job_id)
            # Doodle notes: its hand-drawn sketches are drawn in the background while
            # the rest of the video is prepared and the voice records — joined just
            # before the render (each drawing ~20 s, and the image quota is small)
            doodling = (
                _start_doodles(script, job, job_id, limit=DOODLE_SKETCHES)
                if script.get("style") == "doodle"
                else None
            )
            if (
                script.get("style") == "picture"
            ):  # Picture story: every picture, in its art style and the video's shape
                from app.images import doodle

                doodling = _start_doodles(
                    script,
                    job,
                    job_id,
                    style=doodle.picture_style(
                        script.get("art") or "film", script.get("cast") or []
                    ),
                    # a tall stick-figure page paints square: it fills the box between the title and the
                    # subtitles (picture.jsx PAGE_BOX) — a 2:3 drawing would shrink to a narrow strip
                    limit=PICTURE_MAX,
                    ratio="16:9"
                    if script.get("ratio") == "16:9"
                    else "1:1"
                    if script.get("art") == "stickman"
                    else "9:16",
                )
            if (
                script.get("style") == "presenter"
            ):  # Presenter: colour pictures over the panel's words
                from app.images import doodle

                r, g, b = brand_rgb(brand)
                doodling = _start_doodles(
                    script, job, job_id, style=doodle.host_picture_style(f"#{r:02x}{g:02x}{b:02x}")
                )
            if script.get("style") == "deck" and any(
                sc.get("draw") and not sc.get("image") for sc in script["scenes"]
            ):
                from app.images import doodle  # Slides: the picture slides, painted in the brand's colour

                r, g, b = brand_rgb(brand)
                doodling = _start_doodles(
                    script, job, job_id, style=doodle.host_picture_style(f"#{r:02x}{g:02x}{b:02x}")
                )
            if script.get("style") == "aiteam" and any(
                sc.get("draw") and not sc.get("image") for sc in script["scenes"]
            ):
                from app.images import doodle  # AI service: the post's photo, painted

                doodling = _start_doodles(script, job, job_id, style=doodle.POST_PHOTO_STYLE)
            if script.get("style") == "canvas":  # AI design: the pictures its scenes asked for
                from app.images import doodle

                if any(
                    L.get("draw") and not L.get("src")
                    for sc in script["scenes"]
                    for L in sc.get("layers") or []
                ):
                    _report(job_id, stage="pictures")
                    doodle.draw_pictures(
                        script["scenes"],
                        script.get("theme") or {},
                        job.workspace_id,
                        job.user_id,
                        wide=script.get("ratio") == "16:9",
                        language=script.get("language") or "English",
                    )
                    _check(job_id)
            if (
                script.get("style") == "reaction"
            ):  # Reaction meme: its animals, and the pictures behind
                from app.images import doodle

                _report(job_id, stage="pictures")
                script["cast_images"] = doodle.draw_reaction(script, job.workspace_id, job.user_id)
                _check(job_id)
            if script.get("style") == "podcast" and script.get(
                "places"
            ):  # Podcast: the places its story visits
                from app.images import doodle

                _report(job_id, stage="pictures")
                script["place_images"] = [
                    doodle.draw_place(p, job.workspace_id, job.user_id, style=doodle.BACKDROP_STYLE)
                    for p in script["places"]
                ]
                _check(job_id)
            if script.get("style") == "lifestory" and script.get(
                "places"
            ):  # Life story: its warm rooms, painted
                from app.images import doodle

                _report(job_id, stage="pictures")
                script["place_images"] = []
                for p in script["places"]:
                    _check(job_id)  # Stop pressed: no more rooms painted (or billed)
                    script["place_images"].append(
                        doodle.draw_place(p, job.workspace_id, job.user_id, style=doodle.LIFE_STYLE)
                    )
                _check(job_id)
            if script.get("style") == "cartoon" and script.get(
                "place"
            ):  # Story · Characters: its one place
                from app.images import doodle

                _report(job_id, stage="pictures")
                script["place_image"] = doodle.draw_place(
                    script["place"], job.workspace_id, job.user_id
                )
                _check(job_id)
            # AI design: a quick preview, the AI looks at it and fixes what looks off
            language = script.get("language") or language  # a pasted script speaks its own language
            script = review_design(brand, script, logo, "khmer" in language.lower(), job_id)
            props = build_props(brand, script, logo, "khmer" in language.lower())
            if (
                not subtitles
            ):  # "Subtitles: Off" — the voice without words on screen (MotionPost.jsx)
                props["subtitles"] = False
            from app.billing import plan_features

            if not plan_features.allows(
                db, job.workspace_id, "no_watermark"
            ):  # Free: "Made with Smart Marketing"
                props["watermark"] = True
            db.rollback()  # no transaction held open through the voice and render
            if not (_progress.get(job_id) or {}).get("sketches"):
                # a template video: its scene pictures for the making card, from a
                # quick silent preview made while the voice records (AI design has
                # them from its self-check already)
                threading.Thread(
                    target=_sketch,
                    args=(json.loads(json.dumps(props)), job_id),
                    daemon=True,
                    name=f"sketch-{job_id}",
                ).start()
            # "brand": read by the closest base voice, then turned into the brand's own
            from app.ai import gemini_keys
            from app.voice import speech, voice_clone

            speech.use_workspace_key(
                gemini_keys.workspace_key(db, job.workspace_id)
            )  # Khmer: ours, then theirs, then Azure
            if (
                script.get("style") == "presenter"
                and script.get("host")
                and (
                    voice in ("female", "male")
                    or (
                        voice.startswith(speech.KIRI)
                        and speech.setting_gender(voice) != script["host"]["gender"]
                    )
                )
            ):  # (Podcast: the host follows the voice)
                voice = script["host"][
                    "gender"
                ]  # the host speaks in her own voice (a male host: a male one)
            narrator, clone = voice_clone.narrator_for(brand, language, voice, script.get("style"))
            if script.get("style") in SILENT_STYLES:  # Logo · Drawing: sound effects and music only
                narrator, clone = None, None
            # Dialogue · Two voices: each person speaks in their own voice
            two = voice in ("female", "male", "brand") or voice.startswith(speech.KIRI)
            voices = (
                dialogue_voices(script, language, narrator, voice)
                if narrator and script.get("style") in DIALOGUE_STYLES and two
                else None
            )
            if narrator:
                add_voice(
                    props,
                    script,
                    narrator,
                    job.workspace_id,
                    job.user_id,
                    job_id,
                    brand.pronunciations or [],
                    clone,
                    voices,
                )
            if doodling:
                _finish_doodles(doodling, props, job_id)
            if script.get("style") == "aiteam":
                share_post_picture(props)
            _report(job_id, stage="render", render=0.0)
            blob = render(props, job_id)
        except Stopped:
            job = db.get(GenerationJob, job_id)
            job.status, job.error = "failed", "Stopped"
            db.commit()
            return
        except (ContentAIError, RuntimeError, subprocess.TimeoutExpired) as exc:
            job = db.get(GenerationJob, job_id)
            job.status = "failed"
            job.error = (
                str(exc)
                if not isinstance(exc, subprocess.TimeoutExpired)
                else "Rendering took too long — try again."
            )
            db.commit()
            _ready_push(job)
            return

        job = db.get(GenerationJob, job_id)
        seconds = length_of(props)
        url = store_blob(db, blob, ".mp4", "video/mp4")
        video = Video(
            workspace_id=job.workspace_id,
            brand_id=job.brand_id,
            filename=f"motion-{job.id}.mp4",
            duration_seconds=seconds,
            resolution="1920x1080" if props.get("ratio") == "16:9" else "1080x1920",
            size_bytes=len(blob),
            source="ai",
            tag="ai-motion",
            url=url,
        )
        db.add(video)
        db.flush()
        # The Library's "How it was made" shows the brief and the storyboard.
        job.prompt = f"{job.prompt or AUTO_LABEL}\n\nREMOTION STORYBOARD:\n" + "\n".join(
            f"- {screen}" + (f"\n  🎙 {say}" if say and narrator else "")
            for screen, say in script_lines(script)
        )
        try:
            made = making_of(db, props, script, job_id, voice, narrator, language)
            try:
                made["remake"] = keep_props(
                    db, props
                )  # so it can be drawn again in the other shape
            except Exception:  # noqa: BLE001 — the video matters more than a later re-draw
                log.exception("motion %s: props not kept for a re-draw", job_id)
            job.making = json.dumps(made, ensure_ascii=False)
        except Exception:  # noqa: BLE001 — the video matters more than its making-of
            log.exception("motion %s: making-of not saved", job_id)
        job.video_id = video.id
        job.seconds = seconds
        if job.units:  # a counted video (not a re-shape or an edit): by its real length
            from app.billing import usage

            job.units = usage.video_units(seconds)
        job.status = "succeeded"
        job.error = ""
        if caption:
            # A plan post brings its own caption — no second AI call for one.
            video.caption, video.caption_status = caption, "ready"
        db.commit()
        _ready_push(job)
        if not caption:
            from app.images.media_caption import write_in_background

            write_in_background(video.id, job.prompt)
    except Exception:  # noqa: BLE001 — the page must stop waiting either way
        log.exception("motion video %s crashed", job_id)
        db.rollback()
        job = db.get(GenerationJob, job_id)
        if job is not None and job.status != "succeeded":
            job.status, job.error = (
                "failed",
                "Something went wrong while making the video — try again.",
            )
            db.commit()
    finally:
        _stopped.discard(job_id)
        _progress.pop(job_id, None)
        db.close()


if TYPE_CHECKING:  # loaded after this module — app/video/motion/__init__.py binds these (_link)
    from app.video.motion.reshape import keep_props
