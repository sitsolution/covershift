from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.admin import AdminContext, require_admin
from app.models.application import Application
from app.models.enums import (
    ActivityActionType,
    AdminPermission,
    ApplicationStatus,
    NotificationCategory,
    ShiftStatus,
    UserRole,
)
from app.models.facility import Facility
from app.models.shift import Shift
from app.models.user import StaffProfile, User
from app.schemas.admin.shift import (
    AdminShiftDetail,
    AdminShiftListResponse,
    AdminShiftRow,
    ApplicantRow,
    AssignRequest,
    CancelShiftRequest,
    RejectApplicantRequest,
    ShiftCreate,
    ShiftFormOptions,
    ShiftUpdate,
    TimelineEntry,
)
from app.schemas.base import MessageResponse
from app.services.labels import role_label
from app.services.activity_log import log_activity
from app.services.notifications import notify

from .common import (
    as_aware,
    assigned_staff_for,
    csv_or_none,
    filter_shift_dates,
    now_ist,
    pending_counts_for,
    shift_display_status,
    shift_reference,
)

router = APIRouter()

SHIFT_TYPES = ["Regular", "Emergency", "Weekend", "Night"]
QUALIFICATIONS = ["MBBS", "MD/MS", "DNB"]
CERTIFICATIONS = ["BLS", "ACLS"]
DEFAULT_SPECIALTIES = [
    "Emergency Medicine", "General Medicine", "Pediatrics", "Anaesthesia",
]


def _combine(day, start, end, end_day=None) -> tuple[datetime, datetime]:
    """Build the shift window from the form's separate date and time controls.

    With no end date, an end time earlier than the start means the shift runs
    past midnight, so it belongs to the following day — an 8 PM–8 AM night
    shift, for instance.
    """
    start_dt = datetime.combine(day, start, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_day or day, end, tzinfo=timezone.utc)
    if end_day is None and end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


MAX_SHIFT_LENGTH = timedelta(hours=24)


def _assert_valid_window(start_dt: datetime, end_dt: datetime) -> None:
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shift end must be after its start",
        )
    if end_dt - start_dt > MAX_SHIFT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A shift cannot be longer than 24 hours",
        )


def _assert_starts_in_future(start_dt: datetime) -> None:
    """Shift times are entered in IST and stored naive, so compare against IST
    now — the UTC tag _combine adds is only a label, not a conversion."""
    if start_dt.replace(tzinfo=None) <= now_ist():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shift date and start time must be in the future",
        )


def _row(shift: Shift, pending: int, assigned: List[str]) -> AdminShiftRow:
    return AdminShiftRow(
        id=shift.id,
        reference=shift_reference(shift.id),
        title=shift.title if shift.title and shift.title != shift.specialty else None,
        start_time=shift.start_time,
        end_time=shift.end_time,
        location=shift.facility.location_label,
        specialty=shift.specialty,
        role=shift.role,
        status=shift.status,
        display_status=shift_display_status(shift, pending),
        assigned_staff=assigned,
        applicant_count=pending,
        pay_rate=float(shift.pay_rate),
        is_urgent=shift.is_urgent,
        is_night=shift.is_night,
        is_weekend=shift.is_weekend,
        shift_type=shift.shift_type,
        slots=shift.slots,
        slots_filled=shift.slots_filled,
    )


def _get_shift(admin: AdminContext, shift_id: int) -> Shift:
    shift = (
        admin.db.query(Shift)
        .options(joinedload(Shift.facility))
        .filter(Shift.id == shift_id)
        .first()
    )
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    admin.assert_facility(shift.facility_id)
    return shift


@router.get("", response_model=AdminShiftListResponse)
def list_shifts(
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(
        None, alias="status",
        pattern="^(draft|open|pending|filled|completed|cancelled)$",
    ),
    location: Optional[str] = None,
    specialty: Optional[str] = None,
    role: Optional[UserRole] = None,
    date_from: Optional[date] = Query(None, alias="dateFrom"),
    date_to: Optional[date] = Query(None, alias="dateTo"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None, alias="sortBy", pattern="^(date|status|specialty|location)$"),
    sort_order: Optional[str] = Query("desc", alias="sortOrder", pattern="^(asc|desc)$"),
):
    """Shift Management table, with its search box and three filter chips."""
    db = admin.db
    query = (
        db.query(Shift)
        .options(joinedload(Shift.facility))
        .join(Facility, Shift.facility_id == Facility.id)
    )
    query = admin.scope(query, Shift.facility_id)

    if search:
        term = f"%{search.strip().lstrip('#')}%"
        conditions = [
            Shift.specialty.ilike(term),
            Shift.title.ilike(term),
            Facility.name.ilike(term),
            Facility.city.ilike(term),
            Facility.area.ilike(term),
        ]
        # "SH-2291" in the search box should find shift 291.
        digits = "".join(c for c in search if c.isdigit())
        if digits:
            candidate = int(digits) - 2000
            if candidate > 0:
                conditions.append(Shift.id == candidate)
        query = query.filter(or_(*conditions))

    if location:
        term = f"%{location.strip()}%"
        query = query.filter(or_(Facility.city.ilike(term), Facility.area.ilike(term)))
    if specialty:
        query = query.filter(Shift.specialty == specialty)
    if role:
        query = query.filter(Shift.role == role)
    query = filter_shift_dates(query, date_from, date_to)

    # "filled"/"open"/"pending" are derived, so they filter on the underlying
    # columns rather than on Shift.status alone.
    if status_filter in ("draft", "completed", "cancelled"):
        query = query.filter(Shift.status == ShiftStatus(status_filter))
    elif status_filter == "filled":
        query = query.filter(
            Shift.status.in_([ShiftStatus.open, ShiftStatus.filled]),
            Shift.slots_filled >= Shift.slots,
        )
    elif status_filter in ("open", "pending"):
        pending_shift_ids = db.query(Application.shift_id).filter(
            Application.status == ApplicationStatus.pending
        )
        query = query.filter(
            Shift.status == ShiftStatus.open, Shift.slots_filled < Shift.slots
        )
        if status_filter == "pending":
            query = query.filter(Shift.id.in_(pending_shift_ids))
        else:
            query = query.filter(~Shift.id.in_(pending_shift_ids))

    total = query.order_by(None).count()
    desc = sort_order == "desc"
    if sort_by == "status":
        order_col = Shift.status.desc() if desc else Shift.status.asc()
    elif sort_by == "specialty":
        order_col = Shift.specialty.desc() if desc else Shift.specialty.asc()
    elif sort_by == "location":
        order_col = Facility.name.desc() if desc else Facility.name.asc()
    else:
        order_col = Shift.start_time.desc() if desc else Shift.start_time.asc()
    shifts = query.order_by(order_col).offset(offset).limit(limit).all()

    shift_ids = [s.id for s in shifts]
    pending = pending_counts_for(db, shift_ids)
    assigned = assigned_staff_for(db, shift_ids)

    return AdminShiftListResponse(
        items=[_row(s, pending.get(s.id, 0), assigned.get(s.id, [])) for s in shifts],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(shifts) < total,
    )


@router.get("/form-options", response_model=ShiftFormOptions)
def form_options(admin: AdminContext = Depends(require_admin(AdminPermission.shifts))):
    """Feeds the Create Shift dropdowns from real data instead of hardcoding."""
    db = admin.db
    facilities_query = db.query(Facility)
    if not admin.is_platform_admin:
        facilities_query = facilities_query.filter(Facility.id.in_(admin.facility_ids))

    db_specialties = [
        row[0] for row in admin.scope(db.query(Shift.specialty), Shift.facility_id).distinct().all()
        if row[0]
    ]
    specialties = sorted(set(db_specialties) | set(DEFAULT_SPECIALTIES))

    return ShiftFormOptions(
        facilities=[
            {"id": f.id, "name": f.name, "location": f.location_label}
            for f in facilities_query.order_by(Facility.name).all()
        ],
        specialties=specialties,
        qualifications=QUALIFICATIONS,
        certifications=CERTIFICATIONS,
        shift_types=SHIFT_TYPES,
    )


@router.post("", response_model=AdminShiftDetail, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """Create Shift form. `publish: false` saves a draft, which staff never see."""
    db = admin.db

    facility_id = payload.facility_id or admin.primary_facility_id
    if facility_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A facility must be specified",
        )
    admin.assert_facility(facility_id)
    if db.query(Facility).filter(Facility.id == facility_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Facility not found")

    start_dt, end_dt = _combine(
        payload.date, payload.start_time, payload.end_time, payload.end_date
    )
    _assert_starts_in_future(start_dt)
    _assert_valid_window(start_dt, end_dt)

    now = now_ist()
    shift = Shift(
        facility_id=facility_id,
        role=payload.role,
        specialty=payload.specialty,
        title=payload.title or payload.specialty,
        start_time=start_dt,
        end_time=end_dt,
        pay_rate=Decimal(str(payload.pay_rate)),
        overtime_rate=Decimal(str(payload.overtime_rate)) if payload.overtime_rate else None,
        slots=payload.slots,
        status=ShiftStatus.open if payload.publish else ShiftStatus.draft,
        is_urgent=payload.is_urgent,
        shift_type=payload.shift_type,
        requirements=payload.requirements,
        required_qualifications=csv_or_none(payload.required_qualifications),
        required_certifications=csv_or_none(payload.required_certifications),
        amenities=csv_or_none(payload.amenities),
        description=payload.description,
        is_visible=payload.is_visible,
        published_at=now if payload.publish else None,
        created_by_id=admin.user.id,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)

    log_activity(
        db,
        actor=admin.user,
        action=ActivityActionType.shift_created,
        description=f"Created shift {shift_reference(shift.id)} {shift.title or shift.specialty}",
        entity_type="shift",
        entity_id=shift.id,
        facility_id=facility_id,
    )
    db.commit()

    if payload.publish and payload.notify_staff:
        _notify_matching_staff(db, shift)

    return _detail(admin, shift)


def _notify_matching_staff(db: Session, shift: Shift) -> None:
    """'Send Notifications' on the Create Shift form.

    Targets verified staff of the shift's role. Written synchronously; a queue
    belongs here once the volume justifies one.
    """
    recipients = (
        db.query(User.id)
        .filter(User.role == shift.role, User.is_active.is_(True), User.is_verified.is_(True))
        .all()
    )
    for (user_id,) in recipients:
        notify(
            db,
            user_id=user_id,
            category=NotificationCategory.shift_alert,
            title="New shift matches your profile",
            body=f"{shift.facility.name} · {shift.specialty}",
            entity_type="shift",
            entity_id=shift.id,
            commit=False,
        )
    db.commit()


def _applicants(db: Session, shift: Shift) -> List[ApplicantRow]:
    rows = (
        db.query(Application, User, StaffProfile)
        .join(User, Application.staff_id == User.id)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .filter(Application.shift_id == shift.id)
        .order_by(Application.applied_at.asc())
        .all()
    )
    return [
        ApplicantRow(
            application_id=application.id,
            staff_id=user.id,
            name=user.full_name,
            initials=user.initials,
            specialty=profile.specialty if profile else None,
            rating=float(profile.rating) if profile and profile.rating else 0.0,
            reviews_count=profile.reviews_count if profile else 0,
            shifts_completed=profile.shifts_completed if profile else 0,
            is_verified=user.is_verified,
            applied_at=application.applied_at,
            responded_at=application.responded_at,
            status=application.status.value,
        )
        for application, user, profile in rows
    ]


def _timeline(db: Session, shift: Shift, applicants: List[ApplicantRow]) -> List[TimelineEntry]:
    """The Shift Timeline panel."""
    confirmed = [a for a in applicants if a.status in (ApplicationStatus.confirmed.value, ApplicationStatus.completed.value)]
    entries = [
        TimelineEntry(label="Created", at=shift.created_at, done=True),
        TimelineEntry(
            label="Published",
            at=shift.published_at,
            done=shift.published_at is not None,
        ),
        TimelineEntry(
            label=f"{len(applicants)} application(s) received",
            at=applicants[-1].applied_at if applicants else None,
            done=bool(applicants),
        ),
    ]
    if shift.status == ShiftStatus.cancelled:
        entries.append(TimelineEntry(label="Cancelled", at=shift.cancelled_at, done=True))
    elif confirmed:
        entries.append(TimelineEntry(label="Staff assigned", at=confirmed[0].responded_at, done=True))
        entries.append(
            TimelineEntry(
                label="Shift completed",
                at=shift.end_time if shift.status == ShiftStatus.completed else None,
                done=shift.status == ShiftStatus.completed,
            )
        )
    else:
        entries.append(TimelineEntry(label="Awaiting assignment", at=None, done=False))
    return entries


def _detail(admin: AdminContext, shift: Shift) -> AdminShiftDetail:
    db = admin.db
    applicants = _applicants(db, shift)
    pending = sum(1 for a in applicants if a.status == ApplicationStatus.pending.value)
    assigned = [a.name for a in applicants
                if a.status in (ApplicationStatus.confirmed.value, ApplicationStatus.completed.value)]

    base = _row(shift, pending, assigned)
    return AdminShiftDetail(
        **base.model_dump(by_alias=False),
        facility_id=shift.facility_id,
        facility_name=shift.facility.name,
        duration_hours=shift.duration_hours,
        overtime_rate=float(shift.overtime_rate) if shift.overtime_rate else None,
        requirements=shift.requirements,
        required_qualifications=shift.qualification_list,
        required_certifications=shift.certification_list,
        amenities=shift.amenity_list,
        description=shift.description,
        is_visible=shift.is_visible,
        tags=shift.tags,
        applicants=applicants,
        timeline=_timeline(db, shift, applicants),
        created_at=shift.created_at,
        published_at=shift.published_at,
    )


@router.get("/{shift_id}", response_model=AdminShiftDetail)
def get_shift(
    shift_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """Admin Shift Details: applicants, timeline, assignment."""
    return _detail(admin, _get_shift(admin, shift_id))


@router.patch("/{shift_id}", response_model=AdminShiftDetail)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    shift = _get_shift(admin, shift_id)
    if shift.status in (ShiftStatus.completed, ShiftStatus.cancelled):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {shift.status.value} shift cannot be edited",
        )

    data = payload.model_dump(exclude_unset=True)

    if {"date", "end_date", "start_time", "end_time"} & set(data):
        day = data.get("date") or shift.start_time.date()
        start = data.get("start_time") or shift.start_time.time()
        end = data.get("end_time") or shift.end_time.time()
        # Keep the existing end date unless the start date moved without one,
        # in which case let _combine work it out from the times.
        end_day = data.get("end_date")
        if end_day is None and "date" not in data:
            end_day = shift.end_time.date()
        start_dt, end_dt = _combine(day, start, end, end_day)
        _assert_starts_in_future(start_dt)
        _assert_valid_window(start_dt, end_dt)
        shift.start_time, shift.end_time = start_dt, end_dt

    if "slots" in data and data["slots"] < shift.slots_filled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{shift.slots_filled} slot(s) are already filled",
        )

    for field in ("title", "specialty", "is_urgent", "requirements",
                  "description", "is_visible", "slots"):
        if field in data:
            setattr(shift, field, data[field])
    for field in ("pay_rate", "overtime_rate"):
        if field in data and data[field] is not None:
            setattr(shift, field, Decimal(str(data[field])))
    for field, column in (("required_qualifications", "required_qualifications"),
                          ("required_certifications", "required_certifications"),
                          ("amenities", "amenities")):
        if field in data:
            setattr(shift, column, csv_or_none(data[field]))

    admin.db.commit()
    admin.db.refresh(shift)
    return _detail(admin, shift)


@router.post("/{shift_id}/publish", response_model=AdminShiftDetail)
def publish_shift(
    shift_id: int,
    notify_staff: bool = Query(True, alias="notifyStaff"),
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """Publish a draft created via 'Save as Draft'."""
    shift = _get_shift(admin, shift_id)
    if shift.status != ShiftStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only a draft can be published"
        )
    if shift.start_time <= now_ist():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This shift's start time has already passed",
        )

    shift.status = ShiftStatus.open
    shift.published_at = now_ist()
    admin.db.commit()
    admin.db.refresh(shift)

    if notify_staff:
        _notify_matching_staff(admin.db, shift)
    return _detail(admin, shift)


@router.post("/{shift_id}/duplicate", response_model=AdminShiftDetail,
             status_code=status.HTTP_201_CREATED)
def duplicate_shift(
    shift_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """The Duplicate button. The copy lands a week later, as a draft, so the
    admin can adjust it before publishing."""
    original = _get_shift(admin, shift_id)

    copy = Shift(
        facility_id=original.facility_id,
        role=original.role,
        specialty=original.specialty,
        title=original.title,
        start_time=as_aware(original.start_time) + timedelta(days=7),
        end_time=as_aware(original.end_time) + timedelta(days=7),
        pay_rate=original.pay_rate,
        overtime_rate=original.overtime_rate,
        slots=original.slots,
        status=ShiftStatus.draft,
        is_urgent=original.is_urgent,
        requirements=original.requirements,
        required_qualifications=original.required_qualifications,
        required_certifications=original.required_certifications,
        amenities=original.amenities,
        description=original.description,
        is_visible=original.is_visible,
        created_by_id=admin.user.id,
    )
    admin.db.add(copy)
    admin.db.commit()
    admin.db.refresh(copy)
    return _detail(admin, copy)


def confirm_application(admin: AdminContext, shift: Shift, application: Application) -> None:
    """Confirm a pending application onto its shift and tell the staff member.

    Shared by Shift Details' Assign and Booking Details' Accept, so both apply
    the same rules. Commits.
    """
    db = admin.db
    if application.status == ApplicationStatus.confirmed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This applicant is already assigned"
        )
    if application.status != ApplicationStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {application.status.value} application cannot be assigned",
        )
    if shift.slots_filled >= shift.slots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Every slot on this shift is filled"
        )
    if shift.start_time <= now_ist():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This shift has already started, so the booking can no longer be accepted",
        )

    application.status = ApplicationStatus.confirmed
    application.responded_at = now_ist()
    shift.slots_filled += 1
    if shift.slots_filled >= shift.slots:
        shift.status = ShiftStatus.filled

    staff = db.query(User).filter(User.id == application.staff_id).first()
    notify(
        db,
        user_id=application.staff_id,
        category=NotificationCategory.application,
        title="Application confirmed",
        body=f"{shift.facility.name} · {shift.specialty}",
        entity_type="shift",
        entity_id=shift.id,
        commit=False,
    )
    log_activity(
        db,
        actor=admin.user,
        action=ActivityActionType.booking_confirmed,
        description=f"Confirmed {staff.full_name if staff else 'staff'} for {shift_reference(shift.id)} {shift.specialty}",
        entity_type="application",
        entity_id=application.id,
        facility_id=shift.facility_id,
    )
    db.commit()


@router.post("/{shift_id}/assign", response_model=AdminShiftDetail)
def assign_applicant(
    shift_id: int,
    payload: AssignRequest,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """'Assign from Applicants' — confirms one applicant onto the shift.

    This is the transition the mobile app depends on: until an admin assigns
    someone, applications stay pending forever.
    """
    db = admin.db
    shift = _get_shift(admin, shift_id)

    application = (
        db.query(Application)
        .filter(Application.id == payload.application_id, Application.shift_id == shift_id)
        .first()
    )
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Applicant not found on this shift"
        )
    confirm_application(admin, shift, application)
    db.refresh(shift)
    return _detail(admin, shift)


@router.post("/{shift_id}/applicants/{application_id}/reject", response_model=AdminShiftDetail)
def reject_applicant(
    shift_id: int,
    application_id: int,
    payload: RejectApplicantRequest = RejectApplicantRequest(),
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    db = admin.db
    shift = _get_shift(admin, shift_id)

    application = (
        db.query(Application)
        .filter(Application.id == application_id, Application.shift_id == shift_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Applicant not found")
    if application.status != ApplicationStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {application.status.value} application cannot be rejected",
        )

    application.status = ApplicationStatus.rejected
    application.responded_at = now_ist()
    application.cancellation_reason = payload.reason

    notify(
        db,
        user_id=application.staff_id,
        category=NotificationCategory.application,
        title="Application not successful",
        body=f"{shift.facility.name} · {shift.specialty}",
        entity_type="shift",
        entity_id=shift.id,
        commit=False,
    )
    db.commit()
    db.refresh(shift)
    return _detail(admin, shift)


@router.post("/{shift_id}/cancel", response_model=AdminShiftDetail)
def cancel_shift(
    shift_id: int,
    payload: CancelShiftRequest = CancelShiftRequest(),
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """Cancel Shift. Everyone with a live application is notified, and their
    application is cancelled with them."""
    db = admin.db
    shift = _get_shift(admin, shift_id)

    if shift.status == ShiftStatus.cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This shift is already cancelled"
        )
    if shift.status == ShiftStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="A completed shift cannot be cancelled"
        )
    if shift.start_time <= now_ist():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This shift has already started and cannot be cancelled",
        )

    affected = (
        db.query(Application)
        .filter(
            Application.shift_id == shift_id,
            Application.status.in_([ApplicationStatus.pending, ApplicationStatus.confirmed]),
        )
        .all()
    )
    for application in affected:
        application.status = ApplicationStatus.cancelled
        application.cancelled_at = now_ist()
        application.cancellation_reason = payload.reason or "Shift cancelled by the facility"
        notify(
            db,
            user_id=application.staff_id,
            category=NotificationCategory.application,
            title="Shift cancelled by the facility",
            body=f"{shift.facility.name} · {shift.specialty}",
            entity_type="shift",
            entity_id=shift.id,
            commit=False,
        )

    shift.status = ShiftStatus.cancelled
    shift.cancelled_at = now_ist()
    shift.cancellation_reason = payload.reason
    shift.slots_filled = 0
    db.commit()
    db.refresh(shift)
    return _detail(admin, shift)


@router.post("/{shift_id}/complete", response_model=AdminShiftDetail)
def complete_shift(
    shift_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """Mark a shift done: completes its confirmed bookings and raises the
    staff payments the mobile Earnings screen reads."""
    from app.api.v1.endpoints.admin.bookings import complete_application

    db = admin.db
    shift = _get_shift(admin, shift_id)

    if shift.status == ShiftStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This shift is already completed"
        )
    if as_aware(shift.end_time) > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This shift has not finished yet"
        )
    confirmed = (
        db.query(Application)
        .filter(Application.shift_id == shift_id, Application.status == ApplicationStatus.confirmed)
        .all()
    )
    for application in confirmed:
        complete_application(db, application, shift)

    shift.status = ShiftStatus.completed
    db.commit()
    db.refresh(shift)
    return _detail(admin, shift)


@router.delete("/{shift_id}", response_model=MessageResponse)
def delete_draft(
    shift_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
):
    """Only a draft can be deleted outright — anything published is cancelled
    instead, so its history survives."""
    shift = _get_shift(admin, shift_id)
    if shift.status != ShiftStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a draft can be deleted. Cancel the shift instead.",
        )
    admin.db.delete(shift)
    admin.db.commit()
    return MessageResponse(message="Draft deleted")
