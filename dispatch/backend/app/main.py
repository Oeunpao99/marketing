import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import content_scheduler, scheduler
from app.ai import router as ai_router
from app.auth import router as auth_router
from app.config import get_settings
from app.crud_router import build_router
from app.media import router as media_router
from app.media import serve_router as media_serve_router
from app.registry import REGISTRY, registry_meta
from app.tenancy import get_current_user
from app.video import router as video_gen_router
from app.views import public_router as views_public_router
from app.views import router as views_router

logging.basicConfig(level=logging.INFO)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start(app)
    content_scheduler.start(app)
    try:
        yield
    finally:
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

api = APIRouter(prefix="/api")


@api.get("/health", tags=["Meta"])
def health():
    return {"status": "ok"}


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
api.include_router(video_gen_router, dependencies=authed)
api.include_router(media_router, dependencies=authed)
api.include_router(views_router, dependencies=authed)
api.include_router(views_public_router)
app.include_router(api)
app.include_router(media_serve_router)


@app.get("/", include_in_schema=False)
def root():
    return {"service": "dispatch-api", "docs": "/docs", "models": "/api/meta/models"}
