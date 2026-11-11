from datetime import datetime
from typing import List, Optional

from pydantic import EmailStr, Field

from app.models.enums import UserRole
from app.schemas.base import CamelModel


class UserOut(CamelModel):
    id: int
    email: EmailStr
    phone: Optional[str] = None
    full_name: str
    role: UserRole
    initials: str
    avatar_url: Optional[str] = None
    is_verified: bool
    created_at: datetime


class StaffProfileOut(CamelModel):
    credential_number: Optional[str] = None
    credential_label: str          # "Medical License", "Nursing Council Reg.", …
    specialty: Optional[str] = None
    experience: Optional[str] = None
    qualifications: Optional[str] = None
    bio: Optional[str] = None
    preferred_locations: List[str] = []
    min_pay_rate: Optional[float] = None
    bank_name: Optional[str] = None
    bank_account_last4: Optional[str] = None
    rating: float = 0
    reviews_count: int = 0
    shifts_completed: int = 0


class ProfileOut(CamelModel):
    """Everything the Profile screen renders."""

    user: UserOut
    profile: Optional[StaffProfileOut] = None
    date_of_birth: Optional[datetime] = None
    location: Optional[str] = None


class ProfileUpdate(CamelModel):
    """Edit Profile screen. Every field optional — send only what changed."""

    full_name: Optional[str] = Field(default=None, min_length=3, max_length=60)
    phone: Optional[str] = Field(default=None, pattern=r"^\+?[0-9 \-]{10,20}$")
    date_of_birth: Optional[datetime] = None
    specialty: Optional[str] = None
    experience: Optional[str] = None
    qualifications: Optional[str] = None
    bio: Optional[str] = None
    preferred_locations: Optional[List[str]] = None
    min_pay_rate: Optional[float] = Field(default=None, ge=0)
    bank_name: Optional[str] = None
    bank_account_last4: Optional[str] = Field(default=None, pattern=r"^[0-9]{4}$")
    bank_ifsc: Optional[str] = None


class SettingsOut(CamelModel):
    push_notifications: bool
    sms_alerts: bool
    email_alerts: bool
    profile_visible: bool


class SettingsUpdate(CamelModel):
    push_notifications: Optional[bool] = None
    sms_alerts: Optional[bool] = None
    email_alerts: Optional[bool] = None
    profile_visible: Optional[bool] = None


class DeviceTokenRegister(CamelModel):
    token: str
    platform: str = Field(pattern="^(ios|android)$")


class WebPushSubscriptionRegister(CamelModel):
    """Payload sent by the browser after calling pushManager.subscribe()."""
    endpoint: str
    # Explicit alias: the camelCase generator turns p256dh_key into
    # "p256DhKey" (capital D after the digits), but browsers send "p256dhKey".
    p256dh_key: str = Field(alias="p256dhKey")   # base64url DH public key
    auth_key: str     # base64url auth secret


class WebPushSubscriptionRemove(CamelModel):
    endpoint: str
