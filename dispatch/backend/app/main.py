import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import content_scheduler, scheduler, video
from app.advisor import router as advisor_router
from app.ai import router as ai_router
from app.auth import router as auth_router
from app.improve import router as improve_router
from app.story import router as story_router
from app.chats import router as chats_router
from app.config import get_settings
from app.crud_router import build_router
from app.media import router as media_router
from app.media import serve_router as media_serve_router
from app.push import router as push_router
from app.registry import REGISTRY, registry_meta
from app.tenancy import get_current_user
from app.video import router as video_gen_router
from app.views import public_router as views_public_router
from app.views import router as views_router
from app.weekly import router as weekly_router

logging.basicConfig(level=logging.INFO)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start(app)
    content_scheduler.start(app)
    video.start_worker(app)
    try:
        yield
    finally:
        await video.stop_worker(app)
        await content_scheduler.stop(app)
        await scheduler.stop(app)


app = FastAPI(
    title="ContentFlow API",
    version="0.1.0",
    description="Backend for ContentFlow, the AI social content portal.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAINTENANCE_DEFAULT = "ContentFlow is down for scheduled maintenance. We'll be back shortly."


@app.middleware("http")
async def maintenance_gate(request: Request, call_next):
    """MAINTENANCE_MODE=true: refuse every API call (except health) with a 503
    the frontend recognises (``"maintenance": true``) and shows as its
    "updating" screen."""
    if (
        settings.maintenance_mode
        and request.url.path.startswith("/api/")
        and request.url.path != "/api/health"
    ):
        return JSONResponse(
            {"detail": settings.maintenance_message or MAINTENANCE_DEFAULT, "maintenance": True},
            status_code=503,
            headers={"Retry-After": "60"},
        )
    return await call_next(request)


api = APIRouter(prefix="/api")


@api.get("/health", tags=["Meta"])
def health():
    # Stays 200 in maintenance (container health checks use it); the app polls
    # it to know when to take the "updating" screen down.
    return {
        "status": "ok",
        "maintenance": settings.maintenance_mode,
        "message": (settings.maintenance_message or MAINTENANCE_DEFAULT)
        if settings.maintenance_mode
        else "",
    }


@api.get("/meta/models", tags=["Meta"], dependencies=[Depends(get_current_user)])
def meta_models():
    """Drives the sidebar 'Data' section on the frontend."""
    return registry_meta()


# Everything below needs a signed-in user; each route then scopes itself to
# that user's workspace (app/tenancy.py). Only /auth (login / sign-up), the
# OAuth callbacks and /media/<name> (platforms fetch those urls) stay public.
authed = [Depends(get_current_user)]
for resource in REGISTRY:
    api.include_router(build_router(resource), dependencies=authed)

api.include_router(auth_router)
api.include_router(ai_router, dependencies=authed)
api.include_router(advisor_router, dependencies=authed)
api.include_router(improve_router, dependencies=authed)
api.include_router(story_router, dependencies=authed)
api.include_router(chats_router, dependencies=authed)
api.include_router(push_router, dependencies=authed)
api.include_router(video_gen_router, dependencies=authed)
api.include_router(media_router, dependencies=authed)
api.include_router(views_router, dependencies=authed)
api.include_router(weekly_router, dependencies=authed)
api.include_router(views_public_router)
app.include_router(api)
app.include_router(media_serve_router)


@app.get("/", include_in_schema=False)
def root():
    return {"service": "dispatch-api", "docs": "/docs", "models": "/api/meta/models"}
