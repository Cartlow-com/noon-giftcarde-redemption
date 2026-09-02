from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.database import SessionLocal, init_db
from app.config.settings import settings
from app.modules.batches.routes.routes import router as batches_router
from app.modules.login.routes.routes import router as login_router
from seeders.seed_users import seed_users


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


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
