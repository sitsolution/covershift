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


def _record_pushes(monkeypatch):
    from app.services import notifications

    pushed = []
    monkeypatch.setattr(notifications, "deliver_push", lambda db, **item: pushed.append(item))
    return pushed


def test_new_shift_alert_is_pushed_not_only_listed(client, admin_headers, registered_doctor, monkeypatch):
    """'New shift matches your profile' is written with commit=False; it must
    still be pushed once the shift is saved."""
    from tests.test_admin_shifts import _create_payload

    pushed = _record_pushes(monkeypatch)
    client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(notifyStaff=True))

    assert [(p["user_id"], p["title"]) for p in pushed] == [
        (registered_doctor["user_id"], "New shift matches your profile")]


def test_applying_pushes_to_both_sides(client, admin_headers, auth_headers, monkeypatch):
    from tests.test_admin_shifts import _create_payload

    shift_id = client.post("/api/v1/admin/shifts", headers=admin_headers,
                           json=_create_payload(notifyStaff=False)).json()["id"]
    pushed = _record_pushes(monkeypatch)
    client.post(f"/api/v1/shifts/{shift_id}/apply", headers=auth_headers, json={})

    assert {p["title"] for p in pushed} == {"Application submitted", "New application"}


def test_a_rolled_back_notification_is_not_pushed(db_session, registered_doctor, monkeypatch):
    from app.models.enums import NotificationCategory
    from app.services.notifications import notify

    pushed = _record_pushes(monkeypatch)
    notify(db_session, registered_doctor["user_id"], NotificationCategory.shift_alert, "Never sent", commit=False)
    db_session.rollback()
    db_session.commit()

    assert pushed == []


def test_shift_alert_reaches_the_doctors_phone_token(client, admin_headers, auth_headers, monkeypatch):
    """Real lookup of the doctor's device token after commit; only Expo is faked."""
    from tests.test_admin_shifts import _create_payload

    sent = []

    class _Ticket:
        def validate_response(self):
            pass

    class _Client:
        def publish(self, message):
            sent.append((message.to, message.title))
            return _Ticket()

    monkeypatch.setattr(exponent_server_sdk, "PushClient", _Client)
    client.post("/api/v1/users/me/device-token", headers=auth_headers,
                json={"token": "ExponentPushToken[doctor-phone]", "platform": "android"})

    client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(notifyStaff=True))

    assert sent == [("ExponentPushToken[doctor-phone]", "New shift matches your profile")]
