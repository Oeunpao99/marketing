"""The Smart Marketing connector — an MCP server (Model Context Protocol, the way
Claude, ChatGPT and other AI apps call tools): a customer's assistant makes
template videos, storyboards and pictures in their workspace.

    POST /api/mcp          Authorization: Bearer sm_…   (or X-API-Key: sm_…)
    POST /api/mcp/sm_…     the key in the link — for apps that only take a URL

Streamable HTTP, answered as plain JSON (no event stream): initialize,
tools/list, tools/call, ping. Each tool calls the same function the app's own
button does (app/motion.py, app/video.py), as the key's person, so videos are
made, limited and charged exactly as in the app. Keys: app/api_keys.py.
"""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing, plan_features, usage
from app.api_keys import resolve_key
from app.config import get_settings
from app.database import get_db
from app.models import ApiKey, ApiRequest, Brand, TeamMember, Video

log = logging.getLogger("app.mcp")
router = APIRouter(tags=["MCP"])

PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
CALLS_PER_MINUTE = 60  # per key
_calls: dict[int, deque] = defaultdict(deque)
STORYBOARD_WAIT_S = 45  # make_storyboard waits this long, then says to ask get_storyboard

INSTRUCTIONS = (
    "Smart Marketing makes marketing videos and pictures for small businesses, in Khmer or English. "
    "Typical flow: list_templates → make_storyboard (the scenes, to show the person and edit) → "
    "make_video with that storyboard → check_job every ~20 s until it's done (videos take 2-6 minutes; "
    "a long one more). make_video with just an idea skips the storyboard. Each plan makes a number of videos and "
    "images a month: a video up to 1 min uses 1, up to 3 min 2, longer 1 per 3 min. get_storyboard / "
    "make_storyboard say how many it uses; my_usage shows what's left. Tell the person before making a long video."
)


class ToolError(Exception):
    """Shown to the assistant as the tool's answer (isError) — friendly, no internals."""


def _abs(url: str | None) -> str:
    if not url:
        return ""
    if url.startswith("http"):
        return url
    s = get_settings()
    return (s.public_base_url or s.frontend_url).rstrip("/") + url


def _brand(db: Session, user: TeamMember, brand_id) -> Brand:
    q = select(Brand).where(Brand.workspace_id == user.workspace_id)
    brand = db.scalar(q.where(Brand.id == int(brand_id))) if brand_id else db.scalar(q.order_by(Brand.id))
    if brand is None:
        raise ToolError("That brand isn't in this workspace — call list_brands." if brand_id else "This workspace has no brand yet — add one in the app first.")
    return brand


def _language(value) -> str:
    return "English" if str(value or "").lower().startswith("en") else "Khmer"


# ── the tools ──────────────────────────────────────────────────────────────


def t_list_brands(db: Session, user: TeamMember, args: dict) -> dict:
    brands = db.scalars(select(Brand).where(Brand.workspace_id == user.workspace_id).order_by(Brand.id)).all()
    return {"brands": [{"id": b.id, "name": b.name, "language": getattr(b, "lang", "") or ""} for b in brands]}


def t_list_templates(db: Session, user: TeamMember, args: dict) -> dict:
    from app.motion import TEMPLATE_GUIDE, WIDE_STYLES

    return {
        "templates": [{"template": k, "good_for": v, "shapes": ["9:16", "16:9"] if k in WIDE_STYLES else ["9:16"]} for k, v in TEMPLATE_GUIDE.items()],
        "tip": "Or template 'auto': the AI picks the best one for the story.",
    }


def t_my_usage(db: Session, user: TeamMember, args: dict) -> dict:
    u = usage.summary(db, user.workspace_id)
    return {
        "plan": u["plan_label"],
        "videos_left": u["videos"]["left"],
        "videos_this_month": u["videos"]["limit"],
        "images": "no monthly limit",
        "longest_video_seconds": u["longest_seconds"],
        "refills_at": u["refills_at"],
    }


def _estimate(db: Session, user: TeamMember, brand: Brand, script: dict, language: str, voice: str) -> dict:
    """What making this storyboard uses of the month: its videos (by length), and what's left."""
    from app.motion import estimate_seconds

    seconds = estimate_seconds(script)
    u = usage.summary(db, user.workspace_id)
    return {
        "seconds": seconds,
        "uses_videos": usage.video_units(seconds),
        "videos_left": u["videos"]["left"],
        "longest_video_seconds": u["longest_seconds"],
        "too_long": seconds > u["longest_seconds"] + 5,
    }


def _board(db: Session, user: TeamMember, plan_id: str, brand: Brand, language: str, voice: str) -> dict:
    from app.motion import plan_status

    p = plan_status(plan_id, ws=user.workspace_id)
    if p["status"] == "running":
        return {"status": "writing", "storyboard_id": plan_id, "template": p.get("style"), "next": "call get_storyboard again in ~15 s"}
    if p["status"] == "failed":
        raise ToolError(p.get("error") or "The storyboard couldn't be written — try again.")
    script = p["script"]
    return {
        "status": "ready",
        "storyboard_id": plan_id,
        "template": script.get("style"),
        "why": p.get("why", ""),
        "about_seconds": p.get("estimate_seconds"),
        "estimate": _estimate(db, user, brand, script, language, voice),
        "storyboard": script,
        "next": "show the scenes to the person; edit any 'say' (spoken) or on-screen text if they want, then make_video with storyboard = this storyboard",
    }


def t_make_storyboard(db: Session, user: TeamMember, args: dict) -> dict:
    from app.motion import PlanIn, plan_motion

    brand = _brand(db, user, args.get("brand_id"))
    language = _language(args.get("language"))
    story = str(args.get("story") or "").strip()
    if not story:
        raise ToolError("Give the story, script or topic in 'story'.")
    payload = PlanIn(
        brand_id=brand.id, idea=story[:20000], language=language, goal=str(args.get("template") or "auto"),
        length=str(args.get("length") or "auto"), ratio=str(args.get("shape") or "auto"), music=args.get("music", True) is not False,
    )
    plan_id = plan_motion(payload, db=db, ws=user.workspace_id, user=user)["plan_id"]
    voice = str(args.get("voice") or "female")
    end = time.time() + STORYBOARD_WAIT_S
    while time.time() < end:
        time.sleep(3)
        board = _board(db, user, plan_id, brand, language, voice)
        if board["status"] != "writing":
            return board
    return _board(db, user, plan_id, brand, language, voice)


def t_get_storyboard(db: Session, user: TeamMember, args: dict) -> dict:
    brand = _brand(db, user, args.get("brand_id"))
    try:
        return _board(db, user, str(args.get("storyboard_id") or ""), brand, _language(args.get("language")), str(args.get("voice") or "female"))
    except HTTPException as exc:
        raise ToolError("That storyboard isn't here any more (they're kept a few hours) — make a new one.") from exc


def t_make_video(db: Session, user: TeamMember, args: dict) -> dict:
    from app.motion import MotionIn, create_motion

    brand = _brand(db, user, args.get("brand_id"))
    board = args.get("storyboard")
    if isinstance(board, str) and board.strip().startswith("{"):
        board = json.loads(board)
    idea = str(args.get("idea") or "").strip()
    if not board and not idea:
        raise ToolError("Give an 'idea' (topic or story), or a 'storyboard' from make_storyboard.")
    board = board if isinstance(board, dict) else None
    shape = (board or {}).get("ratio") or str(args.get("shape") or "9:16")  # a storyboard keeps its own shape
    payload = MotionIn(
        brand_id=brand.id, idea=idea[:20000], language=_language(args.get("language")), voice=str(args.get("voice") or "female"),
        music=args.get("music", True) is not False, goal=str(args.get("template") or "auto"), script=board, ratio=shape,
    )
    job = create_motion(payload, db=db, ws=user.workspace_id, user=user)
    return {"job_id": job.id, "status": job.status, "next": "call check_job with this job_id every ~20 s; a video takes 2-6 minutes"}


def t_make_image(db: Session, user: TeamMember, args: dict) -> dict:
    from app.video import ImageIn, create_image

    brand = _brand(db, user, args.get("brand_id"))
    prompt = str(args.get("prompt") or "").strip()
    if len(prompt) < 10:
        raise ToolError("Describe the picture in 'prompt' (at least a sentence). Khmer words to show on it are drawn correctly.")
    job = create_image(
        ImageIn(prompt=prompt[:4000], aspect_ratio=str(args.get("shape") or "1:1"), brand_id=brand.id, use_logo=bool(args.get("logo"))),
        db=db, ws=user.workspace_id, user=user,
    )
    return {"job_id": job.id, "status": job.status, "next": "call check_job with this job_id in ~30 s"}


def t_check_job(db: Session, user: TeamMember, args: dict) -> dict:
    from app.video import get_video

    try:
        j = get_video(int(args.get("job_id") or 0), db=db, ws=user.workspace_id)
    except (HTTPException, ValueError) as exc:
        raise ToolError("No job with that id in this workspace.") from exc
    out = {"job_id": j.id, "status": j.status}
    if j.status in ("queued", "running"):
        p = j.progress or {}
        out["stage"] = p.get("stage") or j.status
        if p.get("render"):
            out["percent"] = round(p["render"] * 100)
        out["next"] = "check again in ~20 s"
    elif j.status == "succeeded" and j.video:
        video = db.get(Video, j.video.id)
        out.update(url=_abs(j.video.url), filename=j.video.filename, caption=(video.caption if video else "") or "", videos_used=j.units or 0)
        out["note"] = "It's also in the person's Library in the app, ready to post."
    elif j.status == "failed":
        out["error"] = j.error or "It couldn't be made — try again."
    return out


S = {"type": "string"}
BRAND = {"type": "integer", "description": "From list_brands. Leave out: the workspace's first brand."}
LANG = {"type": "string", "enum": ["Khmer", "English"], "description": "Default Khmer."}
VOICE = {"type": "string", "description": "female (default), male, none (silent), brand (the brand's own recorded voice)."}
TOOLS = [
    ("list_brands", "The brands (businesses) in this workspace — their ids for the other tools.", {}, [], t_list_brands),
    ("list_templates", "The video templates, what each is good for, and the shapes it can make.", {}, [], t_list_templates),
    ("my_usage", "What this workspace can still make this month — videos and images left, the longest video, its plan, and when they refill.", {}, [], t_my_usage),
    (
        "make_storyboard",
        "Write a video's storyboard (scenes with on-screen words and the spoken line) from a story, script or topic — to "
        "check and edit before anything is made. Waits up to ~45 s; says how many of the month's videos it uses.",
        {
            "story": {**S, "description": "The story, script or topic, in the person's words — pasted stories are followed faithfully."},
            "brand_id": BRAND, "language": LANG, "voice": VOICE,
            "template": {**S, "description": "A template from list_templates, or auto (default)."},
            "length": {**S, "enum": ["auto", "60", "120", "300", "600"], "description": "Seconds; default auto."},
            "shape": {**S, "enum": ["auto", "9:16", "16:9"], "description": "9:16 vertical (TikTok, Reels) or 16:9 wide (YouTube); default auto."},
        },
        ["story"],
        t_make_storyboard,
    ),
    (
        "get_storyboard",
        "A storyboard from make_storyboard that was still being written — the scenes and how many videos it uses, once ready.",
        {"storyboard_id": S, "brand_id": BRAND, "language": LANG, "voice": VOICE},
        ["storyboard_id"],
        t_get_storyboard,
    ),
    (
        "make_video",
        "Start making a finished MP4 (pictures / animation, subtitles, voice, music). Give a storyboard from make_storyboard "
        "(made exactly as it is), or just an idea (the AI writes it). Returns a job_id for check_job.",
        {
            "storyboard": {"type": "object", "description": "The 'storyboard' object from make_storyboard / get_storyboard, edited or not."},
            "idea": {**S, "description": "Instead of a storyboard: the topic or story."},
            "brand_id": BRAND, "language": LANG, "voice": VOICE,
            "template": {**S, "description": "With an idea: a template from list_templates, or auto."},
            "shape": {**S, "enum": ["9:16", "16:9"], "description": "With an idea: default 9:16."},
            "music": {"type": "boolean", "description": "Background music; default true."},
        },
        [],
        t_make_video,
    ),
    (
        "make_image",
        "Start making a marketing picture (poster, product shot, meme) — Khmer words on it are drawn correctly. Returns a job_id for check_job.",
        {
            "prompt": {**S, "description": "What the picture shows, and any words to put on it (in quotes)."},
            "brand_id": BRAND,
            "shape": {**S, "enum": ["1:1", "4:5", "9:16", "16:9"], "description": "Default 1:1."},
            "logo": {"type": "boolean", "description": "Put the brand's logo on it."},
        },
        ["prompt"],
        t_make_image,
    ),
    (
        "check_job",
        "How a video or picture is coming along — and once done, its link (MP4 / image), caption and how many of the month's videos it used.",
        {"job_id": {"type": "integer"}},
        ["job_id"],
        t_check_job,
    ),
]
BY_NAME = {t[0]: t for t in TOOLS}
# connectors made before videos were counted still call my_credits: answered the new way, not listed
BY_NAME["my_credits"] = ("my_credits", "", {}, [], t_my_usage)


def _tool_list() -> list[dict]:
    return [{"name": n, "description": d, "inputSchema": {"type": "object", "properties": p, "required": r}} for n, d, p, r, _ in TOOLS]


# ── the protocol ───────────────────────────────────────────────────────────


def _result(rid, result) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _error(rid, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


def run_tool(db: Session, user: TeamMember, name: str, args: dict, key: ApiKey | None = None) -> dict:
    """One tool, as ``user`` — the MCP result ({content, structuredContent, isError}).
    Logged for the API page (ApiRequest): the tool, ok or not, how long — never the
    arguments. ``key`` None = the API page's Playground."""
    started = time.time()
    out, text = None, ""
    tool = BY_NAME.get(name)
    if tool is None:
        text = f"There's no tool called {name}."
    else:
        try:
            out = tool[4](db, user, args or {})
        except (ToolError, billing.OutOfCredit) as exc:
            text = str(exc)
        except HTTPException as exc:  # the app's own refusals: no videos left, busy, not set up
            text = str(exc.detail)
        except Exception:  # noqa: BLE001 — the reason is in the log, never in the answer
            log.exception("MCP tool %s failed (workspace %s)", name, user.workspace_id)
            text = "Something went wrong on our side — try again in a moment."
        finally:
            db.rollback()  # nothing half-done held open
    try:
        db.add(ApiRequest(
            workspace_id=user.workspace_id, key_id=key.id if key else None, key_name=key.name if key else "",
            tool=name[:40], ok=out is not None, ms=round((time.time() - started) * 1000), error=text[:200],
            job_id=(out or {}).get("job_id") if isinstance((out or {}).get("job_id"), int) else None,
        ))
        db.commit()
    except Exception:  # noqa: BLE001 — a missed log line never fails the call
        log.exception("MCP: could not log a call")
        db.rollback()
    if out is not None:
        return {"content": [{"type": "text", "text": json.dumps(out, ensure_ascii=False, default=str)}], "structuredContent": out, "isError": False}
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _handle(db: Session, user: TeamMember, key: ApiKey, msg: dict) -> dict | None:
    rid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if rid is None:  # a notification (notifications/initialized…): nothing to answer
        return None
    if method == "initialize":
        asked = params.get("protocolVersion")
        return _result(rid, {
            "protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "smart-marketing", "title": "Smart Marketing", "version": "1.0"},
            "instructions": INSTRUCTIONS,
        })
    if method == "ping":
        return _result(rid, {})
    if method == "tools/list":
        return _result(rid, {"tools": _tool_list()})
    if method == "tools/call":
        return _result(rid, run_tool(db, user, params.get("name") or "", params.get("arguments") or {}, key))
    return _error(rid, -32601, f"Method not found: {method}")


def _unauthorized() -> JSONResponse:
    return JSONResponse(
        _error(None, -32001, "A valid Smart Marketing API key is needed (this one may have expired or been revoked) — make one on the API & MCP page."),
        status_code=401,
        headers={"WWW-Authenticate": 'Bearer realm="smart-marketing"'},
    )


async def _serve(request: Request, key: str, db: Session):
    found = resolve_key(db, key)
    if found is None:
        return _unauthorized()
    user, key_row = found
    if not plan_features.allows(db, user.workspace_id, "api"):  # Business and up (a key kept after a downgrade)
        return JSONResponse(
            _error(None, -32003, "API & MCP is on the Business plan and up — upgrade on the Plans page to use this key again."),
            status_code=402,
        )
    now = time.time()
    seen = _calls[user.id]
    while seen and now - seen[0] > 60:
        seen.popleft()
    if len(seen) >= CALLS_PER_MINUTE:
        return JSONResponse(_error(None, -32002, "Too many requests — wait a minute."), status_code=429)
    seen.append(now)
    try:
        body = json.loads(await request.body() or b"null")
    except ValueError:
        return JSONResponse(_error(None, -32700, "Parse error"), status_code=400)
    billing.bind(user.workspace_id, user.id)  # AI calls here are charged to their workspace
    from starlette.concurrency import run_in_threadpool

    msgs = body if isinstance(body, list) else [body]
    if not all(isinstance(m, dict) for m in msgs):
        return JSONResponse(_error(None, -32600, "Invalid request"), status_code=400)
    answers = [a for m in msgs if (a := await run_in_threadpool(_handle, db, user, key_row, m)) is not None]
    if not answers:
        return Response(status_code=202)
    return JSONResponse(answers if isinstance(body, list) else answers[0])


def _key_from(authorization: str | None, x_api_key: str | None) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return (x_api_key or "").strip()


@router.post("/mcp")
async def mcp(request: Request, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    return await _serve(request, _key_from(authorization, x_api_key), db)


@router.post("/mcp/{key}")
async def mcp_keyed(key: str, request: Request, db: Session = Depends(get_db)):
    return await _serve(request, key, db)


@router.get("/mcp")
@router.get("/mcp/{key}")
def mcp_get(key: str = ""):
    # no server-to-client stream: everything is answered on the POST
    return Response(status_code=405, headers={"Allow": "POST"})


@router.delete("/mcp")
@router.delete("/mcp/{key}")
def mcp_delete(key: str = ""):
    return Response(status_code=405, headers={"Allow": "POST"})
