"""Azure Blob Storage for the app's files (images, videos, voice clips, PDFs).

On when AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_NAME are
set: new files go to the container, named like their '/media/<name>' link
(the link itself never changes — app/media.py still serves /media/<name>,
reading the bytes from here). Off: files stay in the database as before.

Existing files are moved by ``python -m app.move_media`` (see there).
"""

from __future__ import annotations

import logging
import threading

from app.config import get_settings

log = logging.getLogger(__name__)

_client = None
_lock = threading.Lock()


def enabled() -> bool:
    s = get_settings()
    return bool(s.azure_storage_connection_string.strip() and s.azure_storage_container_name.strip())


def _container():
    """The container client (made once; the container is created if missing)."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                from azure.core.exceptions import ResourceExistsError
                from azure.storage.blob import BlobServiceClient

                s = get_settings()
                service = BlobServiceClient.from_connection_string(s.azure_storage_connection_string.strip())
                container = service.get_container_client(s.azure_storage_container_name.strip())
                try:
                    container.create_container()  # private — files are served by the app, never public
                except ResourceExistsError:
                    pass
                _client = container
    return _client


def _key(name: str) -> str:
    """Where a file sits in the container: under our folder (AZURE_STORAGE_PREFIX) —
    the container may be shared with another app."""
    prefix = get_settings().azure_storage_prefix.strip().strip("/")
    return f"{prefix}/{name}" if prefix else name


def put(name: str, data: bytes, content_type: str) -> None:
    """Upload (or replace) one file."""
    from azure.storage.blob import ContentSettings

    _container().upload_blob(
        _key(name), data, overwrite=True,
        content_settings=ContentSettings(content_type=content_type or "application/octet-stream", cache_control="public, max-age=31536000, immutable"),
    )


def get(name: str) -> bytes | None:
    """The whole file, or None when it isn't there."""
    from azure.core.exceptions import ResourceNotFoundError

    try:
        return _container().download_blob(_key(name)).readall()
    except ResourceNotFoundError:
        return None


def get_range(name: str, start: int, end: int) -> bytes | None:
    """Bytes ``start`` to ``end`` (inclusive) — a video asking for a piece."""
    from azure.core.exceptions import ResourceNotFoundError

    try:
        return _container().download_blob(_key(name), offset=start, length=end - start + 1).readall()
    except ResourceNotFoundError:
        return None


def size(name: str) -> int | None:
    from azure.core.exceptions import ResourceNotFoundError

    try:
        return _container().get_blob_client(_key(name)).get_blob_properties().size
    except ResourceNotFoundError:
        return None


def delete(name: str) -> None:
    from azure.core.exceptions import ResourceNotFoundError

    try:
        _container().delete_blob(_key(name))
    except ResourceNotFoundError:
        pass
