from datetime import datetime, timedelta, timezone

_IST = timezone(timedelta(hours=5, minutes=30))


def _now_ist():
    return datetime.now(_IST).replace(tzinfo=None)
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.clock import now_ist
from app.core.database import get_db
from app.core.deps import get_current_staff, get_current_user
from app.models.application import Application
from app.models.availability import ShiftPreference
from app.models.enums import ActivityActionType, ApplicationStatus, NotificationCategory, ShiftStatus, UserRole
from app.models.facility import Facility, FacilityMember
from app.models.shift import Shift, ShiftFavorite
from app.models.user import StaffProfile, User
from app.schemas.application import ApplicationOut, ApplyRequest
from app.schemas.base import MessageResponse
from app.schemas.shift import ShiftDetail, ShiftFilterOptions, ShiftListResponse
from app.services import serializers
from app.services.activity_log import log_activity
from app.services.notifications import notify

router = APIRouter()

SHIFT_TYPES = ["Day", "Night", "Weekend", "Urgent"]
PAY_RANGES = ["Under ₹2,000", "₹2,000–₹5,000", "₹5,000–₹10,000", "₹10,000+"]


def _base_query(db: Session):
    return db.query(Shift).options(joinedload(Shift.facility))


def _apply_filters(
    query,
    *,
    role: Optional[UserRole],
    search: Optional[str],
    location: Optional[str],
    specialty: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    shift_type: Optional[str],
    min_pay: Optional[float],
    max_pay: Optional[float],
    urgent_only: bool,
):
    query = query.join(Facility, Shift.facility_id == Facility.id)

    if role:
        query = query.filter(Shift.role == role)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Facility.name.ilike(term),
                Facility.city.ilike(term),
                Facility.area.ilike(term),
                Shift.specialty.ilike(term),
                Shift.title.ilike(term),
            )
        )
    if location:
        term = f"%{location.strip()}%"
        query = query.filter(or_(Facility.city.ilike(term), Facility.area.ilike(term)))
    if specialty:
        query = query.filter(Shift.specialty == specialty)
    if date_from:
        query = query.filter(Shift.start_time >= date_from)
    if date_to:
        query = query.filter(Shift.start_time <= date_to)
    if min_pay is not None:
        query = query.filter(Shift.pay_rate >= min_pay)
    if max_pay is not None:
        query = query.filter(Shift.pay_rate <= max_pay)
    if urgent_only:
        query = query.filter(Shift.is_urgent.is_(True))

    # Filtered in SQL, not in Python — otherwise pagination would count rows
    # that the caller never sees.
    if shift_type == "Night":
        query = query.filter(Shift.is_night.is_(True))
    elif shift_type == "Day":
        query = query.filter(Shift.is_night.is_(False))
    elif shift_type == "Weekend":
        query = query.filter(Shift.is_weekend.is_(True))
    elif shift_type == "Urgent":
        query = query.filter(Shift.is_urgent.is_(True))

    return query


@router.get("", response_model=ShiftListResponse)
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    role: Optional[UserRole] = Query(None, description="Defaults to the caller's own role"),
    search: Optional[str] = None,
    location: Optional[str] = None,
    specialty: Optional[str] = None,
    # Query params are not touched by the schema alias generator, so every
    # multi-word one carries an explicit camelCase alias — the whole API speaks
    # one casing to the TypeScript clients.
    date_from: Optional[datetime] = Query(None, alias="dateFrom"),
    date_to: Optional[datetime] = Query(None, alias="dateTo"),
    shift_type: Optional[str] = Query(None, alias="shiftType", pattern="^(Day|Night|Weekend|Urgent)$"),
    min_pay: Optional[float] = Query(None, alias="minPay", ge=0),
    max_pay: Optional[float] = Query(None, alias="maxPay", ge=0),
    urgent_only: bool = Query(False, alias="urgentOnly"),
    include_applied: bool = Query(
        True, alias="includeApplied", description="Set false to hide shifts already applied to"
    ),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """The Available Shifts screen, including its search box and filter chips."""
    query = _apply_filters(
        _base_query(db),
        role=role or current_user.role,
        search=search,
        location=location,
        specialty=specialty,
        date_from=date_from,
        date_to=date_to,
        shift_type=shift_type,
        min_pay=min_pay,
        max_pay=max_pay,
        urgent_only=urgent_only,
    )

    # Show open shifts until they end (not just until they start). Shifts that
    # have already begun are still visible so staff can see them — the Apply
    # button is disabled client-side (and blocked server-side) once started.
    query = query.filter(
        Shift.status == ShiftStatus.open,
        Shift.is_visible.is_(True),
        Shift.end_time > _now_ist(),
        Shift.slots_filled < Shift.slots,
    )

    if not include_applied:
        applied = db.query(Application.shift_id).filter(
            Application.staff_id == current_user.id,
            Application.status != ApplicationStatus.cancelled,
        )
        query = query.filter(~Shift.id.in_(applied))

    total = query.order_by(None).count()
    shifts = query.order_by(Shift.is_urgent.desc(), Shift.start_time.asc()).offset(offset).limit(limit).all()

    return ShiftListResponse(
        items=serializers.shift_items(db, current_user, shifts),
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(shifts) < total,
    )


@router.get("/recommended", response_model=ShiftListResponse)
def recommended_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    limit: int = Query(10, ge=1, le=50),
):
    """'Recommended for You' — matched on the staff member's own role,
    specialty, pay floor, preferred locations and shift preferences."""
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == current_user.id).first()
    prefs = db.query(ShiftPreference).filter(ShiftPreference.user_id == current_user.id).first()

    query = _base_query(db).join(Facility, Shift.facility_id == Facility.id).filter(
        Shift.role == current_user.role,
        Shift.status == ShiftStatus.open,
        Shift.is_visible.is_(True),
        Shift.end_time > _now_ist(),
        Shift.slots_filled < Shift.slots,
    )

    if profile:
        if profile.min_pay_rate:
            query = query.filter(Shift.pay_rate >= profile.min_pay_rate)
        if profile.preferred_locations:
            cities = [c.strip() for c in profile.preferred_locations.split(",") if c.strip()]
            if cities:
                query = query.filter(
                    or_(*[Facility.city.ilike(f"%{c}%") for c in cities])
                )

    if prefs and not prefs.night_shifts:
        query = query.filter(Shift.is_night.is_(False))
    if prefs and not prefs.weekend_shifts:
        query = query.filter(Shift.is_weekend.is_(False))

    # Already-applied shifts are not recommendations.
    applied = db.query(Application.shift_id).filter(
        Application.staff_id == current_user.id,
        Application.status != ApplicationStatus.cancelled,
    )
    query = query.filter(~Shift.id.in_(applied))

    # Specialty is a ranking signal, not a filter: an exact-match filter makes
    # "Recommended for You" empty whenever the profile and the posting word the
    # same specialty differently.
    if profile and profile.specialty:
        specialty_match = case((Shift.specialty == profile.specialty, 0), else_=1)
        query = query.order_by(specialty_match, Shift.start_time.asc())
    else:
        query = query.order_by(Shift.start_time.asc())

    shifts = query.limit(limit).all()
    return ShiftListResponse(
        items=serializers.shift_items(db, current_user, shifts),
        total=len(shifts),
        limit=limit,
        offset=0,
        has_more=False,
    )


@router.get("/filters", response_model=ShiftFilterOptions)
def filter_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    role: Optional[UserRole] = None,
):
    """Values for the filter chips, derived from shifts that actually exist."""
    target_role = role or current_user.role

    cities = (
        db.query(Facility.city)
        .join(Shift, Shift.facility_id == Facility.id)
        .filter(Shift.role == target_role, Shift.status == ShiftStatus.open)
        .distinct()
        .all()
    )
    specialties = (
        db.query(Shift.specialty)
        .filter(Shift.role == target_role, Shift.status == ShiftStatus.open)
        .distinct()
        .all()
    )

    return ShiftFilterOptions(
        locations=sorted(row[0] for row in cities if row[0]),
        specialties=sorted(row[0] for row in specialties if row[0]),
        shift_types=SHIFT_TYPES,
        pay_ranges=PAY_RANGES,
    )


@router.get("/favorites", response_model=ShiftListResponse)
def list_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    query = (
        _base_query(db)
        .join(ShiftFavorite, ShiftFavorite.shift_id == Shift.id)
        .filter(ShiftFavorite.user_id == current_user.id)
    )
    total = query.count()
    shifts = query.order_by(ShiftFavorite.created_at.desc()).offset(offset).limit(limit).all()

    return ShiftListResponse(
        items=serializers.shift_items(db, current_user, shifts),
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(shifts) < total,
    )


@router.get("/{shift_id}", response_model=ShiftDetail)
def get_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Shift Details screen."""
    shift = _base_query(db).filter(Shift.id == shift_id).first()
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    statuses, favorites = serializers.user_context(db, current_user, [shift])
    return serializers.shift_detail(
        shift,
        application_status=statuses.get(shift.id),
        is_favorite=shift.id in favorites,
    )


@router.post("/{shift_id}/apply", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def apply_to_shift(
    shift_id: int,
    payload: ApplyRequest = ApplyRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """The Apply button on every shift card and on Shift Details."""
    shift = _base_query(db).filter(Shift.id == shift_id).with_for_update().first()
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your account before applying for shifts",
        )
    if shift.role != current_user.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This shift is for a different staff role",
        )
    if not shift.has_open_slots:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This shift is no longer open")
    if shift.start_time <= _now_ist():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This shift has already started")

    existing = (
        db.query(Application)
        .filter(Application.shift_id == shift_id, Application.staff_id == current_user.id)
        .first()
    )
    if existing and existing.status != ApplicationStatus.cancelled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="You have already applied for this shift"
        )

    if existing:
        # Re-applying after a cancellation reuses the row the unique constraint
        # already reserved for this (shift, staff) pair.
        existing.status = ApplicationStatus.pending
        existing.note = payload.note
        existing.applied_at = now_ist()
        existing.cancelled_at = None
        existing.cancellation_reason = None
        application = existing
    else:
        application = Application(shift_id=shift_id, staff_id=current_user.id, note=payload.note)
        db.add(application)
        db.flush()  # populate application.id before using it in notifications/activity log

    # Notify the applying staff member
    notify(
        db,
        user_id=current_user.id,
        category=NotificationCategory.application,
        title="Application submitted",
        body=f"{shift.facility.name} · {shift.specialty}",
        entity_type="shift",
        entity_id=shift.id,
        commit=False,
    )
    # Notify all admins of the facility that a new application arrived
    admin_ids = [
        m.user_id
        for m in db.query(FacilityMember)
        .filter(FacilityMember.facility_id == shift.facility_id)
        .all()
    ]
    for admin_id in admin_ids:
        notify(
            db,
            user_id=admin_id,
            category=NotificationCategory.application,
            title="New application",
            body=f"{current_user.full_name} applied for {shift.specialty} · {shift.facility.name}",
            entity_type="application",
            entity_id=application.id,
            commit=False,
        )
    log_activity(
        db,
        actor=current_user,
        action=ActivityActionType.shift_applied,
        description=f"Applied to shift at {shift.facility.name} · {shift.specialty}",
        entity_type="application",
        entity_id=application.id,
        facility_id=shift.facility_id,
    )
    db.commit()
    db.refresh(application)

    return ApplicationOut(
        id=application.id,
        status=application.status,
        applied_at=application.applied_at,
        responded_at=application.responded_at,
        cancelled_at=application.cancelled_at,
        cancellation_reason=application.cancellation_reason,
        can_cancel=serializers.can_cancel_application(application),
        shift=serializers.shift_item(shift, {shift.id: application.status.value}, set()),
    )


@router.post("/{shift_id}/favorite", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def add_favorite(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """The heart button on Shift Details."""
    if db.query(Shift).filter(Shift.id == shift_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    exists = (
        db.query(ShiftFavorite)
        .filter(ShiftFavorite.user_id == current_user.id, ShiftFavorite.shift_id == shift_id)
        .first()
    )
    if exists is None:
        db.add(ShiftFavorite(user_id=current_user.id, shift_id=shift_id))
        db.commit()
    return MessageResponse(message="Added to favorites")


@router.delete("/{shift_id}/favorite", response_model=MessageResponse)
def remove_favorite(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    db.query(ShiftFavorite).filter(
        ShiftFavorite.user_id == current_user.id, ShiftFavorite.shift_id == shift_id
    ).delete()
    db.commit()
    return MessageResponse(message="Removed from favorites")
