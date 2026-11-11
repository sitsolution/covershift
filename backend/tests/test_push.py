"""Push delivery: browser subscriptions register, and one bad phone token
does not stop the others."""

import exponent_server_sdk

from app.services import push_service


def test_browser_web_push_subscription_is_accepted(client, auth_headers, db_session):
    """The exact body webPushService.ts sends ("p256dhKey", lowercase d)."""
    from app.models.support import WebPushSubscription

    response = client.post("/api/v1/users/me/web-push-subscription", headers=auth_headers, json={
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc", "p256dhKey": "BKey", "authKey": "auth"})

    assert response.status_code == 201
    saved = db_session.query(WebPushSubscription).one()
    assert (saved.p256dh_key, saved.auth_key) == ("BKey", "auth")


def test_one_bad_expo_token_does_not_block_the_others(monkeypatch):
    sent = []

    class _Ticket:
        def validate_response(self):
            pass

    class _Client:
        def publish(self, message):
            if message.to == "ExponentPushToken[old-project]":
                # What Expo does for a token from another Expo project.
                raise exponent_server_sdk.PushServerError("Request failed", None)
            sent.append(message.to)
            return _Ticket()

    monkeypatch.setattr(exponent_server_sdk, "PushClient", _Client)

    push_service._send_expo_push(
        ["ExponentPushToken[old-project]", "ExponentPushToken[current]"], "Title", "Body", {})

    assert sent == ["ExponentPushToken[current]"]
