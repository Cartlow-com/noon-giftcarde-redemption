import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.app import app
from app.config.database import Base, get_db
from seeders.seed_users import seed_users


@pytest.fixture
def client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = testing_session()
    seed_users(db)
    db.close()
    app.state.testing_session = testing_session

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        if hasattr(app.state, "testing_session"):
            delattr(app.state, "testing_session")


@pytest.fixture
def db_session(client: TestClient) -> Session:
    db = client.app.state.testing_session()
    try:
        yield db
    finally:
        db.close()


def login(
    client: TestClient,
    email: str = "user@example.com",
    password: str = "password123",
) -> dict[str, str]:
    response = client.post("/login", json={"email": email, "password": password})
    assert response.status_code == 201
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def login_admin(client: TestClient) -> dict[str, str]:
    return login(client, email="admin@example.com", password="admin123")
