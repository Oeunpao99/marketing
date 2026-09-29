"""Website check — what a digital marketing team needs to know about a
brand's site, in five sections plus an AI summary:

1. Health   — up, HTTPS, SSL expiry, http→https / www redirects, response time
2. SEO      — title, meta description, H1, viewport, lang, canonical, sitemap,
              robots.txt, image alt text, broken links on the homepage
3. Social   — the share preview (Open Graph / Twitter card) every posted link shows
4. Speed    — Google PageSpeed Insights scores + Core Web Vitals, mobile & desktop
5. Domain   — domain expiry (RDAP), email safety (MX / SPF / DMARC)

Checked on demand (Platforms → Website) and weekly (``auto_tick``, from the
content scheduler's minute loop), with a push when the site goes down, the
SSL certificate or domain is about to expire, or the score drops.

This fetches addresses people type in, so every host — and every redirect
hop — must resolve to public internet addresses only (never the server's own
network or the cloud metadata service), and downloads are size- and
time-limited.
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing
from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import Brand, Website
from app.tenancy import current_workspace_id, owned

log = logging.getLogger("app.website")
router = APIRouter(prefix="/website", tags=["Website"])

UA = "Mozilla/5.0 (compatible; ContentFlowSiteCheck/1.0)"
TIMEOUT = 15.0
MAX_BODY = 3_000_000
RECHECK_EVERY = timedelta(days=7)
HISTORY_KEEP = 26
SSL_WARN_DAYS = 14
DOMAIN_WARN_DAYS = 30

_HOST_RE = re.compile(r"^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}(?<!-)\.)+[a-z][a-z0-9-]{1,62}$")


# ── safety: public addresses only ─────────────────────────────────────────
class CheckError(RuntimeError):
    pass


def normalize_domain(raw: str) -> str:
    """"https://www.Example.com/about" → "www.example.com". Raises ValueError."""
    s = (raw or "").strip().lower()
    if "://" not in s:
        s = "http://" + s
    host = (urlparse(s).hostname or "").rstrip(".")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError("That doesn't look like a domain name.") from exc
    if not _HOST_RE.match(host) or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Enter a website address like example.com")
    return host


def _assert_public(host: str) -> None:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise CheckError(f"{host} doesn't resolve — the domain may not exist or its DNS is broken.") from exc
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise CheckError(f"{host} points to a private address — only public websites can be checked.")


def _fetch(url: str, method: str = "GET", max_bytes: int = MAX_BODY, hops: int = 6, verify: bool = True) -> dict:
    """One request with redirects followed by hand, each hop's host checked
    to be public. {"status", "url", "chain": [(status, url)], "headers", "body", "ms"}."""
    chain: list[tuple[int, str]] = []
    started = time.monotonic()
    with httpx.Client(timeout=TIMEOUT, follow_redirects=False, verify=verify, headers={"User-Agent": UA}) as client:
        for _ in range(hops):
            u = urlparse(url)
            if u.scheme not in ("http", "https") or not u.hostname:
                raise CheckError(f"Unsupported address: {url}")
            _assert_public(u.hostname)
            with client.stream(method, url) as r:
                if r.is_redirect and r.headers.get("location"):
                    chain.append((r.status_code, url))
                    url = urljoin(url, r.headers["location"])
                    continue
                body = b""
                if method == "GET":
                    for chunk in r.iter_bytes():
                        body += chunk
                        if len(body) >= max_bytes:
                            break
                return {
                    "status": r.status_code,
                    "url": url,
                    "chain": chain,
                    "headers": {k.lower(): v for k, v in r.headers.items()},
                    "body": body,
                    "ms": int((time.monotonic() - started) * 1000),
                }
    raise CheckError("Too many redirects.")


# ── page reading ──────────────────────────────────────────────────────────
class _Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta: dict[str, str] = {}
        self.lang = ""
        self.canonical = ""
        self.h1: list[str] = []
        self.imgs = 0
        self.imgs_no_alt = 0
        self.links: list[str] = []
        self._in = ""

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "title":
            self._in = "title"
        elif tag == "h1":
            self._in = "h1"
            self.h1.append("")
        elif tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key and "content" in a:
                self.meta.setdefault(key, a["content"].strip())
        elif tag == "link" and "canonical" in a.get("rel", "").lower():
            self.canonical = a.get("href", "")
        elif tag == "img":
            self.imgs += 1
            if not a.get("alt", "").strip():
                self.imgs_no_alt += 1
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag in ("title", "h1"):
            self._in = ""

    def handle_data(self, data):
        if self._in == "title":
            self.title += data
        elif self._in == "h1" and self.h1:
            self.h1[-1] += data


def _item(key: str, label: str, status: str, detail: str, fix: str = "") -> dict:
    """status: pass | warn | fail | info (info = shown, not scored)."""
    return {"key": key, "label": label, "status": status, "detail": detail, "fix": fix}


# ── the checks ────────────────────────────────────────────────────────────
def _ssl_info(host: str) -> dict:
    _assert_public(host)
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=10) as sock, ctx.wrap_socket(sock, server_hostname=host) as s:
            cert = s.getpeercert()
    except ssl.SSLCertVerificationError as exc:
        return {"valid": False, "error": exc.verify_message or str(exc)}
    except OSError as exc:
        return {"valid": False, "error": f"No HTTPS on port 443 ({exc.__class__.__name__})"}
    expires = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
    issuer = dict(x[0] for x in cert.get("issuer", ())).get("organizationName", "")
    return {"valid": True, "expires": expires.date().isoformat(), "days_left": (expires - datetime.now(UTC)).days, "issuer": issuer}


def _health(host: str) -> tuple[list[dict], dict | None, dict]:
    items: list[dict] = []
    page = None
    try:
        page = _fetch(f"https://{host}/")
    except (httpx.HTTPError, CheckError) as exc:
        try:
            page = _fetch(f"https://{host}/", verify=False)  # up, but its certificate is broken
        except (httpx.HTTPError, CheckError):
            try:
                page = _fetch(f"http://{host}/")
            except (httpx.HTTPError, CheckError) as exc2:
                items.append(_item("up", "Website is online", "fail", f"Couldn't open the site: {exc2}", "Check the hosting and the domain's DNS records."))
                return items, None, {}
        log.info("website %s: https fetch failed (%s)", host, exc)

    ok = 200 <= page["status"] < 400
    items.append(
        _item("up", "Website is online", "pass" if ok else "fail",
              f"Answered with status {page['status']} in {page['ms']} ms." if ok else f"The homepage answers with an error ({page['status']}).",
              "" if ok else "Fix the page error on the server — visitors and Google see a broken site.")
    )
    items.append(
        _item("speed", "Server answers quickly",
              "pass" if page["ms"] < 1500 else "warn" if page["ms"] < 4000 else "fail",
              f"{page['ms']} ms to load the homepage from our server.",
              "" if page["ms"] < 1500 else "Slow first answer — ask your host about caching or a CDN.")
    )
    final_https = page["url"].startswith("https://")
    tls = _ssl_info(urlparse(page["url"]).hostname or host) if final_https else {"valid": False, "error": "The site doesn't use HTTPS."}
    if tls.get("valid"):
        days = tls["days_left"]
        items.append(
            _item("ssl", "HTTPS certificate (padlock)",
                  "pass" if days > SSL_WARN_DAYS else "warn" if days > 0 else "fail",
                  f"Valid until {tls['expires']} ({days} days left){' · ' + tls['issuer'] if tls.get('issuer') else ''}.",
                  "" if days > SSL_WARN_DAYS else "Renew the SSL certificate now, or browsers will show “Not secure”.")
        )
    else:
        items.append(_item("ssl", "HTTPS certificate (padlock)", "fail", tls.get("error", "No valid certificate."),
                           "Install a free certificate (e.g. Let's Encrypt) so browsers show the padlock."))

    try:
        plain = _fetch(f"http://{host}/", method="HEAD")
        redirects = plain["url"].startswith("https://")
        items.append(_item("http_redirect", "http:// sends people to https://", "pass" if redirects else "warn",
                           "Visitors typing http:// land on the secure version." if redirects else "http:// stays unsecured.",
                           "" if redirects else "Add a redirect from http:// to https:// on your server."))
    except (httpx.HTTPError, CheckError):
        items.append(_item("http_redirect", "http:// sends people to https://", "info", "Plain http:// isn't served — fine if https works."))

    # www ↔ bare domain only for a main domain (example.com / www.example.com)
    # — nobody types "www." in front of a sub-address like shop.example.com.
    root = _registrable(host)
    if host not in (root, f"www.{root}"):
        return items, page, tls
    other = host[4:] if host.startswith("www.") else f"www.{host}"
    try:
        alt = _fetch(f"https://{other}/", method="HEAD")
        same = urlparse(alt["url"]).hostname == urlparse(page["url"]).hostname
        items.append(_item("www", f"{other} works too", "pass" if same else "warn",
                           f"{other} leads to the same site." if same else f"{other} opens a different address ({urlparse(alt['url']).hostname}).",
                           "" if same else f"Redirect {other} to your main address so links and SEO aren't split."))
    except (httpx.HTTPError, CheckError):
        items.append(_item("www", f"{other} works too", "warn", f"{other} doesn't open.",
                           f"Point {other} to your site — people often type it."))
    return items, page, tls


def _seo_and_social(host: str, page: dict) -> tuple[list[dict], list[dict], dict]:
    ctype = page["headers"].get("content-type", "")
    charset = ctype.split("charset=")[-1].split(";")[0].strip().strip('"') if "charset=" in ctype else "utf-8"
    try:
        html = page["body"].decode(charset or "utf-8", errors="replace")
    except LookupError:  # an unknown charset name
        html = page["body"].decode("utf-8", errors="replace")
    p = _Page()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001 — broken HTML still gives partial results
        pass
    title = " ".join(p.title.split())
    desc = p.meta.get("description", "")
    h1 = [" ".join(t.split()) for t in p.h1 if t.strip()]
    base = page["url"]
    seo: list[dict] = []

    seo.append(
        _item("title", "Page title", "fail" if not title else "pass" if 10 <= len(title) <= 65 else "warn",
              f"“{title[:90]}” ({len(title)} characters)." if title else "No title.",
              "" if title and 10 <= len(title) <= 65 else "Write a 30–60 character title with your brand and what you offer — it's the blue link in Google.")
    )
    seo.append(
        _item("description", "Meta description", "fail" if not desc else "pass" if 50 <= len(desc) <= 165 else "warn",
              f"“{desc[:120]}” ({len(desc)} characters)." if desc else "No description.",
              "" if desc and 50 <= len(desc) <= 165 else "Add a 120–160 character description — Google shows it under your title.")
    )
    seo.append(
        _item("h1", "One main heading (H1)", "pass" if len(h1) == 1 else "warn" if h1 else "fail",
              f"{len(h1)} H1 heading{'s' if len(h1) != 1 else ''}{': “' + h1[0][:70] + '”' if h1 else ''}.",
              "" if len(h1) == 1 else "Use exactly one H1 that says what the page is about.")
    )
    vp = p.meta.get("viewport", "")
    seo.append(_item("mobile", "Mobile-ready", "pass" if "width=device-width" in vp else "fail",
                     "Adapts to phone screens." if "width=device-width" in vp else "No mobile viewport tag.",
                     "" if "width=device-width" in vp else "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">."))
    seo.append(_item("lang", "Language set", "pass" if p.lang else "warn",
                     f"Language: {p.lang}." if p.lang else "The page doesn't say its language.",
                     "" if p.lang else "Add lang=\"km\" or lang=\"en\" to the <html> tag."))
    seo.append(_item("canonical", "Canonical address", "pass" if p.canonical else "warn",
                     f"Points Google to {p.canonical[:80]}." if p.canonical else "No canonical link.",
                     "" if p.canonical else "Add a canonical link so Google knows your main address."))
    robots_meta = p.meta.get("robots", "")
    if "noindex" in robots_meta.lower():
        seo.append(_item("noindex", "Allowed in Google", "fail", "The homepage tells Google not to index it (noindex).",
                         "Remove “noindex” — right now Google is told to hide your homepage."))
    if p.imgs:
        missing = p.imgs_no_alt
        seo.append(_item("alt", "Images have alt text", "pass" if missing == 0 else "warn" if missing / p.imgs <= 0.3 else "fail",
                         f"{p.imgs - missing} of {p.imgs} images described.",
                         "" if missing == 0 else f"Describe the {missing} image{'s' if missing != 1 else ''} with alt text — it helps Google Images and screen readers."))

    sitemap_in_robots = False
    try:
        rb = _fetch(urljoin(base, "/robots.txt"), max_bytes=200_000)
        robots_txt = rb["body"].decode("utf-8", errors="replace") if rb["status"] == 200 else ""
        blocks_all = bool(re.search(r"(?im)^user-agent:\s*\*\s*$[\s\S]*?^disallow:\s*/\s*$", robots_txt))
        sitemap_in_robots = "sitemap:" in robots_txt.lower()
        seo.append(_item("robots", "robots.txt", "fail" if blocks_all else "pass" if robots_txt else "warn",
                         "Blocks all search engines!" if blocks_all else "Found." if robots_txt else "Not found.",
                         "Remove “Disallow: /” — it blocks Google from your whole site." if blocks_all else "" if robots_txt else "Add a robots.txt that lists your sitemap."))
    except (httpx.HTTPError, CheckError):
        seo.append(_item("robots", "robots.txt", "warn", "Couldn't read robots.txt."))
    try:
        sm = _fetch(urljoin(base, "/sitemap.xml"), max_bytes=50_000)
        found = sm["status"] == 200 and b"<" in sm["body"][:500]
        seo.append(_item("sitemap", "Sitemap", "pass" if found or sitemap_in_robots else "warn",
                         "Found — Google can find all your pages." if found or sitemap_in_robots else "No sitemap.xml.",
                         "" if found or sitemap_in_robots else "Add a sitemap.xml and submit it in Google Search Console."))
    except (httpx.HTTPError, CheckError):
        seo.append(_item("sitemap", "Sitemap", "warn", "Couldn't read sitemap.xml."))

    # Broken links on the homepage — a sample, so a check stays quick.
    internal = []
    for href in p.links:
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        full = urljoin(base, href).split("#")[0]
        if urlparse(full).scheme in ("http", "https") and full not in internal:
            internal.append(full)
    sample = internal[:12]
    broken = []

    def _probe(u: str) -> str | None:
        try:
            r = _fetch(u, method="HEAD", hops=4)
            if r["status"] in (405, 403):  # some servers refuse HEAD
                r = _fetch(u, max_bytes=2048, hops=4)
            return u if r["status"] >= 400 else None
        except (httpx.HTTPError, CheckError):
            return u

    if sample:
        with ThreadPoolExecutor(max_workers=6) as pool:
            broken = [u for u in pool.map(_probe, sample) if u]
        seo.append(_item("links", "No broken links", "pass" if not broken else "warn" if len(broken) <= 2 else "fail",
                         f"{len(sample) - len(broken)} of {len(sample)} homepage links work." + (f" Broken: {', '.join(b[:60] for b in broken[:3])}" if broken else ""),
                         "" if not broken else "Fix or remove the broken links — they lose visitors and look careless to Google."))

    # Share preview — what every posted link shows on Facebook / Telegram / LinkedIn.
    og_title = p.meta.get("og:title", "")
    og_desc = p.meta.get("og:description", "")
    og_image = p.meta.get("og:image", "")
    social: list[dict] = [
        _item("og_title", "Share title", "pass" if og_title else "warn", f"“{og_title[:80]}”." if og_title else "No og:title — platforms guess one.",
              "" if og_title else "Add an og:title so shared links show a clean title."),
        _item("og_desc", "Share description", "pass" if og_desc else "warn", f"“{og_desc[:100]}”." if og_desc else "No og:description.",
              "" if og_desc else "Add an og:description — the line under the title in a shared link."),
    ]
    image_url = urljoin(base, og_image) if og_image else ""
    if image_url:
        try:
            im = _fetch(image_url, max_bytes=8_000_000, hops=4)
            size = None
            if im["status"] == 200:
                try:
                    import io

                    from PIL import Image

                    size = Image.open(io.BytesIO(im["body"])).size
                except Exception:  # noqa: BLE001
                    size = None
            good = size and size[0] >= 600
            social.append(_item("og_image", "Share image", "pass" if good else "warn",
                                f"{size[0]}×{size[1]} px." if size else f"The image doesn't load ({im['status']}).",
                                "" if good else "Use a 1200×630 px image so shared links show a big, sharp picture."))
        except (httpx.HTTPError, CheckError):
            social.append(_item("og_image", "Share image", "warn", "The share image doesn't load.", "Fix the og:image address."))
    else:
        social.append(_item("og_image", "Share image", "fail", "No og:image — shared links show no picture (or a random one).",
                            "Add an og:image (1200×630 px) — it's the biggest part of every shared link."))
    card = p.meta.get("twitter:card", "")
    social.append(_item("twitter", "Large-image card", "pass" if card else "info",
                        f"twitter:card = {card}." if card else "No twitter:card (only needed for X/Twitter)."))

    preview = {"title": og_title or title, "description": og_desc or desc, "image": image_url, "site": urlparse(base).hostname}
    return seo, social, preview


def _pagespeed(url: str, strategy: str) -> dict | None:
    params: list[tuple[str, str]] = [("url", url), ("strategy", strategy)] + [
        ("category", c) for c in ("performance", "seo", "accessibility", "best-practices")
    ]
    if key := get_settings().pagespeed_api_key:
        params.append(("key", key))
    try:
        r = httpx.get("https://www.googleapis.com/pagespeedonline/v5/runPagespeed", params=params, timeout=120.0)
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("pagespeed %s failed: %s", strategy, exc)
        return None
    if r.status_code != 200 or "lighthouseResult" not in data:
        log.warning("pagespeed %s: %s", strategy, (data.get("error") or {}).get("message", r.status_code))
        return {"error": (data.get("error") or {}).get("message", f"Google returned {r.status_code}")[:200]}
    lh = data["lighthouseResult"]
    scores = {k: round(v["score"] * 100) for k, v in lh.get("categories", {}).items() if v.get("score") is not None}
    audits = lh.get("audits", {})
    metrics = {
        name: audits[aid].get("displayValue", "")
        for name, aid in (
            ("Largest content shown", "largest-contentful-paint"),
            ("First content shown", "first-contentful-paint"),
            ("Blocking time", "total-blocking-time"),
            ("Layout shift", "cumulative-layout-shift"),
            ("Speed index", "speed-index"),
        )
        if aid in audits
    }
    return {"scores": scores, "metrics": metrics}


def _speed_items(ps: dict) -> list[dict]:
    items = []
    for strategy, label in (("mobile", "Phone"), ("desktop", "Computer")):
        r = ps.get(strategy)
        if not r or r.get("error"):
            items.append(_item(f"ps_{strategy}", f"Google speed score — {label}", "info",
                               (r or {}).get("error") or "Google's check didn't answer this time."))
            continue
        perf = r["scores"].get("performance")
        if perf is not None:
            items.append(_item(f"ps_{strategy}", f"Google speed score — {label}", "pass" if perf >= 90 else "warn" if perf >= 50 else "fail",
                               f"{perf}/100 · SEO {r['scores'].get('seo', '—')} · Accessibility {r['scores'].get('accessibility', '—')}",
                               "" if perf >= 90 else "Compress images, remove unused scripts and use caching — Google ranks fast sites higher."))
    return items


def _doh(name: str, rtype: str) -> list[str]:
    try:
        r = httpx.get("https://dns.google/resolve", params={"name": name, "type": rtype}, timeout=10.0)
        return [a["data"].strip('"').replace('" "', "") for a in r.json().get("Answer", []) if a.get("type") in (1, 5, 15, 16, 28)]
    except (httpx.HTTPError, ValueError):
        return []


def _registrable(host: str) -> str:
    """example.com from www.example.com; shop.com.kh from www.shop.com.kh."""
    parts = host.split(".")
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in {"com", "org", "net", "edu", "gov", "co", "ac", "per", "mil"}:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _domain(host: str) -> tuple[list[dict], dict]:
    root = _registrable(host)
    items: list[dict] = []
    info: dict = {"root": root}
    try:
        r = httpx.get(f"https://rdap.org/domain/{root}", timeout=15.0, follow_redirects=True)
        events = {e.get("eventAction"): e.get("eventDate", "") for e in r.json().get("events", [])} if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        events = {}
    exp = events.get("expiration", "")
    if exp:
        when = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        days = (when - datetime.now(UTC)).days
        info["expires"], info["days_left"] = when.date().isoformat(), days
        items.append(_item("domain_expiry", "Domain registration", "pass" if days > DOMAIN_WARN_DAYS else "warn" if days > 0 else "fail",
                           f"{root} is registered until {when.date().isoformat()} ({days} days left).",
                           "" if days > DOMAIN_WARN_DAYS else "Renew the domain now — if it expires, the website and email stop working."))
    else:
        items.append(_item("domain_expiry", "Domain registration", "info",
                           f"{root}'s registry doesn't publish its expiry date (common for .kh) — check with your domain seller."))
    mx = _doh(root, "MX")
    txt = _doh(root, "TXT")
    dmarc = [t for t in _doh(f"_dmarc.{root}", "TXT") if t.lower().startswith("v=dmarc1")]
    spf = [t for t in txt if t.lower().startswith("v=spf1")]
    items.append(_item("mx", "Email server (MX)", "pass" if mx else "info",
                       f"Email is set up ({len(mx)} MX record{'s' if len(mx) != 1 else ''})." if mx else "No email on this domain."))
    if mx:
        items.append(_item("spf", "SPF (emails not marked as spam)", "pass" if spf else "fail",
                           spf[0][:120] if spf else "No SPF record.",
                           "" if spf else "Add an SPF record from your email provider — without it, your emails go to spam."))
        policy = re.search(r"p=(\w+)", dmarc[0]).group(1).lower() if dmarc and re.search(r"p=(\w+)", dmarc[0]) else ""
        items.append(_item("dmarc", "DMARC (stops fake emails in your name)",
                           "pass" if policy in ("quarantine", "reject") else "warn" if dmarc else "fail",
                           f"Policy: {policy or 'set'}." if dmarc else "No DMARC record.",
                           "" if policy in ("quarantine", "reject") else "Add a DMARC record (start with p=none, then move to quarantine) so no one can send email as you."))
    return items, info


# ── scoring + AI summary ──────────────────────────────────────────────────
SECTION_WEIGHTS = {"health": 30, "seo": 25, "social": 15, "speed": 20, "domain": 10}
SECTION_TITLES = {
    "health": "Is the website working?",
    "seo": "Can Google find it?",
    "social": "Does it look good when shared?",
    "speed": "Google's speed scores",
    "domain": "Is the domain and email safe?",
}


def _section_score(items: list[dict]) -> int | None:
    scored = [i for i in items if i["status"] in ("pass", "warn", "fail")]
    if not scored:
        return None
    return round(100 * sum({"pass": 1, "warn": 0.5, "fail": 0}[i["status"]] for i in scored) / len(scored))


def _overall(sections: list[dict]) -> int:
    parts = [(SECTION_WEIGHTS[s["key"]], s["score"]) for s in sections if s["score"] is not None]
    total = sum(w for w, _ in parts) or 1
    return round(sum(w * sc for w, sc in parts) / total)


SUMMARY_PROMPT = (
    "You are a digital marketing consultant explaining a website check to a small business "
    "owner in Cambodia. Use ONLY the check results given — never invent numbers or problems. "
    "Plain, friendly English.\n"
    "Return JSON: {\"summary\": \"2 sentences: how the site is doing overall and the single most "
    "important thing\", \"fixes\": [{\"title\": \"short\", \"why\": \"1 sentence: what it costs the "
    "business (visitors, trust, shares, Google ranking)\", \"how\": \"1 sentence, concrete\"}] (the 3 "
    "most important problems, most urgent first; fewer if there are fewer), \"post_ideas\": [\"3 "
    "short social post ideas based on what the site is about (its title, description and "
    "heading)\"]}"
)


def _ai_summary(host: str, sections: list[dict], preview: dict, score: int) -> dict | None:
    from app.content_ai import ContentAIError, _chat

    lines = [f"Website: {host} · overall score {score}/100", f"Title: {preview.get('title', '')}", f"Description: {preview.get('description', '')}"]
    for s in sections:
        lines.append(f"\n{SECTION_TITLES[s['key']]} (score {s['score']}):")
        lines += [f"- [{i['status']}] {i['label']}: {i['detail']}" for i in s["items"]]
    try:
        out = _chat([{"role": "system", "content": SUMMARY_PROMPT}, {"role": "user", "content": "\n".join(lines)[:8000]}],
                    get_settings().azure_openai_deployment, max_tokens=2000)
    except ContentAIError as exc:
        log.info("website summary skipped for %s: %s", host, exc)
        return None
    if not isinstance(out, dict):
        return None
    fixes = [
        {k: str(f.get(k) or "")[:300] for k in ("title", "why", "how")}
        for f in (out.get("fixes") or [])[:3]
        if isinstance(f, dict) and f.get("title")
    ]
    return {"summary": str(out.get("summary") or "")[:500], "fixes": fixes, "post_ideas": [str(p)[:200] for p in (out.get("post_ideas") or [])[:3]]}


def run_check(host: str, with_ai: bool = True, step=lambda _p, _s: None) -> dict:
    """The full check for one domain. Never raises for a site problem — a
    site that's down comes back as a report that says so."""
    def _broken(key: str, exc: Exception) -> list[dict]:
        # One part failing on an odd site shouldn't lose the whole report.
        log.exception("website %s: %s check failed", host, key)
        return [_item(f"{key}_error", "Couldn't finish this part", "info", f"Something went wrong checking this ({exc.__class__.__name__}) — try again later.")]

    step(10, "Checking the website is online…")
    health, page, tls = _health(host)
    sections = [{"key": "health", "items": health}]
    preview: dict = {}
    ps: dict = {}
    if page is not None:
        step(30, "Reading the page for SEO and the share preview…")
        try:
            seo, social, preview = _seo_and_social(host, page)
        except Exception as exc:  # noqa: BLE001
            seo = social = _broken("seo", exc)
        sections += [{"key": "seo", "items": seo}, {"key": "social", "items": social}]
        step(45, "Asking Google for its speed scores (about a minute)…")
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                mob, desk = pool.submit(_pagespeed, page["url"], "mobile"), pool.submit(_pagespeed, page["url"], "desktop")
                ps = {"mobile": mob.result(), "desktop": desk.result()}
            speed = _speed_items(ps)
        except Exception as exc:  # noqa: BLE001
            ps, speed = {}, _broken("speed", exc)
        sections.append({"key": "speed", "items": speed})
    step(80, "Checking the domain and email…")
    try:
        domain_items, domain_info = _domain(host)
    except Exception as exc:  # noqa: BLE001
        domain_items, domain_info = _broken("domain", exc), {"root": _registrable(host)}
    sections.append({"key": "domain", "items": domain_items})
    for s in sections:
        s["title"] = SECTION_TITLES[s["key"]]
        s["score"] = _section_score(s["items"])
    score = _overall(sections)
    summary = None
    if with_ai:
        step(90, "Writing your summary…")
        summary = _ai_summary(host, sections, preview, score)
    return {
        "domain": host,
        "url": page["url"] if page else f"https://{host}/",
        "checked_at": datetime.now(UTC).isoformat(),
        "score": score,
        "sections": sections,
        "pagespeed": ps,
        "preview": preview,
        "ssl": tls,
        "domain_info": domain_info,
        "ai": summary,
    }


# ── saving + alerts ───────────────────────────────────────────────────────
def _problems(result: dict, prev_score: int | None) -> dict[str, str]:
    """{problem key: message} worth a push."""
    items = {i["key"]: i for s in result["sections"] for i in s["items"]}
    out: dict[str, str] = {}
    if items.get("up", {}).get("status") == "fail":
        out["down"] = f"{result['domain']} is down — {items['up']['detail']}"
    ssl_days = (result.get("ssl") or {}).get("days_left")
    if ssl_days is not None and ssl_days <= SSL_WARN_DAYS:
        out[f"ssl-{result['ssl'].get('expires')}"] = f"{result['domain']}'s SSL certificate expires in {max(ssl_days, 0)} days."
    dom_days = (result.get("domain_info") or {}).get("days_left")
    if dom_days is not None and dom_days <= DOMAIN_WARN_DAYS:
        out[f"domain-{result['domain_info'].get('expires')}"] = f"The domain {result['domain_info']['root']} expires in {max(dom_days, 0)} days."
    if prev_score is not None and prev_score - result["score"] >= 10:
        out[f"drop-{result['checked_at'][:10]}"] = f"{result['domain']}'s website score dropped from {prev_score} to {result['score']}."
    return out


def save_result(db: Session, site: Website, result: dict, notify: bool) -> None:
    prev = site.score
    site.result = result
    site.score = result["score"]
    site.checked_at = datetime.now(UTC)
    mobile = ((result.get("pagespeed") or {}).get("mobile") or {}).get("scores", {}).get("performance")
    site.history = ([*site.history, {"at": result["checked_at"], "score": result["score"], "mobile": mobile}])[-HISTORY_KEEP:]
    problems = _problems(result, prev)
    alerted = dict(site.alerted or {})
    new = {k: v for k, v in problems.items() if k not in alerted}
    # Forget problems that went away, so they alert again if they come back.
    site.alerted = {k: alerted.get(k) or datetime.now(UTC).isoformat() for k in problems}
    db.commit()
    if notify and new:
        from app.push import notify_workspace

        brand = db.get(Brand, site.brand_id)
        notify_workspace(site.workspace_id, "website", f"Website alert — {brand.name if brand else site.domain}",
                         " · ".join(new.values()), "/website", f"website-{site.id}")


# ── background jobs (one per brand, like the weekly plan's) ───────────────
_jobs: dict[int, dict] = {}
_jobs_lock = threading.Lock()
_JOB_MEMORY = timedelta(minutes=10)


def job_status(brand_id: int) -> dict | None:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j and j["status"] != "running" and datetime.now(UTC) - j["_at"] > _JOB_MEMORY:
            _jobs.pop(brand_id, None)
            return None
        return {k: v for k, v in j.items() if not k.startswith("_")} if j else None


def _set(brand_id: int, **fields) -> None:
    with _jobs_lock:
        if brand_id in _jobs:
            _jobs[brand_id].update(fields, _at=datetime.now(UTC))


def _check_job(brand_id: int, notify: bool = False) -> None:
    db = SessionLocal()
    try:
        site = db.scalar(select(Website).where(Website.brand_id == brand_id))
        if site is None:
            _set(brand_id, status="failed", error="No website set.")
            return
        billing.bind(site.workspace_id)  # the AI summary is this workspace's
        try:
            billing.require_current()
            with_ai = True
        except billing.OutOfCredit:
            with_ai = False
        result = run_check(site.domain, with_ai=with_ai, step=lambda p, s: _set(brand_id, progress=p, step=s))
        save_result(db, site, result, notify)
        _set(brand_id, status="done", progress=100, step="Done")
    except Exception:  # noqa: BLE001 — show the failure on the page, not just the log
        db.rollback()
        log.exception("website check crashed for brand %s", brand_id)
        _set(brand_id, status="failed", step="Failed", error="The check crashed — try again in a minute.")
    finally:
        db.close()


def start_check(brand_id: int, notify: bool = False) -> dict:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j and j["status"] == "running":
            raise HTTPException(409, "Already checking this website — give it a minute.")
        _jobs[brand_id] = {"brand_id": brand_id, "status": "running", "progress": 2, "step": "Starting…", "error": "", "_at": datetime.now(UTC)}
    threading.Thread(target=_check_job, args=(brand_id, notify), daemon=True, name=f"website-{brand_id}").start()
    return job_status(brand_id)


# ── weekly re-checks (called every minute by content_scheduler._tick) ─────
_auto_running = threading.Lock()


def _auto_run(brand_ids: list[int]) -> None:
    try:
        for bid in brand_ids:
            with _jobs_lock:
                busy = _jobs.get(bid, {}).get("status") == "running"
                if not busy:
                    _jobs[bid] = {"brand_id": bid, "status": "running", "progress": 2, "step": "Weekly check…", "error": "", "_at": datetime.now(UTC)}
            if not busy:
                _check_job(bid, notify=True)
    finally:
        _auto_running.release()


def auto_tick(db: Session, now: datetime) -> int:
    """Start the weekly re-check for websites not checked in 7 days — at most
    5 per run, one after another in the background, so the scheduler's
    minute loop never waits on a slow site. Returns how many were started."""
    if not _auto_running.acquire(blocking=False):
        return 0
    due = db.scalars(
        select(Website.brand_id)
        .where((Website.checked_at.is_(None)) | (Website.checked_at < now - RECHECK_EVERY))
        .order_by(Website.checked_at.nulls_first())
        .limit(5)
    ).all()
    if not due:
        _auto_running.release()
        return 0
    threading.Thread(target=_auto_run, args=(list(due),), daemon=True, name="website-weekly").start()
    return len(due)


# ── API ───────────────────────────────────────────────────────────────────
class WebsiteIn(BaseModel):
    brand_id: int
    domain: str = Field(min_length=3, max_length=300)


def _out(site: Website | None) -> dict | None:
    if site is None:
        return None
    return {
        "brand_id": site.brand_id,
        "domain": site.domain,
        "score": site.score,
        "checked_at": site.checked_at,
        "history": site.history or [],
        "result": site.result,
    }


@router.get("")
def website_view(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    site = db.scalar(select(Website).where(Website.brand_id == brand_id))
    return {"website": _out(site), "job": job_status(brand_id)}


@router.put("")
def website_set(payload: WebsiteIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Set (or change) the brand's website, then check it straight away."""
    owned(db, Brand, payload.brand_id, ws)
    try:
        host = normalize_domain(payload.domain)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    site = db.scalar(select(Website).where(Website.brand_id == payload.brand_id))
    if site is None:
        site = Website(workspace_id=ws, brand_id=payload.brand_id, domain=host)
        db.add(site)
    elif site.domain != host:
        site.domain, site.result, site.score, site.checked_at, site.history, site.alerted = host, None, None, None, [], {}
    db.commit()
    return {"website": _out(site), "job": start_check(payload.brand_id)}


@router.post("/check", status_code=202)
def website_check(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    if db.scalar(select(Website.id).where(Website.brand_id == brand_id)) is None:
        raise HTTPException(404, "Add the website address first.")
    return start_check(brand_id)


@router.get("/job")
def website_job(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    return job_status(brand_id) or {"brand_id": brand_id, "status": "idle"}


@router.delete("", status_code=204)
def website_remove(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    site = db.scalar(select(Website).where(Website.brand_id == brand_id))
    if site is not None:
        db.delete(site)
        db.commit()
