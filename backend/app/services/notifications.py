"""Creating in-app notifications and dispatching push delivery.

Rows are written synchronously with the action that caused them.  Push goes
out once the transaction holding the row commits — whether notify() commits
itself or the caller commits later (``commit=False``, used when the
notification is part of a larger change).  A rolled-back notification is never
pushed.  Push failures are logged and swallowed, so the action is never
affected by a broken push configuration.
"""

from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.enums import NotificationCategory
from app.models.notification import Notification
from app.services.push_service import deliver_push

_PENDING_PUSH = "pending_push"


def notify(
    db: Session,
    user_id: int,
    category: NotificationCategory,
    title: str,
    body: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    commit: bool = True,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        category=category,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notification)
    db.info.setdefault(_PENDING_PUSH, []).append(
        dict(user_id=user_id, title=title, body=body, entity_type=entity_type, entity_id=entity_id)
    )
    if commit:
        db.commit()
        db.refresh(notification)
    return notification


@event.listens_for(Session, "after_commit")
def _push_committed_notifications(session: Session) -> None:
    pending = session.info.pop(_PENDING_PUSH, None)
    if not pending:
        return
    # A session cannot run queries inside after_commit, so token lookups use
    # a short-lived session on the same connection source.
    with Session(bind=session.get_bind()) as lookup:
        for item in pending:
            deliver_push(db=lookup, **item)


@event.listens_for(Session, "after_rollback")
def _drop_rolled_back_notifications(session: Session) -> None:
    session.info.pop(_PENDING_PUSH, None)
