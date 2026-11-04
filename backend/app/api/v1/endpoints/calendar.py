from calendar import monthrange
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.core.clock import now_ist
from app.core.database import get_db
from app.core.deps import get_current_staff
from app.models.application import Application
from app.models.availability import Availability
from app.models.enums import ApplicationStatus
from app.models.shift import Shift
from app.models.user import User
from app.schemas.calendar import CalendarDay, CalendarDayDetail, CalendarResponse
from app.services import serializers

router = APIRouter()

#: Application status → the legend marker the month grid draws.
MARKERS = {
    ApplicationStatus.confirmed: "confirmed",
    ApplicationStatus.pending: "pending",
}


@router.get("", response_model=CalendarResponse)
def get_calendar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Calendar screen: month dots plus the Upcoming Shifts list."""
    days_in_month = monthrange(year, month)[1]
    month_start = datetime(year, month, 1, tzinfo=timezone.utc)
    month_end = datetime(year, month, days_in_month, 23, 59, 59, tzinfo=timezone.utc)

    applications = (
        db.query(Application)
        .options(joinedload(Application.shift).joinedload(Shift.facility))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == current_user.id,
            Application.status.in_([ApplicationStatus.confirmed, ApplicationStatus.pending]),
            Shift.start_time >= month_start,
            Shift.start_time <= month_end,
        )
        .all()
    )

    # A day with both a confirmed and a pending shift shows as confirmed.
    booked: dict[date, tuple[str, int]] = {}
    for application in applications:
        day = application.shift.start_time.date()
        marker = MARKERS[application.status]
        current = booked.get(day)
        if current is None:
            booked[day] = (marker, 1)
        else:
            booked[day] = (
                "confirmed" if "confirmed" in (current[0], marker) else marker,
                current[1] + 1,
            )

    available_weekdays = {
        row.weekday
        for row in db.query(Availability).filter(
            Availability.user_id == current_user.id, Availability.is_available.is_(True)
        )
    }

    days = []
    for day_number in range(1, days_in_month + 1):
        day = date(year, month, day_number)
        if day in booked:
            marker, count = booked[day]
            days.append(CalendarDay(day=day, marker=marker, shift_count=count))
        elif day.weekday() in available_weekdays:
            days.append(CalendarDay(day=day, marker="available", shift_count=0))

    upcoming_applications = (
        db.query(Application)
        .options(joinedload(Application.shift).joinedload(Shift.facility))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == current_user.id,
            Application.status.in_([ApplicationStatus.confirmed, ApplicationStatus.pending]),
            Shift.start_time >= now_ist(),
        )
        .order_by(Shift.start_time.asc())
        .limit(10)
        .all()
    )

    return CalendarResponse(
        year=year,
        month=month,
        days=days,
        upcoming=[
            serializers.shift_item(a.shift, {a.shift_id: a.status.value}, set())
            for a in upcoming_applications
        ],
    )


@router.get("/{day}", response_model=CalendarDayDetail)
def get_day(
    day: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Tapping a date cell."""
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    end = datetime.combine(day, time.max, tzinfo=timezone.utc)

    applications = (
        db.query(Application)
        .options(joinedload(Application.shift).joinedload(Shift.facility))
        .join(Shift, Application.shift_id == Shift.id)
        .filter(
            Application.staff_id == current_user.id,
            Application.status.in_([ApplicationStatus.confirmed, ApplicationStatus.pending]),
            Shift.start_time >= start,
            Shift.start_time <= end,
        )
        .all()
    )

    availability = (
        db.query(Availability)
        .filter(Availability.user_id == current_user.id, Availability.weekday == day.weekday())
        .first()
    )

    return CalendarDayDetail(
        day=day,
        is_available=availability.is_available if availability else day.weekday() < 5,
        shifts=[
            serializers.shift_item(a.shift, {a.shift_id: a.status.value}, set())
            for a in applications
        ],
    )
