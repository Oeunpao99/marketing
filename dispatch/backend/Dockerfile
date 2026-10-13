# Production image for the FastAPI backend. Builds a venv with uv (matching
# local dev), then runs pending Alembic migrations before starting uvicorn —
# so `docker compose up` alone brings the schema up to date, no separate step.
FROM python:3.12-slim

# uv's own image ships just the binary — copying it in is the documented,
# fast way to get uv without a separate install step.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# libraqm (+ harfbuzz / fribidi): complex-script text shaping for Pillow, so
# the Khmer text on meme posters (app/meme.py) renders correctly.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libraqm0 \
    && rm -rf /var/lib/apt/lists/*

# Remotion videos (app/motion.py → /motion): Node 22, the libraries Chrome
# Headless Shell needs on Debian 13 (trixie), and a colour-emoji font for the
# scene icons. The Khmer font ships with the motion project itself.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
       libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2t64 libxrandr2 libxkbcommon0 \
       libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 \
       libcups2 fonts-noto-color-emoji \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# The motion project comes from the compose file's extra build context
# (additional_contexts: motion → ./dispatch/motion) — only its sources, never
# node_modules or rendered output. Its browser is fetched now, not on the
# first video.
WORKDIR /motion
COPY --from=motion package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npx remotion browser ensure
COPY --from=motion src ./src
COPY --from=motion public/fonts ./public/fonts
# Background music by mood (public/music/<mood>/*.mp3 — app/motion.py music_tracks).
COPY --from=motion public/music ./public/music
COPY --from=motion sample.json ./
# Pack the template once now, not before every video (app/motion.py _entry).
RUN npx remotion bundle src/index.jsx --out-dir build --log=error

WORKDIR /app

# Dependencies first, isolated from app code, so editing a .py file doesn't
# invalidate this (usually much slower) layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# The local Khmer voice's model (app/local_voice.py, KHMER_TTS_MODEL) is
# downloaded here on first use — a volume in docker-compose.prod.yml keeps it
# across rebuilds.
ENV HF_HOME=/models

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
