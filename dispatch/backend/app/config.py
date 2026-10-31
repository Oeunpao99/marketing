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
    # Optional: the WRITER — a stronger model (e.g. "gpt-5") that writes the
    # content: video storyboards and scripts, the Khmer editor and voice director,
    # post ideas and captions. It may live on another Azure resource (its own
    # endpoint + key). Quick helper calls (picking a template, reading a
    # screenshot, checks) stay on azure_openai_deployment. Blank = no writer.
    azure_openai_writer_deployment: str = ""
    azure_openai_writer_endpoint: str = ""
    azure_openai_writer_api_key: str = ""
    # Claude on Microsoft Foundry (app/ai_models.py): the resource name (the
    # part before .services.ai.azure.com) and its key. Blank = Claude not offered.
    azure_claude_resource: str = ""
    azure_claude_api_key: str = ""

    # In-portal video generation (AI agent → "Generate video").
    # Provider: "azure_sora" or "gemini_omni" ("gemini_veo" goes to gemini_omni now).
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

    # Website check (app/website.py): Google PageSpeed Insights key. Optional —
    # without one Google allows only a few checks a day.
    pagespeed_api_key: str = ""

    # gemini_veo — Google AI Studio / Gemini API key + a Veo model id.
    gemini_api_key: str = ""
    # Where Gemini calls go. Google blocks the Gemini API from some countries
    # (the prod VM is in Hong Kong), so prod points this at a proxy running in a
    # supported region (dispatch/gemini-proxy/worker.js). Blank = Google directly.
    gemini_base_url: str = ""
    gemini_video_model: str = "veo-3.1-fast-generate-preview"  # old: Veo 3.1 preview was shut down 2026-10-22
    # gemini_omni (and gemini_veo, which now goes to it): Google's video model after Veo 3.1 preview
    gemini_omni_model: str = "gemini-omni-1.1-flash"
    # Azure Speech — Khmer / English voice-over for motion videos (app/speech.py).
    azure_speech_key: str = ""
    azure_speech_region: str = ""
    # Azure OpenAI text-to-speech (gpt-4o-mini-tts) — expressive, but its Khmer
    # has a foreign accent; Azure Speech is used first (app/speech.py).
    azure_openai_tts_endpoint: str = ""
    azure_openai_tts_api_key: str = ""
    azure_openai_tts_deployment: str = "gpt-4o-mini-tts"
    azure_openai_tts_api_version: str = "2025-03-01-preview"
    # "azure" | "openai" | "" (= azure when set up, else openai).
    speech_provider: str = ""
    # gpt-4o-mini-tts voices for the Female / Male choice.
    tts_voice_female: str = "coral"
    tts_voice_male: str = "ash"
    # A local open-source Khmer voice for Khmer voice-overs, e.g.
    # "khmerttsopensource/khmer-tts" (app/local_voice.py) — blank = Azure.
    # Note: the MMS Khmer models are licensed CC-BY-NC 4.0 (non-commercial).
    khmer_tts_model: str = ""
    # Who reads ENGLISH voice-overs: "" / "azure" (Ava / Andrew HD — the default)
    # or "kokoro" (app/kokoro_voice.py — open source, free, run on this server).
    # Off by default (the user's choice, 2026-10-30): on a 2-core server Kokoro
    # takes ~2 s per second of speech and slows every render; Azure costs ~$0.01
    # an English video. A Kokoro line that fails is read by Azure instead.
    english_speech_provider: str = ""
    kokoro_voice_female: str = "af_heart"
    kokoro_voice_male: str = "am_michael"
    kokoro_speed: float = 0.95
    # kokoro-v1.0.onnx (~310 MB, best) or kokoro-v1.0.int8.onnx (~90 MB, faster, a little rougher)
    kokoro_model: str = "kokoro-v1.0.onnx"
    kokoro_dir: str = ""  # blank = HF_HOME/kokoro
    # Who reads KHMER voice-overs: "gemini" (Google Gemini TTS — the most natural
    # Khmer the user heard, 2026-10-14), "azure" (Sreymom / Piseth), or "" =
    # Gemini when GEMINI_API_KEY is set. English: see english_speech_provider. A Gemini
    # line that fails is read by Azure instead, so a video never loses its voice.
    khmer_speech_provider: str = ""
    gemini_tts_model: str = "gemini-3.8-flash-tts"
    # Google caps every voice model at ~100 lines a day (10 a minute), even on
    # Tier 1: when one is used up the next reads (each counted on its own),
    # and Sreymom / Piseth only once they all are. Comma-separated, in order.
    gemini_tts_backup_models: str = (
        "gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts"
    )
    gemini_tts_voice_female: str = "Kore"
    gemini_tts_voice_male: str = "Charon"
    # KiriTTS (kiritts.com, a Khmer-first voice): with a key, it reads Khmer lines
    # before Gemini — Gemini, then Sreymom / Piseth, only when it fails. A voice
    # left blank keeps that gender on Gemini (names: GET /v1/voices).
    kiritts_api_key: str = ""
    kiritts_base_url: str = "https://api.kiritts.com/v1"
    kiritts_model: str = "kiritts"
    kiritts_voice_female: str = "Maly"
    kiritts_voice_male: str = ""
    # Veo output size: "720p", "1080p" or "4k" (4k not on Lite). Google allows
    # 1080p / 4k only for 8-second clips — shorter ones always come at 720p.
    gemini_video_resolution: str = "1080p"
    # Auto-generate's daily video (app/content_scheduler.py) — cheaper than the
    # AI Agent's model, since it runs every day. Only used with gemini_veo.
    auto_video_model: str = "veo-3.1-fast-generate-preview"

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
    # Azure Blob Storage for the app's files (app/blobstore.py): both set → new files
    # go there (their /media links stay the same); empty → kept in the database.
    azure_storage_connection_string: str = ""
    azure_storage_container_name: str = ""
    # our folder inside the container — it may be shared with another app
    azure_storage_prefix: str = "smart-marketing/"
    # Busy: past this many images / template videos already waiting or being made
    # (the whole app, the last 30 min), a new one is turned away with "Lots of people
    # are creating right now — please try again in a moment" (app/video.py refuse_if_busy).
    # Videos render one at a time, so their line is short.
    image_busy_at: int = 30
    motion_busy_at: int = 4

    # YouTube (Shorts + videos) — "Connect" on the Channels page (app/youtube.py).
    # A Google Cloud project with the YouTube Data API v3 + YouTube Analytics API on,
    # an OAuth client (Web application) whose redirect URIs include
    # youtube_redirect_uri — "<this backend>/api/views/oauth/youtube/callback"
    # (http://localhost:8000/… works for local dev; Google allows localhost).
    # Scopes: youtube.upload, youtube.readonly, yt-analytics.readonly. Until Google
    # audits the app, uploads stay Private and only its test users can connect.
    youtube_client_id: str = ""
    youtube_client_secret: str = ""
    youtube_redirect_uri: str = ""

    # "Continue with Google" on the login page (app/google_login.py). Empty →
    # the YouTube client above is used, and the redirect is
    # "<this backend>/api/auth/google/callback" (worked out from
    # youtube_redirect_uri) — add that to the client's Authorized redirect URIs.
    google_client_id: str = ""
    google_client_secret: str = ""
    google_login_redirect_uri: str = ""

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
    # Also ask for ``user.info.basic`` when someone connects, so the channel can be named after
    # the person's TikTok account (their display name) instead of a code. It comes with Login Kit
    # (check Scopes in the TikTok developer portal); set TIKTOK_REQUEST_USER_INFO=false if TikTok
    # ever refuses it ("invalid_scope") — accounts then fall back to creator_info's nickname.
    tiktok_request_user_info: bool = True

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
    # Meta retires each Graph API version ~2 years after release (v21.0 ends
    # 21 Jan 2027). Override with META_GRAPH_VERSION in .env when bumping.
    meta_graph_version: str = "v26.0"
    # This backend's own publicly reachable base url, no trailing slash (e.g.
    # https://api.yourdomain.com). Facebook Page posts upload bytes directly
    # and don't need this; Instagram's Content Publishing API always fetches
    # the media from a public url, so Instagram posting is disabled with a
    # clear error until this is set.
    public_base_url: str = ""

    # LinkedIn (app/linkedin.py). Personal profiles: an app at
    # https://www.linkedin.com/developers/apps with the "Sign In with LinkedIn
    # using OpenID Connect" and "Share on LinkedIn" products, and
    # linkedin_redirect_uri registered as an authorized redirect URL — must be
    # a static https url, so local dev needs a tunnel pointed at this backend,
    # at "<that https url>/api/views/oauth/linkedin/callback". Company Pages: a
    # second app with only the Community Management API (linkedin_pages_*
    # below), with the same redirect url registered on it.
    # Marketing advisor chat (app/advisor.py): questions per workspace per day
    # — every question is one AI call, so this caps the bill per account.
    advisor_daily_limit: int = 60

    # Paying for a plan with KHQR (app/payments.py, app/khqr.py, app/bakong.py).
    # The account the money goes to — its Bakong id ("name@bank"), the name and
    # city a bank app shows. A merchant account also has its merchant id and bank
    # (empty = an individual account).
    bakong_account_id: str = ""
    bakong_merchant_name: str = ""
    bakong_merchant_city: str = "Phnom Penh"
    bakong_merchant_id: str = ""
    bakong_acquiring_bank: str = ""
    # Some banks give personal accounts one shared Bakong id (ACLEDA: "khqr@aclb") and
    # tell them apart by this "account information" number — copy both from the
    # account's own KHQR (tag 29: 00 = the id, 01 = this, 02 = the bank)
    bakong_account_info: str = ""
    # Who the paid-plan invoices are from (app/invoice.py) — the company's legal name,
    # address, tax ID (VAT TIN) and email. Empty name = the Bakong merchant name.
    invoice_company: str = ""
    invoice_address: str = ""
    invoice_tax_id: str = ""
    invoice_email: str = ""
    # The Bakong Open API token (api-bakong.nbc.gov.kh — renewed every ~90 days)
    # that confirms payments. The URL can point at a relay in Cambodia if the API
    # refuses our server's (Hong Kong) address.
    bakong_api_token: str = ""
    bakong_api_url: str = "https://api-bakong.nbc.gov.kh"
    # Price overrides as JSON, per plan: {"starter": {"USD": 0.1, "KHR": 100}} — the
    # plans named here replace the built-in prices (app/payments.py BUILT_IN_PRICES),
    # the others keep theirs. The admin portal's Prices tab wins over both.
    # Nothing is sold until the Bakong account and token above are set.
    plan_prices: str = ""

    # Web Push (app/push.py) — lock-screen / desktop notifications. Generate a
    # pair with `python -m app.push keys`; empty = push turned off.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""

    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = ""
    # The Company Pages app (Community Management API). Empty = the "Company
    # Page" choice says LinkedIn Pages aren't set up. The scopes must all be
    # listed on that app's Auth tab, or LinkedIn refuses the sign-in.
    linkedin_pages_client_id: str = ""
    linkedin_pages_client_secret: str = ""
    linkedin_pages_scopes: str = "rw_organization_admin r_organization_social w_organization_social"
    # LinkedIn REST API version (YYYYMM). LinkedIn retires each monthly version
    # about a year after release ("Requested version … is not active") — bump
    # this in .env when that happens, no code change needed.
    linkedin_api_version: str = "202606"

    # Auth — CHANGE secret_key in .env for anything real.
    secret_key: str = "dev-insecure-change-me"
    token_ttl_hours: int = 168  # 7 days
    # The platform admin portal (/admin-mkt, app/admin.py): one login, from
    # .env only. Either one blank = the portal is switched off (404).
    admin_username: str = ""
    admin_password: str = ""
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


GEMINI_GOOGLE_URL = "https://generativelanguage.googleapis.com"


def gemini_url(path: str) -> str:
    """A Gemini API URL — through GEMINI_BASE_URL when set (see gemini_base_url).
    Takes a path ("/v1beta/models/...") or a full Google URL (Veo's download link)."""
    if path.startswith(GEMINI_GOOGLE_URL):
        path = path[len(GEMINI_GOOGLE_URL):]
    base = get_settings().gemini_base_url.strip().rstrip("/") or GEMINI_GOOGLE_URL
    return base + path


@lru_cache
def get_settings() -> Settings:
    return Settings()
