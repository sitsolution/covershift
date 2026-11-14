"""Deleting an account deletes the person's data (Google Play requirement),
keeps their shift history unnamed, and frees the email for a new sign-up."""

from app.services import storage
from tests.conftest import DOCTOR
from tests.factories import make_facility, make_shift
from tests.test_documents import _upload
from tests.test_storage import PNG


def test_delete_account_erases_personal_data(client, auth_headers, registered_doctor, db_session):
    from app.models.application import Application
    from app.models.document import Document
    from app.models.enums import ApplicationStatus
    from app.models.support import DeviceToken
    from app.models.user import StaffProfile, User

    uid = registered_doctor["user_id"]
    _upload(client, auth_headers)
    doc_key = db_session.query(Document.file_path).filter(Document.user_id == uid).scalar()
    avatar = client.post("/api/v1/users/me/avatar", headers=auth_headers, files={"file": PNG}).json()["user"]["avatarUrl"]
    client.post("/api/v1/users/me/device-token", headers=auth_headers,
                json={"token": "ExponentPushToken[doctor-phone]", "platform": "android"})
    shift = make_shift(db_session, make_facility(db_session))
    assert client.post(f"/api/v1/shifts/{shift.id}/apply", headers=auth_headers, json={}).status_code == 201
    assert storage.read(doc_key) is not None

    response = client.delete("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    db_session.expire_all()

    user = db_session.get(User, uid)
    assert user.full_name == "Deleted user"
    assert DOCTOR["email"] not in user.email and user.phone is None
    assert user.avatar_url is None and not user.is_active
    profile = db_session.query(StaffProfile).filter(StaffProfile.user_id == uid).one_or_none()
    assert profile is None or (profile.credential_number is None and profile.bank_ifsc is None)

    assert db_session.query(Document).filter(Document.user_id == uid).count() == 0
    assert db_session.query(DeviceToken).filter(DeviceToken.user_id == uid).count() == 0
    assert storage.read(doc_key) is None
    assert storage.read(avatar.removeprefix("/uploads/")) is None

    # The application stays for the facility's records, but is no longer live.
    application = db_session.query(Application).filter(Application.staff_id == uid).one()
    assert application.status == ApplicationStatus.cancelled


def test_deleted_account_cannot_log_in_and_email_can_register_again(client, auth_headers):
    assert client.delete("/api/v1/users/me", headers=auth_headers).status_code == 200

    login = client.post("/api/v1/auth/login", json={"email": DOCTOR["email"], "password": DOCTOR["password"]})
    assert login.status_code in (401, 403)
    assert client.get("/api/v1/users/me", headers=auth_headers).status_code in (401, 403)

    again = client.post("/api/v1/auth/register", json=DOCTOR)
    assert again.status_code == 201, again.text
