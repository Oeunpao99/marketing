"""Move the app's files from the database (and the old media/ folder) to Azure
Blob Storage — once, after AZURE_STORAGE_CONNECTION_STRING and
AZURE_STORAGE_CONTAINER_NAME are set (app/blobstore.py).

    python -m app.move_media --dry-run      # what would move, how much
    python -m app.move_media --limit 20     # a first small batch, to check
    python -m app.move_media                # the rest
    python -m app.move_media --back         # undo: bring every file back into the database

Safe to stop and run again: it moves a file at a time — upload, check the
copy's size, only then empty the database copy. Thumbnails stay in the
database (small, read constantly). The links (/media/<name>) never change.
Afterwards give the disk its space back: VACUUM FULL media_blobs (see the end).
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

from sqlalchemy import func, select

from app import blobstore
from app.database import SessionLocal
from app.media import MEDIA_DIR
from app.models import MediaBlob

log = logging.getLogger("move_media")


def _mb(n: int) -> str:
    return f"{n / 1024 / 1024:,.1f} MB"


def _is_thumb(name: str) -> bool:
    return name.startswith("thumb")


def forward(dry: bool, limit: int | None, batch: int) -> int:
    """Database (and media/ folder) → Blob Storage. Returns how many failed."""
    with SessionLocal() as db:
        todo = db.execute(
            select(func.count(), func.coalesce(func.sum(MediaBlob.size_bytes), 0)).where(
                MediaBlob.stored == "", MediaBlob.data.is_not(None), ~MediaBlob.name.like("thumb%")
            )
        ).one()
    disk = [p for p in MEDIA_DIR.iterdir() if p.is_file()] if MEDIA_DIR.exists() else []
    print(f"to move: {todo[0]:,} files in the database ({_mb(int(todo[1]))}), {len(disk)} in the old media/ folder")
    if dry:
        return 0
    moved = failed = done_bytes = 0
    started = time.time()
    last_id = 0
    while limit is None or moved + failed < limit:
        with SessionLocal() as db:
            rows = db.scalars(
                select(MediaBlob)
                .where(MediaBlob.id > last_id, MediaBlob.stored == "", MediaBlob.data.is_not(None), ~MediaBlob.name.like("thumb%"))
                .order_by(MediaBlob.id)
                .limit(batch)
            ).all()
            if not rows:
                break
            for row in rows:
                last_id = row.id
                if limit is not None and moved + failed >= limit:
                    break
                data = bytes(row.data)
                try:
                    blobstore.put(row.name, data, row.content_type)
                    copied = blobstore.size(row.name)
                    if copied != len(data):
                        raise RuntimeError(f"copy is {copied} bytes, the file {len(data)}")
                except Exception as exc:  # noqa: BLE001 — leave it in the database, go on
                    failed += 1
                    print(f"  ✗ {row.name}: {exc}")
                    continue
                row.data, row.stored, row.size_bytes = None, "azure", len(data)
                db.commit()  # one at a time: a stop never leaves a file nowhere
                moved += 1
                done_bytes += len(data)
            took = time.time() - started
            print(f"  moved {moved:,} ({_mb(done_bytes)}) · {failed} failed · {took:,.0f} s")
    # the old media/ folder: each file gets a row, its bytes in Blob Storage
    for path in disk:
        if limit is not None and moved + failed >= limit:
            break
        name = path.name
        with SessionLocal() as db:
            if db.scalar(select(MediaBlob.id).where(MediaBlob.name == name)) is not None:
                continue
            data = path.read_bytes()
            ctype = __import__("mimetypes").guess_type(name)[0] or "application/octet-stream"
            try:
                blobstore.put(name, data, ctype)
                if blobstore.size(name) != len(data):
                    raise RuntimeError("size check failed")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"  ✗ media/{name}: {exc}")
                continue
            db.add(MediaBlob(name=name, content_type=ctype, size_bytes=len(data), data=None, stored="azure"))
            db.commit()
            moved += 1
            done_bytes += len(data)
    print(f"done: moved {moved:,} files ({_mb(done_bytes)}), {failed} failed")
    if moved:
        print(
            "\nGive the disk its space back (the app keeps working; it locks media_blobs for a minute or two):\n"
            "  docker compose -f docker-compose.prod.yml exec db psql -U <user> -d <db> -c \"VACUUM FULL media_blobs;\"\n"
            "The old media/ folder's files are in Blob Storage now — remove the folder once you've checked."
        )
    return failed


def back(limit: int | None) -> int:
    """Undo: every file in Blob Storage comes back into the database."""
    moved = failed = 0
    with SessionLocal() as db:
        names = db.scalars(select(MediaBlob.name).where(MediaBlob.stored == "azure").order_by(MediaBlob.id)).all()
    print(f"to bring back: {len(names):,} files")
    for name in names[:limit]:
        data = blobstore.get(name)
        if data is None:
            failed += 1
            print(f"  ✗ {name}: not in Blob Storage")
            continue
        with SessionLocal() as db:
            row = db.scalar(select(MediaBlob).where(MediaBlob.name == name))
            row.data, row.stored = data, ""
            db.commit()
        moved += 1
        if moved % 50 == 0:
            print(f"  back {moved:,}")
    print(f"done: {moved:,} back in the database, {failed} failed (the Blob Storage copies are left in place)")
    return failed


def main() -> None:
    ap = argparse.ArgumentParser(description="Move the app's files to Azure Blob Storage (or back).")
    ap.add_argument("--dry-run", action="store_true", help="only count what would move")
    ap.add_argument("--limit", type=int, default=None, help="move at most this many files")
    ap.add_argument("--batch", type=int, default=20)
    ap.add_argument("--back", action="store_true", help="bring every file back into the database")
    args = ap.parse_args()
    if not blobstore.enabled():
        sys.exit("Blob Storage isn't set up: put AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_NAME in .env first.")
    try:
        blobstore._container()  # reach the account before touching anything
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Can't reach the Blob Storage account — check the connection string and container name. ({type(exc).__name__}: {str(exc)[:200]})")
    failed = back(args.limit) if args.back else forward(args.dry_run, args.limit, args.batch)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
