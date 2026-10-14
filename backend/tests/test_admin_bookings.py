from datetime import timedelta

from app.models.enums import ApplicationStatus, PaymentStatus
from tests.factories import make_facility, make_shift


def _confirmed_booking(client, admin_headers, auth_headers, facility, db_session, days_ahead=3):
    shift = make_shift(db_session, facility, days_ahead=days_ahead)
    application = client.post(
        f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}
    ).json()
    client.post(f"/api/v1/admin/shifts/{shift.id}/assign", headers=admin_headers,
                json={"applicationId": application["id"]})
    return shift, application["id"]


def test_confirmed_future_booking_shows_as_upcoming(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """"Upcoming" is a confirmed booking whose shift has not started."""
    _confirmed_booking(client, admin_headers, auth_headers,
                       registered_admin["facility"], db_session, days_ahead=5)

    body = client.get("/api/v1/admin/bookings", headers=admin_headers).json()
    assert body["items"][0]["displayStatus"] == "upcoming"
    assert body["counts"]["upcoming"] == 1
    assert body["counts"]["confirmed"] == 0

    upcoming = client.get("/api/v1/admin/bookings?tab=upcoming", headers=admin_headers).json()
    assert upcoming["total"] == 1


def test_pending_booking_appears_under_pending(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift = make_shift(db_session, registered_admin["facility"])
    client.post(f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={})

    body = client.get("/api/v1/admin/bookings?tab=pending", headers=admin_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["reference"].startswith("BK-")


def test_booking_detail_has_a_timeline_and_contact_details(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    _, booking_id = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session
    )

    body = client.get(f"/api/v1/admin/bookings/{booking_id}", headers=admin_headers).json()
    labels = [entry["label"] for entry in body["timeline"]]
    assert "Booking confirmed" in labels
    assert body["staffEmail"]
    assert body["facilityName"] == "St. Joseph Hospital"


def test_contacting_the_staff_member_logs_a_message_and_notifies(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    _, booking_id = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session
    )

    posted = client.post(
        f"/api/v1/admin/bookings/{booking_id}/messages",
        headers=admin_headers,
        json={"body": "Sent parking and entry instructions."},
    )
    assert posted.status_code == 201
    assert posted.json()["authorSide"] == "facility"

    detail = client.get(f"/api/v1/admin/bookings/{booking_id}", headers=admin_headers).json()
    assert len(detail["messages"]) == 1

    titles = [
        n["title"] for n in
        client.get("/api/v1/notifications", headers=auth_headers).json()["items"]
    ]
    assert any("Message from" in title for title in titles)


def test_completing_a_booking_raises_a_payment_the_staff_member_sees(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """This is what makes money appear on the mobile Earnings screen."""
    from datetime import datetime, timezone

    shift, booking_id = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session
    )
    # Applying to a past shift is (correctly) refused, so book it first and
    # then age it into the past.
    shift.start_time = datetime.now(timezone.utc) - timedelta(days=1)
    shift.end_time = datetime.now(timezone.utc) - timedelta(hours=12)
    db_session.commit()

    response = client.post(f"/api/v1/admin/bookings/{booking_id}/complete", headers=admin_headers)
    assert response.status_code == 200

    summary = client.get("/api/v1/earnings/summary", headers=auth_headers).json()
    assert summary["pending"] == float(shift.pay_rate)

    transactions = client.get("/api/v1/earnings/transactions", headers=auth_headers).json()
    assert transactions["total"] == 1
    assert transactions["items"][0]["facilityName"] == "St. Joseph Hospital"

    mine = client.get("/api/v1/applications?tab=completed", headers=auth_headers).json()
    assert mine["total"] == 1


def test_cannot_complete_a_shift_that_has_not_finished(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    _, booking_id = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session, days_ahead=5
    )
    response = client.post(f"/api/v1/admin/bookings/{booking_id}/complete", headers=admin_headers)
    assert response.status_code == 400
    assert "not finished" in response.json()["detail"]


def test_cancelling_a_booking_frees_the_slot_and_reopens_the_shift(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift, booking_id = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session
    )
    assert client.get(
        f"/api/v1/admin/shifts/{shift.id}", headers=admin_headers
    ).json()["displayStatus"] == "filled"

    response = client.post(f"/api/v1/admin/bookings/{booking_id}/cancel",
                           headers=admin_headers, json={"reason": "Ward closed"})
    assert response.status_code == 200

    detail = client.get(f"/api/v1/admin/shifts/{shift.id}", headers=admin_headers).json()
    assert detail["slotsFilled"] == 0
    assert detail["status"] == "open", "the shift should be bookable again"


def test_bookings_export_is_csv(client, admin_headers, auth_headers, registered_admin, db_session):
    _confirmed_booking(client, admin_headers, auth_headers,
                       registered_admin["facility"], db_session)

    response = client.get("/api/v1/admin/bookings/export", headers=admin_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")

    lines = response.text.strip().splitlines()
    assert lines[0].startswith("Booking ID,Shift ID")
    assert len(lines) == 2


def test_cannot_read_a_booking_at_another_facility(
    client, admin_headers, auth_headers, db_session
):
    other = make_facility(db_session, name="Rival Hospital")
    shift = make_shift(db_session, other)
    application = client.post(
        f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}
    ).json()

    assert client.get(
        f"/api/v1/admin/bookings/{application['id']}", headers=admin_headers
    ).status_code == 404


def _start_shift(db_session, shift, hours_ago=1):
    """Move a shift so it began `hours_ago` hours ago (IST, as stored)."""
    from datetime import timedelta
    from app.api.v1.endpoints.admin.common import now_ist

    shift.start_time = now_ist() - timedelta(hours=hours_ago)
    shift.end_time = shift.start_time + timedelta(hours=8)
    db_session.commit()


def test_booking_cannot_be_cancelled_once_the_shift_has_started(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift, booking_id = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session
    )
    _start_shift(db_session, shift)

    response = client.post(f"/api/v1/admin/bookings/{booking_id}/cancel",
                           headers=admin_headers, json={})
    assert response.status_code == 400
    assert "already started" in response.json()["detail"]
    assert client.get(f"/api/v1/admin/bookings/{booking_id}",
                      headers=admin_headers).json()["status"] == "confirmed"


def test_shift_cannot_be_cancelled_once_it_has_started(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift, _ = _confirmed_booking(
        client, admin_headers, auth_headers, registered_admin["facility"], db_session
    )
    _start_shift(db_session, shift)

    response = client.post(f"/api/v1/admin/shifts/{shift.id}/cancel", headers=admin_headers, json={})
    assert response.status_code == 400
    assert "already started" in response.json()["detail"]
