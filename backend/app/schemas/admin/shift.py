import datetime as dt
from datetime import date, datetime, time
from typing import List, Optional

from pydantic import Field, model_validator

from app.models.enums import ShiftStatus, UserRole
from app.schemas.base import CamelModel


class AdminShiftRow(CamelModel):
    """One row in the Shift Management table."""

    id: int
    reference: str                 # "#SH-2291"
    title: Optional[str] = None
    start_time: datetime
    end_time: datetime
    location: str
    specialty: str
    role: UserRole
    status: ShiftStatus
    #: What the table's Status column shows. Adds "pending" — an open shift
    #: that has applicants awaiting a decision — which is not a stored state.
    display_status: str
    assigned_staff: List[str] = []
    applicant_count: int = 0
    pay_rate: float
    is_urgent: bool
    is_night: bool = False
    is_weekend: bool = False
    shift_type: Optional[str] = None
    slots: int
    slots_filled: int


class AdminShiftListResponse(CamelModel):
    items: List[AdminShiftRow]
    total: int
    limit: int
    offset: int
    has_more: bool


class ApplicantRow(CamelModel):
    """A row in the Applicants table on admin Shift Details."""

    application_id: int
    staff_id: int
    name: str
    initials: str
    specialty: Optional[str] = None
    rating: float
    reviews_count: int
    shifts_completed: int
    is_verified: bool
    applied_at: datetime
    responded_at: Optional[datetime] = None
    status: str


class TimelineEntry(CamelModel):
    label: str
    at: Optional[datetime] = None
    done: bool


class AdminShiftDetail(AdminShiftRow):
    title: Optional[str] = None
    facility_id: int
    facility_name: str
    duration_hours: float
    overtime_rate: Optional[float] = None
    requirements: Optional[str] = None
    required_qualifications: List[str] = []
    required_certifications: List[str] = []
    amenities: List[str] = []
    description: Optional[str] = None
    is_visible: bool
    tags: List[str] = []
    applicants: List[ApplicantRow] = []
    timeline: List[TimelineEntry] = []
    created_at: datetime
    published_at: Optional[datetime] = None


class ShiftCreate(CamelModel):
    """The Create Shift form.

    Dates and times are sent separately, exactly as the form controls collect
    them. `end_date` is the day the shift ends — the same as `date` for a
    daytime shift, the next day for a night shift. Without it, an end time
    earlier than the start rolls into the next day.
    """

    title: Optional[str] = Field(default=None, max_length=255)
    facility_id: Optional[int] = None      # defaults to the admin's own facility
    role: UserRole = UserRole.doctor
    specialty: str = Field(min_length=1, max_length=120)

    date: date                             # start date
    end_date: Optional[dt.date] = None
    start_time: time
    end_time: time

    pay_rate: float = Field(gt=0)
    overtime_rate: Optional[float] = Field(default=None, ge=0)
    slots: int = Field(default=1, ge=1, le=50)

    is_urgent: bool = False
    shift_type: Optional[str] = None   # Regular, Emergency, Weekend, Night
    requirements: Optional[str] = None
    required_qualifications: List[str] = []
    required_certifications: List[str] = []
    amenities: List[str] = []
    description: Optional[str] = None

    is_visible: bool = True
    notify_staff: bool = True
    publish: bool = True                   # false = "Save as Draft"

    @model_validator(mode="after")
    def check_role(self):
        if self.role in (UserRole.facility_admin, UserRole.super_admin):
            raise ValueError("A shift must target a staff role")
        return self


class ShiftUpdate(CamelModel):
    title: Optional[str] = None
    specialty: Optional[str] = None
    # dt.date, not date: a field named `date` shadows the type inside the class
    # body, which turned this into a field that only ever accepted None.
    date: Optional[dt.date] = None
    end_date: Optional[dt.date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    pay_rate: Optional[float] = Field(default=None, gt=0)
    overtime_rate: Optional[float] = Field(default=None, ge=0)
    slots: Optional[int] = Field(default=None, ge=1, le=50)
    is_urgent: Optional[bool] = None
    requirements: Optional[str] = None
    required_qualifications: Optional[List[str]] = None
    required_certifications: Optional[List[str]] = None
    amenities: Optional[List[str]] = None
    description: Optional[str] = None
    is_visible: Optional[bool] = None


class AssignRequest(CamelModel):
    application_id: int


class CancelShiftRequest(CamelModel):
    reason: Optional[str] = Field(default=None, max_length=255)


class RejectApplicantRequest(CamelModel):
    reason: Optional[str] = Field(default=None, max_length=255)


class ShiftFormOptions(CamelModel):
    """Populates the Create Shift dropdowns from real data."""

    facilities: List[dict]
    specialties: List[str]
    qualifications: List[str]
    certifications: List[str]
    shift_types: List[str]
