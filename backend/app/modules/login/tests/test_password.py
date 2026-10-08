from conftest import login, login_super_admin


def _bearer(body: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {body['access_token']}"}


def _create_user(client, email: str = "new@example.com", password: str = "temp1234") -> str:
    created = client.post(
        "/users",
        headers=login_super_admin(client),
        json={"email": email, "password": password, "role": "user"},
    )
    assert created.status_code == 201
    assert created.json()["must_change_password"] is True
    return created.json()["id"]


def test_new_user_must_change_password_before_using_api(client) -> None:
    _create_user(client)
    headers = login(client, email="new@example.com", password="temp1234")

    me = client.get("/login/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["must_change_password"] is True

    blocked = client.get("/batches", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Password change required"

    changed = client.post(
        "/login/password",
        headers=headers,
        json={"current_password": "temp1234", "new_password": "mine5678"},
    )
    assert changed.status_code == 200
    fresh = _bearer(changed.json())

    assert client.get("/login/me", headers=fresh).json()["must_change_password"] is False
    assert client.get("/batches", headers=fresh).status_code == 200
    # Old token is revoked; the admin-set password no longer works.
    assert client.get("/login/me", headers=headers).status_code == 401
    assert client.post(
        "/login", json={"email": "new@example.com", "password": "temp1234"}
    ).status_code == 401
    assert client.post(
        "/login", json={"email": "new@example.com", "password": "mine5678"}
    ).status_code == 201


def test_change_password_rejects_wrong_current_or_same_password(client) -> None:
    headers = login(client)
    wrong = client.post(
        "/login/password",
        headers=headers,
        json={"current_password": "nope-nope", "new_password": "another1"},
    )
    assert wrong.status_code == 400
    same = client.post(
        "/login/password",
        headers=headers,
        json={"current_password": "password123", "new_password": "password123"},
    )
    assert same.status_code == 400
    short = client.post(
        "/login/password",
        headers=headers,
        json={"current_password": "password123", "new_password": "short"},
    )
    assert short.status_code == 422
    # Nothing changed and the session is still valid.
    assert client.get("/login/me", headers=headers).status_code == 200


def test_change_password_requires_valid_token(client) -> None:
    body = {"current_password": "password123", "new_password": "another1"}
    assert client.post("/login/password", json=body).status_code == 401
    bad = {"Authorization": "Bearer not-a-token"}
    assert client.post("/login/password", headers=bad, json=body).status_code == 401


def test_admin_reset_forces_change_but_own_reset_does_not(client) -> None:
    user_id = _create_user(client, email="reset@example.com")
    super_headers = login_super_admin(client)
    users = client.get("/users", headers=super_headers).json()["users"]
    admin_id = next(u["id"] for u in users if u["email"] == "admin@innovidio.com")

    # Simulate the user having already changed it, then the admin resets it.
    headers = login(client, email="reset@example.com", password="temp1234")
    client.post(
        "/login/password",
        headers=headers,
        json={"current_password": "temp1234", "new_password": "mine5678"},
    )
    reset = client.patch(f"/users/{user_id}", headers=super_headers, json={"password": "again123"})
    assert reset.status_code == 200
    assert reset.json()["must_change_password"] is True

    own = client.patch(f"/users/{admin_id}", headers=super_headers, json={"password": "admin@456"})
    assert own.status_code == 200
    assert own.json()["must_change_password"] is False
