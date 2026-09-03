from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config.database import SessionLocal, init_db
from app.config.settings import settings
from app.modules.batches.routes.routes import router as batches_router
from app.modules.batches.routes.run_routes import router as runs_router
from app.modules.email.routes.routes import router as email_router
from app.modules.login.routes.routes import router as login_router
from seeders.seed_users import seed_users

ADMIN_DIR = Path(__file__).resolve().parent / "static" / "admin"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.APP_NAME, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(login_router)
app.include_router(batches_router)
app.include_router(runs_router)
app.include_router(email_router)

if ADMIN_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=ADMIN_DIR), name="dashboard_assets")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def dashboard() -> FileResponse:
    index = ADMIN_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return FileResponse(index)
