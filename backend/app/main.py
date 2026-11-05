import logging
import mimetypes
import re

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.api.v1.router import api_router
from app.core.config import settings
from app.services import storage

logging.basicConfig(level=logging.INFO if settings.DEBUG else logging.WARNING)

app = FastAPI(
    title="Covershift API",
    description="Backend for the Covershift mobile app and admin dashboard.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Flatten FastAPI's validation errors into `{field: message}`.

    The mobile forms key their error state by field name, so this maps
    straight onto the shape the screens already render.
    """
    fields: dict[str, str] = {}
    for error in exc.errors():
        location = [str(part) for part in error["loc"] if part not in ("body", "query", "path")]
        field = ".".join(location) or "detail"
        # Pydantic prefixes custom validator messages with "Value error, ".
        message = error["msg"].removeprefix("Value error, ")
        fields.setdefault(field, message)

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": next(iter(fields.values()), "Validation failed"),
            "fields": fields,
        },
    )


app.include_router(api_router, prefix="/api/v1")

_AVATAR_KEY = re.compile(r"^\d+/[0-9a-f]{32}\.(jpg|png|webp|heic|heif)$")


@app.get("/uploads/avatars/{key:path}", include_in_schema=False)
def serve_avatar(key: str):
    """Profile photos are public (shown in lists and chat); documents are not,
    and are only read through their authenticated endpoints."""
    if not _AVATAR_KEY.match(key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    content = storage.read(f"{storage.AVATAR_FOLDER}/{key}")
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    media_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    # Keys are random and never reused, so the bytes behind one never change.
    return Response(content, media_type=media_type, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": "covershift-api", "version": app.version}
