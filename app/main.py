
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.admin import router as admin_router
from app.auth import router as auth_router
from app.documents import router as documents_router
from app.database import check_database, engine
from app.models import Base


# Frontend files live inside app/static/
STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create missing tables without deleting existing data.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="DocuGuard - TrustVault",
    version="0.1.0",
    description=(
        "Secure document sharing with backend-enforced authorization, "
        "access revocation, and tamper-evident audit trails."
    ),
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True},
)


# Serve CSS and JavaScript files from /static/
app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static",
)


# Register the existing API routers.
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(admin_router)


# Main frontend page.
@app.get("/", response_class=FileResponse)
def root():
    index_file = STATIC_DIR / "index.html"

    if not index_file.is_file():
        raise HTTPException(
            status_code=500,
            detail="Frontend file app/static/index.html was not found.",
        )

    return FileResponse(
        path=index_file,
        media_type="text/html",
    )


# Basic application health check.
@app.get("/health")
def health():
    return {"status": "ok"}


# Database health check.
@app.get("/health/db")
def database_health():
    try:
        check_database()
        return {"database": "connected"}
    except Exception as exc:
        # Avoid exposing database credentials or internal error details.
        print(
            f"Database health check failed: {type(exc).__name__}",
            flush=True,
        )
        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        ) from exc
