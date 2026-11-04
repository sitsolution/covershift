from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.core.clock import now_ist
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_staff
from app.models.application import Application
from app.models.enums import NotificationCategory, PaymentStatus, PayoutStatus
from app.models.facility import FacilityMember
from app.models.payment import Payment, PayoutRequest
from app.models.shift import Shift
from app.models.user import User
from app.services.notifications import notify
from app.schemas.earnings import (
    EarningsSummary,
    PayoutRequestCreate,
    PayoutRequestOut,
    TransactionListResponse,
    TransactionOut,
    TrendPoint,
)

router = APIRouter()

MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _sum(db: Session, user_id: int, *filters) -> Decimal:
    return db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.user_id == user_id, *filters
    ).scalar() or Decimal(0)


def _available_balance(db: Session, user_id: int) -> Decimal:
    """Paid earnings minus anything already requested or paid out."""
    paid = _sum(db, user_id, Payment.status == PaymentStatus.paid)
    withdrawn = db.query(func.coalesce(func.sum(PayoutRequest.amount), 0)).filter(
        PayoutRequest.user_id == user_id,
        PayoutRequest.status.in_(
            [PayoutStatus.requested, PayoutStatus.processing, PayoutStatus.completed]
        ),
    ).scalar() or Decimal(0)
    return max(Decimal(0), paid - withdrawn)


@router.get("/summary", response_model=EarningsSummary)
def earnings_summary(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_staff)
):
    """The hero card on My Earnings."""
    now = now_ist()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total = _sum(db, current_user.id, Payment.status == PaymentStatus.paid)
    this_month = _sum(
        db, current_user.id, Payment.status == PaymentStatus.paid, Payment.earned_at >= month_start
    )
    pending = _sum(db, current_user.id, Payment.status == PaymentStatus.pending)

    # Payouts run on the 28th; after that, the next one is the following month.
    payout_day = 28
    next_payout = (
        date(now.year, now.month, payout_day)
        if now.day < payout_day
        else (date(now.year, now.month, payout_day) + timedelta(days=32)).replace(day=payout_day)
    )

    return EarningsSummary(
        total_earnings=float(total),
        this_month=float(this_month),
        pending=float(pending),
        available_to_withdraw=float(_available_balance(db, current_user.id)),
        next_payout_date=next_payout,
    )


@router.get("/trend", response_model=list[TrendPoint])
def earnings_trend(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    months: int = Query(7, ge=1, le=24),
):
    """The bar chart. Returns a point per month including empty ones, so the
    chart keeps a stable number of bars."""
    now = now_ist()

    buckets: list[tuple[int, int]] = []
    year, month = now.year, now.month
    for _ in range(months):
        buckets.append((year, month))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    buckets.reverse()

    window_start = datetime(buckets[0][0], buckets[0][1], 1, tzinfo=timezone.utc)
    rows = (
        db.query(
            extract("year", Payment.earned_at).label("y"),
            extract("month", Payment.earned_at).label("m"),
            func.coalesce(func.sum(Payment.amount), 0).label("total"),
        )
        .filter(
            Payment.user_id == current_user.id,
            Payment.status == PaymentStatus.paid,
            Payment.earned_at >= window_start,
        )
        .group_by("y", "m")
        .all()
    )
    totals = {(int(r.y), int(r.m)): float(r.total) for r in rows}

    return [
        TrendPoint(
            label=MONTH_ABBR[m - 1],
            period_start=date(y, m, 1),
            amount=totals.get((y, m), 0.0),
        )
        for y, m in buckets
    ]


@router.get("/transactions", response_model=TransactionListResponse)
def transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Recent Transactions."""
    query = (
        db.query(Payment)
        .options(joinedload(Payment.shift).joinedload(Shift.facility))
        .filter(Payment.user_id == current_user.id)
    )
    total = query.count()
    payments = query.order_by(Payment.earned_at.desc()).offset(offset).limit(limit).all()

    items = []
    for payment in payments:
        shift = payment.shift
        items.append(
            TransactionOut(
                id=payment.id,
                facility_name=shift.facility.name if shift else None,
                facility_initials=shift.facility.initials if shift else None,
                specialty=shift.specialty if shift else None,
                amount=float(payment.amount),
                status=payment.status,
                earned_at=payment.earned_at,
                paid_at=payment.paid_at,
                reference=payment.reference,
            )
        )

    return TransactionListResponse(
        items=items, total=total, limit=limit, offset=offset,
        has_more=offset + len(payments) < total,
    )


@router.post("/payouts", response_model=PayoutRequestOut, status_code=status.HTTP_201_CREATED)
def request_payout(
    payload: PayoutRequestCreate = PayoutRequestCreate(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """'Withdraw / Request Payout'."""
    pending = (
        db.query(PayoutRequest)
        .filter(
            PayoutRequest.user_id == current_user.id,
            PayoutRequest.status.in_([PayoutStatus.requested, PayoutStatus.processing]),
        )
        .first()
    )
    if pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a payout in progress",
        )

    available = _available_balance(db, current_user.id)
    amount = Decimal(str(payload.amount)) if payload.amount is not None else available

    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You have no balance available to withdraw"
        )
    if amount > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount exceeds your available balance of ₹{available:,.2f}",
        )
    if amount < Decimal(str(settings.PAYOUT_MINIMUM)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum payout is ₹{settings.PAYOUT_MINIMUM:,.0f}",
        )

    payout = PayoutRequest(user_id=current_user.id, amount=amount)
    db.add(payout)
    db.commit()
    db.refresh(payout)
    return PayoutRequestOut.model_validate(payout)


@router.post("/payments/{payment_id}/received", response_model=TransactionOut)
def acknowledge_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Staff confirms they received their payment."""
    payment = (
        db.query(Payment)
        .options(joinedload(Payment.shift).joinedload(Shift.facility))
        .filter(Payment.id == payment_id, Payment.user_id == current_user.id)
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.status != PaymentStatus.paid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment has not been marked as sent yet",
        )

    payment.status = PaymentStatus.processing  # processing = staff acknowledged receipt

    # Notify all facility admins that the staff has acknowledged receiving payment
    if payment.application_id:
        application = db.query(Application).filter(Application.id == payment.application_id).first()
        if application:
            admin_ids = [
                m.user_id for m in db.query(FacilityMember)
                .filter(FacilityMember.facility_id == application.shift.facility_id)
                .all()
            ]
            for admin_id in admin_ids:
                notify(
                    db,
                    user_id=admin_id,
                    category=NotificationCategory.payment,
                    title="Payment received by staff",
                    body=f"{current_user.full_name} confirmed receipt of ₹{float(payment.amount):,.0f} · {application.shift.specialty}",
                    entity_type="application",
                    entity_id=application.id,
                    commit=False,
                )

    db.commit()
    db.refresh(payment)

    shift = payment.shift
    return TransactionOut(
        id=payment.id,
        facility_name=shift.facility.name if shift else None,
        facility_initials=shift.facility.initials if shift else None,
        specialty=shift.specialty if shift else None,
        amount=float(payment.amount),
        status=payment.status,
        earned_at=payment.earned_at,
        paid_at=payment.paid_at,
        reference=payment.reference,
    )


@router.get("/payouts", response_model=list[PayoutRequestOut])
def list_payouts(db: Session = Depends(get_db), current_user: User = Depends(get_current_staff)):
    payouts = (
        db.query(PayoutRequest)
        .filter(PayoutRequest.user_id == current_user.id)
        .order_by(PayoutRequest.requested_at.desc())
        .all()
    )
    return [PayoutRequestOut.model_validate(p) for p in payouts]
