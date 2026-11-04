from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app.core.clock import now_ist, today_ist
from app.core.admin import AdminContext, require_admin
from app.models.billing import Invoice, InvoiceLineItem, PaymentMethod
from app.models.enums import AdminPermission, InvoiceStatus
from app.schemas.admin.billing import (
    InvoiceDetail,
    InvoiceLineOut,
    InvoiceListResponse,
    InvoiceRow,
    PayInvoiceRequest,
    PaymentMethodOut,
)
from app.schemas.admin.dashboard import KpiCard

router = APIRouter()

TABS = ("all", "unpaid", "paid", "overdue")


def _row(invoice: Invoice) -> InvoiceRow:
    return InvoiceRow(
        id=invoice.id,
        number=invoice.number,
        issued_on=invoice.issued_on,
        due_on=invoice.due_on,
        total=float(invoice.total),
        # `overdue` is derived from the due date, so a stale nightly job can
        # never leave an invoice mislabelled.
        status=invoice.effective_status,
        paid_at=invoice.paid_at,
    )


@router.get("", response_model=InvoiceListResponse)
def list_invoices(
    admin: AdminContext = Depends(require_admin(AdminPermission.billing)),
    tab: str = Query("all", pattern="^(all|unpaid|paid|overdue)$"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Invoices & Billing: the four KPI cards, tabs, and invoice table."""
    db = admin.db
    invoices = admin.scope(
        db.query(Invoice).order_by(Invoice.issued_on.desc()), Invoice.facility_id
    ).all()

    # effective_status is computed, so tabs and counts are resolved in Python
    # over the facility's own (small) invoice set.
    counts = {"all": len(invoices), "unpaid": 0, "paid": 0, "overdue": 0}
    for invoice in invoices:
        key = invoice.effective_status.value
        if key in counts:
            counts[key] += 1

    selected = (
        invoices if tab == "all"
        else [i for i in invoices if i.effective_status.value == tab]
    )

    today = today_ist()
    outstanding = sum(
        float(i.total) for i in invoices
        if i.effective_status in (InvoiceStatus.unpaid, InvoiceStatus.overdue)
    )
    overdue_count = counts["overdue"]

    paid_this_month = [
        i for i in invoices
        if i.status == InvoiceStatus.paid
        and i.paid_at
        and i.paid_at.year == today.year
        and i.paid_at.month == today.month
    ]

    upcoming = sorted(
        (i for i in invoices if i.effective_status in (InvoiceStatus.unpaid, InvoiceStatus.overdue)),
        key=lambda i: i.due_on,
    )
    next_due = upcoming[0] if upcoming else None

    payment_method = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.facility_id == admin.primary_facility_id,
            PaymentMethod.is_primary.is_(True),
        )
        .first()
        if admin.primary_facility_id
        else None
    )

    kpis = [
        KpiCard(
            label="Total Outstanding", value=f"₹{outstanding:,.0f}",
            delta=f"{counts['unpaid'] + overdue_count} invoice(s)",
            delta_tone="negative" if overdue_count else "neutral",
        ),
        KpiCard(
            label="Paid This Month",
            value=f"₹{sum(float(i.total) for i in paid_this_month):,.0f}",
            delta=f"{len(paid_this_month)} invoice(s)", delta_tone="positive",
        ),
        KpiCard(
            label="Next Payment Due",
            value=f"₹{float(next_due.total):,.0f}" if next_due else "—",
            delta=f"Due {next_due.due_on:%d %b}" if next_due else "Nothing outstanding",
            delta_tone="warning" if next_due else "neutral",
        ),
        KpiCard(
            label="Payment Method",
            value=f"{payment_method.label} ····{payment_method.last4}"
            if payment_method else "Not set",
            delta="Primary" if payment_method else "Add a payment method",
            delta_tone="neutral" if payment_method else "warning",
        ),
    ]

    return InvoiceListResponse(
        items=[_row(i) for i in selected[offset : offset + limit]],
        total=len(selected),
        counts=counts,
        kpis=kpis,
        payment_method=PaymentMethodOut.model_validate(payment_method) if payment_method else None,
    )


def _get_invoice(admin: AdminContext, invoice_id: int) -> Invoice:
    invoice = (
        admin.db.query(Invoice)
        .options(joinedload(Invoice.line_items), joinedload(Invoice.facility))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    admin.assert_facility(invoice.facility_id)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceDetail)
def get_invoice(
    invoice_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.billing)),
):
    """The View action — an invoice with its line items."""
    invoice = _get_invoice(admin, invoice_id)
    base = _row(invoice)
    return InvoiceDetail(
        **base.model_dump(by_alias=False),
        facility_name=invoice.facility.name,
        period_start=invoice.period_start,
        period_end=invoice.period_end,
        subtotal=float(invoice.subtotal),
        tax=float(invoice.tax),
        notes=invoice.notes,
        line_items=[
            InvoiceLineOut(
                id=item.id,
                description=item.description,
                quantity=float(item.quantity),
                unit_amount=float(item.unit_amount),
                amount=float(item.amount),
                shift_id=item.shift_id,
            )
            for item in invoice.line_items
        ],
    )


@router.post("/{invoice_id}/pay", response_model=InvoiceDetail)
def pay_invoice(
    invoice_id: int,
    payload: PayInvoiceRequest = PayInvoiceRequest(),
    admin: AdminContext = Depends(require_admin(AdminPermission.billing)),
):
    """The 'Pay Now' button.

    There is no payment gateway wired up: this records the invoice as settled
    and stores the reference. Swapping in a real provider means taking a
    payment here and only then marking it paid.
    """
    invoice = _get_invoice(admin, invoice_id)

    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This invoice is already paid"
        )
    if invoice.status == InvoiceStatus.void:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This invoice has been voided"
        )

    invoice.status = InvoiceStatus.paid
    invoice.paid_at = now_ist()
    invoice.payment_reference = payload.reference or f"PAY-{invoice.number}"
    admin.db.commit()
    return get_invoice(invoice_id, admin)


@router.get("/{invoice_id}/download")
def download_invoice(
    invoice_id: int,
    admin: AdminContext = Depends(require_admin(AdminPermission.billing)),
):
    """The Download action.

    Returns the invoice as CSV. PDF rendering needs a document library that is
    not a dependency yet — flagged rather than faked.
    """
    import csv
    import io

    from fastapi.responses import StreamingResponse

    invoice = _get_invoice(admin, invoice_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([f"Invoice {invoice.number}"])
    writer.writerow(["Facility", invoice.facility.name])
    writer.writerow(["Period", f"{invoice.period_start} to {invoice.period_end}"])
    writer.writerow(["Issued", invoice.issued_on, "Due", invoice.due_on])
    writer.writerow([])
    writer.writerow(["Description", "Quantity", "Unit Amount", "Amount"])
    for item in invoice.line_items:
        writer.writerow([item.description, float(item.quantity),
                         float(item.unit_amount), float(item.amount)])
    writer.writerow([])
    writer.writerow(["Subtotal", "", "", float(invoice.subtotal)])
    writer.writerow(["Tax", "", "", float(invoice.tax)])
    writer.writerow(["Total", "", "", float(invoice.total)])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{invoice.number}.csv"'},
    )
