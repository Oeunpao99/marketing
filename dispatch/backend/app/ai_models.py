"""The writing models a workspace can choose from, and how a call reaches each.

Customers pick the model that WRITES (captions, ideas, Improve with AI,
storyboards, the Khmer editor and voice director — content_ai.writer_model):
the request's choice (the composer, header X-AI-Model), else the workspace's
default (Settings), else the platform's (AZURE_OPENAI_WRITER_DEPLOYMENT).
The platform admin (/admin-mkt) turns models on and off, sets each one's
price per 1M tokens and the markup credit is charged at (table ai_models),
and may limit a workspace to some of them (workspaces.ai_models_allowed).
Helper calls (checks, tags, summaries) stay on the default deployment.

Providers: Azure OpenAI (the existing path in content_ai._chat), Claude on
Microsoft Foundry (Anthropic's SDK) and Gemini (its OpenAI-compatible
endpoint, through GEMINI_BASE_URL when set — app/config.py gemini_url).
"""

from __future__ import annotations

import json
import re
import threading
import time

import httpx
from sqlalchemy import select

from app.config import gemini_url, get_settings
from app.database import SessionLocal
from app.models import AiModel, Workspace

# key → what customers see; the key is also the deployment / model name
CATALOG: dict[str, dict] = {
    "gpt-5": {"label": "GPT-5", "vendor": "OpenAI", "provider": "azure_openai", "blurb": "Strong planner, follows every rule — the default"},
    "gpt-5-mini": {"label": "GPT-5 mini", "vendor": "OpenAI", "provider": "azure_openai", "blurb": "Fastest and cheapest — quick drafts"},
    "claude-opus-5-5": {"label": "Claude Opus 5.5", "vendor": "Anthropic", "provider": "azure_claude", "blurb": "Most natural Khmer storytelling"},
    "gemini-4-argon": {"label": "Gemini 4 Argon", "vendor": "Google", "provider": "gemini", "blurb": "Very fast, natural Khmer"},
}


class ModelError(RuntimeError):
    pass


# ── settings from the database, briefly cached ─────────────────────────────
_cache: dict = {"at": 0.0, "rows": {}}
_lock = threading.Lock()


def _rows() -> dict[str, dict]:
    """{key: {"enabled", "price_in", "price_out", "markup"}} from ai_models (30 s cache)."""
    with _lock:
        if time.time() - _cache["at"] < 30:
            return _cache["rows"]
    db = SessionLocal()
    try:
        rows = {
            r.key: {"enabled": r.enabled, "price_in": float(r.price_in), "price_out": float(r.price_out), "markup": float(r.markup)}
            for r in db.scalars(select(AiModel)).all()
        }
    except Exception:  # noqa: BLE001 — before the migration ran: the catalog alone
        rows = {}
    finally:
        db.close()
    with _lock:
        _cache.update(at=time.time(), rows=rows)
    return rows


def forget() -> None:
    """The admin changed a model — read the table again on the next call."""
    with _lock:
        _cache["at"] = 0.0


def configured(key: str) -> bool:
    """The platform has the keys this model needs."""
    s = get_settings()
    provider = CATALOG.get(key, {}).get("provider")
    if provider == "azure_openai":
        return bool(s.azure_openai_api_key and s.azure_openai_endpoint)
    if provider == "azure_claude":
        return bool(s.azure_claude_api_key and s.azure_claude_resource)
    if provider == "gemini":
        return bool(s.gemini_api_key)
    return False


def canonical(model: str) -> str:
    """The catalog key for a model name a provider reports — Azure says
    "gpt-5-mini-2025-08-07" for the deployment "gpt-5-mini". Others unchanged."""
    name = (model or "").strip()
    if name in CATALOG:
        return name
    hits = [k for k in CATALOG if name.startswith(k + "-")]
    return max(hits, key=len) if hits else name


def pricing(model: str) -> tuple[float, float, float] | None:
    """(price in, price out per 1M tokens, markup) for a catalog model — None
    for any other (billing.py's own table prices those)."""
    row = _rows().get(canonical(model))
    if not row or not (row["price_in"] or row["price_out"]):
        return None
    return row["price_in"], row["price_out"], row["markup"]


def usable(key: str) -> bool:
    """On, priced and configured — a model the platform can offer at all."""
    row = _rows().get(key)
    return key in CATALOG and configured(key) and bool(row and row["enabled"] and (row["price_in"] or row["price_out"]))


def allowed_for(ws: Workspace | None) -> list[str]:
    """The models this workspace may pick, in catalog order."""
    keys = [k for k in CATALOG if usable(k)]
    if ws is not None and ws.ai_models_allowed is not None:
        keys = [k for k in keys if k in ws.ai_models_allowed]
    return keys


_ws_cache: dict[int, tuple[float, str, list | None]] = {}


def _workspace_choice(ws_id: int) -> tuple[str, list | None]:
    hit = _ws_cache.get(ws_id)
    if hit and time.time() - hit[0] < 30:
        return hit[1], hit[2]
    db = SessionLocal()
    try:
        w = db.get(Workspace, ws_id)
        pick = (w.ai_model or "", w.ai_models_allowed) if w else ("", None)
    except Exception:  # noqa: BLE001 — before the migration ran
        pick = ("", None)
    finally:
        db.close()
    _ws_cache[ws_id] = (time.time(), *pick)
    return pick


def forget_workspace(ws_id: int) -> None:
    _ws_cache.pop(ws_id, None)


def choose(fallback: str) -> str:
    """The writer for this call: the request's pick, else the workspace's
    default, else ``fallback`` (the platform's) — each only if this workspace
    may use it."""
    from app import billing

    ws, _user = billing.payer()
    requested = billing.requested_model()
    default, allowed = _workspace_choice(ws) if ws else ("", None)
    for key in (requested, default):
        if key and usable(key) and (allowed is None or key in allowed):
            return key
    return fallback


# ── the calls ─────────────────────────────────────────────────────────────
_JSON = "\n\nReply with ONLY the JSON object — no markdown, no words before or after it."
_claude_client = None


def _claude():
    global _claude_client
    if _claude_client is None:
        from anthropic import AnthropicFoundry

        s = get_settings()
        _claude_client = AnthropicFoundry(api_key=s.azure_claude_api_key, resource=s.azure_claude_resource, max_retries=2, timeout=600.0)
    return _claude_client


def _json_from(text: str) -> dict:
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        raise ModelError("The AI didn't return JSON.")
    try:
        return json.loads(m[0])
    except ValueError as exc:
        raise ModelError("The AI returned broken JSON.") from exc


def complete(messages: list[dict], model: str, max_tokens: int, effort: str = "") -> tuple[dict, dict]:
    """A JSON reply from a non-Azure-OpenAI catalog model: (the parsed object,
    usage {"input_tokens", "output_tokens"}). Raises ModelError."""
    provider = CATALOG[model]["provider"]
    if provider == "azure_claude":
        return _complete_claude(messages, model, max_tokens, effort)
    if provider == "gemini":
        return _complete_gemini(messages, model, max_tokens, effort)
    raise ModelError(f"{model} isn't called this way")


def _complete_claude(messages: list[dict], model: str, max_tokens: int, effort: str) -> tuple[dict, dict]:
    import anthropic

    system = "\n\n".join(str(m["content"]) for m in messages if m.get("role") == "system") + _JSON
    turns = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("role") in ("user", "assistant")]
    try:
        # streamed — its thinking counts inside max_tokens, and long Khmer storyboards are big
        with _claude().messages.stream(
            model=model,
            max_tokens=max(max_tokens, 16000),
            system=system,
            output_config={"effort": effort if effort in ("low", "medium", "high") else "medium"},
            messages=turns,
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.RateLimitError as exc:
        raise ModelError("Claude is busy — try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise ModelError(f"Claude said {exc.status_code}: {str(exc)[:200]}") from exc
    except anthropic.APIConnectionError as exc:
        raise ModelError(f"Could not reach Claude: {exc}") from exc
    if msg.stop_reason == "refusal":
        raise ModelError("Claude declined this request.")
    text = next((b.text for b in msg.content if b.type == "text"), "")
    return _json_from(text), {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}


def _complete_gemini(messages: list[dict], model: str, max_tokens: int, effort: str) -> tuple[dict, dict]:
    s = get_settings()
    body = {"model": model, "messages": messages, "response_format": {"type": "json_object"}}
    if effort in ("low", "medium", "high"):
        body["reasoning_effort"] = effort
    try:
        resp = httpx.post(
            gemini_url("/v1beta/openai/chat/completions"),
            headers={"Authorization": f"Bearer {s.gemini_api_key}"},
            json=body,
            timeout=300.0,
        )
    except httpx.HTTPError as exc:
        raise ModelError(f"Could not reach Gemini: {exc}") from exc
    if resp.status_code == 429:
        raise ModelError("Gemini is busy or its daily limit is used up — try again later.")
    if resp.status_code >= 400:
        raise ModelError(f"Gemini said {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    usage = data.get("usage") or {}
    text = data["choices"][0]["message"]["content"]
    return _json_from(text), {"input_tokens": usage.get("prompt_tokens") or 0, "output_tokens": usage.get("completion_tokens") or 0}
