from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.clock import today_ist
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.enums import ActivityActionType, DocumentStatus, DocumentType
from app.models.user import User
from app.schemas.base import MessageResponse
from app.schemas.document import (
    DocumentGroup,
    DocumentListResponse,
    DocumentOut,
    DocumentTypeOption,
)
from app.services import storage
from app.services.activity_log import log_activity
from app.services.labels import (
    DOCUMENT_TYPE_LABELS,
    DOCUMENT_TYPES_WITH_EXPIRY,
    DOCUMENT_TYPES_WITH_NUMBER,
    REQUIRED_DOCUMENT_TYPES,
)

router = APIRouter()

EXPIRY_WARNING_DAYS = 30


def _to_out(doc: Document) -> DocumentOut:
    days_left = (doc.expiry_date - today_ist()).days if doc.expiry_date else None
    return DocumentOut(
        id=doc.id,
        doc_type=doc.doc_type,
        doc_type_label=DOCUMENT_TYPE_LABELS.get(doc.doc_type, doc.doc_type.value),
        label=doc.label,
        display_name=doc.display_name,
        document_number=doc.document_number,
        original_filename=doc.original_filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        file_url=f"/api/v1/documents/{doc.id}/file",
        issue_date=doc.issue_date,
        expiry_date=doc.expiry_date,
        status=doc.status,
        rejection_reason=doc.rejection_reason,
        is_expiring_soon=days_left is not None and 0 <= days_left <= EXPIRY_WARNING_DAYS,
        days_until_expiry=days_left,
        created_at=doc.created_at,
    )


def _group_badge(docs: List[DocumentOut]) -> tuple[str, str]:
    """Collapse a type's documents into the one badge the card shows."""
    if not docs:
        return "Missing", "neutral"
    if any(d.status == DocumentStatus.expired for d in docs):
        return "Expired", "urgent"
    if any(d.status == DocumentStatus.rejected for d in docs):
        return "Rejected", "urgent"

    pending = sum(1 for d in docs if d.status == DocumentStatus.pending)
    if pending:
        return (f"{pending} Pending" if len(docs) > 1 else "Pending"), "warning"
    if any(d.is_expiring_soon for d in docs):
        return "Expiring Soon", "warning"
    return "Verified", "success"


def _refresh_expired(db: Session, docs: List[Document]) -> None:
    """Flip past-expiry documents to `expired` on read.

    A scheduled job would be better, but this keeps the badge honest without
    one, and only writes when something actually changed.
    """
    today = today_ist()
    changed = False
    for doc in docs:
        if (
            doc.expiry_date
            and doc.expiry_date < today
            and doc.status != DocumentStatus.expired
        ):
            doc.status = DocumentStatus.expired
            changed = True
    if changed:
        db.commit()


@router.get("", response_model=DocumentListResponse)
def list_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """My Documents screen — grouped into one card per document type."""
    docs = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    _refresh_expired(db, docs)

    by_type: dict[DocumentType, List[DocumentOut]] = {}
    for doc in docs:
        by_type.setdefault(doc.doc_type, []).append(_to_out(doc))

    # Show the role's required types even when nothing is uploaded yet, so the
    # screen can prompt for what is missing.
    ordered_types = list(REQUIRED_DOCUMENT_TYPES.get(current_user.role, []))
    ordered_types += [t for t in by_type if t not in ordered_types]

    groups = []
    for doc_type in ordered_types:
        items = by_type.get(doc_type, [])
        label, variant = _group_badge(items)
        groups.append(
            DocumentGroup(
                doc_type=doc_type,
                title=DOCUMENT_TYPE_LABELS[doc_type],
                status_label=label,
                status_variant=variant,
                documents=items,
            )
        )

    return DocumentListResponse(
        groups=groups,
        total=len(docs),
        verified_count=sum(1 for d in docs if d.status == DocumentStatus.verified),
        pending_count=sum(1 for d in docs if d.status == DocumentStatus.pending),
        expired_count=sum(1 for d in docs if d.status == DocumentStatus.expired),
    )


@router.get("/types", response_model=List[DocumentTypeOption])
def document_types(current_user: User = Depends(get_current_user)):
    """Fills the Document Type picker on the upload screen."""
    return [
        DocumentTypeOption(
            value=doc_type,
            label=label,
            requires_number=doc_type in DOCUMENT_TYPES_WITH_NUMBER,
            requires_expiry=doc_type in DOCUMENT_TYPES_WITH_EXPIRY,
        )
        for doc_type, label in DOCUMENT_TYPE_LABELS.items()
    ]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    # Named in camelCase rather than aliased: FastAPI applies Form(alias=...)
    # when parsing but not when generating the OpenAPI schema, so an alias here
    # would make /docs advertise a field name the endpoint rejects. Matching the
    # parameter name keeps the documented contract and the runtime in step.
    docType: DocumentType = Form(...),
    documentNumber: Optional[str] = Form(None),
    label: Optional[str] = Form(None),
    issueDate: Optional[date] = Form(None),
    expiryDate: Optional[date] = Form(None),
    confirmed: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload Document screen (multipart/form-data)."""
    doc_type, document_number = docType, documentNumber
    issue_date, expiry_date = issueDate, expiryDate

    if not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must confirm the document is valid and belongs to you",
        )
    if expiry_date and issue_date and expiry_date <= issue_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiry date must be after the issue date",
        )
    if expiry_date and expiry_date < today_ist():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This document has already expired"
        )

    relative_path, size = storage.save_upload(file, current_user.id)

    document = Document(
        user_id=current_user.id,
        doc_type=doc_type,
        label=label,
        document_number=document_number,
        file_path=relative_path,
        original_filename=file.filename or "upload",
        content_type=file.content_type,
        file_size=size,
        issue_date=issue_date,
        expiry_date=expiry_date,
        status=DocumentStatus.pending,
    )
    db.add(document)
    log_activity(
        db,
        actor=current_user,
        action=ActivityActionType.document_uploaded,
        description=f"Uploaded {DOCUMENT_TYPE_LABELS.get(doc_type, doc_type.value)}",
        entity_type="document",
        entity_id=None,  # document.id not yet assigned before commit
        facility_id=None,
    )
    db.commit()
    db.refresh(document)
    return _to_out(document)


@router.get("/{document_id}/file")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serves the file through an authenticated route rather than as a static
    asset, so one user cannot read another's credentials by guessing a URL."""
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    content = storage.read(doc.file_path)
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File is missing from storage")

    return Response(
        content,
        media_type=doc.content_type,
        headers={"Content-Disposition": storage.content_disposition("attachment", doc.original_filename)},
    )


@router.delete("/{document_id}", response_model=MessageResponse)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage.delete(doc.file_path)
    db.delete(doc)
    db.commit()
    return MessageResponse(message="Document deleted")
