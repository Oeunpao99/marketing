from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://dispatch:dispatch@localhost:5433/dispatch"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Where the React app lives — the TikTok OAuth callback redirects back here.
    frontend_url: str = "http://localhost:5173"

    # Fallback Telegram bot token, used when a channel's config has no "bot_token".
    telegram_bot_token: str = ""
    # When true, non-Telegram platforms are "published" by simply marking them
    # posted (there is no real Facebook/TikTok/YouTube integration yet).
    simulate_unimplemented_platforms: bool = True

    # In-process delivery worker: every `publish_worker_interval_seconds` it
    # delivers any queued post whose scheduled time has passed. Set
    # `publish_worker_enabled=false` to run the worker externally instead
    # (POST /api/views/publish-due on a cron).
    publish_worker_enabled: bool = True
    publish_worker_interval_seconds: int = 60

    # In-process daily content scheduler (Auto-generate page): checks every
    # minute for an enabled Automation whose "write at" time has passed today,
    # and writes that brand's batch of ideas. Same "run it externally instead"
    # escape hatch as the delivery worker, via POST /api/views/auto/{id}/run-now.
    content_scheduler_enabled: bool = True

    # Planned maintenance: every /api call except /api/health answers 503 with
    # this message, the app shows its "updating" screen to everyone, and the
    # delivery + content workers don't start. Flip it in .env and recreate the
    # backend container; set it back to false the same way.
    maintenance_mode: bool = False
    maintenance_message: str = ""

    # Azure OpenAI — powers the AI agent's "Generate prompt".
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""  # e.g. https://<res>.services.ai.azure.com/openai/v1/
    azure_openai_deployment: str = "gpt-5-mini"
    azure_openai_vision_deployment: str = "gpt-5-mini"
    # Optional: a separate (stronger) chat deployment used only for brands that
    # post in Khmer — small models write noticeably stiffer, less natural
    # Khmer. Blank = use azure_openai_deployment for everything.
    azure_openai_khmer_deployment: str = ""

    # In-portal video generation (AI agent → "Generate video").
    # Provider: "azure_sora" or "gemini_veo".
    video_generation_enabled: bool = True
    video_provider: str = "azure_sora"
    # Safety cap on a single render, in seconds.
    video_max_seconds: int = 20

    # azure_sora — Sora often lives in a different Azure resource/region than the
    # chat model, so video can point elsewhere. Blank endpoint/key => reuse the
    # chat resource above.
    azure_openai_video_endpoint: str = ""
    azure_openai_video_api_key: str = ""
    azure_openai_video_deployment: str = "sora-2"
    azure_openai_video_api_version: str = "preview"

    # gemini_veo — Google AI Studio / Gemini API key + a Veo model id.
    gemini_api_key: str = ""
    gemini_video_model: str = "veo-3.1-fast-generate-preview"

    # In-portal image generation (AI agent → "Generate image"). Synchronous.
    # Provider: "azure_openai" (dall-e-3 / gpt-image-1) or "gemini_imagen".
    image_generation_enabled: bool = True
    image_provider: str = "azure_openai"
    # Blank endpoint/key => reuse the chat resource; fill to point image
    # generation at its own Azure resource.
    azure_openai_image_endpoint: str = ""
    azure_openai_image_api_key: str = ""
    azure_openai_image_deployment: str = "gpt-image-1"
    gemini_image_model: str = "imagen-3.0-generate-002"
    # App-wide cap on simultaneous provider image calls. Requests beyond it
    # wait (job stays "queued") instead of hitting the provider at once.
    image_max_concurrency: int = 6

    # TikTok Content Posting API — "Connect" on the Channels page (app/tiktok.py).
    # Register an app at https://developers.tiktok.com, add it, and request the
    # `video.upload` + `video.list` scopes. tiktok_redirect_uri must exactly
    # match a redirect URI registered on that app — TikTok requires it to be a
    # static https url, so local dev needs a tunnel (e.g. ngrok) pointed at
    # this backend; point it at "<that https url>/api/views/oauth/tiktok/callback".
    tiktok_client_key: str = ""
    tiktok_client_secret: str = ""
    tiktok_redirect_uri: str = ""
    # Off by default: requesting `video.publish` (Direct Post, auto-publish)
    # before your TikTok app actually has that scope enabled makes the whole
    # OAuth login fail outright. Only flip this on once you've added
    # `video.publish` under the app's **Sandbox** tab (works pre-audit, but
    # only for accounts added there as Target Users) — see README.md's TikTok
    # section. Existing connected channels keep working on Upload regardless;
    # this only affects channels connected/reconnected after you flip it.
    tiktok_request_direct_post: bool = False
    # Off by default, and should stay off until the app actually passes
    # TikTok's Direct Post audit: an unaudited app's Direct Post calls are
    # rejected outright (not just forced private) for any privacy_level other
    # than SELF_ONLY — even though creator_info still lists the others as
    # valid for the account. While this is false, app/tiktok.py's picker only
    # ever offers/sends SELF_ONLY, so that failure can't happen.
    tiktok_app_audited: bool = False

    # Meta Graph API — Facebook Pages + Instagram, one shared developer app
    # (app/meta.py). Create an app at https://developers.facebook.com, add
    # "Facebook Login for Business", and register meta_redirect_uri as a valid
    # OAuth redirect — must be a static https url, so local dev needs a tunnel
    # (e.g. ngrok) pointed at this backend, at
    # "<that https url>/api/views/oauth/meta/callback". While the app is in
    # Development mode you can only post to Pages your own Meta account
    # administers; posting to a client's Page needs them added as a tester (or
    # App Review for pages_manage_posts / instagram_content_publish).
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_redirect_uri: str = ""
    meta_graph_version: str = "v21.0"
    # This backend's own publicly reachable base url, no trailing slash (e.g.
    # https://api.yourdomain.com). Facebook Page posts upload bytes directly
    # and don't need this; Instagram's Content Publishing API always fetches
    # the media from a public url, so Instagram posting is disabled with a
    # clear error until this is set.
    public_base_url: str = ""

    # LinkedIn — personal-profile posting only (app/linkedin.py). Create an app
    # at https://www.linkedin.com/developers/apps, add the "Sign In with
    # LinkedIn using OpenID Connect" and "Share on LinkedIn" products (both
    # self-serve, no partner approval needed), and register
    # linkedin_redirect_uri as an authorized redirect URL — must be a static
    # https url, so local dev needs a tunnel pointed at this backend, at
    # "<that https url>/api/views/oauth/linkedin/callback". Posting to a
    # Company Page instead of a person's own feed needs LinkedIn's Community
    # Management API, which requires manual partner approval — not supported
    # here.
    # Marketing advisor chat (app/advisor.py): questions per workspace per day
    # — every question is one AI call, so this caps the bill per account.
    advisor_daily_limit: int = 60

    # Web Push (app/push.py) — lock-screen / desktop notifications. Generate a
    # pair with `python -m app.push keys`; empty = push turned off.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""

    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = ""
    # LinkedIn REST API version (YYYYMM). LinkedIn retires each monthly version
    # about a year after release ("Requested version … is not active") — bump
    # this in .env when that happens, no code change needed.
    linkedin_api_version: str = "202606"

    # Auth — CHANGE secret_key in .env for anything real.
    secret_key: str = "dev-insecure-change-me"
    token_ttl_hours: int = 168  # 7 days
    # Seeded demo account (app/seed.py). Blank password = login disabled for it.
    seed_admin_email: str = "admin@tipsa.local"
    seed_admin_password: str = "changeme"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def video_endpoint(self) -> str:
        return self.azure_openai_video_endpoint or self.azure_openai_endpoint

    @property
    def video_api_key(self) -> str:
        return self.azure_openai_video_api_key or self.azure_openai_api_key

    @property
    def image_endpoint(self) -> str:
        return self.azure_openai_image_endpoint or self.azure_openai_endpoint

    @property
    def image_api_key(self) -> str:
        return self.azure_openai_image_api_key or self.azure_openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
