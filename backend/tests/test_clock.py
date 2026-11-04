"""Times are stored and compared in IST.

Live MySQL runs its session on +05:30, so a UTC "now" written or compared
against these columns lands 5½ hours off: wrong times on screen, and shifts
that already started still listed as upcoming.
"""

from datetime import timedelta

from app.core.clock import now_ist
from app.models.application import Application
from app.models.enums import ApplicationStatus
from app.models.user import User
from tests.conftest import DOCTOR
from tests.factories import make_facility, make_shift


def _close_to_now(value) -> bool:
    return abs((value.replace(tzinfo=None) - now_ist()).total_seconds()) < 120


def test_last_login_is_stamped_in_ist(client, db_session, registered_doctor):
    client.post("/api/v1/auth/login", json={"email": DOCTOR["email"], "password": DOCTOR["password"]})
    user = db_session.query(User).filter(User.email == DOCTOR["email"]).one()
    db_session.refresh(user)
    assert _close_to_now(user.last_login_at)


def test_calendar_upcoming_leaves_out_a_shift_that_already_started(client, auth_headers, db_session):
    shift = make_shift(db_session, make_facility(db_session))
    shift.start_time = now_ist() - timedelta(hours=1)
    shift.end_time = shift.start_time + timedelta(hours=8)
    staff = db_session.query(User).filter(User.email == DOCTOR["email"]).one()
    db_session.add(Application(shift_id=shift.id, staff_id=staff.id, status=ApplicationStatus.confirmed))
    db_session.commit()

    today = now_ist()
    body = client.get(f"/api/v1/calendar?year={today.year}&month={today.month}", headers=auth_headers).json()
    assert body["upcoming"] == []
