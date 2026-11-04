"""Super Admin dashboard — GET /superadmin/dashboard."""

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.clock import now_ist
from app.api.v1.endpoints.superadmin.deps import require_super_admin
from app.core.deps import get_db
from app.models.document import Document
from app.models.enums import DocumentStatus, ShiftStatus, UserRole
from app.models.facility import Facility, FacilityMember
from app.models.shift import Shift
from app.models.user import User
from app.schemas.base import CamelModel

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RoleCount(CamelModel):
    role: str
    count: int
    pct: float


class RecentFacilityItem(CamelModel):
    id: int
    name: str
    facility_type: str
    city: str
    admin_contact: str
    joined_label: str
    is_active: bool


class SuperAdminDashboardResponse(CamelModel):
    total_users: int
    total_facilities: int
    active_shifts: int
    pending_verifications: int
    new_users_this_month: int
    new_facilities_this_month: int
    users_by_role: List[RoleCount]
    recent_facilities: List[RecentFacilityItem]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=SuperAdminDashboardResponse)
def dashboard(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Platform-level overview for the super admin home screen."""
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_facilities = db.query(func.count(Facility.id)).scalar() or 0

    active_shifts = (
        db.query(func.count(Shift.id))
        .filter(Shift.status.in_([ShiftStatus.open, ShiftStatus.filled]))
        .scalar()
        or 0
    )

    pending_verifications = (
        db.query(func.count(Document.id))
        .filter(Document.status == DocumentStatus.pending)
        .scalar()
        or 0
    )

    # Month-to-date counts
    now = now_ist()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_users_this_month = (
        db.query(func.count(User.id))
        .filter(User.created_at >= month_start)
        .scalar()
        or 0
    )
    new_facilities_this_month = (
        db.query(func.count(Facility.id))
        .filter(Facility.created_at >= month_start)
        .scalar()
        or 0
    )

    # Users grouped by role
    role_rows = (
        db.query(User.role, func.count(User.id).label("cnt"))
        .group_by(User.role)
        .order_by(func.count(User.id).desc())
        .all()
    )
    users_by_role: List[RoleCount] = []
    for role, cnt in role_rows:
        pct = round(cnt / total_users * 100, 1) if total_users else 0.0
        users_by_role.append(RoleCount(role=role.value if hasattr(role, "value") else role, count=cnt, pct=pct))

    # Last 5 facilities
    recent_facilities_rows = (
        db.query(Facility)
        .order_by(Facility.created_at.desc())
        .limit(5)
        .all()
    )

    # Gather first member's user name per facility
    facility_ids = [f.id for f in recent_facilities_rows]
    first_members: dict[int, str] = {}
    if facility_ids:
        member_rows = (
            db.query(FacilityMember.facility_id, User.full_name)
            .join(User, FacilityMember.user_id == User.id)
            .filter(FacilityMember.facility_id.in_(facility_ids))
            .order_by(FacilityMember.facility_id, FacilityMember.id)
            .all()
        )
        for fid, fname in member_rows:
            first_members.setdefault(fid, fname)

    recent_facilities: List[RecentFacilityItem] = []
    for fac in recent_facilities_rows:
        joined_label = (
            fac.created_at.strftime("%b %Y")
            if fac.created_at
            else "—"
        )
        recent_facilities.append(
            RecentFacilityItem(
                id=fac.id,
                name=fac.name,
                facility_type=fac.facility_type.value if hasattr(fac.facility_type, "value") else fac.facility_type,
                city=fac.city,
                admin_contact=first_members.get(fac.id, "—"),
                joined_label=joined_label,
                is_active=True,
            )
        )

    return SuperAdminDashboardResponse(
        total_users=total_users,
        total_facilities=total_facilities,
        active_shifts=active_shifts,
        pending_verifications=pending_verifications,
        new_users_this_month=new_users_this_month,
        new_facilities_this_month=new_facilities_this_month,
        users_by_role=users_by_role,
        recent_facilities=recent_facilities,
    )
