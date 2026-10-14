from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Core ──────────────────────────────────────────────────────────────────
    DEBUG: bool = True
    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/covershift"

    # No default: a missing SECRET_KEY must fail loudly rather than silently
    # signing tokens with a well-known value.
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Expo Go on a real device calls in over the LAN, so the mobile origin is
    # not fixed. Requests from the app carry no Origin header, so this list only
    # needs to cover the browser-based admin.
    # Comma-separated string, not List[str]: pydantic-settings JSON-decodes
    # complex types straight from .env before any validator runs, so a plain
    # `a,b,c` value raises a SettingsError. Read via `settings.cors_origins`.
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:19006"

    # ── Uploads ───────────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 10
    ALLOWED_UPLOAD_TYPES: str = "application/pdf,image/jpeg,image/png"   # see CORS_ORIGINS

    # ── OTP ───────────────────────────────────────────────────────────────────
    OTP_LENGTH: int = 6
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60

    # ── Email (Resend) ────────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@covershift.in"
    EMAIL_FROM_NAME: str = "Covershift"

    # ── Push Notifications ────────────────────────────────────────────────────
    # Expo Push — optional access token raises rate limits on the Expo push API.
    # Leave blank during development; add once you have the Expo project set up.
    EXPO_ACCESS_TOKEN: str = ""

    # VAPID keys for Web Push (admin browser notifications).
    # Generate once with:
    #   pip install pywebpush
    #   python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('PRIVATE:', v.private_key.private_bytes_raw().hex()); print('PUBLIC:', v.public_key_str)"
    # Or use the online tool at https://vapidkeys.com
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "admin@covershift.in"

    # ── Business rules ────────────────────────────────────────────────────────
    # How close to shift start a confirmed application may still be cancelled.
    CANCELLATION_CUTOFF_HOURS: int = 24
    PAYOUT_MINIMUM: float = 500.0

    @staticmethod
    def _split_csv(value: str) -> List[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    @property
    def cors_origins(self) -> List[str]:
        return self._split_csv(self.CORS_ORIGINS)

    @property
    def allowed_upload_types(self) -> List[str]:
        return self._split_csv(self.ALLOWED_UPLOAD_TYPES)

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    @property
    def expose_otp(self) -> bool:
        """Return codes in API responses only when they cannot be emailed, so
        signup and password reset stay testable locally. Once an email provider
        is configured the code goes by email only — DEBUG defaults to on, and a
        reset code in the response would let anyone take over an account."""
        return self.DEBUG and not self.RESEND_API_KEY


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
