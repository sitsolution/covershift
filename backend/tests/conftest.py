"""Test fixtures.

Each test runs against a fresh in-memory SQLite database with the real schema,
so tests are isolated and need no MySQL server.
"""

import os
import tempfile

# Set before app.core.config is imported — Settings is cached at import time.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-anywhere-real")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("DEBUG", "true")
# Tests read codes from responses and must never email through the real
# provider configured in backend/.env.
os.environ["RESEND_API_KEY"] = ""
# Keep uploaded fixtures out of the working tree.
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp(prefix="coverline-test-uploads-"))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Import the model registry first: it populates Base.metadata, and importing
# it as `app.models` afterwards would rebind the name `app` away from the
# FastAPI instance.
import app.models  # noqa: F401

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,   # one shared connection, so :memory: persists
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


DOCTOR = {
    "fullName": "Dr. Ananya Rao",
    "email": "ananya@example.com",
    "phone": "+919812345678",
    "password": "Password1",
    "role": "doctor",
    "licenseNumber": "MCI-2019-88213",
    "specialty": "Emergency Med.",
    "experience": "6–10 years",
    "acceptedTerms": True,
}


@pytest.fixture
def registered_doctor(client):
    """A registered, OTP-verified doctor plus their auth header."""
    response = client.post("/api/v1/auth/register", json=DOCTOR)
    assert response.status_code == 201, response.text
    body = response.json()

    verified = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": DOCTOR["email"], "code": body["debugOtp"]},
    )
    assert verified.status_code == 200, verified.text
    token = verified.json()["accessToken"]
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "body": verified.json(),
        "user_id": body["userId"],
    }


@pytest.fixture
def auth_headers(registered_doctor):
    return registered_doctor["headers"]


# ── Admin fixtures ────────────────────────────────────────────────────────────

ADMIN = {
    "fullName": "Rakesh Menon",
    "email": "admin@example.com",
    "phone": "+919444444444",
    "password": "Password1",
    "role": "facility_admin",
    "facilityName": "St. Joseph Hospital",
    "facilityType": "hospital",
    "city": "Pune",
    "acceptedTerms": True,
}


@pytest.fixture
def registered_admin(client, db_session):
    """A facility admin who owns one facility as its super admin."""
    from app.models.enums import FacilityRole
    from app.models.facility import Facility, FacilityMember

    response = client.post("/api/v1/auth/register", json=ADMIN)
    assert response.status_code == 201, response.text
    body = response.json()

    # Registration creates the membership; promote it to super_admin, which is
    # what an owner-created facility implies.
    member = (
        db_session.query(FacilityMember)
        .filter(FacilityMember.user_id == body["userId"])
        .one()
    )
    member.facility_role = FacilityRole.super_admin
    db_session.commit()

    facility = db_session.query(Facility).filter(Facility.id == member.facility_id).one()
    return {
        "headers": {"Authorization": f"Bearer {body['accessToken']}"},
        "user_id": body["userId"],
        "facility_id": facility.id,
        "facility": facility,
    }


@pytest.fixture
def admin_headers(registered_admin):
    return registered_admin["headers"]


@pytest.fixture
def limited_admin(client, db_session, registered_admin):
    """A manager on the same facility holding only the `shifts` permission."""
    from app.models.enums import FacilityRole, UserRole
    from app.models.facility import FacilityMember
    from app.core.security import hash_password
    from app.models.user import User

    user = User(
        email="manager@example.com",
        full_name="Priya Menon",
        hashed_password=hash_password("Password1"),
        role=UserRole.facility_admin,
        is_verified=True,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        FacilityMember(
            facility_id=registered_admin["facility_id"],
            user_id=user.id,
            facility_role=FacilityRole.manager,
            permissions="shifts",
        )
    )
    db_session.commit()

    token = client.post(
        "/api/v1/auth/login", json={"email": "manager@example.com", "password": "Password1"}
    ).json()["accessToken"]
    return {"headers": {"Authorization": f"Bearer {token}"}, "user_id": user.id}


@pytest.fixture
def platform_admin_headers(client, db_session):
    """A platform super admin — unscoped, sees every facility and staff member."""
    from app.core.security import hash_password
    from app.models.enums import UserRole
    from app.models.user import User

    db_session.add(User(
        email="root@example.com",
        full_name="Platform Admin",
        hashed_password=hash_password("Password1"),
        role=UserRole.super_admin,
        is_verified=True,
    ))
    db_session.commit()

    token = client.post(
        "/api/v1/auth/login", json={"email": "root@example.com", "password": "Password1"}
    ).json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}
