"""Delete a user's account and the personal data attached to it.

Google Play requires that deleting an account deletes the user's data, apart
from records kept for a stated legitimate reason. Here:

- deleted: uploaded documents (rows and files), profile photo, device and
  browser push registrations, notifications, availability, shift preferences
  and favourites, support tickets, OTP and reset codes, and the personal
  fields of the staff profile (credential / ID number, bank details, bio...)
- anonymised: the user row itself (name, email, phone, date of birth,
  password), which stays only so past applications and payments still add up
  for the facility's records and tax purposes
- pending applications are cancelled, so facilities stop seeing them as live

The account can never log in again, and the email and phone become free to
register afresh.
"""

import logging
import secrets

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.application import Application
from app.models.availability import Availability, ShiftPreference
from app.models.document import Document
from app.models.enums import ApplicationStatus
from app.models.notification import Notification
from app.models.otp import OtpCode, PasswordResetToken
from app.models.shift import ShiftFavorite
from app.models.support import DeviceToken, SupportTicket, WebPushSubscription
from app.models.user import User
from app.services import storage

logger = logging.getLogger(__name__)

DELETED_NAME = "Deleted user"

# Tables whose rows belong to the user alone and carry nothing a facility
# needs once the person has gone.
_OWNED = (
    DeviceToken,
    WebPushSubscription,
    OtpCode,
    PasswordResetToken,
    Availability,
    ShiftPreference,
    ShiftFavorite,
    Notification,
    SupportTicket,
)

# Personal fields on the staff profile; ratings and shift counts stay.
_PROFILE_FIELDS = (
    "credential_number",
    "specialty",
    "experience",
    "qualifications",
    "bio",
    "preferred_locations",
    "min_pay_rate",
    "bank_name",
    "bank_account_last4",
    "bank_ifsc",
)


def deleted_email(user_id: int) -> str:
    return f"deleted-{user_id}@deleted.invalid"


def delete_account(db: Session, user: User) -> None:
    uid = user.id
    file_keys = [key for (key,) in db.query(Document.file_path).filter(Document.user_id == uid)]
    if user.avatar_url and user.avatar_url.startswith("/uploads/"):
        file_keys.append(user.avatar_url.removeprefix("/uploads/"))

    db.query(Document).filter(Document.user_id == uid).delete(synchronize_session=False)
    for model in _OWNED:
        db.query(model).filter(model.user_id == uid).delete(synchronize_session=False)
    db.query(Application).filter(
        Application.staff_id == uid, Application.status == ApplicationStatus.pending
    ).update({Application.status: ApplicationStatus.cancelled}, synchronize_session=False)

    if user.staff_profile is not None:
        for field in _PROFILE_FIELDS:
            setattr(user.staff_profile, field, None)

    user.email = deleted_email(uid)
    user.phone = None
    user.full_name = DELETED_NAME
    user.avatar_url = None
    user.date_of_birth = None
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    user.is_active = False
    user.is_verified = False
    db.commit()
    db.expire_all()

    # Files go after the commit: a failed commit must not leave rows pointing
    # at files that no longer exist.
    for key in file_keys:
        try:
            storage.delete(key)
        except Exception:
            logger.warning("Could not delete file %s of deleted user %s", key, uid, exc_info=True)
