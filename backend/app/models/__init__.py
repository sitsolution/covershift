"""Model registry.

Importing every model here is what makes ``Base.metadata`` complete — Alembic's
autogenerate only sees tables whose module has been imported.
"""

from app.models.activity_log import ActivityLog
from app.models.role_permission import RolePermission
from app.models.application import Application
from app.models.availability import Availability, ShiftPreference
from app.models.billing import Invoice, InvoiceLineItem, PaymentMethod
from app.models.document import Document
from app.models.enums import (
    FACILITY_ADMIN_ROLES,
    STAFF_ROLES,
    ActivityActionType,
    AdminPermission,
    ApplicationStatus,
    DocumentStatus,
    DocumentType,
    FacilityRole,
    FacilityType,
    InvoiceStatus,
    NotificationCategory,
    OtpPurpose,
    PaymentStatus,
    PayoutStatus,
    ShiftStatus,
    TicketStatus,
    UserRole,
)
from app.models.facility import Facility, FacilityMember, FacilityStaff
from app.models.notification import Notification
from app.models.otp import OtpCode, PasswordResetToken
from app.models.payment import Payment, PayoutRequest
from app.models.shift import Shift, ShiftFavorite
from app.models.staff_meta import BookingMessage, StaffNote, StaffReview
from app.models.support import DeviceToken, Faq, SupportTicket
from app.models.user import StaffProfile, User, UserSettings
from app.models.chat import ChatRoom, DirectMessage

__all__ = [
    "ActivityActionType",
    "ActivityLog",
    "RolePermission",
    "FACILITY_ADMIN_ROLES",
    "InvoiceStatus",
    "FacilityRole",
    "AdminPermission",
    "BookingMessage",
    "StaffNote",
    "StaffReview",
    "PaymentMethod",
    "InvoiceLineItem",
    "Invoice",
    "Application",
    "ApplicationStatus",
    "Availability",
    "DeviceToken",
    "Document",
    "DocumentStatus",
    "DocumentType",
    "Facility",
    "FacilityMember",
    "FacilityStaff",
    "FacilityType",
    "Faq",
    "Notification",
    "NotificationCategory",
    "OtpCode",
    "OtpPurpose",
    "PasswordResetToken",
    "Payment",
    "PaymentStatus",
    "PayoutRequest",
    "PayoutStatus",
    "STAFF_ROLES",
    "Shift",
    "ShiftFavorite",
    "ShiftPreference",
    "ShiftStatus",
    "StaffProfile",
    "SupportTicket",
    "TicketStatus",
    "User",
    "UserRole",
    "UserSettings",
    "ChatRoom",
    "DirectMessage",
]
