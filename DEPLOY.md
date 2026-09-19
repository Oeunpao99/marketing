# Deploying Dispatch to production (Azure VM)

Runs the whole stack — Postgres, FastAPI backend, React frontend via nginx —
with `docker-compose.prod.yml`. No separate worker containers: the delivery
and auto-generate schedulers run in-process inside the backend.

This VM already runs another app (`founderlens`) on ports 8088/8001/5433.
Dispatch is configured to use **8089** for its frontend; backend and Postgres
aren't published to the host at all, so they can't collide with anything.

---

## Prerequisites (already true on this VM)

- Docker + Docker Compose (confirmed — `founderlens` is already running on it)
- git

---

## 1 · Get the code

First deploy:

```bash
cd ~
git clone https://github.com/Oeunpao99/marketing.git dispatch-app
cd dispatch-app
```

Later deploys (update in place):

```bash
cd ~/dispatch-app
git pull
```

---

## 2 · Root `.env` — Postgres credentials + port

```bash
cp .env.prod.example .env
nano .env
```

Set a real `POSTGRES_PASSWORD`. `WEB_PORT=8089` is already set — leave it
unless 8089 turns out to be taken (`sudo ss -tlnp` to check).

---

## 3 · Backend `.env` — app secrets

```bash
cp dispatch/backend/.env.example dispatch/backend/.env
nano dispatch/backend/.env
```

Most values (Azure OpenAI keys, TikTok client key/secret, worker flags) can
be copied straight from the working dev `.env`. These specific fields must
point at Dispatch's real production URL instead of `localhost:5173` / the
ngrok tunnel:

| Field | Set to |
| --- | --- |
| `FRONTEND_URL` | Dispatch's real public URL (e.g. `http://<vm-ip>:8089`) |
| `CORS_ORIGINS` | same URL |
| `PUBLIC_BASE_URL` | backend's public URL — required for Instagram publishing |
| `TIKTOK_REDIRECT_URI` | `<public url>/api/views/oauth/tiktok/callback` — also re-register this in the TikTok Developer Portal |
| `META_REDIRECT_URI` | `<public url>/api/views/oauth/meta/callback` — also add this in the Meta app settings, if using Facebook/Instagram |
| `SECRET_KEY` | a real random value — generate with `openssl rand -hex 32` |
| `SEED_ADMIN_PASSWORD` | a real password, not `changeme` |

Until these are filled in with the real URL, the app runs fine but TikTok/Meta
OAuth login and Instagram publishing won't work.

---

## 4 · Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds both images, starts Postgres, waits for it to report healthy,
runs Alembic migrations automatically (baked into the backend's startup
command), then starts the backend and frontend.

---

## 5 · Verify

```bash
docker compose -f docker-compose.prod.yml ps      # all three services "healthy"
curl http://localhost:8089                         # frontend
curl http://localhost:8089/api/health               # backend, proxied through nginx
```

Open `http://<vm-ip>:8089` in a browser.

---

## Daily operations

| Task | Command |
| --- | --- |
| View logs | `docker compose -f docker-compose.prod.yml logs -f backend` (or `frontend` / `db`) |
| Restart after a code change | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| Stop everything (keep data) | `docker compose -f docker-compose.prod.yml stop` |
| Start again | `docker compose -f docker-compose.prod.yml start` |
| Full stop + remove containers (keep data volume) | `docker compose -f docker-compose.prod.yml down` |
| **Destroy the database** (irreversible) | `docker compose -f docker-compose.prod.yml down -v` |

Postgres data persists in the named volume `dispatch-db-data`, independent of
container restarts/rebuilds.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `backend` never becomes healthy | `docker compose -f docker-compose.prod.yml logs backend` — usually a bad/missing value in `dispatch/backend/.env` |
| Port 8089 already in use | change `WEB_PORT` in the root `.env`, then `up -d --build` again |
| TikTok/Meta login fails | redirect URI in `.env` doesn't match what's registered in the TikTok/Meta developer portal, or doesn't match the URL you're actually browsing to |
| Instagram publish fails | `PUBLIC_BASE_URL` is blank or not actually publicly reachable |
| 502 from nginx | backend container isn't up yet or crashed — check `docker compose -f docker-compose.prod.yml logs backend` |
