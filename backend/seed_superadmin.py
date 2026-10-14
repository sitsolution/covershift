"""Run once to create the platform super admin account.

Usage:
    cd backend
    source .venv/bin/activate
    python seed_superadmin.py
"""
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.enums import UserRole

EMAIL    = "superadmin@coverline.app"
PASSWORD = "Admin@1234"

db = SessionLocal()
try:
    existing = db.query(User).filter(User.email == EMAIL).first()
    if existing:
        print(f"[skip] Super admin already exists (id={existing.id})")
    else:
        user = User(
            email=EMAIL,
            full_name="Super Admin",
            hashed_password=hash_password(PASSWORD),
            role=UserRole.super_admin,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[ok] Super admin created (id={user.id})")
        print(f"     Email:    {EMAIL}")
        print(f"     Password: {PASSWORD}")
finally:
    db.close()
