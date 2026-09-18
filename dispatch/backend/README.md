# Dispatch backend

FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL. Dependency management with `uv`.

Every model in `app/models.py` is listed in `app/registry.py`, which:

- generates a full REST resource at `/api/<name>` (list / get / create / patch / delete), and
- is serialized by `GET /api/meta/models` — the frontend builds its sidebar **Data**
  section from that response, so every model automatically gets a sidebar entry.

## First run

```bash
cd dispatch/backend
cp .env.example .env

# 1. dev database (Postgres on :5433, Adminer on :8080)
docker compose -f docker-compose.dev.yml up -d

# 2. install deps into .venv
uv sync

# 3. run migrations
uv run python -m alembic upgrade head

# 4. load demo data (mirrors the React prototype fixtures)
uv run python -m app.seed

# 5. serve — http://localhost:8000/docs
uv run python -m uvicorn app.main:app --reload --port 8000
```

> On Windows the console entry points (`alembic`, `uvicorn`) can hit an
> "Access is denied" spawn error under OneDrive-synced folders. Always call them
> as `uv run python -m alembic …` / `uv run python -m uvicorn …`.

## Migrations

```bash
# after editing app/models.py
uv run python -m alembic revision --autogenerate -m "describe change"
uv run python -m alembic upgrade head
uv run python -m alembic downgrade -1
```

## Layout

| File | Purpose |
| --- | --- |
| `app/models.py` | SQLAlchemy models (12 tables) |
| `app/schemas.py` | Pydantic Read / Create / Update per model |
| `app/registry.py` | model → resource metadata; single source of truth for the sidebar |
| `app/crud_router.py` | generic CRUD `APIRouter` factory |
| `app/views.py` | pre-joined read models + actions for the app's screens |
| `app/content_ai.py` | writes a brand's daily batch of post ideas from its Products |
| `app/content_scheduler.py` | in-process worker that runs each Automation on schedule |
| `app/publishers.py` | delivery adapters — Telegram is live, others simulated |
| `app/seed.py` | idempotent demo data |
| `docker-compose.dev.yml` | Postgres + Adminer for local dev |

## Key endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | liveness |
| GET | `/api/meta/models` | registry → sidebar |
| CRUD | `/api/brands`, `/api/channels`, `/api/videos`, `/api/posts`, `/api/post-targets`, `/api/drafts`, `/api/automations`, `/api/products`, `/api/platforms`, `/api/team-members` | generic |
| GET | `/api/views/today` | queue, pre-joined |
| GET | `/api/views/channels` | brands → channels |
| GET | `/api/views/review` | drafts waiting |
| GET | `/api/views/calendar` | `?start=&end=` (dates) → every planned idea in range, any status |
| GET | `/api/views/auto` | automations |
| POST | `/api/views/auto/{id}/run-now` | write today's batch for one brand right now |
| GET | `/api/views/insights` | `?brand_id=&limit=` → live likes/comments/shares/views per published post |
| GET | `/api/views/sidebar` | badge counts |
| POST | `/api/views/schedule` | create Post + PostTargets |
| POST | `/api/views/drafts/{id}/approve` · `/reject` | review actions |
| POST | `/api/views/channels` | add a brand↔platform channel (JSON body, see below) |
| POST | `/api/views/channels/{id}/connect` | set status `live`, merge `config` |
| GET | `/api/views/oauth/tiktok/start` | `?brand_id=` → `{url}` to send the browser to TikTok's consent screen |
| GET | `/api/views/oauth/tiktok/callback` | TikTok redirects here after consent; stores tokens, bounces back to the app |
| GET | `/api/views/channels/{id}/tiktok/creator-info` | this account's allowed privacy levels + duet/comment/Stitch defaults, for the Direct Post picker |
| GET | `/api/views/oauth/meta/start` | `?brand_id=&intent=facebook\|instagram` → `{url}` to send the browser to Facebook's consent screen |
| GET | `/api/views/oauth/meta/callback` | Facebook redirects here after consent; fetches every Page, stashes them, bounces to `/channels/add?meta_pending=` |
| GET | `/api/views/oauth/meta/pending/{id}` | the stashed Page list (no tokens) for the "pick a Page" step |
| POST | `/api/views/oauth/meta/pending/{id}/confirm` | save the chosen Page's token onto the brand's Facebook and/or Instagram channel |
| POST | `/api/views/post-targets/{id}/publish` | deliver one post now |
| POST | `/api/views/publish-due` | deliver every queued post whose time has passed |
| POST | `/api/ai/prompt` | write a generation prompt from a brief; refine mode when `prior_prompt` + `feedback` are sent |
| POST | `/api/ai/video` | start an in-portal video render from a prompt → `GenerationJob` |
| GET | `/api/ai/video/{id}` | poll a render; on success saves the MP4 as a `Video` and links it |
| POST | `/api/ai/image` | generate an image synchronously → saved as a `Video` row (`kind="image"`) |

## Daily content AI — Auto-generate → Waiting for you → Calendar

The engine behind the **Auto-generate** page: per brand, on a schedule, the AI
reads that brand's **Products** (what it sells/offers — `app/models.py`'s
`Product`, managed on the Products page) and writes a batch of post ideas —
title, insight (why this angle), and a ready-to-edit caption — via
`app/content_ai.py` (one Azure OpenAI chat call, JSON mode).

`app/content_scheduler.py` is an in-process worker (mirrors the delivery
worker in `app/scheduler.py`) that checks every minute for an enabled
`Automation` whose "write at" time has passed today and hasn't run yet today,
and calls `run_automation()` — row-locks the automation so a same-second
"Generate now" click and the worker tick can't double-write, then persists the
ideas as `Draft` rows with `planned_for` set to that day. Toggle it off with
`CONTENT_SCHEDULER_ENABLED=false` and drive it yourself via
`POST /api/views/auto/{id}/run-now` instead (same escape hatch pattern as
`PUBLISH_WORKER_ENABLED` / `/publish-due`).

Each `Automation.require_approval` decides where a fresh batch lands:
`waiting` (shown on **Waiting for you**, `GET /api/views/review`, approve/reject
via the existing `POST /api/views/drafts/{id}/approve` · `/reject`) or straight
to `approved`. Either way every dated idea shows up on the **Calendar**
(`GET /api/views/calendar`) — click one there to read it, approve/reject it, or
hit "Use this idea" to jump into the AI agent page with that idea's topic and
caption prefilled as the brief.

No extra `.env` setup beyond what `AZURE_OPENAI_*` already provides for the
rest of the AI agent — this reuses the same chat deployment.

## AI agent — prompt → image / video

`app/ai.py` turns a brief into one generation prompt (Azure OpenAI chat). Send
`prior_prompt` + `feedback` to the same endpoint to iterate on a prompt.

`app/video.py` generates the media **inside the portal** and stores the result
as a `Video` row (`source="ai"`) ready to drop onto a post, plus a
`GenerationJob` record.

| | endpoint | providers (`*_PROVIDER`) | sync? |
| --- | --- | --- | --- |
| Video | `POST /ai/video` + poll `GET /ai/video/{id}` | `azure_sora`, `gemini_veo` | no |
| Image | `POST /ai/image` | `azure_openai` (gpt-image-1 / dall-e-3), `gemini_imagen` | yes |

Each provider needs its keys set (see `.env.example`); an unconfigured provider
returns 503 and the UI offers "bring your own file". Image generation runs on the
**chat** Azure resource (`AZURE_OPENAI_ENDPOINT`), video can point elsewhere via
`AZURE_OPENAI_VIDEO_ENDPOINT`.

## Telegram

Telegram is the first platform with a **real** delivery integration
(`app/publishers.py`). The others are marked posted without a network call
(toggle with `SIMULATE_UNIMPLEMENTED_PLATFORMS`).

**One-time setup**

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. Add the bot as an **administrator** of your channel (Post Messages permission).
3. Note the channel's `@username` (public) or numeric `-100…` id (private).

**Connect the channel** (token is stored in `channels.config`, redacted in every
read response):

```bash
# existing seeded Telegram channel (status "off")
curl -X POST localhost:8000/api/views/channels/11/connect \
  -H 'content-type: application/json' \
  -d '{"handle":"@my_channel","config":{"bot_token":"123:ABC","chat_id":"@my_channel"}}'

# …or create a fresh one
curl -X POST localhost:8000/api/views/channels \
  -H 'content-type: application/json' \
  -d '{"brand_id":2,"platform_slug":"telegram","config":{"bot_token":"123:ABC","chat_id":"@my_channel"}}'
```

A `bot_token` in `.env` (`TELEGRAM_BOT_TOKEN`) is used as a fallback when a
channel has none.

**Publish** — schedule as normal. An in-process worker (`app/scheduler.py`) runs
every `PUBLISH_WORKER_INTERVAL_SECONDS` (default 60) and delivers each queued
target once its `scheduled_for` time passes — no cron needed. Set
`PUBLISH_WORKER_ENABLED=false` to turn it off and drive delivery yourself:

```bash
# deliver one now
curl -X POST localhost:8000/api/views/post-targets/{id}/publish

# or deliver everything that's due; run on a cron / every minute
curl -X POST localhost:8000/api/views/publish-due -H 'content-type: application/json' -d '{}'
```

If `videos.url` is set on the post's video, Telegram receives the video with the
caption; otherwise it's a text message.

A `PostTarget` moves `queued → posting → posted` (or `→ failed` with `error` set;
re-run to retry). The worker briefly holds targets in `posting` so the portal's
Today view can show a "Posting…" animation, and re-attempts any `posting` row
left stranded by a crash for more than 5 minutes. `GET /api/views/today` returns
the current status per target; the React store polls it every few seconds.

## TikTok

TikTok is the second platform with a **real** delivery integration
(`app/tiktok.py` + the `_publish_tiktok` branch in `app/publishers.py`), via
TikTok's Content Posting API. Unlike Telegram (a bot token you paste in), this
is a proper OAuth connect — the user logs into TikTok and approves the app.

**Two flows, chosen automatically per channel** — `app/tiktok.py` implements
both **Upload** (default) and **Direct Post**; `_publish_tiktok` in
`app/publishers.py` picks between them by checking what scope the channel's
own token actually carries (`"video.publish" in channel.config["scope"]`),
not just a setting — so this is safe to leave alone per-channel.

- **Upload** (`video.upload` scope, no audit needed) — `upload_video_draft()`
  lands the video as a draft in the connected account's TikTok inbox; a
  person still opens TikTok and taps **Post** to finish it, typing the
  caption by hand (the Upload API has no field for it at all — `Draft.body`
  prepared in this portal doesn't carry over).
- **Direct Post** (`video.publish` scope) — `publish_video_direct()`
  auto-publishes with no human step. Getting a token with this scope needs
  either TikTok's Sandbox (works pre-audit, but only for accounts added as
  Target Users on the app — see below) or a passed audit. That audit's own
  guidelines explicitly rule out "a utility tool to help upload content to
  account(s) you or your team manages" — i.e. an internal tool like this
  one — so this is realistically a Sandbox-only path unless the app's actual
  audience is broader than that.

**Enabling Direct Post (Sandbox)**

1. In the TikTok app dashboard, switch to the **Sandbox** tab and add
   `video.publish` as a scope there (it's addable in Sandbox even without an
   audit) alongside `video.upload` / `video.list`.
2. Add the TikTok account(s) you'll test with as **Target Users** under that
   same Sandbox tab.
3. Set `TIKTOK_REQUEST_DIRECT_POST=true` in `.env` and restart the backend —
   this makes future `/oauth/tiktok/start` calls also request the
   `video.publish` scope (see `app/tiktok.py`'s `_scope()`). Existing
   Upload-only connections are unaffected; only channels connected/
   reconnected after flipping this pick up Direct Post.
4. Reconnect that channel (Channels → TikTok → Connect again for that brand).
   Once its token carries `video.publish`, the New Post composer shows a
   TikTok-specific panel (`CaptionComps.jsx`'s `TikTokDirectPostOptions`) —
   who can see the post (from `GET /views/channels/{id}/tiktok/creator-info`,
   TikTok's actual allowed values for that account), duet/comment/Stitch
   toggles, and content disclosure ("promotes my own business" /
   "paid partnership" — mapped to `brand_organic_toggle` /
   `brand_content_toggle`). Those choices ride along on the `PostTarget` as
   `platform_options.tiktok` and are read straight back out at publish time.
   `is_aigc` is always sent `true` — this portal's videos are AI-generated,
   and TikTok's content disclosure policy expects that declared.

Until the app passes the actual audit, Direct Post output still lands
private/self-view only regardless of the chosen privacy level — that's
TikTok's rule for unaudited apps, same as it always was.

**One-time setup**

1. Register an app at [developers.tiktok.com](https://developers.tiktok.com),
   add the **Content Posting API** product (not just Login Kit — scopes like
   `video.upload` only become addable once it's added), and request the
   `video.upload` and `video.list` scopes.
2. Add a redirect URI on that app matching `TIKTOK_REDIRECT_URI` in `.env` —
   it **must be a static `https://…` URL**, so for local dev, tunnel this
   backend (e.g. `ngrok http 8000`) and point it at
   `<tunnel url>/api/views/oauth/tiktok/callback`.
3. Set `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, and
   `FRONTEND_URL` (where the React app runs) in `.env`.
4. TikTok also requires a working Terms of Service URL and Privacy Policy URL
   on the app, each passing TikTok's own domain-ownership verification (a DNS
   TXT record on that exact host) before the app will save at all — unrelated
   to this codebase, just a portal prerequisite.

**Connect** — from the portal: Channels → Add platform → TikTok → pick a
brand. That sends the browser to TikTok's consent screen
(`GET /api/views/oauth/tiktok/start?brand_id=…`); TikTok redirects back to
`GET /api/views/oauth/tiktok/callback`, which exchanges the code for an
access/refresh token pair, stores them on the channel's `config` (redacted in
every read response, same as Telegram's bot token), and bounces the browser
back to `/channels` in the React app.

**Publish** — same worker as Telegram (`app/scheduler.py` /
`POST /api/views/publish-due`). `_publish_tiktok` reads the post's video bytes
via `app/media.py`, refreshes the access token first if it's near expiry, and
uploads in one chunk (TikTok allows up to 64 MB that way — plenty for this
portal's short AI-generated clips; a much larger file would need real chunked
upload, which isn't implemented). The `PostTarget` is marked `posted` once
TikTok has the file — that reflects this app's job being done, not that the
video is actually public yet.

## Facebook & Instagram

Both run through one Meta developer app and one OAuth login
(`app/meta.py` + the `_publish_facebook` / `_publish_instagram` branches in
`app/publishers.py`), since Instagram posting is done via the Facebook Page
its Business account is linked to.

**One-time setup**

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   and add the **Facebook Login for Business** product.
2. Add a redirect URI matching `META_REDIRECT_URI` in `.env` — same rule as
   TikTok: must be a static `https://…` URL, so local dev needs a tunnel,
   pointed at `<tunnel url>/api/views/oauth/meta/callback`.
3. Set `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `FRONTEND_URL`.
4. While the app is in **Development mode**, it can only post to Pages your
   own Meta account administers — post to a client's Page by adding them as a
   tester on the app, or go through App Review for `pages_manage_posts` /
   `instagram_content_publish` to lift that.

**Connect** — Channels → Add platform → Facebook *or* Instagram → pick a
brand; both kick off the same Facebook login (`GET /oauth/meta/start`) with
every relevant scope (`app/meta.py`'s `SCOPES`). Unlike Telegram/TikTok, one
login can return several Pages, so there's an extra step: the callback
exchanges the code for a short-lived token, upgrades it to a ~60-day one,
calls `me/accounts` for every Page the user manages plus each Page's linked
Instagram Business Account (if any), and stashes that list **server-side**
(`meta._pending`, an in-memory dict — raw Page tokens never touch the
browser) under an opaque id. The browser bounces to
`/channels/add?meta_pending=<id>`, which fetches
`GET /oauth/meta/pending/<id>` and shows a picker; confirming
(`POST /oauth/meta/pending/<id>/confirm`) saves that one Page's token onto the
brand's `facebook` and/or `instagram` Channel and is single-use (calling it
twice 404s the second time). Page tokens obtained this way are effectively
non-expiring, so there's no refresh step like TikTok's.

**Publish** — same worker as Telegram/TikTok. Facebook Page posts
(`meta.publish_to_page`) upload the media as bytes directly to Graph, same as
Telegram/TikTok — no public url needed. **Instagram is different**: its
Content Publishing API only accepts a public `image_url` / `video_url`, it
cannot take an uploaded file, so `_publish_instagram` builds one from
`PUBLIC_BASE_URL` + the video's `/media/…` path and fails with a clear error
if `PUBLIC_BASE_URL` isn't set — this only works once the backend is reachable
at a real public https address (not `localhost`). A video container is polled
(`status_code`) until Instagram finishes processing it before publishing;
images publish immediately.

## Insights

`GET /api/views/insights` (the **Insights** page) shows live likes / comments
/ shares / views for every post the portal has published, pulled straight
from each platform — nothing is stored or snapshotted, each page load fans
out one live API call per post (in a small thread pool, `views.py`'s
`_post_metrics`) to that post's platform, keyed off the `external_id` saved on
its `PostTarget` when it was published. `?brand_id=` filters to one brand;
`?limit=` (default 30) bounds how many recent posts it checks, since each one
is a live network call.

Per platform:
- **Facebook** — likes/comments/shares straight off the Page post.
- **Instagram** — likes/comments off the media item.
- **TikTok** — needs the `video.list` scope (added alongside `video.publish`
  in `app/tiktok.py`'s `SCOPE` — a channel connected before this was added
  needs reconnecting once). Resolves the async publish's real video id via
  `post/publish/status/fetch/` first, so a just-published video briefly shows
  as "processing" until TikTok finishes it.
- **Telegram** — shows the channel's current subscriber count
  (`publishers.telegram_subscriber_count`, `getChatMemberCount`) on every one
  of its posts (status `"partial"` — it's a real, live number, just a
  channel-level one, not per-post). Per-post views and reactions are not
  shown: the Bot API has no on-demand call for either — views only ever
  appear on a `Message` object the bot already has in hand, and reactions
  only ever arrive as live update events the bot isn't set up to listen for.
  Getting either would need a different-shaped piece of work (a forward+delete
  trick for views, a standing update listener for reactions) — ask if you
  want to go there.

A failure on any one post (token revoked, post deleted on the platform's
side, rate limit) shows as an "unavailable" row with the reason — it never
blanks the rest of the page.
