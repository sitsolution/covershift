"""Push notification delivery.

Mobile  → Expo Push API  (handles FCM + APNs transparently)
Web     → Web Push API   (VAPID, standard browser push)

Neither channel throws — failures are logged and swallowed so a broken push
configuration never blocks the action that triggered the notification.
"""

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ── Mobile — Expo Push ────────────────────────────────────────────────────────

def _send_expo_push(tokens: list[str], title: str, body: Optional[str], data: dict) -> None:
    """Send push to a list of Expo push tokens.

    Each token is sent on its own: Expo rejects a whole batch when its tokens
    belong to different Expo projects (e.g. an old install of the app), and one
    stale token must not stop the user's current device from being notified.
    """
    try:
        from exponent_server_sdk import (
            DeviceNotRegisteredError,
            PushClient,
            PushMessage,
            PushServerError,
        )
    except ImportError:
        logger.warning("exponent_server_sdk not installed — mobile push skipped")
        return

    client = PushClient()

    for token in tokens:
        message = PushMessage(
            to=token,
            title=title,
            body=body or "",
            data=data,
            sound="default",
            badge=1,
        )
        try:
            client.publish(message).validate_response()
        except DeviceNotRegisteredError:
            logger.info("Expo token no longer valid, will deactivate: %s…", token[:20])
            _deactivate_expo_token(token)
        except PushServerError as exc:
            logger.error("Expo push server error for %s…: %s", token[:20], exc)
        except Exception as exc:
            logger.error("Expo push unexpected error for %s…: %s", token[:20], exc)


def _deactivate_expo_token(token: str) -> None:
    """Mark a stale Expo token inactive so we stop sending to it."""
    try:
        from app.core.database import SessionLocal
        from app.models.support import DeviceToken

        with SessionLocal() as db:
            db.query(DeviceToken).filter(DeviceToken.token == token).update(
                {"is_active": False}
            )
            db.commit()
    except Exception as exc:
        logger.error("Failed to deactivate expo token: %s", exc)


# ── Web — VAPID Web Push ──────────────────────────────────────────────────────

def _send_web_push(
    subscriptions: list[dict], title: str, body: Optional[str], data: dict
) -> None:
    """Send Web Push to a list of subscription dicts {endpoint, keys:{p256dh, auth}}."""
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed — web push skipped")
        return

    from app.core.config import settings

    if not settings.VAPID_PRIVATE_KEY:
        logger.warning("VAPID_PRIVATE_KEY not configured — web push skipped")
        return

    payload = json.dumps({"title": title, "body": body or "", "data": data})

    for sub in subscriptions:
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIMS_EMAIL}"},
                content_encoding="aes128gcm",
            )
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in (404, 410):
                # Subscription expired or user revoked permission
                _deactivate_web_subscription(sub.get("endpoint", ""))
            else:
                logger.error("Web push error (status %s): %s", status_code, exc)
        except Exception as exc:
            logger.error("Web push unexpected error: %s", exc)


def _deactivate_web_subscription(endpoint: str) -> None:
    if not endpoint:
        return
    try:
        from app.core.database import SessionLocal
        from app.models.support import WebPushSubscription

        with SessionLocal() as db:
            db.query(WebPushSubscription).filter(
                WebPushSubscription.endpoint == endpoint
            ).update({"is_active": False})
            db.commit()
    except Exception as exc:
        logger.error("Failed to deactivate web push subscription: %s", exc)


# ── Public entry point ────────────────────────────────────────────────────────

def deliver_push(
    db: Session,
    user_id: int,
    title: str,
    body: Optional[str],
    entity_type: Optional[str],
    entity_id: Optional[int],
) -> None:
    """Look up active tokens for *user_id* and fire push via the right channel.

    Called from services/notifications.py right after the DB row is written.
    Errors are contained — the caller is never affected.
    """
    from app.models.support import DeviceToken, WebPushSubscription
    from app.models.user import UserSettings

    try:
        settings_row = (
            db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        )
        if settings_row and not settings_row.push_notifications:
            return

        data: dict = {}
        if entity_type:
            data["entity_type"] = entity_type
        if entity_id is not None:
            data["entity_id"] = entity_id

        # ── Mobile (Expo push tokens) ─────────────────────────────────────────
        mobile_rows = (
            db.query(DeviceToken.token)
            .filter(
                DeviceToken.user_id == user_id,
                DeviceToken.is_active.is_(True),
                DeviceToken.platform.in_(["ios", "android"]),
            )
            .all()
        )
        if mobile_rows:
            _send_expo_push([r.token for r in mobile_rows], title, body, data)

        # ── Web (VAPID subscriptions) ─────────────────────────────────────────
        web_rows = (
            db.query(WebPushSubscription)
            .filter(
                WebPushSubscription.user_id == user_id,
                WebPushSubscription.is_active.is_(True),
            )
            .all()
        )
        if web_rows:
            sub_dicts = [
                {
                    "endpoint": row.endpoint,
                    "keys": {"p256dh": row.p256dh_key, "auth": row.auth_key},
                }
                for row in web_rows
            ]
            _send_web_push(sub_dicts, title, body, data)

    except Exception as exc:
        logger.error("deliver_push failed for user %s: %s", user_id, exc)
