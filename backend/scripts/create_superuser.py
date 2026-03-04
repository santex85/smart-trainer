#!/usr/bin/env python3
"""Set is_superuser=True for a user by email. Use after applying migration 025.
Usage: from backend dir: python scripts/create_superuser.py admin@example.com"""
import sys
from pathlib import Path

# Ensure app is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/create_superuser.py <email>")
        sys.exit(1)
    email = sys.argv[1].strip()
    if not email:
        print("Provide a non-empty email.")
        sys.exit(1)

    engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
    with Session(engine) as session:
        user = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if not user:
            print(f"User with email {email!r} not found.")
            sys.exit(1)
        if user.is_superuser:
            print(f"User {email!r} is already a superuser.")
            sys.exit(0)
        user.is_superuser = True
        session.commit()
        print(f"Set is_superuser=True for {email!r}. They can now log in at /admin.")


if __name__ == "__main__":
    main()
