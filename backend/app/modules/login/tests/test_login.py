def test_health_check(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_success(client) -> None:
    response = client.post(
        "/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


def test_login_invalid_credentials(client) -> None:
    response = client.post(
        "/login",
        json={"email": "user@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_me_requires_token(client) -> None:
    response = client.get("/login/me")
    assert response.status_code == 401


def test_login_revokes_previous_access_token(client) -> None:
    first = client.post(
        "/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert first.status_code == 201
    old_token = first.json()["access_token"]

    second = client.post(
        "/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert second.status_code == 201
    new_token = second.json()["access_token"]
    assert new_token != old_token

    stale = client.get("/login/me", headers={"Authorization": f"Bearer {old_token}"})
    assert stale.status_code == 401
    assert "sign in again" in stale.json()["detail"].lower() or "expired" in stale.json()["detail"].lower()

    fresh = client.get("/login/me", headers={"Authorization": f"Bearer {new_token}"})
    assert fresh.status_code == 200
    assert fresh.json()["email"] == "user@example.com"
