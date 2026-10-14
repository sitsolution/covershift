import pytest

from app.models.enums import ApplicationStatus, ShiftStatus, UserRole
from tests.factories import make_facility, make_shift
from tests.conftest import DOCTOR


def _apply(client, headers, shift_id):
    return client.post(f"/api/v1/shifts/{shift_id}/apply", headers=headers, json={})


def test_apply_creates_a_pending_application(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session))

    response = _apply(client, auth_headers, shift.id)
    assert response.status_code == 201
    assert response.json()["status"] == "pending"
    assert response.json()["canCancel"] is True


def test_cannot_apply_twice(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session))
    _apply(client, auth_headers, shift.id)
    assert _apply(client, auth_headers, shift.id).status_code == 409


def test_cannot_apply_to_another_roles_shift(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session), role=UserRole.nurse)
    response = _apply(client, auth_headers, shift.id)
    assert response.status_code == 400
    assert "different staff role" in response.json()["detail"]


def test_cannot_apply_to_a_shift_that_already_started(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session), days_ahead=-1)
    assert _apply(client, auth_headers, shift.id).status_code == 400


def test_unverified_user_cannot_apply(client, db_session):
    """Registration returns a token, but applying needs a verified account."""
    token = client.post(
        "/api/v1/auth/register", json={**DOCTOR, "email": "unverified@example.com"}
    ).json()["accessToken"]
    shift = make_shift(db_session, make_facility(db_session))

    response = _apply(client, {"Authorization": f"Bearer {token}"}, shift.id)
    assert response.status_code == 403
    assert "Verify" in response.json()["detail"]


def test_tab_counts_cover_every_tab_in_one_response(client, auth_headers, db_session):
    facility = make_facility(db_session)
    for day in (2, 3, 4):
        _apply(client, auth_headers, make_shift(db_session, facility, days_ahead=day).id)

    body = client.get("/api/v1/applications", headers=auth_headers).json()
    assert body["counts"] == {"pending": 3, "confirmed": 0, "completed": 0, "cancelled": 0}
    assert body["total"] == 3


def test_cancelling_a_pending_application(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session))
    application_id = _apply(client, auth_headers, shift.id).json()["id"]

    response = client.post(
        f"/api/v1/applications/{application_id}/cancel",
        headers=auth_headers,
        json={"reason": "Schedule conflict"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    # It moves to the Cancelled tab, not out of the list entirely.
    counts = client.get("/api/v1/applications", headers=auth_headers).json()["counts"]
    assert counts["cancelled"] == 1 and counts["pending"] == 0


def test_cancelling_twice_is_rejected(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session))
    application_id = _apply(client, auth_headers, shift.id).json()["id"]

    client.post(f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={})
    second = client.post(
        f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={}
    )
    assert second.status_code == 400


def test_reapplying_after_cancelling_reuses_the_row(client, auth_headers, db_session):
    """The (shift, staff) unique constraint means a second row would fail."""
    shift = make_shift(db_session, make_facility(db_session))
    application_id = _apply(client, auth_headers, shift.id).json()["id"]
    client.post(f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={})

    again = _apply(client, auth_headers, shift.id)
    assert again.status_code == 201
    assert again.json()["id"] == application_id
    assert again.json()["status"] == "pending"


def test_confirmed_application_too_close_to_start_cannot_be_cancelled(
    client, auth_headers, db_session
):
    shift = make_shift(db_session, make_facility(db_session), days_ahead=0, start_hour=23)
    application_id = _apply(client, auth_headers, shift.id).json()["id"]

    from app.models.application import Application
    application = db_session.query(Application).filter(Application.id == application_id).one()
    application.status = ApplicationStatus.confirmed
    db_session.commit()

    response = client.post(
        f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={}
    )
    assert response.status_code == 400
    assert "too close" in response.json()["detail"]


def test_cancelling_a_confirmed_booking_frees_the_slot(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session), days_ahead=10, slots=1)
    application_id = _apply(client, auth_headers, shift.id).json()["id"]

    from app.models.application import Application
    application = db_session.query(Application).filter(Application.id == application_id).one()
    application.status = ApplicationStatus.confirmed
    shift.slots_filled = 1
    shift.status = ShiftStatus.filled
    db_session.commit()

    client.post(f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={})
    db_session.refresh(shift)
    assert shift.slots_filled == 0
    assert shift.status == ShiftStatus.open, "the shift should be listable again"


def test_cannot_read_another_users_application(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session))
    application_id = _apply(client, auth_headers, shift.id).json()["id"]

    other = client.post("/api/v1/auth/register", json={
        **DOCTOR, "email": "other@example.com", "phone": "+919899999999"}).json()
    client.post("/api/v1/auth/verify-otp",
                json={"email": "other@example.com", "code": other["debugOtp"]})
    other_headers = {"Authorization": f"Bearer {other['accessToken']}"}

    response = client.get(f"/api/v1/applications/{application_id}", headers=other_headers)
    assert response.status_code == 404


def _set_start(db_session, shift, hours_from_now):
    """Place the shift start relative to IST now, matching how times are stored."""
    from datetime import timedelta
    from app.api.v1.endpoints.admin.common import now_ist

    shift.start_time = now_ist() + timedelta(hours=hours_from_now)
    shift.end_time = shift.start_time + timedelta(hours=8)
    db_session.commit()


def test_pending_application_cannot_be_withdrawn_once_the_shift_has_started(
    client, auth_headers, db_session
):
    shift = make_shift(db_session, make_facility(db_session))
    application_id = _apply(client, auth_headers, shift.id).json()["id"]
    _set_start(db_session, shift, -1)

    mine = client.get("/api/v1/applications?tab=pending", headers=auth_headers).json()
    assert mine["items"][0]["canCancel"] is False
    response = client.post(
        f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={}
    )
    assert response.status_code == 400


def test_cancellation_cutoff_is_measured_in_ist(client, auth_headers, db_session):
    """20 hours out is inside the 24-hour cutoff. Read as UTC it looked like
    25½ hours, so the cancel used to go through."""
    shift = make_shift(db_session, make_facility(db_session))
    application_id = _apply(client, auth_headers, shift.id).json()["id"]

    from app.models.application import Application
    application = db_session.query(Application).filter(Application.id == application_id).one()
    application.status = ApplicationStatus.confirmed
    _set_start(db_session, shift, 20)

    response = client.post(
        f"/api/v1/applications/{application_id}/cancel", headers=auth_headers, json={}
    )
    assert response.status_code == 400
    assert "too close" in response.json()["detail"]
