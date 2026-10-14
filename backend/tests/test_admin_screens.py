"""Staff database, document verification, reports, calendar, billing, settings."""

from datetime import date, datetime, timedelta, timezone

from tests.factories import make_facility, make_shift

PDF = ("license.pdf", b"%PDF-1.4 fake", "application/pdf")


def _upload_document(client, headers, **overrides):
    data = {"docType": "medical_license", "confirmed": "true", **overrides}
    return client.post("/api/v1/documents", headers=headers, files={"file": PDF}, data=data)


def _connect_staff(client, admin_headers, auth_headers, facility, db_session):
    """Give the staff member an application at this facility."""
    shift = make_shift(db_session, facility)
    client.post(f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={})
    return shift


# ── Staff database ────────────────────────────────────────────────────────────

def _add_to_roster(db_session, facility_id, staff_id):
    from app.models.facility import FacilityStaff

    db_session.add(FacilityStaff(facility_id=facility_id, user_id=staff_id))
    db_session.commit()


def test_staff_directory_hides_staff_from_other_facilities(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """A facility admin sees only their own staff, never the whole platform."""
    assert client.get("/api/v1/admin/staff", headers=admin_headers).json()["total"] == 0

    rival = make_facility(db_session, name="Rival Hospital")
    _connect_staff(client, admin_headers, auth_headers, rival, db_session)
    assert client.get("/api/v1/admin/staff", headers=admin_headers).json()["total"] == 0

    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    body = client.get("/api/v1/admin/staff", headers=admin_headers).json()
    assert body["total"] == 1

    row = body["items"][0]
    assert row["name"] == "Dr. Ananya Rao"
    assert row["roleLabel"] == "Doctor"
    assert row["availabilityLabel"] in ("Available", "Unavailable")


def test_platform_admin_sees_every_staff_member(
    client, platform_admin_headers, auth_headers
):
    body = client.get("/api/v1/admin/staff", headers=platform_admin_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Dr. Ananya Rao"


def test_another_facilitys_staff_profile_is_not_found(
    client, admin_headers, auth_headers, registered_doctor, platform_admin_headers
):
    staff_id = registered_doctor["user_id"]
    for path in ("", "/shifts", "/reviews", "/notes"):
        response = client.get(f"/api/v1/admin/staff/{staff_id}{path}", headers=admin_headers)
        assert response.status_code == 404, path

    assert client.get(
        f"/api/v1/admin/staff/{staff_id}", headers=platform_admin_headers
    ).status_code == 200


def test_staff_added_by_an_admin_joins_their_roster(client, admin_headers, db_session):
    created = client.post("/api/v1/admin/staff", headers=admin_headers, json={
        "fullName": "Sister Meera Iyer", "email": "meera@example.com",
        "phone": "+919822222222", "password": "Password1", "role": "nurse",
    })
    assert created.status_code == 201, created.text

    body = client.get("/api/v1/admin/staff", headers=admin_headers).json()
    assert [row["name"] for row in body["items"]] == ["Sister Meera Iyer"]


def test_global_search_finds_only_the_facilitys_staff(
    client, admin_headers, auth_headers, registered_admin, db_session, platform_admin_headers
):
    def staff_hits(headers):
        return client.get("/api/v1/admin/search?q=Ananya", headers=headers).json()["staff"]

    assert staff_hits(admin_headers) == []
    assert len(staff_hits(platform_admin_headers)) == 1

    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    assert len(staff_hits(admin_headers)) == 1


def test_filter_options_only_cover_the_facilitys_staff(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    assert client.get(
        "/api/v1/admin/staff/filter-options", headers=admin_headers
    ).json()["specialties"] == []

    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    assert client.get(
        "/api/v1/admin/staff/filter-options", headers=admin_headers
    ).json()["specialties"] == ["Emergency Med."]


def test_staff_hidden_when_profile_visibility_is_off(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """Switching off Profile Visibility in the mobile app removes them."""
    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    client.patch("/api/v1/users/me/settings", headers=auth_headers,
                 json={"profileVisible": False})
    assert client.get("/api/v1/admin/staff", headers=admin_headers).json()["total"] == 0


def test_staff_filters(client, admin_headers, auth_headers, registered_admin, db_session):
    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    assert client.get(
        "/api/v1/admin/staff?role=nurse", headers=admin_headers
    ).json()["total"] == 0
    assert client.get(
        "/api/v1/admin/staff?role=doctor", headers=admin_headers
    ).json()["total"] == 1
    assert client.get(
        "/api/v1/admin/staff?search=Ananya", headers=admin_headers
    ).json()["total"] == 1
    assert client.get(
        "/api/v1/admin/staff?minRating=4.9", headers=admin_headers
    ).json()["total"] == 0


def test_documents_are_withheld_until_the_staff_member_applies_here(
    client, admin_headers, auth_headers, registered_admin, registered_doctor, db_session
):
    """Credentials are private to facilities the staff member approached —
    being on the roster alone is not enough."""
    _upload_document(client, auth_headers)
    staff_id = registered_doctor["user_id"]
    _add_to_roster(db_session, registered_admin["facility_id"], staff_id)

    profile = client.get(f"/api/v1/admin/staff/{staff_id}", headers=admin_headers).json()
    assert profile["canViewDocuments"] is False
    assert profile["documents"] == []

    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)

    profile = client.get(f"/api/v1/admin/staff/{staff_id}", headers=admin_headers).json()
    assert profile["canViewDocuments"] is True
    assert len(profile["documents"]) == 1


def test_staff_notes_are_private_to_the_facility(
    client, admin_headers, registered_admin, registered_doctor, db_session
):
    staff_id = registered_doctor["user_id"]
    _add_to_roster(db_session, registered_admin["facility_id"], staff_id)

    created = client.post(f"/api/v1/admin/staff/{staff_id}/notes", headers=admin_headers,
                          json={"body": "Reliable on night cover."})
    assert created.status_code == 201

    notes = client.get(f"/api/v1/admin/staff/{staff_id}/notes", headers=admin_headers).json()
    assert len(notes) == 1
    assert notes[0]["authorName"] == "Rakesh Menon"


def test_review_requires_a_completed_shift_at_this_facility(
    client, admin_headers, registered_admin, registered_doctor, db_session
):
    staff_id = registered_doctor["user_id"]
    _add_to_roster(db_session, registered_admin["facility_id"], staff_id)

    response = client.post(f"/api/v1/admin/staff/{staff_id}/reviews", headers=admin_headers,
                           json={"rating": 5, "comment": "Great"})
    assert response.status_code == 400
    assert "has not completed a shift" in response.json()["detail"]


def test_review_updates_the_aggregate_rating(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    from app.models.application import Application
    from app.models.enums import ApplicationStatus

    shift = _connect_staff(client, admin_headers, auth_headers,
                           registered_admin["facility"], db_session)
    application = db_session.query(Application).filter(Application.shift_id == shift.id).one()
    application.status = ApplicationStatus.completed
    db_session.commit()

    staff_id = application.staff_id
    client.post(f"/api/v1/admin/staff/{staff_id}/reviews", headers=admin_headers,
                json={"rating": 4, "comment": "Solid"})
    client.post(f"/api/v1/admin/staff/{staff_id}/reviews", headers=admin_headers,
                json={"rating": 5})

    profile = client.get(f"/api/v1/admin/staff/{staff_id}", headers=admin_headers).json()
    assert profile["stats"]["reviewsCount"] == 2
    assert profile["stats"]["rating"] == 4.5

    # The staff member sees the same rating on their own profile.
    mine = client.get("/api/v1/users/me", headers=auth_headers).json()
    assert mine["profile"]["rating"] == 4.5


# ── Document verification ─────────────────────────────────────────────────────

def test_verification_queue_only_shows_connected_staff(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    _upload_document(client, auth_headers)
    assert client.get(
        "/api/v1/admin/documents?tab=pending", headers=admin_headers
    ).json()["total"] == 0

    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    body = client.get("/api/v1/admin/documents?tab=pending", headers=admin_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["docTypeLabel"] == "Medical License"


def test_verifying_a_document_notifies_the_staff_member(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    _upload_document(client, auth_headers)
    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)

    document_id = client.get(
        "/api/v1/admin/documents?tab=pending", headers=admin_headers
    ).json()["items"][0]["id"]

    response = client.post(f"/api/v1/admin/documents/{document_id}/verify", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "verified"

    # The staff member's Docs screen now shows it verified.
    groups = client.get("/api/v1/documents", headers=auth_headers).json()
    assert groups["verifiedCount"] == 1

    titles = [n["title"] for n in
              client.get("/api/v1/notifications", headers=auth_headers).json()["items"]]
    assert "Document verified" in titles


def test_rejection_requires_a_reason(client, admin_headers, auth_headers,
                                     registered_admin, db_session):
    _upload_document(client, auth_headers)
    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    document_id = client.get(
        "/api/v1/admin/documents?tab=pending", headers=admin_headers
    ).json()["items"][0]["id"]

    assert client.post(f"/api/v1/admin/documents/{document_id}/reject",
                       headers=admin_headers, json={}).status_code == 422

    response = client.post(f"/api/v1/admin/documents/{document_id}/reject",
                           headers=admin_headers, json={"reason": "Scan is unreadable"})
    assert response.status_code == 200
    assert response.json()["rejectionReason"] == "Scan is unreadable"


def test_admin_can_preview_the_document_file(client, admin_headers, auth_headers,
                                             registered_admin, db_session):
    _upload_document(client, auth_headers)
    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)
    document_id = client.get(
        "/api/v1/admin/documents?tab=pending", headers=admin_headers
    ).json()["items"][0]["id"]

    response = client.get(f"/api/v1/admin/documents/{document_id}/file", headers=admin_headers)
    assert response.status_code == 200
    assert response.content == PDF[1]
    assert "inline" in response.headers["content-disposition"]


# ── Dashboard, reports, calendar ──────────────────────────────────────────────

def test_dashboard_kpis_reflect_real_shifts(client, admin_headers, registered_admin, db_session):
    now = datetime.now(timezone.utc)
    facility = registered_admin["facility"]
    make_shift(db_session, facility, days_ahead=1, urgent=True)
    make_shift(db_session, facility, days_ahead=2)

    body = client.get(
        f"/api/v1/admin/dashboard?year={now.year}&month={now.month}", headers=admin_headers
    ).json()

    labels = {kpi["label"]: kpi["value"] for kpi in body["kpis"]}
    assert body["facilityName"] == "St. Joseph Hospital"
    assert int(labels["Total Shifts This Month"]) >= 1
    assert len(body["shiftVolumeByWeek"]) == 5
    assert body["urgentShifts"][0]["status"] == "unfilled"


def test_reports_include_fill_rate_and_compliance(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    _upload_document(
        client, auth_headers,
        expiryDate=(date.today() + timedelta(days=10)).isoformat(),
    )
    _connect_staff(client, admin_headers, auth_headers, registered_admin["facility"], db_session)

    body = client.get("/api/v1/admin/reports", headers=admin_headers).json()
    labels = [kpi["label"] for kpi in body["kpis"]]
    assert labels == ["Fill Rate", "Avg Time to Fill", "Locum Spend", "Expiring Documents"]
    assert len(body["expiringDocuments"]) == 1
    assert body["expiringDocuments"][0]["status"] == "Expiring soon"


def test_calendar_marks_the_worst_state_per_day(
    client, admin_headers, auth_headers, registered_admin, db_session
):
    """An unfilled shift outranks a filled one on the same day."""
    facility = registered_admin["facility"]
    target = datetime.now(timezone.utc) + timedelta(days=3)

    filled = make_shift(db_session, facility, days_ahead=3, start_hour=8)
    make_shift(db_session, facility, days_ahead=3, start_hour=14)

    application = client.post(
        f"/api/v1/shifts/{filled.id}/apply", headers=auth_headers, json={}
    ).json()
    client.post(f"/api/v1/admin/shifts/{filled.id}/assign", headers=admin_headers,
                json={"applicationId": application["id"]})

    body = client.get(
        f"/api/v1/admin/calendar?year={target.year}&month={target.month}", headers=admin_headers
    ).json()
    cell = next(d for d in body["days"] if d["day"] == target.date().isoformat())
    assert cell["total"] == 2
    assert cell["filled"] == 1
    assert cell["marker"] == "unfilled"


# ── Billing ───────────────────────────────────────────────────────────────────

def _make_invoice(db_session, facility_id, *, number="INV-1", total=92000,
                  status="unpaid", due_in_days=10):
    from decimal import Decimal
    from app.models.billing import Invoice, InvoiceLineItem
    from app.models.enums import InvoiceStatus

    issued = date.today() - timedelta(days=5)
    invoice = Invoice(
        facility_id=facility_id, number=number, status=InvoiceStatus(status),
        period_start=issued, period_end=issued + timedelta(days=30),
        issued_on=issued, due_on=date.today() + timedelta(days=due_in_days),
        subtotal=Decimal(str(total)), tax=Decimal("0"), total=Decimal(str(total)),
    )
    db_session.add(invoice)
    db_session.flush()
    db_session.add(InvoiceLineItem(
        invoice_id=invoice.id, description="Locum cover", quantity=Decimal("1"),
        unit_amount=Decimal(str(total)), amount=Decimal(str(total))))
    db_session.commit()
    return invoice


def test_overdue_is_derived_from_the_due_date(client, admin_headers, registered_admin, db_session):
    """An unpaid invoice past its due date reads as overdue without a job run."""
    _make_invoice(db_session, registered_admin["facility_id"], number="INV-1", due_in_days=-5)
    _make_invoice(db_session, registered_admin["facility_id"], number="INV-2", due_in_days=10)

    body = client.get("/api/v1/admin/invoices", headers=admin_headers).json()
    assert body["counts"]["overdue"] == 1
    assert body["counts"]["unpaid"] == 1

    overdue = client.get("/api/v1/admin/invoices?tab=overdue", headers=admin_headers).json()
    assert overdue["total"] == 1
    assert overdue["items"][0]["number"] == "INV-1"


def test_billing_kpis(client, admin_headers, registered_admin, db_session):
    _make_invoice(db_session, registered_admin["facility_id"], number="INV-1", total=92000)

    body = client.get("/api/v1/admin/invoices", headers=admin_headers).json()
    kpis = {kpi["label"]: kpi["value"] for kpi in body["kpis"]}
    assert kpis["Total Outstanding"] == "₹92,000"
    assert kpis["Payment Method"] == "Not set"


def test_paying_an_invoice_marks_it_settled(client, admin_headers, registered_admin, db_session):
    invoice = _make_invoice(db_session, registered_admin["facility_id"])

    response = client.post(f"/api/v1/admin/invoices/{invoice.id}/pay", headers=admin_headers,
                           json={"reference": "TXN-123"})
    assert response.status_code == 200
    assert response.json()["status"] == "paid"

    again = client.post(f"/api/v1/admin/invoices/{invoice.id}/pay", headers=admin_headers, json={})
    assert again.status_code == 400


def test_invoice_download_is_csv(client, admin_headers, registered_admin, db_session):
    invoice = _make_invoice(db_session, registered_admin["facility_id"])
    response = client.get(f"/api/v1/admin/invoices/{invoice.id}/download", headers=admin_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "Locum cover" in response.text


# ── Settings & admin users ────────────────────────────────────────────────────

def test_facility_profile_round_trip(client, admin_headers):
    body = client.get("/api/v1/admin/settings/facility", headers=admin_headers).json()
    assert body["name"] == "St. Joseph Hospital"

    updated = client.patch("/api/v1/admin/settings/facility", headers=admin_headers, json={
        "address": "221 MG Road, Kalyani Nagar, Pune",
        "contactEmail": "ops@stjosephhosp.in",
        "description": "Multi-specialty hospital serving Pune East"}).json()
    assert updated["address"].startswith("221 MG Road")
    assert updated["contactEmail"] == "ops@stjosephhosp.in"


def test_inviting_an_admin_user_and_accepting_the_invitation(client, admin_headers):
    invited = client.post("/api/v1/admin/settings/users", headers=admin_headers, json={
        "fullName": "Rohan Deshpande", "email": "rohan@example.com",
        "facilityRole": "manager", "permissions": ["shifts", "staff"]})
    assert invited.status_code == 201

    body = invited.json()
    assert body["permissions"] == ["shifts", "staff"]
    assert body["acceptedAt"] is None
    assert body["debugInvitationToken"], "DEBUG should expose the token"

    # The invitee cannot log in until they set a password.
    accepted = client.post("/api/v1/auth/accept-invitation", json={
        "token": body["debugInvitationToken"], "newPassword": "Password1"})
    assert accepted.status_code == 200

    login = client.post("/api/v1/auth/login",
                        json={"email": "rohan@example.com", "password": "Password1"})
    assert login.status_code == 200

    rows = client.get("/api/v1/admin/settings/users", headers=admin_headers).json()
    invitee = next(r for r in rows if r["email"] == "rohan@example.com")
    assert invitee["acceptedAt"] is not None


def test_facility_super_admin_gets_every_permission(client, admin_headers):
    rows = client.get("/api/v1/admin/settings/users", headers=admin_headers).json()
    owner = rows[0]
    assert owner["facilityRole"] == "super_admin"
    assert set(owner["permissions"]) == {
        "shifts", "staff", "bookings", "documents", "reports", "billing"
    }


def test_cannot_invite_the_same_admin_twice(client, admin_headers):
    payload = {"fullName": "Rohan Deshpande", "email": "rohan@example.com",
               "facilityRole": "manager", "permissions": ["shifts"]}
    assert client.post("/api/v1/admin/settings/users",
                       headers=admin_headers, json=payload).status_code == 201
    assert client.post("/api/v1/admin/settings/users",
                       headers=admin_headers, json=payload).status_code == 409


def test_cannot_invite_a_staff_email_as_an_admin(client, admin_headers, auth_headers):
    from tests.conftest import DOCTOR

    response = client.post("/api/v1/admin/settings/users", headers=admin_headers, json={
        "fullName": "Ananya Rao", "email": DOCTOR["email"], "facilityRole": "manager"})
    assert response.status_code == 409
    assert "staff account" in response.json()["detail"]


def test_cannot_change_or_remove_your_own_access(client, admin_headers):
    rows = client.get("/api/v1/admin/settings/users", headers=admin_headers).json()
    own = rows[0]["memberId"]

    assert client.patch(f"/api/v1/admin/settings/users/{own}", headers=admin_headers,
                        json={"facilityRole": "staff"}).status_code == 400
    assert client.delete(f"/api/v1/admin/settings/users/{own}",
                         headers=admin_headers).status_code == 400


def test_updating_a_members_permissions_takes_effect_immediately(client, admin_headers, limited_admin):
    rows = client.get("/api/v1/admin/settings/users", headers=admin_headers).json()
    manager = next(r for r in rows if r["email"] == "manager@example.com")

    assert client.get("/api/v1/admin/staff",
                      headers=limited_admin["headers"]).status_code == 403

    client.patch(f"/api/v1/admin/settings/users/{manager['memberId']}", headers=admin_headers,
                 json={"permissions": ["shifts", "staff"]})

    assert client.get("/api/v1/admin/staff",
                      headers=limited_admin["headers"]).status_code == 200
