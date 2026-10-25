
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings

# Render PostgreSQL URLs may be provided as postgres:// or postgresql://.
# This project uses psycopg 3, so normalize the driver explicitly.
database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgres://"):]
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgresql://"):]

engine = create_engine(
    database_url,
    connect_args={"options": "-csearch_path=docuguard"},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def check_database() -> bool:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True


