from app.app import app


def test_app_imports() -> None:
    assert app.title == "Noon Automation API"


def test_client_health(client) -> None:
    assert client.get("/health").status_code == 200
