# Dispatch / Ti P'sa — social content portal

A portal for scheduling short-form video across three brands and their
Facebook / TikTok / YouTube channels.

- **Frontend** — React + Vite + Tailwind (this folder)
- **Backend** — FastAPI + SQLAlchemy + Alembic + PostgreSQL (`backend/`)

```
dispatch/
├── src/            React app
├── backend/        FastAPI API + migrations + dev database
└── README.md       ← you are here
```

---

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20+ | `node --version` |
| Python | 3.12+ | `python --version` |
| uv | 0.5+ | `uv --version` — install: <https://docs.astral.sh/uv/> |
| Docker + Compose | any recent | `docker compose version` |

---

## 1 · Start the backend

```bash
cd dispatch/backend

# a. config
cp .env.example .env

# b. dev database — Postgres on :5433, Adminer UI on :8080
docker compose -f docker-compose.dev.yml up -d

# c. install Python dependencies into .venv
uv sync

# d. create the tables
uv run python -m alembic upgrade head

# e. load demo data (safe to skip; re-runnable, does nothing if data exists)
uv run python -m app.seed

# f. run the API — http://localhost:8000/docs
uv run python -m uvicorn app.main:app --reload --port 8000
```

Leave this terminal running.

> **Windows / OneDrive note:** running `alembic` or `uvicorn` directly can fail
> with `Access is denied (os error 5)`. Always invoke them through Python:
> `uv run python -m alembic …` and `uv run python -m uvicorn …`.

### Quick check

```bash
curl http://localhost:8000/api/health          # {"status":"ok"}
curl http://localhost:8000/api/meta/models     # the 9 models
```

Open <http://localhost:8000/docs> for the full interactive API.
Open <http://localhost:8080> for Adminer (system `PostgreSQL`, server `db`,
user/pass/db all `dispatch`) — set the port to 5432 inside the compose network,
or connect from your host to `localhost:5433`.

---

## 2 · Start the frontend

In a **second terminal**:

```bash
cd dispatch
npm install
npm run dev            # http://localhost:5173
```

Vite proxies every `/api/*` request to `http://localhost:8000`
(see `vite.config.js`). To point at a different backend:

```bash
VITE_API_URL=https://api.example.com npm run dev
```

Production build:

```bash
npm run build          # → dist/
npm run preview        # serve the build locally
```

---

## Daily use

| Task | Command (from `dispatch/backend`) |
| --- | --- |
| Start DB | `docker compose -f docker-compose.dev.yml up -d` |
| Stop DB (keep data) | `docker compose -f docker-compose.dev.yml stop` |
| Reset DB (wipe data) | `docker compose -f docker-compose.dev.yml down -v` then repeat steps **d–e** |
| New migration after editing `app/models.py` | `uv run python -m alembic revision --autogenerate -m "message"` |
| Apply migrations | `uv run python -m alembic upgrade head` |
| Roll back one migration | `uv run python -m alembic downgrade -1` |
| Re-seed from scratch | `alembic downgrade base && alembic upgrade head && python -m app.seed` (each `uv run python -m …`) |
| Lint backend | `uv run ruff check app` |

---

## Data model

Nine tables, each exposed as a REST resource **and** listed by
`GET /api/meta/models` (which drives the sidebar's *Data* section):

| Group | Models |
| --- | --- |
| Content | Brands · Platforms · Channels · Videos |
| Scheduling | Posts · Post targets · Drafts · Automations |
| Team | Team members |

Generic endpoints per resource: `GET/POST /api/<name>`,
`GET/PATCH/DELETE /api/<name>/{id}`.
Screen-shaped endpoints: `/api/views/today`, `/api/views/channels`,
`/api/views/review`, `/api/views/auto`, `/api/views/sidebar`,
`POST /api/views/schedule`.

More detail: [`backend/README.md`](backend/README.md) ·
[`backend/FRONTEND_INTEGRATION.md`](backend/FRONTEND_INTEGRATION.md).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Access is denied (os error 5)` running alembic/uvicorn | use `uv run python -m alembic` / `uv run python -m uvicorn` |
| `connection refused` on port 5433 | `docker compose -f docker-compose.dev.yml up -d`, wait for `pg_isready` |
| API returns 500 on first call | migrations not applied — run `alembic upgrade head` |
| Frontend shows network errors | backend not running, or started on a port other than 8000 |
| `uv: command not found` | install uv: <https://docs.astral.sh/uv/getting-started/installation/> |
| Port 8000 already in use | `uv run python -m uvicorn app.main:app --port 8001` and set `VITE_API_URL` |
