"""Helpers shared by the admin endpoints."""

from datetime import date, datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.enums import ApplicationStatus, ShiftStatus
from app.models.shift import Shift
from app.models.user import User


def shift_reference(shift_id: int) -> str:
    """Human-facing shift id, as the tables display it."""
    return f"SH-{shift_id + 2000:04d}"


def booking_reference(application_id: int) -> str:
    return f"BK-{application_id + 8800:04d}"


def as_aware(value: datetime) -> datetime:
    """MySQL hands back naive datetimes; treat them as IST (Asia/Kolkata, UTC+5:30)
    since all shift times are entered and stored in Indian Standard Time."""
    return value if value.tzinfo else value.replace(tzinfo=IST)


def now_ist() -> datetime:
    """Current time as a naive IST datetime — use this for DB-level comparisons
    against shift start_time / end_time which are stored as naive IST values."""
    return datetime.now(IST).replace(tzinfo=None)


def shift_display_status(shift: Shift, pending_count: int) -> str:
    """The Status column on Shift Management.

    The table shows five states but only four are stored: "Pending" is an open
    shift with applicants awaiting a decision, which is derived rather than
    persisted so a shift can never sit in a stale state.
    """
    if shift.status == ShiftStatus.cancelled:
        return "cancelled"
    if shift.status == ShiftStatus.completed:
        return "completed"
    if shift.status == ShiftStatus.draft:
        return "draft"
    if shift.slots_filled >= shift.slots:
        return "filled"
    if pending_count > 0:
        return "pending"
    return "open"


def booking_display_status(application: Application) -> str:
    """Bookings adds an "Upcoming" tab, which is a confirmed booking whose
    shift has not started yet."""
    if application.status == ApplicationStatus.confirmed:
        return "upcoming" if application.shift.start_time > now_ist() else "confirmed"
    return application.status.value


def pending_counts_for(db: Session, shift_ids: List[int]) -> dict[int, int]:
    """Pending applicants per shift, in one query."""
    if not shift_ids:
        return {}
    from sqlalchemy import func

    rows = (
        db.query(Application.shift_id, func.count(Application.id))
        .filter(
            Application.shift_id.in_(shift_ids),
            Application.status == ApplicationStatus.pending,
        )
        .group_by(Application.shift_id)
        .all()
    )
    return {shift_id: count for shift_id, count in rows}


def assigned_staff_for(db: Session, shift_ids: List[int]) -> dict[int, List[str]]:
    """Confirmed staff names per shift, in one query."""
    if not shift_ids:
        return {}
    rows = (
        db.query(Application.shift_id, User.full_name)
        .join(User, Application.staff_id == User.id)
        .filter(
            Application.shift_id.in_(shift_ids),
            Application.status.in_([ApplicationStatus.confirmed, ApplicationStatus.completed]),
        )
        .all()
    )
    result: dict[int, List[str]] = {}
    for shift_id, name in rows:
        result.setdefault(shift_id, []).append(name)
    return result


def csv_or_none(values: Optional[List[str]]) -> Optional[str]:
    if values is None:
        return None
    return ", ".join(v.strip() for v in values if v and v.strip()) or None


def filter_shift_dates(query, date_from: Optional[date], date_to: Optional[date]):
    """Limit a query joined to Shift to shifts starting within the date range.

    Both ends are whole days and inclusive: "to 15 Oct" keeps shifts starting
    any time on 15 Oct, not just at midnight.
    """
    if date_from:
        query = query.filter(Shift.start_time >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Shift.start_time < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    return query


def facility_staff_ids(admin):
    """Subquery of the staff ids that belong to this admin's facilities: the
    ones they added by hand plus anyone who has applied to one of their shifts.

    Returns None for a platform admin, who sees every staff member.
    """
    if admin.is_platform_admin:
        return None
    from app.models.facility import FacilityStaff

    added = admin.db.query(FacilityStaff.user_id.label("staff_id")).filter(
        FacilityStaff.facility_id.in_(admin.facility_ids)
    )
    applied = (
        admin.db.query(Application.staff_id.label("staff_id"))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(Shift.facility_id.in_(admin.facility_ids))
    )
    return added.union(applied)
