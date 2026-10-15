"""The Messages tab dot: unread staff messages for the signed-in admin."""

from app.models.chat import ChatRoom, DirectMessage


def _message(db, room, sender_id, sender_role, read=False):
    db.add(DirectMessage(room_id=room.id, sender_id=sender_id, sender_name="x",
                         sender_role=sender_role, body="Hi", is_read=read))
    db.commit()


def test_unread_count_counts_only_unread_staff_messages_to_this_admin(
    client, admin_headers, registered_admin, registered_doctor, db_session
):
    url = "/api/v1/chat/unread-count"
    assert client.get(url, headers=admin_headers).json() == {"count": 0}

    admin_id, staff_id = registered_admin["user_id"], registered_doctor["user_id"]
    room = ChatRoom(room_key=f"admin_{admin_id}_staff_{staff_id}", admin_id=admin_id, staff_id=staff_id)
    db_session.add(room)
    db_session.commit()

    _message(db_session, room, staff_id, "staff")             # counts
    _message(db_session, room, staff_id, "staff", read=True)  # already read
    _message(db_session, room, admin_id, "admin")             # admin's own
    assert client.get(url, headers=admin_headers).json() == {"count": 1}

    # Opening the conversation marks it read.
    client.get(f"/api/v1/chat/rooms/{room.room_key}/history", headers=admin_headers)
    assert client.get(url, headers=admin_headers).json() == {"count": 0}


def test_unread_count_is_admin_only(client, auth_headers):
    assert client.get("/api/v1/chat/unread-count", headers=auth_headers).status_code == 403
