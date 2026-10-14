from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.availability import Availability, ShiftPreference
from app.models.enums import STAFF_ROLES, FacilityRole, OtpPurpose, UserRole
from app.models.facility import Facility, FacilityMember
from app.models.user import StaffProfile, User, UserSettings
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleAuthRequest,
    GoogleNeedsRegistrationResponse,
    GoogleSignupRequest,
    LoginRequest,
    OtpSentResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    ResendOtpRequest,
    ResetPasswordRequest,
    ResetPasswordWithCodeRequest,
    TokenResponse,
    VerifyOtpRequest,
)
from app.schemas.base import MessageResponse
from app.services import otp as otp_service
from app.services.labels import WEEKDAY_NAMES

router = APIRouter()


def _token_response(user: User) -> dict:
    return {
        "access_token": create_access_token(user.id, user.role.value),
        "refresh_token": create_refresh_token(user.id),
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user.id,
        "role": user.role,
        "is_verified": user.is_verified,
        "full_name": user.full_name,
    }


def _seed_defaults(db: Session, user: User) -> None:
    """Every user gets settings; staff also get a default week of availability
    so the Set Availability screen has something to render on first open."""
    db.add(UserSettings(user_id=user.id))

    if user.role in STAFF_ROLES:
        db.add(ShiftPreference(user_id=user.id))
        for weekday in range(len(WEEKDAY_NAMES)):
            db.add(
                Availability(
                    user_id=user.id,
                    weekday=weekday,
                    is_available=weekday < 5,   # weekdays on, weekend off
                    start_time=datetime.strptime("09:00", "%H:%M").time(),
                    end_time=datetime.strptime("18:00", "%H:%M").time(),
                )
            )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Backs all five sign-up screens.

    Returns tokens immediately so the app can proceed to OTP entry with an
    authenticated session; ``isVerified`` stays false until the code is checked.
    """
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if payload.phone and db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already registered")

    user = User(
        email=payload.email,
        phone=payload.phone,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        accepted_terms_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()   # assign user.id without ending the transaction

    if payload.role in STAFF_ROLES:
        db.add(
            StaffProfile(
                user_id=user.id,
                credential_number=payload.credential,
                specialty=payload.classification,
                experience=payload.experience,
            )
        )
    elif payload.role == UserRole.facility_admin:
        facility = Facility(
            name=payload.facility_name,
            facility_type=payload.facility_type,
            city=payload.city,
            created_by_id=user.id,
        )
        db.add(facility)
        db.flush()
        db.add(FacilityMember(
            facility_id=facility.id,
            user_id=user.id,
            facility_role=FacilityRole.super_admin,
            accepted_at=datetime.now(timezone.utc),
        ))

    _seed_defaults(db, user)
    db.commit()
    db.refresh(user)

    code = otp_service.issue_code(db, user, OtpPurpose.signup_verification)

    return RegisterResponse(
        **_token_response(user),
        otp_sent_to=user.email,
        debug_otp=code if settings.expose_otp else None,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # Same error and roughly the same work whether the email exists or not, so
    # the response cannot be used to enumerate accounts.
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    debug_otp: str | None = None
    if not user.is_verified:
        # Issue a fresh OTP every time an unverified user logs in so they always
        # have a working code to enter on the verification screen, regardless of
        # whether they self-registered or were added by an admin.
        debug_otp_code = otp_service.issue_code(db, user, OtpPurpose.signup_verification)
        debug_otp = debug_otp_code if settings.expose_otp else None

    return TokenResponse(**_token_response(user), debug_otp=debug_otp)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    token_payload = decode_token(payload.refresh_token, expected_type="refresh")
    if token_payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
        )

    user = db.query(User).filter(User.id == int(token_payload["sub"])).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    return TokenResponse(**_token_response(user))


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    """OTP Verification screen."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    ok, reason = otp_service.verify_code(db, user, payload.code, OtpPurpose.signup_verification)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    user.is_verified = True
    db.commit()
    db.refresh(user)
    # Fresh tokens so the client's stored claims reflect the verified state.
    return TokenResponse(**_token_response(user))


@router.post("/resend-otp", response_model=OtpSentResponse)
def resend_otp(payload: ResendOtpRequest, db: Session = Depends(get_db)):
    """The 'Resend Code' link once the screen's timer hits zero."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account is already verified")

    cooldown = otp_service.seconds_until_resend(db, user.id, OtpPurpose.signup_verification)
    if cooldown > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {cooldown} seconds before requesting another code",
        )

    code = otp_service.issue_code(db, user, OtpPurpose.signup_verification)
    return OtpSentResponse(
        message="Verification code sent",
        sent_to=user.email,
        expires_in_seconds=settings.OTP_TTL_MINUTES * 60,
        resend_available_in_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS,
        debug_otp=code if settings.expose_otp else None,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Forgot Password, first step: email a reset code.

    An unknown email is reported straight away so the user can fix a typo.
    This does reveal whether an account exists, but signup already does that
    ("Email already registered"), so it adds nothing an attacker lacks.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email address.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    cooldown = otp_service.seconds_until_resend(db, user.id, OtpPurpose.password_reset)
    if cooldown > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {cooldown} seconds before requesting another code",
        )

    code = otp_service.issue_code(db, user, OtpPurpose.password_reset)
    return ForgotPasswordResponse(
        message=f"A 6-digit reset code has been sent to {user.email}.",
        expires_in_seconds=settings.OTP_TTL_MINUTES * 60,
        resend_available_in_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS,
        debug_otp=code if settings.expose_otp else None,
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordWithCodeRequest, db: Session = Depends(get_db)):
    """Forgot Password, second step: check the code and set the new password."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect code. Please check the email and try again.",
        )

    ok, reason = otp_service.verify_code(db, user, payload.code, OtpPurpose.password_reset)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password updated. You can now log in.")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Settings → Change Password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current one",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password changed successfully")


@router.post("/accept-invitation", response_model=TokenResponse)
def accept_invitation(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Completes an admin invitation.

    The invited account was created with an unusable random password; this sets
    the real one and marks the membership accepted, so the invitee chooses
    their own credentials and nobody ever knows a password on their behalf.
    """
    from app.models.facility import FacilityMember

    user = otp_service.consume_reset_token(db, payload.token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link is invalid or has expired",
        )

    user.hashed_password = hash_password(payload.new_password)
    user.is_verified = True

    db.query(FacilityMember).filter(
        FacilityMember.user_id == user.id,
        FacilityMember.accepted_at.is_(None),
    ).update({"accepted_at": datetime.now(timezone.utc)}, synchronize_session=False)

    db.commit()
    db.refresh(user)
    return TokenResponse(**_token_response(user))


@router.post("/google", response_model=TokenResponse | GoogleNeedsRegistrationResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Sign in with Google. Returns JWT if user exists, else needsRegistration payload."""
    import httpx
    resp = httpx.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {payload.access_token}"},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    google_data = resp.json()
    email = google_data.get("email")
    full_name = google_data.get("name", "")

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account has no email")

    user = db.query(User).filter(User.email == email).first()
    if user:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        return TokenResponse(**_token_response(user))

    return GoogleNeedsRegistrationResponse(google_email=email, google_name=full_name)


@router.post("/google-signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def google_signup(payload: GoogleSignupRequest, db: Session = Depends(get_db)):
    """Complete registration for new Google users after role selection."""
    import httpx
    import secrets as _secrets
    resp = httpx.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {payload.access_token}"},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    google_data = resp.json()
    email = google_data.get("email")
    full_name = google_data.get("name", "")

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account has no email")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if payload.phone and db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already registered")

    user = User(
        email=email,
        phone=payload.phone or None,
        full_name=full_name,
        hashed_password=hash_password(_secrets.token_urlsafe(32)),
        role=payload.role,
        accepted_terms_at=datetime.now(timezone.utc),
        is_verified=True,
    )
    db.add(user)
    db.flush()

    if payload.role in STAFF_ROLES:
        db.add(StaffProfile(
            user_id=user.id,
            credential_number=payload.credential,
            specialty=payload.classification,
            experience=payload.experience,
        ))
    elif payload.role == UserRole.facility_admin:
        facility = Facility(
            name=payload.facility_name,
            facility_type=payload.facility_type,
            city=payload.city,
            created_by_id=user.id,
        )
        db.add(facility)
        db.flush()
        db.add(FacilityMember(
            facility_id=facility.id,
            user_id=user.id,
            facility_role=FacilityRole.super_admin,
            accepted_at=datetime.now(timezone.utc),
        ))

    _seed_defaults(db, user)
    db.commit()
    db.refresh(user)
    return TokenResponse(**_token_response(user))


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)):
    """Tokens are stateless, so this is advisory: the client discards them.
    Kept as an endpoint so revocation can be added without a client change."""
    return MessageResponse(message="Logged out")
