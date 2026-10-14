"""ORM → response-schema conversion.

Shift cards need two things the model alone cannot know: whether the viewer has
applied, and whether they favourited it. Both are passed in as prefetched maps
so a list endpoint stays at a fixed number of queries.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.application import Application
from app.models.enums import ApplicationStatus
from app.models.shift import Shift, ShiftFavorite
from app.models.user import User
from app.schemas.shift import FacilityBrief, ShiftDetail, ShiftListItem
from app.schemas.user import UserOut


_IST = timezone(timedelta(hours=5, minutes=30))


def user_context(db: Session, user: User, shifts: Iterable[Shift]) -> tuple[Dict[int, str], Set[int]]:
    """Fetch this user's application status and favourites for the given shifts
    in two queries, regardless of how many shifts there are."""
    shift_ids = [s.id for s in shifts]
    if not shift_ids:
        return {}, set()

    applications = (
        db.query(Application.shift_id, Application.status)
        .filter(
            Application.staff_id == user.id,
            Application.shift_id.in_(shift_ids),
            Application.status != ApplicationStatus.cancelled,
        )
        .all()
    )
    statuses = {shift_id: status.value for shift_id, status in applications}

    favorites = (
        db.query(ShiftFavorite.shift_id)
        .filter(ShiftFavorite.user_id == user.id, ShiftFavorite.shift_id.in_(shift_ids))
        .all()
    )
    return statuses, {row[0] for row in favorites}


def facility_brief(shift: Shift) -> FacilityBrief:
    facility = shift.facility
    return FacilityBrief(
        id=facility.id,
        name=facility.name,
        initials=facility.initials,
        location=facility.location_label,
        rating=float(facility.rating or 0),
        logo_url=facility.logo_url,
    )


def shift_item(
    shift: Shift,
    application_statuses: Optional[Dict[int, str]] = None,
    favorite_ids: Optional[Set[int]] = None,
) -> ShiftListItem:
    from datetime import timedelta, timezone as tz
    _IST = tz(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(_IST).replace(tzinfo=None)
    return ShiftListItem(
        id=shift.id,
        facility=facility_brief(shift),
        role=shift.role,
        specialty=shift.specialty,
        title=shift.title,
        start_time=shift.start_time,
        end_time=shift.end_time,
        duration_hours=shift.duration_hours,
        pay_rate=float(shift.pay_rate),
        status=shift.status,
        is_urgent=shift.is_urgent,
        is_night=shift.is_night,
        is_weekend=shift.is_weekend,
        tags=shift.tags,
        slots=shift.slots,
        slots_remaining=max(0, shift.slots - shift.slots_filled),
        application_status=(application_statuses or {}).get(shift.id),
        is_favorite=shift.id in (favorite_ids or set()),
        has_started=shift.start_time <= now_ist,
    )


def shift_items(
    db: Session, user: User, shifts: List[Shift]
) -> List[ShiftListItem]:
    statuses, favorites = user_context(db, user, shifts)
    return [shift_item(s, statuses, favorites) for s in shifts]


def shift_detail(
    shift: Shift,
    application_status: Optional[str] = None,
    is_favorite: bool = False,
) -> ShiftDetail:
    base = shift_item(shift)
    facility = shift.facility
    return ShiftDetail(
        **base.model_dump(by_alias=False),
        requirements=shift.requirements,
        amenities=shift.amenity_list,
        description=shift.description,
        address=facility.address,
        latitude=float(facility.latitude) if facility.latitude is not None else None,
        longitude=float(facility.longitude) if facility.longitude is not None else None,
        created_at=shift.created_at,
    ).model_copy(update={"application_status": application_status, "is_favorite": is_favorite})


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        phone=user.phone,
        full_name=user.full_name,
        role=user.role,
        initials=user.initials,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        created_at=user.created_at,
    )


def can_cancel_application(application: Application) -> bool:
    """Nothing can be cancelled once the shift has started. Before that, a
    pending application can always be withdrawn; a confirmed one only up to
    the cutoff before the shift starts."""
    # Shift times are stored as naive IST, so measure against IST now — reading
    # them as UTC put the cutoff 5½ hours late.
    start = application.shift.start_time.replace(tzinfo=None)
    hours_out = (start - datetime.now(_IST).replace(tzinfo=None)).total_seconds() / 3600
    if hours_out <= 0:
        return False
    if application.status == ApplicationStatus.pending:
        return True
    if application.status != ApplicationStatus.confirmed:
        return False
    return hours_out >= settings.CANCELLATION_CUTOFF_HOURS
