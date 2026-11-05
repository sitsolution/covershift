from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.clock import now_ist
from app.core.database import get_db
from app.core.deps import get_current_staff, get_current_user
from app.models.application import Application
from app.models.enums import ApplicationStatus, PaymentStatus, ShiftStatus, STAFF_ROLES
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.shift import Shift
from app.models.support import DeviceToken, WebPushSubscription
from app.models.user import StaffProfile, User, UserSettings
from app.schemas.base import MessageResponse
from app.schemas.dashboard import DashboardResponse, DashboardStats
from app.schemas.user import (
    DeviceTokenRegister,
    ProfileOut,
    ProfileUpdate,
    SettingsOut,
    SettingsUpdate,
    StaffProfileOut,
    WebPushSubscriptionRegister,
    WebPushSubscriptionRemove,
)
from app.services import serializers
from app.services.labels import credential_label
from app.services.storage import save_upload

router = APIRouter()


def _get_or_create_settings(db: Session, user: User) -> UserSettings:
    settings_row = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if settings_row is None:
        settings_row = UserSettings(user_id=user.id)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row


def _profile_out(db: Session, user: User) -> ProfileOut:
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()

    profile_out: Optional[StaffProfileOut] = None
    if profile is not None:
        profile_out = StaffProfileOut(
            credential_number=profile.credential_number,
            credential_label=credential_label(user.role),
            specialty=profile.specialty,
            experience=profile.experience,
            qualifications=profile.qualifications,
            bio=profile.bio,
            preferred_locations=[
                p.strip() for p in (profile.preferred_locations or "").split(",") if p.strip()
            ],
            min_pay_rate=float(profile.min_pay_rate) if profile.min_pay_rate is not None else None,
            bank_name=profile.bank_name,
            bank_account_last4=profile.bank_account_last4,
            rating=float(profile.rating or 0),
            reviews_count=profile.reviews_count,
            shifts_completed=profile.shifts_completed,
        )

    return ProfileOut(
        user=serializers.user_out(user),
        profile=profile_out,
        date_of_birth=user.date_of_birth,
        location=(profile.preferred_locations if profile else None),
    )


@router.get("/me", response_model=ProfileOut)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Profile screen."""
    return _profile_out(db, current_user)


@router.patch("/me", response_model=ProfileOut)
def update_me(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit Profile screen. Only the fields present in the body are touched."""
    data = payload.model_dump(exclude_unset=True)

    if "phone" in data and data["phone"]:
        clash = (
            db.query(User)
            .filter(User.phone == data["phone"], User.id != current_user.id)
            .first()
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Phone number already in use"
            )

    for field in ("full_name", "phone", "date_of_birth"):
        if field in data:
            setattr(current_user, field, data[field])

    profile_fields = {
        "specialty", "experience", "qualifications", "bio",
        "min_pay_rate", "bank_name", "bank_account_last4", "bank_ifsc",
    }
    if (profile_fields | {"preferred_locations"}) & data.keys():
        profile = db.query(StaffProfile).filter(StaffProfile.user_id == current_user.id).first()
        if profile is None:
            if current_user.role not in STAFF_ROLES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This account has no staff profile to update",
                )
            profile = StaffProfile(user_id=current_user.id)
            db.add(profile)

        for field in profile_fields & data.keys():
            setattr(profile, field, data[field])
        if "preferred_locations" in data:
            profile.preferred_locations = ", ".join(data["preferred_locations"] or [])

    db.commit()
    db.refresh(current_user)
    return _profile_out(db, current_user)


@router.post("/me/avatar", response_model=ProfileOut)
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """'Change Photo' on Edit Profile."""
    from app.services.storage import _AVATAR_TYPES, AVATAR_FOLDER
    key, _ = save_upload(file, current_user.id, allowed_types=_AVATAR_TYPES, folder=AVATAR_FOLDER)
    current_user.avatar_url = f"/uploads/{key}"
    db.commit()
    db.refresh(current_user)
    return _profile_out(db, current_user)


@router.get("/me/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Settings screen toggles."""
    return SettingsOut.model_validate(_get_or_create_settings(db, current_user))


@router.patch("/me/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings_row = _get_or_create_settings(db, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings_row, field, value)
    db.commit()
    db.refresh(settings_row)
    return SettingsOut.model_validate(settings_row)


@router.post("/me/device-token", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register_device_token(
    payload: DeviceTokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stores the Expo push token so push notifications have a target."""
    existing = db.query(DeviceToken).filter(DeviceToken.token == payload.token).first()
    now = now_ist()

    if existing is not None:
        # A device can change hands between accounts; re-point the token.
        existing.user_id = current_user.id
        existing.platform = payload.platform
        existing.is_active = True
        existing.last_seen_at = now
    else:
        db.add(
            DeviceToken(
                user_id=current_user.id,
                token=payload.token,
                platform=payload.platform,
                last_seen_at=now,
            )
        )
    db.commit()
    return MessageResponse(message="Device registered")


@router.delete("/me", response_model=MessageResponse)
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete: deactivates the account. Staff disappear from the directory
    and cannot log in again. Data is retained for audit purposes."""
    current_user.is_active = False
    db.commit()
    return MessageResponse(message="Account deactivated")


@router.delete("/me/device-token", response_model=MessageResponse)
def unregister_device_token(
    payload: DeviceTokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(DeviceToken).filter(
        DeviceToken.token == payload.token, DeviceToken.user_id == current_user.id
    ).delete()
    db.commit()
    return MessageResponse(message="Device unregistered")


@router.post("/me/web-push-subscription", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register_web_push_subscription(
    payload: WebPushSubscriptionRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a browser Web Push subscription so admins receive browser push notifications."""
    existing = (
        db.query(WebPushSubscription)
        .filter(WebPushSubscription.endpoint == payload.endpoint)
        .first()
    )
    if existing is not None:
        existing.user_id = current_user.id
        existing.p256dh_key = payload.p256dh_key
        existing.auth_key = payload.auth_key
        existing.is_active = True
    else:
        db.add(
            WebPushSubscription(
                user_id=current_user.id,
                endpoint=payload.endpoint,
                p256dh_key=payload.p256dh_key,
                auth_key=payload.auth_key,
            )
        )
    db.commit()
    return MessageResponse(message="Web push subscription registered")


@router.delete("/me/web-push-subscription", response_model=MessageResponse)
def unregister_web_push_subscription(
    payload: WebPushSubscriptionRemove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(WebPushSubscription).filter(
        WebPushSubscription.endpoint == payload.endpoint,
        WebPushSubscription.user_id == current_user.id,
    ).delete()
    db.commit()
    return MessageResponse(message="Web push subscription removed")


@router.get("/me/vapid-public-key")
def get_vapid_public_key():
    """Return the VAPID public key so the browser can subscribe to Web Push."""
    from app.core.config import settings

    return {"vapidPublicKey": settings.VAPID_PUBLIC_KEY}


@router.get("/me/dashboard", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """The whole Home screen in one call: stats, urgent shifts, recommendations."""
    from app.api.v1.endpoints.shifts import recommended_shifts

    now = now_ist()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    available = (
        db.query(func.count(Shift.id))
        .filter(
            Shift.role == current_user.role,
            Shift.status == ShiftStatus.open,
            Shift.is_visible.is_(True),
            Shift.end_time > now,
            Shift.slots_filled < Shift.slots,
        )
        .scalar()
    )
    upcoming = (
        db.query(func.count(Application.id))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == current_user.id,
            Application.status == ApplicationStatus.confirmed,
            Shift.start_time > now,
        )
        .scalar()
    )
    completed = (
        db.query(func.count(Application.id))
        .filter(
            Application.staff_id == current_user.id,
            Application.status == ApplicationStatus.completed,
        )
        .scalar()
    )
    earnings = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.user_id == current_user.id,
            Payment.status == PaymentStatus.paid,
            Payment.earned_at >= month_start,
        )
        .scalar()
    )
    unread = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .scalar()
    )

    urgent = (
        db.query(Shift)
        .filter(
            Shift.role == current_user.role,
            Shift.status == ShiftStatus.open,
            Shift.is_visible.is_(True),
            Shift.is_urgent.is_(True),
            Shift.end_time > now,
            Shift.slots_filled < Shift.slots,
        )
        .order_by(Shift.start_time.asc())
        .limit(10)
        .all()
    )

    hour = now.hour
    greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"

    return DashboardResponse(
        user=serializers.user_out(current_user),
        greeting=greeting,
        stats=DashboardStats(
            available_shifts=available or 0,
            upcoming_shifts=upcoming or 0,
            completed_shifts=completed or 0,
            earnings_this_month=float(earnings or 0),
        ),
        urgent_shifts=serializers.shift_items(db, current_user, urgent),
        recommended_shifts=recommended_shifts(db=db, current_user=current_user, limit=10).items,
        unread_notifications=unread or 0,
    )
