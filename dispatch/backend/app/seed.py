"""Idempotent seed data mirroring the React prototype's mock fixtures.

Run with:  uv run python -m app.seed
"""

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import (
    Automation,
    Brand,
    Channel,
    Draft,
    Platform,
    Post,
    PostTarget,
    TeamMember,
    Video,
)

# Seed times are Phnom Penh wall-clock (UTC+7); stored as the equivalent instant.
PHNOM_PENH = timezone(timedelta(hours=7))
TODAY = datetime(2026, 9, 4, tzinfo=PHNOM_PENH)

BRANDS = [
    dict(
        slug="assist", name="AI Smart Assistance", lang="English", note="Product tips, short demos"
    ),
    dict(slug="chum", name="Chumnouykar", lang="Khmer", note="Everyday help, community"),
    dict(slug="hub", name="AI Hub", lang="Khmer + English", note="News, tools, tutorials"),
]

PLATFORMS = [
    dict(
        slug="facebook",
        name="Facebook",
        char_limit=5000,
        supports_title=False,
        post_as="Posts as a Reel",
    ),
    dict(
        slug="tiktok", name="TikTok", char_limit=2200, supports_title=False, post_as="Posts to feed"
    ),
    dict(
        slug="youtube",
        name="YouTube",
        char_limit=5000,
        supports_title=True,
        post_as="Posts as a Short",
    ),
    dict(
        slug="instagram",
        name="Instagram",
        char_limit=2200,
        supports_title=False,
        post_as="Posts as a Reel",
    ),
    dict(
        slug="telegram",
        name="Telegram",
        char_limit=4096,
        supports_title=False,
        post_as="Posts to channel",
    ),
]

CHANNELS = [
    ("assist", "facebook", "AI Smart Assistance", "live", "Page token · no expiry"),
    ("assist", "tiktok", "@aismartassist", "live", "Refreshes in 41 days"),
    ("assist", "youtube", "AI Smart Assistance", "live", "Refreshes in 22 days"),
    ("chum", "facebook", "Chumnouykar", "live", "Page token · no expiry"),
    ("chum", "tiktok", "@chumnouykar", "live", "Refreshes in 6 days"),
    ("chum", "youtube", "Chumnouykar", "soon", "Token expires in 2 days"),
    ("hub", "facebook", "AI Hub", "live", "Page token · no expiry"),
    ("hub", "tiktok", "@aihub.kh", "live", "Refreshes in 58 days"),
    ("hub", "youtube", "—", "off", "Not connected"),
    ("assist", "instagram", "", "off", "Not connected"),
    ("chum", "instagram", "", "off", "Not connected"),
    ("hub", "instagram", "", "off", "Not connected"),
    # Telegram channels start disconnected — connect each with a bot token + chat_id.
    ("assist", "telegram", "", "off", "Add bot token to connect"),
    ("chum", "telegram", "", "off", "Add bot token to connect"),
    ("hub", "telegram", "", "off", "Add bot token to connect"),
]

VIDEOS = [
    (
        "chumnouykar-tip-042.mp4",
        "chum",
        47,
        "1080x1920",
        38,
        "sample videos / demo clip 1",
        "Data saving tips",
    ),
    (
        "assist-pdf-summary.mp4",
        "assist",
        41,
        "1080x1920",
        31,
        "sample videos / demo clip 2",
        "Product demo",
    ),
    (
        "hub-ai-tools-week.mp4",
        "hub",
        63,
        "1080x1920",
        52,
        "sample videos / demo clip 3",
        "Weekly news",
    ),
    (
        "chum-grab-pro.mp4",
        "chum",
        38,
        "1080x1920",
        29,
        "sample videos / demo clip 4",
        "Everyday help",
    ),
    (
        "assist-voice-note.mp4",
        "assist",
        55,
        "1080x1920",
        44,
        "sample videos / demo clip 5",
        "Product demo",
    ),
    (
        "hub-student-tools.mp4",
        "hub",
        72,
        "1080x1920",
        58,
        "sample videos / demo clip 6",
        "For students",
    ),
]

# (time, brand, [platform slugs], title, caption, status)
QUEUE = [
    (
        "07:30",
        "chum",
        ["facebook"],
        "3 ways to save phone data",
        "បើកទូរស័ព្ទហើយចំណាយ data លឿនពេក? សាកល្បង ៣ វិធីនេះ…",
        "posted",
    ),
    (
        "08:00",
        "chum",
        ["tiktok"],
        "3 ways to save phone data",
        "Data អស់លឿន? សាកមើល ៣ វិធីនេះ #Cambodia #tips",
        "posted",
    ),
    (
        "12:00",
        "assist",
        ["facebook", "tiktok"],
        "Ask AI to summarise a PDF",
        "Stop reading 40 pages. Ask it for the five that matter.",
        "scheduled",
    ),
    (
        "18:00",
        "hub",
        ["facebook"],
        "New AI tools this week",
        "Four tools worth your time this week, and one that isn't.",
        "scheduled",
    ),
    (
        "19:30",
        "chum",
        ["facebook", "tiktok"],
        "Booking a Grab like a pro",
        "វិធីកក់ Grab ឲ្យបានតម្លៃសមរម្យ…",
        "scheduled",
    ),
    (
        "20:30",
        "hub",
        ["tiktok", "youtube"],
        "New AI tools this week",
        "Four tools worth your time this week. Link in bio.",
        "scheduled",
    ),
]

DRAFTS = [
    ("chum", "How to spot a fake Facebook page", "05:02", 52),
    ("assist", "Turn a voice note into meeting notes", "05:04", 41),
    ("hub", "Three free AI tools for students", "05:07", 63),
]

AUTOMATIONS = [
    ("chum", True, time(5, 0), 2, "Trending in Cambodia + your topic bank", True),
    ("assist", True, time(5, 0), 1, "Product feature list", True),
    ("hub", False, time(6, 0), 1, "AI news feeds", True),
]


def _hhmm(s: str) -> datetime:
    h, m = (int(x) for x in s.split(":"))
    return TODAY.replace(hour=h, minute=m)


def run() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(Brand).limit(1)) is not None:
            print("Seed data already present -- nothing to do.")
            return

        from app.models import Workspace

        workspace = Workspace(name="Demo workspace")
        db.add(workspace)
        db.flush()
        brands = {b["slug"]: Brand(**b, workspace_id=workspace.id) for b in BRANDS}
        platforms = {p["slug"]: Platform(**p) for p in PLATFORMS}
        db.add_all([*brands.values(), *platforms.values()])
        db.flush()

        channels: dict[tuple[str, str], Channel] = {}
        for bslug, pslug, handle, status, note in CHANNELS:
            ch = Channel(
                brand_id=brands[bslug].id,
                platform_id=platforms[pslug].id,
                handle=handle,
                status=status,
                token_note=note,
            )
            channels[(bslug, pslug)] = ch
            db.add(ch)

        videos: dict[str, Video] = {}
        for fname, bslug, dur, res, mb, src, tag in VIDEOS:
            v = Video(
                workspace_id=workspace.id,
                brand_id=brands[bslug].id,
                filename=fname,
                duration_seconds=dur,
                resolution=res,
                size_bytes=mb * 1024 * 1024,
                source=src,
                tag=tag,
            )
            videos[bslug] = v
            db.add(v)
        db.flush()

        for tstr, bslug, pslugs, title, caption, status in QUEUE:
            post = Post(
                brand_id=brands[bslug].id,
                video_id=videos.get(bslug).id if videos.get(bslug) else None,
                title=title,
                status="posted" if status == "posted" else "scheduled",
            )
            db.add(post)
            db.flush()
            for pslug in pslugs:
                ch = channels.get((bslug, pslug))
                if ch is None:
                    continue
                db.add(
                    PostTarget(
                        post_id=post.id,
                        channel_id=ch.id,
                        caption=caption,
                        scheduled_for=_hhmm(tstr),
                        status="posted" if status == "posted" else "queued",
                    )
                )

        for bslug, title, made, length in DRAFTS:
            db.add(
                Draft(
                    brand_id=brands[bslug].id,
                    title=title,
                    body="",
                    length_seconds=length,
                    generated_at=_hhmm(made),
                    source="overnight batch",
                    status="waiting",
                )
            )

        # Brand's own after_insert hook (app/models.py) already created a
        # blank Automation row for each brand at the flush above — fill in
        # the demo settings on those rather than inserting a second row
        # (brand_id is unique).
        for bslug, enabled, run_at, n, src, approve in AUTOMATIONS:
            automation = db.scalar(
                select(Automation).where(Automation.brand_id == brands[bslug].id)
            )
            automation.enabled = enabled
            automation.run_at = run_at
            automation.videos_per_day = n
            automation.topic_source = src
            automation.require_approval = approve

        from app.config import get_settings
        from app.security import hash_password

        cfg = get_settings()
        db.add(
            TeamMember(
                workspace_id=workspace.id,
                name="Sokha R.",
                initials="SR",
                email=cfg.seed_admin_email,
                location="Phnom Penh",
                timezone="UTC+7",
                role="owner",
                is_active=True,
                password_hash=(
                    hash_password(cfg.seed_admin_password) if cfg.seed_admin_password else ""
                ),
            )
        )

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
