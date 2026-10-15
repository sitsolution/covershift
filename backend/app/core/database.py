from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # MySQL drops idle connections; revalidate before use
    pool_recycle=3600,
    echo=False,
)



if engine.dialect.name == "mysql":
    @event.listens_for(engine, "connect")
    def _use_ist(dbapi_connection, _record):
        """Stamp NOW()/server defaults in IST on every server.

        Timestamps are stored without a zone and read as IST (like shift
        times). A local MySQL usually runs in IST, but Railway's runs in UTC, so
        on live every created_at landed 5½ hours behind — "5h ago" on a
        notification created a moment earlier.
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("SET time_zone = '+05:30'")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
