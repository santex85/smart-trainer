# Only import Base here so that Alembic (and any code that only needs metadata)
# can "from app.db.base import Base" or "from app.db import Base" without
# loading session.py and creating the async engine (which requires a valid
# DATABASE_URL and can fail in migration/deploy contexts).
from app.db.base import Base

__all__ = ["Base"]
