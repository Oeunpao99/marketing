# Production image for the FastAPI backend. Builds a venv with uv (matching
# local dev), then runs pending Alembic migrations before starting uvicorn —
# so `docker compose up` alone brings the schema up to date, no separate step.
FROM python:3.12-slim

# uv's own image ships just the binary — copying it in is the documented,
# fast way to get uv without a separate install step.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Dependencies first, isolated from app code, so editing a .py file doesn't
# invalidate this (usually much slower) layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
