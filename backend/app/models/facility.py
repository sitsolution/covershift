from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.enums import AdminPermission, FacilityRole, FacilityType, enum_column


class Facility(Base):
    """A hospital / clinic that posts shifts.

    Separate from User: one admin may manage several facilities, and a facility
    outlives the admin account that registered it.
    """

    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    facility_type = Column(enum_column(FacilityType), nullable=False)

    city = Column(String(120), nullable=False, index=True)
    area = Column(String(120), nullable=True)      # "Kothrud", "Viman Nagar"
    state = Column(String(120), nullable=True)
    address = Column(Text, nullable=True)
    latitude = Column(Numeric(9, 6), nullable=True)
    longitude = Column(Numeric(9, 6), nullable=True)

    contact_email = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)
    rating = Column(Numeric(3, 2), default=0, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False, server_default="1")

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    shifts = relationship("Shift", back_populates="facility", cascade="all, delete-orphan")
    members = relationship("FacilityMember", back_populates="facility", cascade="all, delete-orphan")

    @property
    def initials(self) -> str:
        words = [w for w in self.name.split() if w[:1].isalnum()]
        if not words:
            return "?"
        if len(words) == 1:
            return words[0][:2].upper()
        return (words[0][0] + words[1][0]).upper()

    @property
    def location_label(self) -> str:
        return ", ".join(p for p in (self.area, self.city) if p)


class FacilityMember(Base):
    """Links a facility_admin user to a facility, with their authority there.

    Permissions are a comma-separated subset of AdminPermission — the checkbox
    list on the Add Admin User screen. A facility super_admin implicitly holds
    all of them.
    """

    __tablename__ = "facility_members"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    facility_role = Column(
        enum_column(FacilityRole),
        default=FacilityRole.manager,
        server_default=FacilityRole.manager.value,
        nullable=False,
    )
    permissions = Column(String(255), nullable=True)
    invited_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    facility = relationship("Facility", back_populates="members", foreign_keys=[facility_id])

    __table_args__ = (UniqueConstraint("facility_id", "user_id", name="uq_member_facility_user"),)

    @property
    def permission_list(self) -> list[str]:
        if self.facility_role == FacilityRole.super_admin:
            return [p.value for p in AdminPermission]
        return [p.strip() for p in (self.permissions or "").split(",") if p.strip()]

    def can(self, permission: AdminPermission) -> bool:
        return permission.value in self.permission_list


class FacilityStaff(Base):
    """A staff member a facility admin added to their facility's roster.

    Staff who apply to one of the facility's shifts belong to it too, but that
    link already lives on Application — this table holds only the manual adds.
    """

    __tablename__ = "facility_staff"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    added_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("facility_id", "user_id", name="uq_facility_staff"),)
