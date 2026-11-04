"""Super Admin user management — /superadmin/users."""

from datetime import datetime
from typing import List, Optional

from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import EmailStr
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.endpoints.superadmin.deps import require_super_admin
from app.core.deps import get_db
from app.core.security import hash_password
from app.models.document import Document
from app.models.enums import ActivityActionType, DocumentStatus, DocumentType, FacilityRole, OtpPurpose, UserRole
from app.models.facility import Facility, FacilityMember
from app.models.user import User, UserSettings
from app.schemas.base import CamelModel, MessageResponse
from app.services import otp as otp_service, storage
from app.services.activity_log import log_activity
from app.services.labels import DOCUMENT_TYPE_LABELS

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserListItem(CamelModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool
    is_verified: bool
    facility_id: Optional[int] = None
    facility_name: Optional[str] = None
    created_at: datetime


class DocumentBrief(CamelModel):
    id: int
    doc_type: str
    original_filename: str
    status: DocumentStatus
    uploaded_at: datetime
    expiry_date: Optional[datetime] = None


class UserDetailItem(UserListItem):
    documents: List[DocumentBrief] = []


class UserListResponse(CamelModel):
    items: List[UserListItem]
    total: int


class CreateUserBody(CamelModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str
    role: UserRole
    facility_id: Optional[int] = None
    is_active: bool = True


class UpdateUserBody(CamelModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    facility_id: Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _facility_map(db: Session, user_ids: list[int]) -> dict[int, tuple[Optional[int], Optional[str]]]:
    """Returns {user_id: (facility_id, facility_name)} for the first membership of each user."""
    if not user_ids:
        return {}
    rows = (
        db.query(FacilityMember.user_id, Facility.id, Facility.name)
        .join(Facility, FacilityMember.facility_id == Facility.id)
        .filter(FacilityMember.user_id.in_(user_ids))
        .order_by(FacilityMember.user_id, FacilityMember.id)
        .all()
    )
    result: dict[int, tuple[Optional[int], Optional[str]]] = {}
    for uid, fid, fname in rows:
        result.setdefault(uid, (fid, fname))
    return result


def _build_list_item(user: User, fac_map: dict) -> UserListItem:
    fid, fname = fac_map.get(user.id, (None, None))
    return UserListItem(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        is_verified=user.is_verified,
        facility_id=fid,
        facility_name=fname,
        created_at=user.created_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=UserListResponse)
def list_users(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    role: Optional[UserRole] = Query(None),
    is_active: Optional[bool] = Query(None),
    is_verified: Optional[bool] = Query(None),
    facility_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None, alias="sortBy", pattern="^(name|role|status|created_at)$"),
    sort_order: Optional[str] = Query("desc", alias="sortOrder", pattern="^(asc|desc)$"),
):
    query = db.query(User)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(User.full_name.ilike(pattern), User.email.ilike(pattern))
        )
    if role is not None:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if is_verified is not None:
        query = query.filter(User.is_verified == is_verified)
    if facility_id is not None:
        sub = db.query(FacilityMember.user_id).filter(FacilityMember.facility_id == facility_id).subquery()
        query = query.filter(User.id.in_(sub))

    total = query.count()
    desc = sort_order == "desc"
    if sort_by == "name":
        order_col = User.full_name.desc() if desc else User.full_name.asc()
    elif sort_by == "role":
        order_col = User.role.desc() if desc else User.role.asc()
    elif sort_by == "status":
        order_col = User.is_active.desc() if desc else User.is_active.asc()
    else:
        order_col = User.created_at.desc() if desc else User.created_at.asc()
    users = query.order_by(order_col).offset(offset).limit(limit).all()

    fac_map = _facility_map(db, [u.id for u in users])
    items = [_build_list_item(u, fac_map) for u in users]

    return UserListResponse(items=items, total=total)


@router.post("", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserBody,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if body.phone and db.query(User).filter(User.phone == body.phone).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already registered")

    user = User(
        email=body.email,
        phone=body.phone or None,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        is_active=body.is_active,
        is_verified=True,   # super admin creates verified accounts
    )
    db.add(user)
    db.flush()

    db.add(UserSettings(user_id=user.id))

    # If a facility is provided, create a FacilityMember link
    if body.facility_id:
        facility = db.query(Facility).filter(Facility.id == body.facility_id).first()
        if not facility:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Facility not found")
        db.add(FacilityMember(
            facility_id=body.facility_id,
            user_id=user.id,
            facility_role=FacilityRole.staff,
        ))

    db.commit()
    db.refresh(user)

    fac_map = _facility_map(db, [user.id])
    return _build_list_item(user, fac_map)


@router.get("/{user_id}", response_model=UserDetailItem)
def get_user(
    user_id: int,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    fac_map = _facility_map(db, [user.id])
    base = _build_list_item(user, fac_map)

    docs = (
        db.query(Document)
        .filter(Document.user_id == user_id)
        .order_by(Document.created_at.desc())
        .all()
    )
    doc_items = [
        DocumentBrief(
            id=d.id,
            doc_type=d.doc_type.value if hasattr(d.doc_type, "value") else d.doc_type,
            original_filename=d.original_filename,
            status=d.status,
            uploaded_at=d.created_at,
            expiry_date=d.expiry_date,
        )
        for d in docs
    ]

    return UserDetailItem(**base.model_dump(), documents=doc_items)


@router.put("/{user_id}", response_model=UserListItem)
def update_user(
    user_id: int,
    body: UpdateUserBody,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_role = user.role

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.email is not None:
        user.email = body.email
    if body.phone is not None:
        user.phone = body.phone
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active

    # Update facility assignment
    if body.facility_id is not None:
        # Remove existing memberships
        db.query(FacilityMember).filter(FacilityMember.user_id == user.id).delete()
        if body.facility_id != 0:
            db.add(FacilityMember(
                facility_id=body.facility_id,
                user_id=user.id,
                facility_role=FacilityRole.staff,
            ))

    # Log role change if the role was updated
    if body.role is not None and body.role != old_role:
        log_activity(
            db,
            actor=current_user,
            action=ActivityActionType.role_updated,
            description=f"Changed {user.full_name}'s role from {old_role.value} to {body.role.value}",
            entity_type="role",
            entity_id=user.id,
        )

    db.commit()
    db.refresh(user)

    fac_map = _facility_map(db, [user.id])
    return _build_list_item(user, fac_map)


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
def reset_user_password(
    user_id: int,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Email the user a 6-digit password reset code.

    Same code as the self-service Forgot Password flow, so the user enters it
    under Forgot Password → "I already have a code" and sets their own password.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reset password for a deactivated account.",
        )

    otp_service.issue_code(db, user, OtpPurpose.password_reset)
    return MessageResponse(message=f"Password reset code sent to {user.email}")


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    db.commit()


@router.post("/{user_id}/documents", response_model=DocumentBrief, status_code=status.HTTP_201_CREATED)
def upload_document_for_user(
    user_id: int,
    file: UploadFile = File(...),
    docType: DocumentType = Form(...),
    documentNumber: Optional[str] = Form(None),
    issueDate: Optional[date] = Form(None),
    expiryDate: Optional[date] = Form(None),
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Super admin uploads a document on behalf of a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if expiryDate and issueDate and expiryDate <= issueDate:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expiry date must be after the issue date")

    relative_path, size = storage.save_upload(file, user_id)

    document = Document(
        user_id=user_id,
        doc_type=docType,
        document_number=documentNumber,
        file_path=relative_path,
        original_filename=file.filename or "upload",
        content_type=file.content_type,
        file_size=size,
        issue_date=issueDate,
        expiry_date=expiryDate,
        status=DocumentStatus.pending,
    )
    db.add(document)

    log_activity(
        db,
        actor=current_user,
        action=ActivityActionType.document_uploaded,
        description=f"Uploaded {DOCUMENT_TYPE_LABELS.get(docType, docType.value)} for {user.full_name}",
        entity_type="document",
        entity_id=None,
    )
    db.commit()
    db.refresh(document)

    return DocumentBrief(
        id=document.id,
        doc_type=document.doc_type.value if hasattr(document.doc_type, "value") else document.doc_type,
        original_filename=document.original_filename,
        status=document.status,
        uploaded_at=document.created_at,
        expiry_date=document.expiry_date,
    )
