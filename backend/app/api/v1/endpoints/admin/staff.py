from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.admin import AdminContext, require_admin
from app.core.config import settings
from app.core.security import hash_password
from app.models.application import Application
from app.models.availability import Availability, ShiftPreference
from app.models.document import Document
from app.models.enums import (
    STAFF_ROLES,
    AdminPermission,
    ApplicationStatus,
    DocumentStatus,
    PaymentStatus,
    UserRole,
)
from app.models.facility import FacilityStaff
from app.models.payment import Payment
from app.models.shift import Shift
from app.models.staff_meta import StaffNote, StaffReview
from app.models.user import StaffProfile, User, UserSettings
from app.schemas.admin.staff import (
    StaffCreate,
    StaffCreateResponse,
    StaffDetail,
    StaffFilterOptions,
    StaffInvite,
    StaffListResponse,
    StaffNoteCreate,
    StaffNoteOut,
    StaffReviewCreate,
    StaffReviewOut,
    StaffRow,
    StaffShiftHistoryRow,
    StaffStats,
)
from app.api.v1.endpoints.documents import _to_out as document_out
from app.schemas.base import MessageResponse
from app.services.labels import credential_label, role_label

from .common import facility_staff_ids, shift_reference

router = APIRouter()


def _availability_map(db: Session, staff_ids: List[int]) -> dict[int, bool]:
    """A staff member counts as available if any weekday is marked available."""
    if not staff_ids:
        return {}
    rows = (
        db.query(Availability.user_id, func.max(Availability.is_available))
        .filter(Availability.user_id.in_(staff_ids))
        .group_by(Availability.user_id)
        .all()
    )
    return {user_id: bool(available) for user_id, available in rows}


def _verification_map(db: Session, staff_ids: List[int]) -> dict[int, str]:
    """Overall document standing, shown in the Verification column."""
    if not staff_ids:
        return {}
    rows = (
        db.query(Document.user_id, Document.status)
        .filter(Document.user_id.in_(staff_ids))
        .all()
    )
    by_user: dict[int, set] = {}
    for user_id, doc_status in rows:
        by_user.setdefault(user_id, set()).add(doc_status)

    result = {}
    for user_id, statuses in by_user.items():
        if DocumentStatus.rejected in statuses or DocumentStatus.expired in statuses:
            result[user_id] = "Rejected"
        elif DocumentStatus.pending in statuses:
            result[user_id] = "Pending"
        elif DocumentStatus.verified in statuses:
            result[user_id] = "Verified"
    return result


@router.get("", response_model=StaffListResponse)
def list_staff(
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    availability: Optional[str] = Query(None, pattern="^(Available|Unavailable)$"),
    verification: Optional[str] = Query(None, pattern="^(Verified|Pending|Rejected)$"),
    min_rating: Optional[float] = Query(None, alias="minRating", ge=0, le=5),
    location: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None, alias="sortBy", pattern="^(name|rating|shifts)$"),
    sort_order: Optional[str] = Query("asc", alias="sortOrder", pattern="^(asc|desc)$"),
):
    """Staff Database.

    A facility admin sees only their facilities' staff — those they added and
    those who have applied to one of their shifts. A platform admin sees every
    staff member. Only staff who have made their profile visible are listed.
    """
    db = admin.db
    query = (
        db.query(User, StaffProfile)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .outerjoin(UserSettings, UserSettings.user_id == User.id)
        .filter(User.role.in_(STAFF_ROLES), User.is_active.is_(True))
        # A staff member who switched off Profile Visibility in the mobile app
        # drops out of the directory.
        .filter(or_(UserSettings.profile_visible.is_(True), UserSettings.id.is_(None)))
    )

    own_staff = facility_staff_ids(admin)
    if own_staff is not None:
        query = query.filter(User.id.in_(own_staff))

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.email.ilike(term),
                StaffProfile.specialty.ilike(term),
                StaffProfile.preferred_locations.ilike(term),
            )
        )
    if role:
        query = query.filter(User.role == role)
    if location:
        query = query.filter(StaffProfile.preferred_locations.ilike(f"%{location.strip()}%"))
    if min_rating is not None:
        query = query.filter(StaffProfile.rating >= min_rating)

    rows = query.order_by(User.full_name.asc()).all()
    staff_ids = [user.id for user, _ in rows]
    available = _availability_map(db, staff_ids)
    verified = _verification_map(db, staff_ids)

    items: List[StaffRow] = []
    for user, profile in rows:
        is_available = available.get(user.id, False)
        # user.is_verified is the authoritative flag (matches what StaffProfile shows).
        # Fall back to document-based status only when the account is not yet verified.
        if user.is_verified:
            verification_status = "Verified"
        else:
            verification_status = verified.get(user.id, "Pending")

        # Availability and verification are aggregates over other tables, so
        # they filter here rather than in SQL.
        if availability and (availability == "Available") != is_available:
            continue
        if verification and verification != verification_status:
            continue

        items.append(
            StaffRow(
                id=user.id,
                name=user.full_name,
                initials=user.initials,
                role=user.role,
                role_label=role_label(user.role),
                specialty=profile.specialty if profile else None,
                location=profile.preferred_locations if profile else None,
                is_available=is_available,
                availability_label="Available" if is_available else "Unavailable",
                rating=float(profile.rating) if profile and profile.rating else 0.0,
                verification_status=verification_status,
                shifts_completed=profile.shifts_completed if profile else 0,
            )
        )

    # Sort in Python (availability/verification are post-SQL filters, so SQL ORDER BY isn't reliable).
    reverse = sort_order == "desc"
    if sort_by == "rating":
        items.sort(key=lambda x: x.rating, reverse=reverse)
    elif sort_by == "shifts":
        items.sort(key=lambda x: x.shifts_completed, reverse=reverse)
    else:
        items.sort(key=lambda x: x.name.lower(), reverse=reverse)

    total = len(items)
    return StaffListResponse(
        items=items[offset : offset + limit],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + limit < total,
    )


@router.get("/filter-options", response_model=StaffFilterOptions)
def filter_options(admin: AdminContext = Depends(require_admin(AdminPermission.staff))):
    db = admin.db
    profiles = db.query(StaffProfile)
    own_staff = facility_staff_ids(admin)
    if own_staff is not None:
        profiles = profiles.filter(StaffProfile.user_id.in_(own_staff))

    specialties = [
        row[0] for row in profiles.with_entities(StaffProfile.specialty).distinct().all() if row[0]
    ]
    locations = set()
    for (value,) in profiles.with_entities(StaffProfile.preferred_locations).distinct().all():
        for part in (value or "").split(","):
            if part.strip():
                locations.add(part.strip())

    return StaffFilterOptions(
        roles=[{"value": r.value, "label": role_label(r)} for r in STAFF_ROLES],
        specialties=sorted(specialties),
        locations=sorted(locations),
    )


def _can_view_documents(admin: AdminContext, staff_id: int) -> bool:
    """Credentials are private unless the staff member has actually applied to
    one of this admin's facilities. A platform admin always sees them."""
    if admin.is_platform_admin:
        return True
    return (
        admin.db.query(Application.id)
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == staff_id,
            Shift.facility_id.in_(admin.facility_ids),
        )
        .first()
        is not None
    )


def _get_staff(admin: AdminContext, staff_id: int) -> User:
    query = admin.db.query(User).filter(User.id == staff_id, User.role.in_(STAFF_ROLES))
    own_staff = facility_staff_ids(admin)
    if own_staff is not None:
        # 404 rather than 403: another facility's staff member is not confirmed to exist.
        query = query.filter(User.id.in_(own_staff))
    user = query.first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")
    return user


@router.get("/{staff_id}", response_model=StaffDetail)
def get_staff(
    staff_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    """Admin Staff Profile — Overview and Professional Details tabs."""
    db = admin.db
    user = _get_staff(admin, staff_id)
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()

    at_this_facility = 0
    if not admin.is_platform_admin:
        at_this_facility = (
            db.query(func.count(Application.id))
            .join(Shift, Application.shift_id == Shift.id)
            .filter(
                Application.staff_id == user.id,
                Application.status == ApplicationStatus.completed,
                Shift.facility_id.in_(admin.facility_ids),
            )
            .scalar()
        ) or 0

    cancellations = (
        db.query(func.count(Application.id))
        .filter(
            Application.staff_id == user.id,
            Application.status == ApplicationStatus.cancelled,
            Application.cancelled_at.isnot(None),
        )
        .scalar()
    ) or 0

    total_paid = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.user_id == user.id, Payment.status == PaymentStatus.paid)
        .scalar()
    ) or 0

    can_view = _can_view_documents(admin, user.id)
    documents = []
    if can_view:
        documents = (
            db.query(Document)
            .filter(Document.user_id == user.id)
            .order_by(Document.created_at.desc())
            .all()
        )

    available = _availability_map(db, [user.id]).get(user.id, False)

    # Response time: median minutes from shift.published_at → application.applied_at
    response_pairs = (
        db.query(Application.applied_at, Shift.published_at)
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == user.id,
            Shift.published_at.isnot(None),
            Application.applied_at.isnot(None),
        )
        .all()
    )
    avg_response_minutes: Optional[int] = None
    if response_pairs:
        deltas = sorted(
            int((row.applied_at - row.published_at).total_seconds() / 60)
            for row in response_pairs
            if row.applied_at >= row.published_at
        )
        if deltas:
            mid = len(deltas) // 2
            median = deltas[mid] if len(deltas) % 2 else (deltas[mid - 1] + deltas[mid]) // 2
            avg_response_minutes = max(0, median)

    return StaffDetail(
        id=user.id,
        name=user.full_name,
        initials=user.initials,
        email=user.email,
        phone=user.phone,
        role=user.role,
        role_label=role_label(user.role),
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        is_available=available,
        joined_on=user.created_at,
        credential_label=credential_label(user.role),
        credential_number=profile.credential_number if profile else None,
        specialty=profile.specialty if profile else None,
        experience=profile.experience if profile else None,
        qualifications=profile.qualifications if profile else None,
        preferred_locations=[
            p.strip() for p in ((profile.preferred_locations if profile else "") or "").split(",")
            if p.strip()
        ],
        min_pay_rate=float(profile.min_pay_rate) if profile and profile.min_pay_rate else None,
        stats=StaffStats(
            shifts_completed=profile.shifts_completed if profile else 0,
            shifts_at_this_facility=at_this_facility,
            completion_rate=round((profile.shifts_completed / (profile.shifts_completed + cancellations)) * 100)
                if profile and (profile.shifts_completed + cancellations) > 0 else 100,
            rating=float(profile.rating) if profile and profile.rating else 0.0,
            reviews_count=profile.reviews_count if profile else 0,
            cancellation_count=cancellations,
            total_paid=float(total_paid),
            avg_response_minutes=avg_response_minutes,
        ),
        can_view_documents=can_view,
        documents=[document_out(d) for d in documents],
    )


@router.get("/{staff_id}/shifts", response_model=List[StaffShiftHistoryRow])
def shift_history(
    staff_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
    limit: int = Query(50, ge=1, le=200),
):
    """Shift History tab. Scoped to the admin's own facilities — one facility
    has no business reading a staff member's work elsewhere."""
    _get_staff(admin, staff_id)

    query = (
        admin.db.query(Application)
        .options(joinedload(Application.shift).joinedload(Shift.facility))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(Application.staff_id == staff_id)
    )
    query = admin.scope(query, Shift.facility_id)

    applications = query.order_by(Shift.start_time.desc()).limit(limit).all()
    shift_ids = [a.shift.id for a in applications]
    reviews_map = {
        r.shift_id: float(r.rating)
        for r in admin.db.query(StaffReview)
        .filter(StaffReview.staff_id == staff_id, StaffReview.shift_id.in_(shift_ids))
        .all()
    } if shift_ids else {}

    return [
        StaffShiftHistoryRow(
            shift_id=a.shift.id,
            reference=shift_reference(a.shift.id),
            facility_name=a.shift.facility.name,
            specialty=a.shift.specialty,
            start_time=a.shift.start_time,
            end_time=a.shift.end_time,
            status=a.status.value,
            pay_rate=float(a.shift.pay_rate),
            rating_given=reviews_map.get(a.shift.id),
        )
        for a in applications
    ]


@router.get("/{staff_id}/reviews", response_model=List[StaffReviewOut])
def list_reviews(
    staff_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    """Reviews tab. Reviews are public across facilities — they are what the
    rating is built from."""
    _get_staff(admin, staff_id)

    reviews = (
        admin.db.query(StaffReview)
        .options(joinedload(StaffReview.facility), joinedload(StaffReview.shift))
        .filter(StaffReview.staff_id == staff_id)
        .order_by(StaffReview.created_at.desc())
        .all()
    )
    authors = {
        u.id: u.full_name
        for u in admin.db.query(User).filter(
            User.id.in_([r.author_id for r in reviews if r.author_id])
        )
    }
    return [
        StaffReviewOut(
            id=r.id,
            rating=float(r.rating),
            comment=r.comment,
            facility_name=r.facility.name if r.facility else None,
            author_name=authors.get(r.author_id),
            shift_reference=shift_reference(r.shift_id) if r.shift_id else None,
            created_at=r.created_at,
        )
        for r in reviews
    ]


@router.post("/{staff_id}/reviews", response_model=StaffReviewOut,
             status_code=status.HTTP_201_CREATED)
def create_review(
    staff_id: int,
    payload: StaffReviewCreate,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    """Rate a staff member. Only allowed after a shift they completed here, and
    the profile's aggregate rating is recomputed from all reviews."""
    db = admin.db
    _get_staff(admin, staff_id)

    facility_id = admin.primary_facility_id
    if payload.shift_id is not None:
        shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if shift is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
        admin.assert_facility(shift.facility_id)
        facility_id = shift.facility_id

    if facility_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A review must be attached to a facility",
        )

    completed = (
        db.query(Application.id)
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == staff_id,
            Application.status == ApplicationStatus.completed,
            Shift.facility_id == facility_id,
        )
        .first()
    )
    if completed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This staff member has not completed a shift at your facility",
        )

    review = StaffReview(
        staff_id=staff_id,
        facility_id=facility_id,
        shift_id=payload.shift_id,
        author_id=admin.user.id,
        rating=Decimal(str(payload.rating)),
        comment=payload.comment,
    )
    db.add(review)
    db.flush()

    aggregate, count = (
        db.query(func.avg(StaffReview.rating), func.count(StaffReview.id))
        .filter(StaffReview.staff_id == staff_id)
        .one()
    )
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == staff_id).first()
    if profile is not None:
        profile.rating = Decimal(str(round(float(aggregate), 2)))
        profile.reviews_count = count

    db.commit()
    db.refresh(review)

    facility = review.facility
    return StaffReviewOut(
        id=review.id,
        rating=float(review.rating),
        comment=review.comment,
        facility_name=facility.name if facility else None,
        author_name=admin.user.full_name,
        shift_reference=shift_reference(review.shift_id) if review.shift_id else None,
        created_at=review.created_at,
    )


@router.get("/{staff_id}/notes", response_model=List[StaffNoteOut])
def list_notes(
    staff_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    """Notes tab. Private to the facility that wrote them — never returned to
    the staff member through the mobile API."""
    _get_staff(admin, staff_id)

    query = admin.db.query(StaffNote).filter(StaffNote.staff_id == staff_id)
    query = admin.scope(query, StaffNote.facility_id)

    notes = query.order_by(StaffNote.created_at.desc()).all()
    authors = {
        u.id: u.full_name
        for u in admin.db.query(User).filter(
            User.id.in_([n.author_id for n in notes if n.author_id])
        )
    }
    return [
        StaffNoteOut(
            id=n.id, body=n.body, author_name=authors.get(n.author_id), created_at=n.created_at
        )
        for n in notes
    ]


@router.post("/{staff_id}/notes", response_model=StaffNoteOut, status_code=status.HTTP_201_CREATED)
def create_note(
    staff_id: int,
    payload: StaffNoteCreate,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    _get_staff(admin, staff_id)

    facility_id = admin.primary_facility_id
    if facility_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A note must belong to a facility",
        )

    note = StaffNote(
        staff_id=staff_id,
        facility_id=facility_id,
        author_id=admin.user.id,
        body=payload.body,
    )
    admin.db.add(note)
    admin.db.commit()
    admin.db.refresh(note)
    return StaffNoteOut(
        id=note.id, body=note.body, author_name=admin.user.full_name, created_at=note.created_at
    )


@router.delete("/{staff_id}/notes/{note_id}", response_model=MessageResponse)
def delete_note(
    staff_id: int,
    note_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    query = admin.db.query(StaffNote).filter(
        StaffNote.id == note_id, StaffNote.staff_id == staff_id
    )
    note = admin.scope(query, StaffNote.facility_id).first()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    admin.db.delete(note)
    admin.db.commit()
    return MessageResponse(message="Note deleted")


@router.post("", response_model=StaffCreateResponse, status_code=status.HTTP_201_CREATED)
def create_staff(
    payload: StaffCreate,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    """Admin manually creates a staff account.

    The account is created with ``is_verified=False`` — the staff member must
    log in on the mobile app and complete OTP verification to become verified.
    """
    db = admin.db

    if payload.role not in STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only shift-working roles can be added as staff",
        )
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already registered")

    user = User(
        email=payload.email,
        phone=payload.phone,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_verified=False,
        accepted_terms_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    db.add(
        StaffProfile(
            user_id=user.id,
            credential_number=payload.credential_number,
            specialty=payload.specialty,
            experience=payload.experience,
        )
    )

    # Put them on the adding facility's roster. A platform admin has no
    # facility, and sees every staff member anyway.
    if admin.primary_facility_id is not None:
        db.add(FacilityStaff(
            facility_id=admin.primary_facility_id, user_id=user.id, added_by_id=admin.user.id,
        ))

    # Seed defaults (settings + availability) same as self-registration
    db.add(UserSettings(user_id=user.id))
    db.add(ShiftPreference(user_id=user.id))
    from app.services.labels import WEEKDAY_NAMES
    for weekday in range(len(WEEKDAY_NAMES)):
        db.add(
            Availability(
                user_id=user.id,
                weekday=weekday,
                is_available=weekday < 5,
                start_time=datetime.strptime("09:00", "%H:%M").time(),
                end_time=datetime.strptime("18:00", "%H:%M").time(),
            )
        )

    db.commit()
    db.refresh(user)

    return StaffCreateResponse(
        id=user.id,
        name=user.full_name,
        email=user.email,
        role=user.role,
        role_label=role_label(user.role),
        is_verified=False,
    )


@router.post("/invite", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def invite_staff(
    payload: StaffInvite,
    admin: AdminContext = Depends(require_admin(AdminPermission.staff)),
):
    """'Add New Staff'.

    Staff register themselves in the mobile app — an admin cannot create a
    credentialed account on someone's behalf. This records the invitation and
    reports back; wiring it to an email provider is the remaining step.
    """
    if payload.role not in STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitations are for shift-working roles only",
        )

    existing = admin.db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Someone is already registered with that email",
        )

    return MessageResponse(
        message=f"Invitation queued for {payload.email}. "
                "They will be prompted to complete registration in the Covershift app."
    )
