"""Admin global search — GET /admin/search?q="""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_

from app.core.admin import AdminContext, get_admin
from app.models.application import Application
from app.models.enums import STAFF_ROLES, ApplicationStatus, ShiftStatus
from app.models.facility import Facility
from app.models.shift import Shift
from app.models.user import StaffProfile, User
from app.schemas.base import CamelModel

from .common import booking_reference, facility_staff_ids, shift_reference

router = APIRouter()

LIMIT = 5  # max results per group


# ── Response shapes ───────────────────────────────────────────────────────────

class StaffResult(CamelModel):
    id: int
    name: str
    email: str
    role: str
    specialty: Optional[str] = None
    url: str = ""


class ShiftResult(CamelModel):
    id: int
    reference: str
    title: str
    facility_name: str
    status: str
    url: str = ""


class BookingResult(CamelModel):
    id: int
    reference: str
    staff_name: str
    shift_title: str
    url: str = ""


class SearchResponse(CamelModel):
    query: str
    staff: List[StaffResult] = []
    shifts: List[ShiftResult] = []
    bookings: List[BookingResult] = []


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResponse, tags=["admin: search"])
def admin_search(
    q: str = Query(..., min_length=2, max_length=100),
    admin: AdminContext = Depends(get_admin),
):
    db = admin.db
    term = f"%{q.strip()}%"

    # ── Staff ─────────────────────────────────────────────────────────────────
    staff_q = (
        db.query(User, StaffProfile)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .filter(User.role.in_(STAFF_ROLES))
        .filter(
            or_(
                User.full_name.ilike(term),
                User.email.ilike(term),
                StaffProfile.specialty.ilike(term),
            )
        )
    )
    own_staff = facility_staff_ids(admin)
    if own_staff is not None:
        staff_q = staff_q.filter(User.id.in_(own_staff))
    staff_q = staff_q.limit(LIMIT).all()
    staff_results = [
        StaffResult(
            id=u.id,
            name=u.full_name,
            email=u.email,
            role=u.role.value,
            specialty=p.specialty if p else None,
            url=f"/staff/{u.id}",
        )
        for u, p in staff_q
    ]

    # ── Shifts ────────────────────────────────────────────────────────────────
    shift_q = (
        db.query(Shift, Facility)
        .join(Facility, Shift.facility_id == Facility.id)
        .filter(Shift.status != ShiftStatus.cancelled)
        .filter(
            or_(
                Shift.title.ilike(term),
                Shift.specialty.ilike(term),
                Facility.name.ilike(term),
            )
        )
    )
    shift_q = admin.scope(shift_q, Shift.facility_id)
    shift_rows = shift_q.limit(LIMIT).all()

    shift_results = [
        ShiftResult(
            id=s.id,
            reference=shift_reference(s.id),
            title=s.title or s.specialty,
            facility_name=f.name,
            status=s.status.value,
            url=f"/shifts",
        )
        for s, f in shift_rows
    ]

    # ── Bookings ──────────────────────────────────────────────────────────────
    # Match by booking reference "BK-XXXX" or staff name
    booking_q = (
        db.query(Application, User, Shift)
        .join(User, Application.staff_id == User.id)
        .join(Shift, Application.shift_id == Shift.id)
        .filter(Application.status != ApplicationStatus.cancelled)
        .filter(
            or_(
                User.full_name.ilike(term),
                Shift.title.ilike(term),
                Shift.specialty.ilike(term),
            )
        )
    )
    booking_q = admin.scope(booking_q, Shift.facility_id)
    booking_rows = booking_q.limit(LIMIT).all()

    booking_results = [
        BookingResult(
            id=app.id,
            reference=booking_reference(app.id),
            staff_name=u.full_name,
            shift_title=s.title or s.specialty,
            url=f"/bookings",
        )
        for app, u, s in booking_rows
    ]

    return SearchResponse(
        query=q,
        staff=staff_results,
        shifts=shift_results,
        bookings=booking_results,
    )
