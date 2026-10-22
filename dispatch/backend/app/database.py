from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

_url = get_settings().database_url
# Postgres: room for a crowd — the pages, their polling and the background jobs
# (images, videos, captions) all share this one process's pool (SQLAlchemy's
# default 5 + 10 ran dry with 30 people making images at once). Postgres allows 100.
_pool = {"pool_size": 10, "max_overflow": 20, "pool_timeout": 30} if _url.startswith("postgresql") else {}
engine = create_engine(_url, pool_pre_ping=True, future=True, **_pool)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
