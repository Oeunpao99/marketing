# Gemini proxy

Google blocks the Gemini API (Khmer voice, Veo video) from Hong Kong, where the
prod VM runs. This Cloudflare Worker forwards those calls from Singapore.

## Deploy (once)

```bash
cd dispatch/gemini-proxy
npx wrangler login
npx wrangler deploy
openssl rand -hex 16                     # → your token
npx wrangler secret put PROXY_TOKEN      # paste the token
```

`wrangler deploy` prints the URL, e.g. `https://gemini-proxy.<you>.workers.dev`.

## Use it on the VM

In `dispatch/backend/.env`:

```
GEMINI_BASE_URL=https://gemini-proxy.<you>.workers.dev/<token>
```

then `docker compose up -d backend` (a plain restart doesn't re-read `.env`).

Check (expect `200`):

```bash
docker exec marketing-backend-1 python -c "import httpx; from app.config import get_settings as g, gemini_url; print(httpx.get(gemini_url('/v1beta/models'), params={'key': g().gemini_api_key}).status_code)"
```

Leave `GEMINI_BASE_URL` blank anywhere Google works directly (your PC).
