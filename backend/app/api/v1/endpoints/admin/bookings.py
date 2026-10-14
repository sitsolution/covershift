import csv
import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.admin import AdminContext, require_admin
from app.models.application import Application
from app.models.enums import (
    ActivityActionType,
    AdminPermission,
    ApplicationStatus,
    NotificationCategory,
    PaymentStatus,
)
from app.models.payment import Payment
from app.models.shift import Shift
from app.models.staff_meta import BookingMessage
from app.models.user import StaffProfile, User
from app.schemas.admin.booking import (
    BookingCancelRequest,
    BookingDetail,
    BookingListResponse,
    BookingMessageCreate,
    BookingMessageOut,
    BookingRow,
)
from app.schemas.admin.shift import TimelineEntry
from app.services.activity_log import log_activity
from app.services.labels import role_label
from app.services.notifications import notify

from .common import as_aware, booking_display_status, booking_reference, now_ist, shift_reference

router = APIRouter()

#: The Bookings screen's tabs. "upcoming" is derived, not stored.
TABS = ("all", "pending", "confirmed", "upcoming", "completed", "cancelled")


def complete_application(db: Session, application: Application, shift: Shift) -> Payment:
    """Close out a confirmed booking and raise the staff member's payment.

    Called when a shift is completed. This is what makes money appear on the
    mobile Earnings screen, so it also bumps the profile's completed count.
    """
    application.status = ApplicationStatus.completed

    payment = Payment(
        user_id=application.staff_id,
        shift_id=shift.id,
        application_id=application.id,
        amount=Decimal(shift.pay_rate),
        status=PaymentStatus.pending,
        earned_at=shift.end_time,
    )
    db.add(payment)

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == application.staff_id).first()
    if profile is not None:
        profile.shifts_completed = (profile.shifts_completed or 0) + 1

    notify(
        db,
        user_id=application.staff_id,
        category=NotificationCategory.payment,
        title="Shift completed",
        body=f"₹{float(shift.pay_rate):,.0f} pending for {shift.facility.name}",
        entity_type="payment",
        entity_id=shift.id,
        commit=False,
    )
    return payment


def _base_query(admin: AdminContext):
    return (
        admin.scope(
            admin.db.query(Application)
            .join(Shift, Application.shift_id == Shift.id),
            Shift.facility_id,
        )
        .options(
            joinedload(Application.shift).joinedload(Shift.facility),
            joinedload(Application.staff),
        )
    )


def _row(application: Application) -> BookingRow:
    shift = application.shift
    staff = application.staff
    return BookingRow(
        id=application.id,
        reference=booking_reference(application.id),
        shift_id=shift.id,
        shift_label=f"{shift.title or shift.specialty}",
        shift_start=shift.start_time,
        shift_end=shift.end_time,
        staff_id=staff.id,
        staff_name=staff.full_name,
        staff_initials=staff.initials,
        staff_email=staff.email,
        booked_on=application.applied_at,
        status=application.status.value,
        display_status=booking_display_status(application),
    )


@router.get("", response_model=BookingListResponse)
def list_bookings(
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
    tab: str = Query("all", pattern="^(all|pending|confirmed|upcoming|completed|cancelled)$"),
    search: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None, alias="sortBy", pattern="^(booked_on|status|shift|staff)$"),
    sort_order: Optional[str] = Query("desc", alias="sortOrder", pattern="^(asc|desc)$"),
):
    """The Bookings table and its six tabs."""
    query = _base_query(admin)

    user_joined = False
    if search:
        term = f"%{search.strip()}%"
        query = query.join(User, Application.staff_id == User.id).filter(
            func.lower(User.full_name).like(term.lower())
        )
        user_joined = True

    # "upcoming" and "confirmed" share a stored status and split on the shift's
    # start time, so they are filtered in SQL rather than after pagination.
    now = datetime.now(timezone.utc)
    if tab == "upcoming":
        query = query.filter(
            Application.status == ApplicationStatus.confirmed, Shift.start_time > now
        )
    elif tab == "confirmed":
        query = query.filter(
            Application.status == ApplicationStatus.confirmed, Shift.start_time <= now
        )
    elif tab == "cancelled":
        query = query.filter(
            Application.status.in_([ApplicationStatus.cancelled, ApplicationStatus.rejected])
        )
    elif tab != "all":
        query = query.filter(Application.status == ApplicationStatus(tab))

    total = query.order_by(None).count()
    desc = sort_order == "desc"
    if sort_by == "status":
        order_col = Application.status.desc() if desc else Application.status.asc()
    elif sort_by == "shift":
        order_col = Shift.start_time.desc() if desc else Shift.start_time.asc()
    elif sort_by == "staff":
        if not user_joined:
            query = query.join(User, Application.staff_id == User.id)
        order_col = User.full_name.desc() if desc else User.full_name.asc()
    else:
        order_col = Application.applied_at.desc() if desc else Application.applied_at.asc()
    applications = query.order_by(order_col).offset(offset).limit(limit).all()

    counts = _tab_counts(admin)
    return BookingListResponse(
        items=[_row(a) for a in applications],
        total=total,
        counts=counts,
        limit=limit,
        offset=offset,
        has_more=offset + len(applications) < total,
    )


def _tab_counts(admin: AdminContext) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    rows = admin.scope(
        admin.db.query(Application.status, Shift.start_time)
        .join(Shift, Application.shift_id == Shift.id),
        Shift.facility_id,
    ).all()

    counts = {tab: 0 for tab in TABS}
    for status_value, start_time in rows:
        counts["all"] += 1
        if status_value == ApplicationStatus.confirmed:
            key = "upcoming" if as_aware(start_time) > now else "confirmed"
            counts[key] += 1
        elif status_value in (ApplicationStatus.cancelled, ApplicationStatus.rejected):
            counts["cancelled"] += 1
        elif status_value.value in counts:
            counts[status_value.value] += 1
    return counts


@router.get("/export")
def export_bookings(
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
    tab: str = Query("all", pattern="^(all|pending|confirmed|upcoming|completed|cancelled)$"),
):
    """'Export to CSV'. Streams so a large export never buffers fully in memory."""
    applications = _base_query(admin).order_by(Application.applied_at.desc()).all()
    now = datetime.now(timezone.utc)

    def _matches(application: Application) -> bool:
        display = booking_display_status(application)
        if tab == "all":
            return True
        if tab == "cancelled":
            return application.status in (ApplicationStatus.cancelled, ApplicationStatus.rejected)
        return display == tab

    def rows():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            ["Booking ID", "Shift ID", "Shift", "Facility", "Staff", "Role",
             "Shift Start", "Booked On", "Status", "Pay Rate"]
        )
        yield buffer.getvalue()

        for application in applications:
            if not _matches(application):
                continue
            buffer.seek(0)
            buffer.truncate(0)
            shift = application.shift
            writer.writerow([
                booking_reference(application.id),
                shift_reference(shift.id),
                shift.title or shift.specialty,
                shift.facility.name,
                application.staff.full_name,
                application.staff.role.value,
                shift.start_time.isoformat(),
                application.applied_at.isoformat(),
                booking_display_status(application),
                float(shift.pay_rate),
            ])
            yield buffer.getvalue()

    filename = f"bookings-{datetime.now(timezone.utc):%Y%m%d}.csv"
    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_booking(admin: AdminContext, booking_id: int) -> Application:
    application = _base_query(admin).filter(Application.id == booking_id).first()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return application


def _timeline(application: Application, payment: Payment | None = None) -> List[TimelineEntry]:
    """The Timeline panel on Booking Details."""
    shift = application.shift
    staff_role = role_label(application.staff.role) if application.staff else "Staff"
    completed = application.status == ApplicationStatus.completed
    cancelled = application.status in (ApplicationStatus.cancelled, ApplicationStatus.rejected)

    payment_done = payment is not None and payment.status in (PaymentStatus.paid, PaymentStatus.processing)
    payment_at = payment.paid_at if payment_done else None

    entries = [
        TimelineEntry(label="Shift created", at=shift.created_at, done=True),
        TimelineEntry(label=f"{staff_role} applied", at=application.applied_at, done=True),
        TimelineEntry(
            label="Booking confirmed",
            at=application.responded_at,
            done=application.status in (ApplicationStatus.confirmed, ApplicationStatus.completed),
        ),
        TimelineEntry(label="Shift completed", at=None, done=completed),
        TimelineEntry(label="Payment processed", at=payment_at, done=payment_done),
    ]
    if cancelled:
        entries.append(
            TimelineEntry(label="Booking cancelled", at=application.cancelled_at, done=True)
        )
    return entries


@router.get("/{booking_id}", response_model=BookingDetail)
def get_booking(
    booking_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
):
    """Booking Details: timeline, communication log, staff contact."""
    application = _get_booking(admin, booking_id)
    shift, staff = application.shift, application.staff
    profile = (
        admin.db.query(StaffProfile).filter(StaffProfile.user_id == staff.id).first()
    )
    messages = (
        admin.db.query(BookingMessage)
        .filter(BookingMessage.application_id == application.id)
        .order_by(BookingMessage.created_at.asc())
        .all()
    )

    payment = (
        admin.db.query(Payment)
        .filter(Payment.application_id == application.id)
        .first()
    )

    base = _row(application)
    return BookingDetail(
        **base.model_dump(by_alias=False),
        facility_name=shift.facility.name,
        specialty=shift.specialty,
        shift_role=shift.role.value,
        pay_rate=float(shift.pay_rate),
        duration_hours=shift.duration_hours,
        staff_phone=staff.phone,
        staff_rating=float(profile.rating) if profile and profile.rating else 0.0,
        staff_specialty=profile.specialty if profile else None,
        timeline=_timeline(application, payment),
        messages=[BookingMessageOut.model_validate(m) for m in messages],
        payment_id=payment.id if payment else None,
        payment_status=payment.status.value if payment else None,
    )


@router.post("/{booking_id}/messages", response_model=BookingMessageOut,
             status_code=status.HTTP_201_CREATED)
def add_message(
    booking_id: int,
    payload: BookingMessageCreate,
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
):
    """'Contact Doctor' — appends to the Communication Log and notifies them."""
    application = _get_booking(admin, booking_id)

    message = BookingMessage(
        application_id=application.id,
        author_id=admin.user.id,
        author_name=admin.user.full_name,
        author_side="facility",
        body=payload.body,
    )
    admin.db.add(message)

    notify(
        admin.db,
        user_id=application.staff_id,
        category=NotificationCategory.application,
        title=f"Message from {application.shift.facility.name}",
        body=payload.body[:160],
        entity_type="application",
        entity_id=application.id,
        commit=False,
    )
    admin.db.commit()
    admin.db.refresh(message)
    return BookingMessageOut.model_validate(message)


@router.post("/{booking_id}/complete", response_model=BookingDetail)
def mark_completed(
    booking_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
):
    """'Mark as Completed'. Raises the staff member's payment."""
    application = _get_booking(admin, booking_id)

    if application.status == ApplicationStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This booking is already completed"
        )
    if application.status != ApplicationStatus.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {application.status.value} booking cannot be completed",
        )
    if as_aware(application.shift.end_time) > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This shift has not finished yet"
        )

    complete_application(admin.db, application, application.shift)
    # Log for facility activity log (actor = admin)
    log_activity(
        admin.db,
        actor=admin.user,
        action=ActivityActionType.booking_completed,
        description=f"Marked booking {booking_reference(application.id)} complete · {application.shift.specialty}",
        entity_type="application",
        entity_id=application.id,
        facility_id=application.shift.facility_id,
    )
    # Log for staff's My Activity feed (actor = staff member)
    log_activity(
        admin.db,
        actor=application.staff,
        action=ActivityActionType.booking_completed,
        description=f"Completed shift at {application.shift.facility.name} · {application.shift.specialty}",
        entity_type="application",
        entity_id=application.id,
        facility_id=application.shift.facility_id,
    )
    admin.db.commit()
    return get_booking(booking_id, admin)


@router.post("/{booking_id}/payment-done", response_model=BookingDetail)
def mark_payment_done(
    booking_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
):
    """Admin marks that payment has been sent to the staff member."""
    application = _get_booking(admin, booking_id)

    if application.status != ApplicationStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment can only be marked done for a completed booking",
        )

    payment = (
        admin.db.query(Payment)
        .filter(Payment.application_id == application.id)
        .first()
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No payment record found for this booking"
        )
    if payment.status != PaymentStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Payment is already marked as done"
        )

    payment.status = PaymentStatus.paid
    payment.paid_at = datetime.now(timezone.utc)

    notify(
        admin.db,
        user_id=application.staff_id,
        category=NotificationCategory.payment,
        title="Payment sent",
        body=f"₹{float(application.shift.pay_rate):,.0f} payment sent for {application.shift.facility.name} · {application.shift.specialty}",
        entity_type="payment",
        entity_id=payment.id,
        commit=False,
    )
    admin.db.commit()
    return get_booking(booking_id, admin)


@router.post("/{booking_id}/cancel", response_model=BookingDetail)
def cancel_booking(
    booking_id: int,
    payload: BookingCancelRequest = BookingCancelRequest(),
    admin: AdminContext = Depends(require_admin(AdminPermission.bookings)),
):
    """Cancel Booking. Frees the slot and re-opens the shift if it was full."""
    from app.models.enums import ShiftStatus

    application = _get_booking(admin, booking_id)
    if application.status in (ApplicationStatus.cancelled, ApplicationStatus.completed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {application.status.value} booking cannot be cancelled",
        )
    if application.shift.start_time <= now_ist():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This shift has already started and the booking cannot be cancelled",
        )

    was_confirmed = application.status == ApplicationStatus.confirmed
    application.status = ApplicationStatus.cancelled
    application.cancelled_at = now_ist()
    application.cancellation_reason = payload.reason or "Cancelled by the facility"

    shift = application.shift
    if was_confirmed:
        shift.slots_filled = max(0, shift.slots_filled - 1)
        if shift.status == ShiftStatus.filled and shift.slots_filled < shift.slots:
            shift.status = ShiftStatus.open

    notify(
        admin.db,
        user_id=application.staff_id,
        category=NotificationCategory.application,
        title="Booking cancelled by the facility",
        body=f"{shift.facility.name} · {shift.specialty}",
        entity_type="shift",
        entity_id=shift.id,
        commit=False,
    )
    log_activity(
        admin.db,
        actor=admin.user,
        action=ActivityActionType.booking_cancelled,
        description=f"Cancelled booking {booking_reference(application.id)} · {shift.specialty}",
        entity_type="application",
        entity_id=application.id,
        facility_id=shift.facility_id,
    )
    admin.db.commit()
    return get_booking(booking_id, admin)
