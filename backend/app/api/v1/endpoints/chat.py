"""Real-time chat between facility admins and staff members.

WebSocket URL: /api/v1/chat/ws/{room_key}?token=<access_token>

REST helpers:
  POST   /api/v1/chat/rooms          — get-or-create room (admin → staff_id)
  GET    /api/v1/chat/rooms          — list all rooms for the current admin
  GET    /api/v1/chat/rooms/{key}/history — paginated message history
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.deps import get_current_user, get_current_facility_admin
from app.core.security import decode_token
from app.models.chat import ChatRoom, DirectMessage
from app.models.enums import NotificationCategory, STAFF_ROLES
from app.models.facility import FacilityMember
from app.models.user import User
from app.schemas.base import MessageResponse
from app.schemas.chat import ChatHistoryResponse, ChatRoomOut, DirectMessageOut, SendMessageRequest
from app.services.notifications import notify

logger = logging.getLogger(__name__)

router = APIRouter()


# ── In-process connection manager ────────────────────────────────────────────

class _ConnectionManager:
    """Holds active WebSocket connections keyed by room_key."""

    def __init__(self):
        self._rooms: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, room_key: str, ws: WebSocket):
        await ws.accept()
        self._rooms[room_key].append(ws)

    def disconnect(self, room_key: str, ws: WebSocket):
        try:
            self._rooms[room_key].remove(ws)
        except ValueError:
            pass

    def is_online(self, room_key: str) -> bool:
        return len(self._rooms[room_key]) > 0

    async def broadcast(self, room_key: str, payload: dict):
        for ws in list(self._rooms[room_key]):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(room_key, ws)


manager = _ConnectionManager()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_room(db: Session, admin_id: int, staff_id: int) -> ChatRoom:
    room_key = f"admin_{admin_id}_staff_{staff_id}"
    room = db.query(ChatRoom).filter(ChatRoom.room_key == room_key).first()
    if room is None:
        try:
            room = ChatRoom(room_key=room_key, admin_id=admin_id, staff_id=staff_id)
            db.add(room)
            db.commit()
            db.refresh(room)
        except IntegrityError:
            # Another concurrent request already created the room (race condition).
            db.rollback()
            room = db.query(ChatRoom).filter(ChatRoom.room_key == room_key).first()
    return room


def _mysql_rooms_newest_first(query):
    """MySQL doesn't support NULLS LAST — use ISNULL() trick to push NULLs to end."""
    return query.order_by(
        func.isnull(ChatRoom.last_message_at),   # 0 for non-NULL, 1 for NULL → NULLs last
        ChatRoom.last_message_at.desc(),
    )


def _room_out(room: ChatRoom, viewer_id: int, db: Session) -> ChatRoomOut:
    unread = (
        db.query(func.count(DirectMessage.id))
        .filter(
            DirectMessage.room_id == room.id,
            DirectMessage.is_read.is_(False),
            DirectMessage.sender_id != viewer_id,
        )
        .scalar()
    ) or 0

    last_msg = (
        db.query(DirectMessage)
        .filter(DirectMessage.room_id == room.id)
        .order_by(DirectMessage.created_at.desc())
        .first()
    )

    facility_member = db.query(FacilityMember).filter(FacilityMember.user_id == room.admin_id).first()
    facility_name = facility_member.facility.name if facility_member else None

    return ChatRoomOut(
        id=room.id,
        room_key=room.room_key,
        admin_id=room.admin_id,
        staff_id=room.staff_id,
        admin_name=room.admin.full_name,
        facility_name=facility_name,
        staff_name=room.staff.full_name,
        staff_initials=room.staff.initials,
        last_message_at=room.last_message_at,
        last_message_body=last_msg.body[:60] if last_msg else None,
        unread_count=unread,
    )


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.post("/rooms", response_model=ChatRoomOut)
def get_or_create_room(
    staff_id: int = Query(..., description="ID of the staff member to chat with"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_facility_admin),
):
    """Admin opens a chat with a staff member — creates room if it doesn't exist."""
    staff = db.query(User).filter(User.id == staff_id, User.role.in_(STAFF_ROLES)).first()
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")
    room = _get_or_create_room(db, current_user.id, staff_id)
    return _room_out(room, current_user.id, db)


@router.get("/rooms", response_model=List[ChatRoomOut])
def list_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_facility_admin),
):
    """This admin's conversations, newest-activity first. A room is created as
    soon as the chat drawer opens, so only rooms with a message are listed —
    the same rule as the staff side."""
    rooms = _mysql_rooms_newest_first(
        db.query(ChatRoom).filter(
            ChatRoom.admin_id == current_user.id,
            ChatRoom.last_message_at.isnot(None),
        )
    ).all()
    return [_room_out(r, current_user.id, db) for r in rooms]


@router.get("/my-rooms", response_model=List[ChatRoomOut])
def staff_list_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Staff: list all rooms where this user is the staff member."""
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff only")
    rooms = _mysql_rooms_newest_first(
        db.query(ChatRoom).filter(
            ChatRoom.staff_id == current_user.id,
            ChatRoom.last_message_at.isnot(None),
        )
    ).all()
    return [_room_out(r, current_user.id, db) for r in rooms]


@router.get("/rooms/by-id/{room_id}", response_model=ChatRoomOut)
def get_room_by_id(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Staff: resolve a room DB id (from a notification) to full room info."""
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat room not found")
    if current_user.id not in (room.admin_id, room.staff_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    return _room_out(room, current_user.id, db)


@router.get("/rooms/{room_key}/history", response_model=ChatHistoryResponse)
def room_history(
    room_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Paginated message history. Accessible by both admin and staff."""
    room = db.query(ChatRoom).filter(ChatRoom.room_key == room_key).first()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat room not found")

    # Only participants may read
    if current_user.id not in (room.admin_id, room.staff_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")

    total = db.query(func.count(DirectMessage.id)).filter(DirectMessage.room_id == room.id).scalar() or 0
    msgs = (
        db.query(DirectMessage)
        .filter(DirectMessage.room_id == room.id)
        .order_by(DirectMessage.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Mark messages from the other side as read
    db.query(DirectMessage).filter(
        DirectMessage.room_id == room.id,
        DirectMessage.sender_id != current_user.id,
        DirectMessage.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()

    return ChatHistoryResponse(
        room_key=room_key,
        messages=[DirectMessageOut.model_validate(m) for m in msgs],
        total=total,
        has_more=offset + len(msgs) < total,
    )


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/{room_key}")
async def websocket_chat(
    websocket: WebSocket,
    room_key: str,
    token: str = Query(...),
):
    """
    Connect: ws://.../api/v1/chat/ws/{room_key}?token=<access_token>

    Messages sent by client:  { "body": "hello" }
    Messages received:        { "type": "message", "data": { ...DirectMessageOut } }
    On connect server sends:  { "type": "history", "data": [...last 50 msgs] }
    """
    # ── Auth ──────────────────────────────────────────────────────────────────
    payload = decode_token(token, expected_type="access")
    if payload is None:
        await websocket.close(code=4001)
        return

    user_id = int(payload.get("sub", 0))

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
        if user is None:
            await websocket.close(code=4001)
            return

        # ── Room access ───────────────────────────────────────────────────────
        room = db.query(ChatRoom).filter(ChatRoom.room_key == room_key).first()
        if room is None:
            await websocket.close(code=4004)
            return
        if user.id not in (room.admin_id, room.staff_id):
            await websocket.close(code=4003)
            return

        # Determine sender_role label
        sender_role = "staff" if user.role in STAFF_ROLES else "admin"

        # ── Accept + send history ─────────────────────────────────────────────
        await manager.connect(room_key, websocket)

        history = (
            db.query(DirectMessage)
            .filter(DirectMessage.room_id == room.id)
            .order_by(DirectMessage.created_at.asc())
            .limit(50)
            .all()
        )
        await websocket.send_json({
            "type": "history",
            "data": [DirectMessageOut.model_validate(m).model_dump(mode="json", by_alias=True) for m in history],
        })

        # Mark existing unread as read on connect
        db.query(DirectMessage).filter(
            DirectMessage.room_id == room.id,
            DirectMessage.sender_id != user.id,
            DirectMessage.is_read.is_(False),
        ).update({"is_read": True}, synchronize_session=False)
        db.commit()

        # ── Message loop ──────────────────────────────────────────────────────
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                body = str(data.get("body", "")).strip()
            except (json.JSONDecodeError, AttributeError):
                continue

            if not body:
                continue

            # Persist
            msg = DirectMessage(
                room_id=room.id,
                sender_id=user.id,
                sender_name=user.full_name,
                sender_role=sender_role,
                body=body,
                is_read=False,
            )
            db.add(msg)
            room.last_message_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(msg)

            out = DirectMessageOut.model_validate(msg).model_dump(mode="json", by_alias=True)
            payload_out = {"type": "message", "data": out}

            # Broadcast to everyone in the room (including sender for echo)
            await manager.broadcast(room_key, payload_out)

            # Notify the other participant if they are NOT connected
            other_id = room.staff_id if sender_role == "admin" else room.admin_id
            if not manager.is_online(room_key) or not any(
                True for ws in manager._rooms[room_key]
                # rough check: if other side has no socket we notify
                if ws is not websocket
            ):
                notify(
                    db,
                    user_id=other_id,
                    category=NotificationCategory.message,
                    title=f"New message from {user.full_name}",
                    body=body[:120],
                    entity_type="chat_room",
                    entity_id=room.id,
                )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("WebSocket error in room %s: %s", room_key, exc)
    finally:
        manager.disconnect(room_key, websocket)
        db.close()
