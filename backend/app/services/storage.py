"""File storage for uploaded documents and profile photos.

Files are stored under a per-user key with a random name — the original
filename is kept in the database, never in storage, so a hostile filename
cannot escape the upload root. ``STORAGE_BACKEND`` picks local disk
(``UPLOAD_DIR``) or S3 (``S3_BUCKET``); callers only see keys like
``12/ab34….pdf`` or ``avatars/12/cd56….jpg``.

Only keys under ``avatars/`` are served publicly (see app.main). Documents are
read through their authenticated endpoints.
"""

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import quote

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}

# Some clients (Android) send "image/jpg" — normalise before any checks.
_MIME_ALIASES = {"image/jpg": "image/jpeg"}

AVATAR_FOLDER = "avatars"


def upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


@lru_cache
def _s3():
    import boto3

    return boto3.client("s3", region_name=settings.AWS_REGION)


def _use_s3() -> bool:
    return settings.STORAGE_BACKEND.lower() == "s3"


def save_upload(
    file: UploadFile,
    user_id: int,
    allowed_types: set | None = None,
    folder: str | None = None,
) -> Tuple[str, int]:
    """Validate and persist an upload. Returns (key, size_bytes).

    Pass ``allowed_types`` to override the default config list (e.g. for avatar
    uploads which should accept WebP / HEIC in addition to the document types),
    and ``folder`` to store under a prefix such as ``avatars``.
    """
    # Normalise aliases (e.g. Android sometimes sends "image/jpg")
    content_type = _MIME_ALIASES.get(file.content_type or "", file.content_type or "")

    types = allowed_types if allowed_types is not None else set(settings.allowed_upload_types)
    if content_type not in types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(types))}",
        )

    # Read in chunks and abort as soon as the cap is passed, so an oversized
    # upload never gets fully buffered.
    max_bytes = settings.max_upload_bytes
    chunks, size = [], 0
    while chunk := file.file.read(1024 * 1024):
        size += len(chunk)
        if size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB limit",
            )
        chunks.append(chunk)

    if size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

    prefix = f"{folder}/" if folder else ""
    key = f"{prefix}{user_id}/{secrets.token_hex(16)}{EXTENSIONS[content_type]}"
    data = b"".join(chunks)

    if _use_s3():
        _s3().put_object(Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=content_type)
    else:
        target = resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return key, size


def resolve(relative_path: str) -> Path:
    """Map a stored key to a local path, refusing anything that escapes the
    upload root."""
    root = upload_root()
    target = (root / relative_path).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")
    return target


def read(key: str) -> Optional[bytes]:
    """The stored bytes, or None when the file is missing."""
    if _use_s3():
        from botocore.exceptions import ClientError

        try:
            return _s3().get_object(Bucket=settings.S3_BUCKET, Key=key)["Body"].read()
        except ClientError as exc:
            # Without s3:ListBucket (the role deliberately lacks it), S3
            # answers a missing key with AccessDenied rather than NoSuchKey.
            if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "AccessDenied"):
                return None
            raise
    target = resolve(key)
    return target.read_bytes() if target.is_file() else None


def delete(key: str) -> None:
    if _use_s3():
        _s3().delete_object(Bucket=settings.S3_BUCKET, Key=key)
    else:
        resolve(key).unlink(missing_ok=True)


def content_disposition(disposition: str, filename: str) -> str:
    """A Content-Disposition value that survives quotes and non-ASCII
    filenames (the same rule Starlette's FileResponse uses)."""
    quoted = quote(filename)
    if quoted != filename:
        return f"{disposition}; filename*=utf-8''{quoted}"
    return f'{disposition}; filename="{filename}"'
