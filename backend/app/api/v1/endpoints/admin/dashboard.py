from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app.core.clock import today_ist
from app.core.admin import AdminContext, get_admin, require_admin
from app.models.application import Application
from app.models.document import Document
from app.models.enums import (
    STAFF_ROLES,
    AdminPermission,
    ApplicationStatus,
    DocumentStatus,
    ShiftStatus,
)
from app.models.notification import Notification
from app.models.shift import Shift
from app.models.staff_meta import StaffReview
from app.models.user import StaffProfile, User
from app.schemas.admin.dashboard import (
    AdminCalendarResponse,
    AdminDashboardResponse,
    CalendarDayCell,
    ChartBar,
    ExpiringDocumentRow,
    KpiCard,
    ReportsResponse,
    TopStaffRow,
    UrgentShiftRow,
)
from app.services.labels import DOCUMENT_TYPE_LABELS

from .common import IST, as_aware

router = APIRouter()

MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]
EXPIRY_WARNING_DAYS = 30


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    last_day = monthrange(year, month)[1]
    return (
        datetime(year, month, 1, tzinfo=timezone.utc),
        datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc),
    )


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _shift_counts(admin: AdminContext, start: datetime, end: datetime) -> tuple[int, int, int]:
    """(total, filled, unfilled) for shifts starting in the window."""
    query = admin.scope(
        admin.db.query(Shift).filter(
            Shift.start_time >= start,
            Shift.start_time <= end,
            Shift.status != ShiftStatus.draft,
        ),
        Shift.facility_id,
    )
    shifts = query.all()
    total = len(shifts)
    filled = sum(1 for s in shifts if s.slots_filled >= s.slots)
    unfilled = sum(
        1 for s in shifts
        if s.status not in (ShiftStatus.cancelled,) and s.slots_filled < s.slots
    )
    return total, filled, unfilled


def _delta(current: float, previous: float, unit: str = "") -> tuple[str, str]:
    """Text and tone for a KPI's comparison line."""
    if previous == 0:
        return ("No comparison for last month", "neutral")
    change = ((current - previous) / previous) * 100
    tone = "positive" if change >= 0 else "negative"
    return (f"{change:+.0f}%{unit} vs last month", tone)


def _weekly_bars(admin: AdminContext, start: datetime, end: datetime) -> List[ChartBar]:
    """Shift volume grouped into the month's weeks — the dashboard bar chart."""
    shifts = admin.scope(
        admin.db.query(Shift.start_time).filter(
            Shift.start_time >= start,
            Shift.start_time <= end,
            Shift.status != ShiftStatus.draft,
        ),
        Shift.facility_id,
    ).all()

    buckets = [0] * 5
    for (start_time,) in shifts:
        week_index = min((as_aware(start_time).day - 1) // 7, 4)
        buckets[week_index] += 1

    return [ChartBar(label=f"W{i + 1}", value=float(count)) for i, count in enumerate(buckets)]


@router.get("/dashboard", response_model=AdminDashboardResponse)
def dashboard(
    admin: AdminContext = Depends(get_admin),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    """The admin Dashboard: four KPI cards, the volume chart, urgent shifts."""
    db = admin.db
    now = datetime.now(IST)
    year = year or now.year
    month = month or now.month

    start, end = _month_bounds(year, month)
    prev_start, prev_end = _month_bounds(*_previous_month(year, month))

    total, filled, unfilled = _shift_counts(admin, start, end)
    prev_total, _, _ = _shift_counts(admin, prev_start, prev_end)

    urgent_unfilled = admin.scope(
        db.query(func.count(Shift.id)).filter(
            Shift.start_time >= start,
            Shift.start_time <= end,
            Shift.status == ShiftStatus.open,
            Shift.is_urgent.is_(True),
            Shift.slots_filled < Shift.slots,
        ),
        Shift.facility_id,
    ).scalar() or 0

    # "Active locum staff" = distinct staff with a live or completed booking
    # at this facility, which is the number an admin actually cares about.
    active_staff = admin.scope(
        db.query(func.count(func.distinct(Application.staff_id)))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.status.in_(
                [ApplicationStatus.confirmed, ApplicationStatus.completed]
            )
        ),
        Shift.facility_id,
    ).scalar() or 0

    new_staff = admin.scope(
        db.query(func.count(func.distinct(Application.staff_id)))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.applied_at >= start,
            Application.status.in_(
                [ApplicationStatus.confirmed, ApplicationStatus.completed]
            ),
        ),
        Shift.facility_id,
    ).scalar() or 0

    fill_rate = (filled / total * 100) if total else 0
    volume_delta, volume_tone = _delta(total, prev_total)

    urgent_rows = admin.scope(
        db.query(Shift)
        .options(joinedload(Shift.facility))
        .filter(
            Shift.status == ShiftStatus.open,
            Shift.start_time > now,
            Shift.slots_filled < Shift.slots,
        ),
        Shift.facility_id,
    ).order_by(Shift.is_urgent.desc(), Shift.start_time.asc()).limit(5).all()

    pending_shift_ids = {
        shift_id for (shift_id,) in db.query(Application.shift_id).filter(
            Application.shift_id.in_([s.id for s in urgent_rows]),
            Application.status == ApplicationStatus.pending,
        )
    }

    unread = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == admin.user.id, Notification.is_read.is_(False))
        .scalar()
    ) or 0

    facility = admin.primary_facility()
    return AdminDashboardResponse(
        facility_name=facility.name if facility else "All facilities",
        period_label=f"{MONTH_NAMES[month - 1]} {year}",
        kpis=[
            KpiCard(label="Total Shifts This Month", value=str(total),
                    delta=volume_delta, delta_tone=volume_tone),
            KpiCard(label="Filled Shifts", value=str(filled),
                    delta=f"{fill_rate:.1f}% fill rate",
                    delta_tone="positive" if fill_rate >= 75 else "warning"),
            KpiCard(label="Unfilled Shifts", value=str(unfilled),
                    delta=f"{urgent_unfilled} urgent",
                    delta_tone="negative" if urgent_unfilled else "neutral"),
            KpiCard(label="Active Locum Staff", value=str(active_staff),
                    delta=f"+{new_staff} this month",
                    delta_tone="positive" if new_staff else "neutral"),
        ],
        shift_volume_by_week=_weekly_bars(admin, start, end),
        urgent_shifts=[
            UrgentShiftRow(
                id=s.id,
                title=s.title or s.specialty,
                location=s.facility.location_label,
                start_time=s.start_time,
                specialty=s.specialty,
                status="pending" if s.id in pending_shift_ids else "unfilled",
                hours_until_start=round(
                    (as_aware(s.start_time) - now).total_seconds() / 3600, 1
                ),
            )
            for s in urgent_rows
        ],
        unread_notifications=unread,
    )


@router.get("/reports", response_model=ReportsResponse)
def reports(
    admin: AdminContext = Depends(require_admin(AdminPermission.reports)),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    """The Reports screen: fill rate, time to fill, spend, and compliance."""
    db = admin.db
    now = datetime.now(IST)
    year = year or now.year
    month = month or now.month

    start, end = _month_bounds(year, month)
    prev_start, prev_end = _month_bounds(*_previous_month(year, month))

    total, filled, _ = _shift_counts(admin, start, end)
    prev_total, prev_filled, _ = _shift_counts(admin, prev_start, prev_end)

    fill_rate = (filled / total * 100) if total else 0
    prev_fill_rate = (prev_filled / prev_total * 100) if prev_total else 0

    # Time to fill: publication → the confirming decision, averaged.
    confirmed = admin.scope(
        db.query(Shift.published_at, Shift.created_at, Application.responded_at)
        .join(Application, Application.shift_id == Shift.id)
        .filter(
            Application.status.in_([ApplicationStatus.confirmed, ApplicationStatus.completed]),
            Application.responded_at.isnot(None),
            Shift.start_time >= start,
            Shift.start_time <= end,
        ),
        Shift.facility_id,
    ).all()

    # Clamped at zero: a shift can be filled in the same instant it is
    # published (or a hair before, given clock skew between the two writes),
    # and a negative "time to fill" is meaningless on the KPI card.
    durations = [
        max(0.0, (as_aware(responded) - as_aware(published or created)).total_seconds() / 3600)
        for published, created, responded in confirmed
        if responded and (published or created)
    ]
    avg_fill_hours = sum(durations) / len(durations) if durations else 0

    spend = admin.scope(
        db.query(func.coalesce(func.sum(Shift.pay_rate), 0))
        .join(Application, Application.shift_id == Shift.id)
        .filter(
            Application.status == ApplicationStatus.completed,
            Shift.start_time >= start,
            Shift.start_time <= end,
        ),
        Shift.facility_id,
    ).scalar() or 0

    expiring = _expiring_documents(admin)

    top_rows = admin.scope(
        db.query(
            User.id, User.full_name,
            func.count(Application.id).label("shifts"),
        )
        .join(Application, Application.staff_id == User.id)
        .join(Shift, Application.shift_id == Shift.id)
        .filter(Application.status == ApplicationStatus.completed),
        Shift.facility_id,
    ).group_by(User.id, User.full_name).order_by(func.count(Application.id).desc()).limit(5).all()

    ratings = {
        profile.user_id: float(profile.rating or 0)
        for profile in db.query(StaffProfile).filter(
            StaffProfile.user_id.in_([r[0] for r in top_rows])
        )
    }

    fill_delta = fill_rate - prev_fill_rate
    return ReportsResponse(
        period_label=f"{MONTH_NAMES[month - 1]} {year}",
        kpis=[
            KpiCard(label="Fill Rate", value=f"{fill_rate:.1f}%",
                    delta=f"{fill_delta:+.1f} pts vs last month",
                    delta_tone="positive" if fill_delta >= 0 else "negative"),
            KpiCard(label="Avg Time to Fill",
                    value=f"{avg_fill_hours:.0f} hrs" if durations else "—",
                    delta=f"across {len(durations)} filled shift(s)", delta_tone="neutral"),
            KpiCard(label="Locum Spend", value=f"₹{float(spend):,.0f}",
                    delta="This month", delta_tone="neutral"),
            KpiCard(label="Expiring Documents", value=str(len(expiring)),
                    delta=f"Within {EXPIRY_WARNING_DAYS} days",
                    delta_tone="warning" if expiring else "neutral"),
        ],
        shifts_by_week=_weekly_bars(admin, start, end),
        top_staff=[
            TopStaffRow(
                staff_id=staff_id, name=name, shifts_completed=shifts,
                rating=ratings.get(staff_id, 0.0),
            )
            for staff_id, name, shifts in top_rows
        ],
        expiring_documents=expiring,
    )


def _expiring_documents(admin: AdminContext) -> List[ExpiringDocumentRow]:
    """Compliance panel: documents already expired or expiring soon, for staff
    connected to this admin's facilities."""
    db = admin.db
    today = today_ist()
    cutoff = today + timedelta(days=EXPIRY_WARNING_DAYS)

    connected_staff = admin.scope(
        db.query(Application.staff_id).join(Shift, Application.shift_id == Shift.id),
        Shift.facility_id,
    ).distinct()

    documents = (
        db.query(Document, User)
        .join(User, Document.user_id == User.id)
        .filter(
            Document.user_id.in_(connected_staff),
            Document.expiry_date.isnot(None),
            Document.expiry_date <= cutoff,
        )
        .order_by(Document.expiry_date.asc())
        .all()
    )

    rows = []
    for document, user in documents:
        days_left = (document.expiry_date - today).days
        rows.append(
            ExpiringDocumentRow(
                document_id=document.id,
                staff_id=user.id,
                staff_name=user.full_name,
                document_type=DOCUMENT_TYPE_LABELS.get(document.doc_type, document.doc_type.value),
                expires_on=document.expiry_date,
                status="Expired" if days_left < 0 else "Expiring soon",
                days_until_expiry=days_left,
            )
        )
    return rows


@router.get("/calendar", response_model=AdminCalendarResponse)
def calendar(
    admin: AdminContext = Depends(require_admin(AdminPermission.shifts)),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """The admin Calendar View. One dot per day, coloured by the worst state
    among that day's shifts — an unfilled shift matters more than a filled one."""
    start, end = _month_bounds(year, month)

    shifts = admin.scope(
        admin.db.query(Shift).filter(
            Shift.start_time >= start,
            Shift.start_time <= end,
            Shift.status != ShiftStatus.draft,
        ),
        Shift.facility_id,
    ).all()

    pending_ids = {
        shift_id for (shift_id,) in admin.db.query(Application.shift_id).filter(
            Application.shift_id.in_([s.id for s in shifts]),
            Application.status == ApplicationStatus.pending,
        )
    }

    by_day: dict[date, dict] = {}
    for shift in shifts:
        day = as_aware(shift.start_time).date()
        cell = by_day.setdefault(day, {"total": 0, "filled": 0, "unfilled": 0, "markers": set()})
        cell["total"] += 1

        if shift.status == ShiftStatus.cancelled:
            cell["markers"].add("cancelled")
        elif shift.slots_filled >= shift.slots:
            cell["filled"] += 1
            cell["markers"].add("filled")
        elif shift.id in pending_ids:
            cell["unfilled"] += 1
            cell["markers"].add("pending")
        else:
            cell["unfilled"] += 1
            cell["markers"].add("unfilled")

    # Worst-first, matching the legend's order of urgency.
    priority = ["unfilled", "pending", "filled", "cancelled"]

    days = []
    for day in sorted(by_day):
        cell = by_day[day]
        marker = next((m for m in priority if m in cell["markers"]), "filled")
        days.append(
            CalendarDayCell(
                day=day, marker=marker, total=cell["total"],
                filled=cell["filled"], unfilled=cell["unfilled"],
            )
        )

    return AdminCalendarResponse(year=year, month=month, days=days)
