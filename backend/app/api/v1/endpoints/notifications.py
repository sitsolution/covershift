from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.clock import now_ist
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.enums import NotificationCategory
from app.models.notification import Notification
from app.models.user import User
from app.schemas.base import CountResponse, MessageResponse
from app.schemas.notification import NotificationListResponse, NotificationOut

router = APIRouter()

#: Presets matching the mobile Notifications screen's tabs.
#: On mobile, "Shift Alerts" bundles shift matches + application updates (no separate Applications tab).
TAB_CATEGORIES = {
    "all": None,
    "unread": None,
    "shift_alerts": [NotificationCategory.shift_alert, NotificationCategory.application],
    "payments": [NotificationCategory.payment],
}


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tab: str = Query("all", pattern="^(all|unread|shift_alerts|payments)$"),
    categories: Optional[str] = Query(
        None,
        description="Comma-separated categories, overriding `tab`. The admin "
                    "centre uses this for its Applications and System tabs, "
                    "which do not map onto the mobile presets.",
    ),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Notifications screen."""
    query = db.query(Notification).filter(Notification.user_id == current_user.id)

    if categories:
        try:
            wanted = [
                NotificationCategory(value.strip())
                for value in categories.split(",")
                if value.strip()
            ]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unknown notification category",
            )
        if wanted:
            query = query.filter(Notification.category.in_(wanted))
    elif tab == "unread":
        query = query.filter(Notification.is_read.is_(False))
    elif TAB_CATEGORIES[tab] is not None:
        query = query.filter(Notification.category.in_(TAB_CATEGORIES[tab]))

    total = query.count()
    items = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()

    unread = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .scalar()
    )

    return NotificationListResponse(
        items=[NotificationOut.model_validate(n) for n in items],
        total=total,
        unread_count=unread or 0,
        limit=limit,
        offset=offset,
        has_more=offset + len(items) < total,
    )


@router.get("/unread-count", response_model=CountResponse)
def unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The red dot on the dashboard bell."""
    count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .scalar()
    )
    return CountResponse(count=count or 0)


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = now_ist()
        db.commit()
        db.refresh(notification)
    return NotificationOut.model_validate(notification)


@router.post("/read-all", response_model=CountResponse)
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """'Mark all as read'."""
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .update(
            {"is_read": True, "read_at": now_ist()},
            synchronize_session=False,
        )
    )
    db.commit()
    return CountResponse(count=updated)


@router.delete("/{notification_id}", response_model=MessageResponse)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .delete()
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    db.commit()
    return MessageResponse(message="Notification deleted")
