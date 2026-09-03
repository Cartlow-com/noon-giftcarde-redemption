from app.app import app


def test_app_imports() -> None:
    assert app.title == "Noon Automation API"


def test_client_health(client) -> None:
    assert client.get("/health").status_code == 200


def test_dashboard_served_at_root(client) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert b"Noon Automation" in response.content
    assert b"/assets/app.js" in response.content
    assert b"/assets/util.js" in response.content


def test_dashboard_assets_served(client) -> None:
    css = client.get("/assets/styles.css")
    detail = client.get("/assets/detail.css")
    js = client.get("/assets/app.js")
    util = client.get("/assets/util.js")
    assert css.status_code == 200
    assert detail.status_code == 200
    assert js.status_code == 200
    assert util.status_code == 200
    assert b"--noon" in css.content
    assert b"/batches" in js.content
