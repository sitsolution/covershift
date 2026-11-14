"""Google sign-in: the API trusts a Google ID token only when Google issued it
to our own OAuth client."""

import httpx
import pytest

from app.core.config import settings

OUR_CLIENT = "our-web-client.apps.googleusercontent.com"


class _Resp:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


@pytest.fixture
def google(monkeypatch):
    """Stand-in for Google's tokeninfo endpoint; tests set the claims."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_IDS", OUR_CLIENT)
    state = {"claims": {}, "status": 200, "calls": []}

    def fake_get(url, params=None, **_):
        state["calls"].append((url, params))
        return _Resp(state["status"], state["claims"])

    monkeypatch.setattr(httpx, "get", fake_get)

    def sign_in_as(email, name="Dr. Google User", aud=OUR_CLIENT, verified="true"):
        state["claims"] = {"aud": aud, "iss": "https://accounts.google.com", "email": email,
                           "email_verified": verified, "name": name}

    state["sign_in_as"] = sign_in_as
    return state


def test_new_google_user_is_asked_to_register(client, google):
    google["sign_in_as"]("new.doctor@gmail.com", name="Dr. New")
    body = client.post("/api/v1/auth/google", json={"idToken": "tok"}).json()
    assert body["needsRegistration"] is True
    assert body["googleEmail"] == "new.doctor@gmail.com"
    assert google["calls"][0][1] == {"id_token": "tok"}


def test_google_signup_then_login(client, google):
    google["sign_in_as"]("new.doctor@gmail.com", name="Dr. New")
    signup = client.post("/api/v1/auth/google-signup", json={
        "idToken": "tok", "role": "doctor", "phone": "+919800000001",
        "licenseNumber": "MCI-1", "specialty": "General Medicine", "experience": "3-5 years",
    })
    assert signup.status_code == 201, signup.text
    assert signup.json()["accessToken"]

    login = client.post("/api/v1/auth/google", json={"idToken": "tok"})
    assert login.status_code == 200
    assert login.json()["userId"] == signup.json()["userId"]
    assert login.json()["role"] == "doctor"


def test_token_issued_to_another_app_is_rejected(client, registered_doctor, google):
    from tests.conftest import DOCTOR

    google["sign_in_as"](DOCTOR["email"], aud="someone-elses-app.apps.googleusercontent.com")
    response = client.post("/api/v1/auth/google", json={"idToken": "tok"})
    assert response.status_code == 401


def test_unverified_google_email_is_rejected(client, google):
    google["sign_in_as"]("x@gmail.com", verified="false")
    assert client.post("/api/v1/auth/google", json={"idToken": "tok"}).status_code == 401


def test_invalid_token_is_rejected(client, google):
    google["status"] = 400
    assert client.post("/api/v1/auth/google", json={"idToken": "bad"}).status_code == 401


def test_google_sign_in_off_without_client_id(client, google, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_IDS", "")
    google["sign_in_as"]("x@gmail.com")
    assert client.post("/api/v1/auth/google", json={"idToken": "tok"}).status_code == 503
