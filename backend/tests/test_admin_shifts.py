from datetime import date, datetime, timedelta, timezone

from app.models.enums import ApplicationStatus, ShiftStatus
from tests.factories import make_facility, make_shift


def _create_payload(**overrides):
    payload = {
        "title": "ER Night Cover",
        "specialty": "Emergency Med.",
        "role": "doctor",
        "date": (date.today() + timedelta(days=5)).isoformat(),
        "startTime": "20:00:00",
        "endTime": "08:00:00",
        "payRate": 9500,
        "slots": 1,
        "requiredQualifications": ["MBBS", "MD/MS"],
        "requiredCertifications": ["BLS"],
        "publish": True,
    }
    payload.update(overrides)
    return payload


def test_create_shift_rolls_an_overnight_end_time_to_the_next_day(client, admin_headers):
    """8 PM–8 AM is a 12-hour night shift, not a negative-length one."""
    body = client.post(
        "/api/v1/admin/shifts", headers=admin_headers, json=_create_payload()
    ).json()

    assert body["durationHours"] == 12.0
    assert "Night" in body["tags"]
    start = datetime.fromisoformat(body["startTime"])
    end = datetime.fromisoformat(body["endTime"])
    assert end.date() == start.date() + timedelta(days=1)


def test_created_shift_carries_the_form_fields(client, admin_headers):
    body = client.post(
        "/api/v1/admin/shifts", headers=admin_headers,
        json=_create_payload(overtimeRate=1200, amenities=["Meals provided"]),
    ).json()

    assert body["requiredQualifications"] == ["MBBS", "MD/MS"]
    assert body["requiredCertifications"] == ["BLS"]
    assert body["overtimeRate"] == 1200.0
    assert body["amenities"] == ["Meals provided"]
    assert body["reference"].startswith("SH-")


def test_draft_is_hidden_from_staff_until_published(client, admin_headers, auth_headers):
    """'Save as Draft' must not surface in the mobile app."""
    draft = client.post(
        "/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(publish=False)
    ).json()
    assert draft["status"] == "draft"

    assert client.get("/api/v1/shifts", headers=auth_headers).json()["total"] == 0

    published = client.post(
        f"/api/v1/admin/shifts/{draft['id']}/publish", headers=admin_headers
    )
    assert published.status_code == 200
    assert published.json()["status"] == "open"
    assert client.get("/api/v1/shifts", headers=auth_headers).json()["total"] == 1


def test_invisible_shift_is_hidden_from_staff_browse(client, admin_headers, auth_headers):
    """'Make Visible to All Doctors' switched off keeps it out of browse."""
    client.post(
        "/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(isVisible=False)
    )
    assert client.get("/api/v1/shifts", headers=auth_headers).json()["total"] == 0


def test_publishing_a_shift_notifies_matching_staff(client, admin_headers, auth_headers):
    client.post("/api/v1/admin/shifts", headers=admin_headers,
                json=_create_payload(notifyStaff=True))

    body = client.get("/api/v1/notifications", headers=auth_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["category"] == "shift_alert"


def test_publish_can_suppress_notifications(client, admin_headers, auth_headers):
    client.post("/api/v1/admin/shifts", headers=admin_headers,
                json=_create_payload(notifyStaff=False))
    assert client.get("/api/v1/notifications", headers=auth_headers).json()["total"] == 0


def test_cannot_publish_a_shift_in_the_past(client, admin_headers):
    response = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=(date.today() - timedelta(days=1)).isoformat()))
    assert response.status_code == 400


def test_cannot_save_a_draft_in_the_past(client, admin_headers):
    response = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=(date.today() - timedelta(days=1)).isoformat(), publish=False))
    assert response.status_code == 400


def _ist_payload(at: datetime, **overrides):
    return _create_payload(
        date=at.date().isoformat(),
        startTime=at.strftime("%H:%M:00"),
        endTime=(at + timedelta(hours=4)).strftime("%H:%M:00"),
        **overrides,
    )


def test_start_time_earlier_today_is_rejected(client, admin_headers):
    """Times are IST. Two hours ago in IST is still 'in the future' if it is
    misread as UTC — the window that let past start times through."""
    from app.api.v1.endpoints.admin.common import now_ist

    response = client.post("/api/v1/admin/shifts", headers=admin_headers,
                           json=_ist_payload(now_ist() - timedelta(hours=2)))
    assert response.status_code == 400
    assert "must be in the future" in response.json()["detail"]


def test_start_time_later_today_is_accepted(client, admin_headers):
    from app.api.v1.endpoints.admin.common import now_ist

    response = client.post("/api/v1/admin/shifts", headers=admin_headers,
                           json=_ist_payload(now_ist() + timedelta(hours=1)))
    assert response.status_code == 201, response.text


def test_cannot_move_a_shift_into_the_past(client, admin_headers):
    shift = client.post("/api/v1/admin/shifts", headers=admin_headers,
                        json=_create_payload()).json()
    response = client.patch(f"/api/v1/admin/shifts/{shift['id']}", headers=admin_headers,
                            json={"date": (date.today() - timedelta(days=1)).isoformat()})
    assert response.status_code == 400


def _days_ahead(n):
    return (date.today() + timedelta(days=n)).isoformat()


def test_night_shift_ends_on_the_chosen_end_date(client, admin_headers):
    response = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=_days_ahead(5), endDate=_days_ahead(6), startTime="20:00:00", endTime="08:00:00"))
    assert response.status_code == 201, response.text
    body = response.json()
    assert datetime.fromisoformat(body["endTime"]).date().isoformat() == _days_ahead(6)
    assert body["durationHours"] == 12.0


def test_short_shift_keeps_the_same_end_date(client, admin_headers):
    body = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=_days_ahead(5), endDate=_days_ahead(5), startTime="10:00:00", endTime="13:00:00")).json()
    assert datetime.fromisoformat(body["endTime"]).date().isoformat() == _days_ahead(5)
    assert body["durationHours"] == 3.0


def test_end_before_start_is_rejected_when_end_date_is_given(client, admin_headers):
    """Same end date with an earlier end time is a mistake, not a night shift."""
    response = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=_days_ahead(5), endDate=_days_ahead(5), startTime="20:00:00", endTime="08:00:00"))
    assert response.status_code == 400
    assert "after its start" in response.json()["detail"]


def test_shift_longer_than_24_hours_is_rejected(client, admin_headers):
    response = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=_days_ahead(5), endDate=_days_ahead(6), startTime="08:00:00", endTime="09:00:00"))
    assert response.status_code == 400
    assert "24 hours" in response.json()["detail"]


def test_editing_the_end_date_turns_a_shift_overnight(client, admin_headers):
    shift = client.post("/api/v1/admin/shifts", headers=admin_headers, json=_create_payload(
        date=_days_ahead(5), endDate=_days_ahead(5), startTime="10:00:00", endTime="13:00:00")).json()
    response = client.patch(f"/api/v1/admin/shifts/{shift['id']}", headers=admin_headers,
                            json={"endDate": _days_ahead(6), "endTime": "06:00:00"})
    assert response.status_code == 200, response.text
    assert datetime.fromisoformat(response.json()["endTime"]).date().isoformat() == _days_ahead(6)


def test_assigning_an_applicant_confirms_them_and_fills_the_shift(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """The transition the mobile app cannot make on its own."""
    shift = make_shift(db_session, registered_admin["facility"])
    application = client.post(
        f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}
    ).json()

    detail = client.get(f"/api/v1/admin/shifts/{shift.id}", headers=admin_headers).json()
    assert len(detail["applicants"]) == 1
    assert detail["displayStatus"] == "pending"

    assigned = client.post(
        f"/api/v1/admin/shifts/{shift.id}/assign",
        headers=admin_headers,
        json={"applicationId": application["id"]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["displayStatus"] == "filled"
    assert assigned.json()["slotsFilled"] == 1

    # The staff member now sees it as confirmed.
    mine = client.get("/api/v1/applications?tab=confirmed", headers=auth_headers).json()
    assert mine["total"] == 1


def test_assignment_notifies_the_staff_member(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift = make_shift(db_session, registered_admin["facility"])
    application = client.post(
        f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}
    ).json()
    client.post(f"/api/v1/admin/shifts/{shift.id}/assign", headers=admin_headers,
                json={"applicationId": application["id"]})

    titles = [
        item["title"]
        for item in client.get("/api/v1/notifications", headers=auth_headers).json()["items"]
    ]
    assert "Application confirmed" in titles


def test_cannot_assign_beyond_the_slot_count(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift = make_shift(db_session, registered_admin["facility"], slots=1)
    first = client.post(f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}).json()
    client.post(f"/api/v1/admin/shifts/{shift.id}/assign", headers=admin_headers,
                json={"applicationId": first["id"]})

    again = client.post(f"/api/v1/admin/shifts/{shift.id}/assign", headers=admin_headers,
                        json={"applicationId": first["id"]})
    assert again.status_code == 409


def test_rejecting_an_applicant(client, admin_headers, auth_headers, registered_admin, db_session):
    shift = make_shift(db_session, registered_admin["facility"])
    application = client.post(
        f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}
    ).json()

    response = client.post(
        f"/api/v1/admin/shifts/{shift.id}/applicants/{application['id']}/reject",
        headers=admin_headers, json={"reason": "Insufficient ER experience"},
    )
    assert response.status_code == 200
    assert response.json()["applicants"][0]["status"] == "rejected"


def test_cancelling_a_shift_cancels_its_applications_and_notifies(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift = make_shift(db_session, registered_admin["facility"])
    client.post(f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={})

    response = client.post(f"/api/v1/admin/shifts/{shift.id}/cancel", headers=admin_headers,
                           json={"reason": "Ward closed"})
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    mine = client.get("/api/v1/applications?tab=cancelled", headers=auth_headers).json()
    assert mine["total"] == 1
    assert mine["items"][0]["cancellationReason"] == "Ward closed"


def test_duplicate_creates_a_draft_a_week_later(client, admin_headers, registered_admin, db_session):
    shift = make_shift(db_session, registered_admin["facility"], days_ahead=3)

    copy = client.post(f"/api/v1/admin/shifts/{shift.id}/duplicate", headers=admin_headers)
    assert copy.status_code == 201

    body = copy.json()
    assert body["id"] != shift.id
    assert body["status"] == "draft", "a duplicate should be reviewed before going live"
    original_start = shift.start_time
    assert datetime.fromisoformat(body["startTime"]).date() == (
        original_start + timedelta(days=7)
    ).date()


def test_status_filter_distinguishes_open_from_pending(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """"Pending" is an open shift with applicants — derived, not stored."""
    facility = registered_admin["facility"]
    with_applicant = make_shift(db_session, facility, days_ahead=3)
    make_shift(db_session, facility, days_ahead=4)
    client.post(f"/api/v1/shifts/{with_applicant.id}/apply", headers=auth_headers, json={})

    pending = client.get("/api/v1/admin/shifts?status=pending", headers=admin_headers).json()
    assert pending["total"] == 1
    assert pending["items"][0]["id"] == with_applicant.id

    open_only = client.get("/api/v1/admin/shifts?status=open", headers=admin_headers).json()
    assert open_only["total"] == 1
    assert open_only["items"][0]["id"] != with_applicant.id


def test_search_finds_a_shift_by_its_reference(client, admin_headers, registered_admin, db_session):
    shift = make_shift(db_session, registered_admin["facility"])
    reference = client.get(
        f"/api/v1/admin/shifts/{shift.id}", headers=admin_headers
    ).json()["reference"]

    body = client.get(f"/api/v1/admin/shifts?search={reference}", headers=admin_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == shift.id


def test_cannot_shrink_slots_below_what_is_already_filled(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    shift = make_shift(db_session, registered_admin["facility"], slots=2)
    application = client.post(
        f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}
    ).json()
    client.post(f"/api/v1/admin/shifts/{shift.id}/assign", headers=admin_headers,
                json={"applicationId": application["id"]})

    response = client.patch(f"/api/v1/admin/shifts/{shift.id}", headers=admin_headers,
                            json={"slots": 0})
    assert response.status_code == 422   # slots must be >= 1

    response = client.patch(f"/api/v1/admin/shifts/{shift.id}", headers=admin_headers,
                            json={"slots": 1})
    assert response.status_code == 200   # 1 filled, 1 slot is consistent


def test_only_drafts_can_be_deleted(client, admin_headers, registered_admin, db_session):
    published = make_shift(db_session, registered_admin["facility"])
    assert client.delete(
        f"/api/v1/admin/shifts/{published.id}", headers=admin_headers
    ).status_code == 400

    draft = client.post("/api/v1/admin/shifts", headers=admin_headers,
                        json=_create_payload(publish=False)).json()
    assert client.delete(
        f"/api/v1/admin/shifts/{draft['id']}", headers=admin_headers
    ).status_code == 200


def test_shift_date_filter_includes_the_whole_last_day(client, admin_headers, registered_admin, db_session):
    """dateTo used to mean midnight at the start of that day, hiding its shifts."""
    shift = make_shift(db_session, registered_admin["facility"], start_hour=15)
    day = shift.start_time.date().isoformat()
    body = client.get("/api/v1/admin/shifts", headers=admin_headers,
                      params={"dateFrom": day, "dateTo": day}).json()
    assert [row["id"] for row in body["items"]] == [shift.id]
    assert client.get("/api/v1/admin/shifts", headers=admin_headers,
                      params={"role": "nurse"}).json()["total"] == 0
