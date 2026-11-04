"""Super Admin reports — GET /superadmin/reports."""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.clock import now_ist, today_ist
from app.api.v1.endpoints.superadmin.deps import require_super_admin
from app.core.deps import get_db
from app.models.application import Application
from app.models.document import Document
from app.models.enums import ApplicationStatus, DocumentStatus, ShiftStatus, UserRole
from app.models.facility import Facility
from app.models.shift import Shift
from app.models.user import User
from app.schemas.base import CamelModel

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TopFacilityRow(CamelModel):
    name: str
    shift_count: int
    fill_rate: float


class StaffGrowthRow(CamelModel):
    role: str
    count: int


class SuperAdminReportsResponse(CamelModel):
    platform_fill_rate: float
    total_shift_hours: float
    new_users_this_month: int
    expiring_documents: int
    top_facilities: List[TopFacilityRow]
    staff_growth_by_role: List[StaffGrowthRow]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("", response_model=SuperAdminReportsResponse)
def reports(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    # Platform fill rate: completed / non-cancelled applications * 100
    non_cancelled = (
        db.query(func.count(Application.id))
        .filter(Application.status != ApplicationStatus.cancelled)
        .scalar()
        or 0
    )
    completed_apps = (
        db.query(func.count(Application.id))
        .filter(Application.status == ApplicationStatus.completed)
        .scalar()
        or 0
    )
    platform_fill_rate = round(completed_apps / non_cancelled * 100, 1) if non_cancelled else 0.0

    # Total shift hours for completed shifts (computed property — must load rows)
    completed_shifts = (
        db.query(Shift.start_time, Shift.end_time)
        .filter(Shift.status == ShiftStatus.completed)
        .all()
    )
    total_shift_hours = round(
        sum(
            (end - start).total_seconds() / 3600
            for start, end in completed_shifts
            if start and end
        ),
        1,
    )

    # New users this calendar month
    now = now_ist()
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    new_users_this_month = (
        db.query(func.count(User.id))
        .filter(User.created_at >= month_start)
        .scalar()
        or 0
    )

    # Expiring documents: verified, expiry within next 30 days
    today = today_ist()
    cutoff = today + timedelta(days=30)
    expiring_documents = (
        db.query(func.count(Document.id))
        .filter(
            Document.status == DocumentStatus.verified,
            Document.expiry_date.isnot(None),
            Document.expiry_date >= today,
            Document.expiry_date <= cutoff,
        )
        .scalar()
        or 0
    )

    # Top 5 facilities by total shift count
    top_rows = (
        db.query(
            Facility.name,
            func.count(Shift.id).label("shift_count"),
        )
        .join(Shift, Shift.facility_id == Facility.id)
        .group_by(Facility.id, Facility.name)
        .order_by(func.count(Shift.id).desc())
        .limit(5)
        .all()
    )

    # Fill rate per top facility
    top_facilities: List[TopFacilityRow] = []
    for fac_name, shift_count in top_rows:
        # Count completed applications for this facility's shifts
        fac_completed = (
            db.query(func.count(Application.id))
            .join(Shift, Application.shift_id == Shift.id)
            .join(Facility, Shift.facility_id == Facility.id)
            .filter(
                Facility.name == fac_name,
                Application.status == ApplicationStatus.completed,
            )
            .scalar()
            or 0
        )
        fac_non_cancelled = (
            db.query(func.count(Application.id))
            .join(Shift, Application.shift_id == Shift.id)
            .join(Facility, Shift.facility_id == Facility.id)
            .filter(
                Facility.name == fac_name,
                Application.status != ApplicationStatus.cancelled,
            )
            .scalar()
            or 0
        )
        fill_rate = round(fac_completed / fac_non_cancelled * 100, 1) if fac_non_cancelled else 0.0
        top_facilities.append(
            TopFacilityRow(name=fac_name, shift_count=shift_count, fill_rate=fill_rate)
        )

    # Staff growth by role
    staff_roles = [UserRole.doctor, UserRole.nurse, UserRole.ot_tech, UserRole.housekeeping]
    role_counts_raw = (
        db.query(User.role, func.count(User.id).label("cnt"))
        .filter(User.role.in_(staff_roles))
        .group_by(User.role)
        .all()
    )
    role_count_map: dict[str, int] = {
        (r.value if hasattr(r, "value") else r): cnt for r, cnt in role_counts_raw
    }
    staff_growth_by_role: List[StaffGrowthRow] = [
        StaffGrowthRow(role=r.value, count=role_count_map.get(r.value, 0))
        for r in staff_roles
    ]

    return SuperAdminReportsResponse(
        platform_fill_rate=platform_fill_rate,
        total_shift_hours=total_shift_hours,
        new_users_this_month=new_users_this_month,
        expiring_documents=expiring_documents,
        top_facilities=top_facilities,
        staff_growth_by_role=staff_growth_by_role,
    )
