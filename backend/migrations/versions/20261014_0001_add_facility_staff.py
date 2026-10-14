"""add facility_staff table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-14 00:01:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "facility_staff",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("facility_id", sa.Integer(), sa.ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("added_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("facility_id", "user_id", name="uq_facility_staff"),
    )
    op.create_index("ix_facility_staff_id", "facility_staff", ["id"])
    op.create_index("ix_facility_staff_facility_id", "facility_staff", ["facility_id"])
    op.create_index("ix_facility_staff_user_id", "facility_staff", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_facility_staff_user_id", table_name="facility_staff")
    op.drop_index("ix_facility_staff_facility_id", table_name="facility_staff")
    op.drop_index("ix_facility_staff_id", table_name="facility_staff")
    op.drop_table("facility_staff")
