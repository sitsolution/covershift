from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.clock import today_ist
from app.core.database import Base
from app.models.enums import InvoiceStatus, enum_column


class Invoice(Base):
    """What a facility owes the platform for a billing period.

    Distinct from Payment, which is what the platform owes a staff member.
    """

    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"),
                         nullable=False, index=True)

    number = Column(String(40), nullable=False, unique=True, index=True)   # "INV-3381"
    status = Column(enum_column(InvoiceStatus), default=InvoiceStatus.unpaid,
                    nullable=False, index=True)

    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    issued_on = Column(Date, nullable=False, index=True)
    due_on = Column(Date, nullable=False, index=True)

    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax = Column(Numeric(12, 2), nullable=False, default=0)
    total = Column(Numeric(12, 2), nullable=False, default=0)

    paid_at = Column(DateTime(timezone=True), nullable=True)
    payment_reference = Column(String(80), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    facility = relationship("Facility")
    line_items = relationship("InvoiceLineItem", back_populates="invoice",
                              cascade="all, delete-orphan")

    @property
    def is_overdue(self) -> bool:
        from datetime import date
        return self.status == InvoiceStatus.unpaid and self.due_on < today_ist()

    @property
    def effective_status(self) -> InvoiceStatus:
        """`overdue` is derived from the due date rather than stored, so an
        invoice cannot sit in a stale state between nightly jobs."""
        return InvoiceStatus.overdue if self.is_overdue else self.status


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True)

    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(8, 2), nullable=False, default=1)
    unit_amount = Column(Numeric(10, 2), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="line_items")


class PaymentMethod(Base):
    """The facility's billing instrument — the Payment Method KPI card."""

    __tablename__ = "payment_methods"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"),
                         nullable=False, index=True)

    label = Column(String(120), nullable=False)      # "HDFC Bank"
    last4 = Column(String(4), nullable=False)
    method_type = Column(String(30), nullable=False, default="bank_account")
    is_primary = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
