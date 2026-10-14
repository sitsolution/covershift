from tests.conftest import DOCTOR


def test_register_returns_tokens_and_unverified_state(client):
    response = client.post("/api/v1/auth/register", json=DOCTOR)
    assert response.status_code == 201

    body = response.json()
    assert body["isVerified"] is False
    assert body["role"] == "doctor"
    assert body["accessToken"] and body["refreshToken"]
    assert body["debugOtp"], "DEBUG mode should expose the OTP"


def test_register_rejects_weak_password(client):
    response = client.post("/api/v1/auth/register", json={**DOCTOR, "password": "weakpass"})
    assert response.status_code == 422
    # Errors are keyed by field so the mobile form can render them inline.
    assert "uppercase" in response.json()["fields"]["password"]


def test_register_requires_role_specific_fields(client):
    payload = {k: v for k, v in DOCTOR.items() if k != "licenseNumber"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert "license" in response.json()["detail"].lower()


def test_register_rejects_duplicate_email(client):
    client.post("/api/v1/auth/register", json=DOCTOR)
    response = client.post("/api/v1/auth/register", json={**DOCTOR, "phone": "+919800000000"})
    assert response.status_code == 409


def test_each_role_registers_with_its_own_credential_field(client):
    roles = [
        {"role": "nurse", "regNumber": "NCR-1", "specialty": "ICU Nursing"},
        {"role": "ot_tech", "certNumber": "OT-1", "certifyingBody": "Allied Health Council"},
        {"role": "housekeeping", "idProof": "123456789012", "workArea": "General Ward"},
        {"role": "facility_admin", "facilityName": "Apollo Hospital",
         "facilityType": "hospital", "city": "Pune"},
    ]
    for index, extra in enumerate(roles):
        payload = {
            "fullName": f"Test User {index}",
            "email": f"user{index}@example.com",
            "phone": f"+91981234000{index}",
            "password": "Password1",
            "acceptedTerms": True,
            **extra,
        }
        response = client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 201, f"{extra['role']}: {response.text}"
        assert response.json()["role"] == extra["role"]


def test_cannot_self_register_as_super_admin(client):
    response = client.post("/api/v1/auth/register", json={**DOCTOR, "role": "super_admin"})
    assert response.status_code == 422


def test_verify_otp_marks_account_verified(client):
    otp = client.post("/api/v1/auth/register", json=DOCTOR).json()["debugOtp"]
    response = client.post(
        "/api/v1/auth/verify-otp", json={"email": DOCTOR["email"], "code": otp}
    )
    assert response.status_code == 200
    assert response.json()["isVerified"] is True


def test_wrong_otp_reports_remaining_attempts(client):
    client.post("/api/v1/auth/register", json=DOCTOR)
    response = client.post(
        "/api/v1/auth/verify-otp", json={"email": DOCTOR["email"], "code": "000000"}
    )
    assert response.status_code == 400
    assert "attempt" in response.json()["detail"]


def test_otp_locks_out_after_max_attempts(client):
    client.post("/api/v1/auth/register", json=DOCTOR)
    for _ in range(5):
        client.post("/api/v1/auth/verify-otp", json={"email": DOCTOR["email"], "code": "000000"})

    response = client.post(
        "/api/v1/auth/verify-otp", json={"email": DOCTOR["email"], "code": "000000"}
    )
    assert response.status_code == 400
    assert "Too many" in response.json()["detail"]


def test_login_rejects_bad_password(client):
    client.post("/api/v1/auth/register", json=DOCTOR)
    response = client.post(
        "/api/v1/auth/login", json={"email": DOCTOR["email"], "password": "Wrong123"}
    )
    assert response.status_code == 401


def test_login_error_does_not_reveal_whether_email_exists(client):
    client.post("/api/v1/auth/register", json=DOCTOR)
    known = client.post(
        "/api/v1/auth/login", json={"email": DOCTOR["email"], "password": "Wrong123"}
    )
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "Wrong123"}
    )
    assert known.status_code == unknown.status_code == 401
    assert known.json()["detail"] == unknown.json()["detail"]


def test_forgot_password_rejects_an_unknown_email(client):
    response = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 404
    assert "No account found" in response.json()["detail"]


def test_protected_route_requires_a_valid_token(client, auth_headers):
    assert client.get("/api/v1/users/me").status_code == 401
    assert client.get(
        "/api/v1/users/me", headers={"Authorization": "Bearer nonsense"}
    ).status_code == 401
    assert client.get("/api/v1/users/me", headers=auth_headers).status_code == 200


def test_refresh_token_is_not_accepted_as_an_access_token(client, registered_doctor):
    refresh = registered_doctor["body"]["refreshToken"]
    response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {refresh}"})
    assert response.status_code == 401, "a refresh token must not authorise API calls"


def test_change_password_then_login_with_the_new_one(client, auth_headers):
    changed = client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers,
        json={"currentPassword": "Password1", "newPassword": "Password2"},
    )
    assert changed.status_code == 200

    assert client.post(
        "/api/v1/auth/login", json={"email": DOCTOR["email"], "password": "Password1"}
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login", json={"email": DOCTOR["email"], "password": "Password2"}
    ).status_code == 200


def test_super_admin_profile_page_flow(client, platform_admin_headers):
    """The calls the super admin My Profile page makes: load, rename, change password."""
    me = client.get("/api/v1/users/me", headers=platform_admin_headers)
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "root@example.com"

    renamed = client.patch("/api/v1/users/me", headers=platform_admin_headers,
                           json={"fullName": "Platform Owner"})
    assert renamed.status_code == 200
    assert renamed.json()["user"]["fullName"] == "Platform Owner"

    wrong = client.post("/api/v1/auth/change-password", headers=platform_admin_headers,
                        json={"currentPassword": "Nope1234", "newPassword": "NewPass123"})
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "Current password is incorrect"

    changed = client.post("/api/v1/auth/change-password", headers=platform_admin_headers,
                          json={"currentPassword": "Password1", "newPassword": "NewPass123"})
    assert changed.status_code == 200

    def login(password):
        return client.post("/api/v1/auth/login",
                           json={"email": "root@example.com", "password": password})

    assert login("Password1").status_code == 401
    after = login("NewPass123")
    assert after.status_code == 200
    assert after.json()["role"] == "super_admin"


def _forgot(client, email):
    return client.post("/api/v1/auth/forgot-password", json={"email": email})


def _reset(client, email, code, password="NewPass123"):
    return client.post("/api/v1/auth/reset-password",
                       json={"email": email, "code": code, "newPassword": password})


def test_forgot_password_emails_a_code_that_resets_the_password(client, registered_doctor):
    sent = _forgot(client, DOCTOR["email"])
    assert sent.status_code == 200
    code = sent.json()["debugOtp"]
    assert code and len(code) == 6

    assert _reset(client, DOCTOR["email"], code).status_code == 200

    login = lambda pw: client.post("/api/v1/auth/login", json={"email": DOCTOR["email"], "password": pw})
    assert login(DOCTOR["password"]).status_code == 401
    assert login("NewPass123").status_code == 200

    # The code is single-use.
    assert _reset(client, DOCTOR["email"], code, "Another123").status_code == 400


def test_wrong_reset_code_is_rejected_and_counted(client, registered_doctor):
    code = _forgot(client, DOCTOR["email"]).json()["debugOtp"]
    wrong = "000000" if code != "000000" else "111111"
    response = _reset(client, DOCTOR["email"], wrong)
    assert response.status_code == 400
    assert "attempt(s) remaining" in response.json()["detail"]
    # The password is unchanged.
    assert client.post("/api/v1/auth/login", json={
        "email": DOCTOR["email"], "password": DOCTOR["password"]}).status_code == 200


def test_reset_rejects_a_weak_new_password(client, registered_doctor):
    code = _forgot(client, DOCTOR["email"]).json()["debugOtp"]
    assert _reset(client, DOCTOR["email"], code, "short").status_code == 422


def test_resend_inside_the_cooldown_is_refused_and_keeps_the_first_code(client, registered_doctor):
    first = _forgot(client, DOCTOR["email"]).json()["debugOtp"]
    again = _forgot(client, DOCTOR["email"])
    assert again.status_code == 429
    assert "Please wait" in again.json()["detail"]
    assert _reset(client, DOCTOR["email"], first).status_code == 200
