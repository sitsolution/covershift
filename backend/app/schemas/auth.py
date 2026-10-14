from typing import Optional

from pydantic import EmailStr, Field, field_validator, model_validator

from app.models.enums import FacilityType, UserRole
from app.schemas.base import CamelModel

# Mirrors apps/mobile/src/utils/validation.ts so the client and server agree
# on what a valid password is.
PASSWORD_MIN = 8


def _validate_password(value: str) -> str:
    if len(value) < PASSWORD_MIN:
        raise ValueError(f"Password must be at least {PASSWORD_MIN} characters")
    if not any(c.isupper() for c in value):
        raise ValueError("Password must contain at least one uppercase letter")
    if not any(c.islower() for c in value):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in value):
        raise ValueError("Password must contain at least one number")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return value


class RegisterRequest(CamelModel):
    """One endpoint behind all five sign-up screens.

    The shared fields are identical across roles; the role-specific credential
    field differs only in name, and is normalised server-side.
    """

    full_name: str = Field(min_length=3, max_length=60)
    email: EmailStr
    phone: str = Field(pattern=r"^\+?[0-9 \-]{10,20}$")
    password: str
    role: UserRole
    accepted_terms: bool = True

    # ── Role-specific credential (exactly one applies) ────────────────────────
    license_number: Optional[str] = None      # doctor
    reg_number: Optional[str] = None          # nurse
    cert_number: Optional[str] = None         # OT technician
    id_proof: Optional[str] = None            # housekeeping

    # ── Role-specific classification ──────────────────────────────────────────
    specialty: Optional[str] = None           # doctor, nurse
    certifying_body: Optional[str] = None     # OT technician
    work_area: Optional[str] = None           # housekeeping
    experience: Optional[str] = None

    # ── Facility admin ────────────────────────────────────────────────────────
    facility_name: Optional[str] = None
    facility_type: Optional[FacilityType] = None
    city: Optional[str] = None

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)

    @field_validator("full_name", "specialty", "city", "facility_name")
    @classmethod
    def strip_text(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def check_role_fields(self):
        if self.role == UserRole.super_admin:
            raise ValueError("Cannot self-register as super admin")

        required = {
            UserRole.doctor: [("license_number", "Medical license number is required"),
                              ("specialty", "Specialty is required")],
            UserRole.nurse: [("reg_number", "Nursing council registration is required"),
                             ("specialty", "Specialty is required")],
            UserRole.ot_tech: [("cert_number", "Certification number is required"),
                               ("certifying_body", "Certifying body is required")],
            UserRole.housekeeping: [("id_proof", "ID proof number is required"),
                                    ("work_area", "Preferred work area is required")],
            UserRole.facility_admin: [("facility_name", "Facility name is required"),
                                      ("facility_type", "Facility type is required"),
                                      ("city", "City is required")],
        }.get(self.role, [])

        for field, message in required:
            if not getattr(self, field, None):
                raise ValueError(message)

        if not self.accepted_terms:
            raise ValueError("You must accept the Terms of Service to continue")
        return self

    # Normalised values the ORM layer actually stores.
    @property
    def credential(self) -> Optional[str]:
        return self.license_number or self.reg_number or self.cert_number or self.id_proof

    @property
    def classification(self) -> Optional[str]:
        return self.specialty or self.certifying_body or self.work_area


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class TokenResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: int
    role: UserRole
    is_verified: bool
    full_name: Optional[str] = None
    debug_otp: Optional[str] = None


class RefreshRequest(CamelModel):
    refresh_token: str


class RegisterResponse(TokenResponse):
    """Sign-up returns tokens plus, in development only, the OTP that would
    otherwise arrive by SMS/email."""

    otp_sent_to: str
    debug_otp: Optional[str] = None


class VerifyOtpRequest(CamelModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


class ResendOtpRequest(CamelModel):
    email: EmailStr


class OtpSentResponse(CamelModel):
    message: str
    sent_to: str
    expires_in_seconds: int
    resend_available_in_seconds: int
    debug_otp: Optional[str] = None


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


class ForgotPasswordResponse(CamelModel):
    message: str
    expires_in_seconds: int
    resend_available_in_seconds: int
    debug_otp: Optional[str] = None


class ResetPasswordWithCodeRequest(CamelModel):
    """Forgot Password, second step: the emailed code plus the new password."""

    email: EmailStr
    code: str = Field(min_length=4, max_length=10)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)


class ResetPasswordRequest(CamelModel):
    """Accept Invitation: a one-time token and the password to set."""

    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)


class GoogleAuthRequest(CamelModel):
    access_token: str


class GoogleNeedsRegistrationResponse(CamelModel):
    needs_registration: bool = True
    google_email: str
    google_name: str


class GoogleSignupRequest(CamelModel):
    access_token: str
    role: UserRole
    phone: Optional[str] = None
    license_number: Optional[str] = None
    reg_number: Optional[str] = None
    cert_number: Optional[str] = None
    id_proof: Optional[str] = None
    specialty: Optional[str] = None
    certifying_body: Optional[str] = None
    work_area: Optional[str] = None
    experience: Optional[str] = None
    facility_name: Optional[str] = None
    facility_type: Optional[FacilityType] = None
    city: Optional[str] = None

    @property
    def credential(self) -> Optional[str]:
        return self.license_number or self.reg_number or self.cert_number or self.id_proof

    @property
    def classification(self) -> Optional[str]:
        return self.specialty or self.certifying_body or self.work_area
