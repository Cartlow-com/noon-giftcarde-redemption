from conftest import login, login_super_admin


def test_seeded_super_admin_role(client) -> None:
    headers = login_super_admin(client)
    me = client.get("/login/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "admin@innovidio.com"
    assert body["role"] == "super_admin"


def test_admin_example_is_not_super_admin(client) -> None:
    headers = login(client, email="admin@example.com", password="admin123")
    me = client.get("/login/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "user"


def test_users_forbidden_for_regular_user(client) -> None:
    headers = login(client)
    assert client.get("/users", headers=headers).status_code == 403


def test_super_admin_user_crud(client) -> None:
    headers = login_super_admin(client)
    listed = client.get("/users", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] >= 3

    created = client.post(
        "/users",
        headers=headers,
        json={"email": "ops@example.com", "password": "secret12", "role": "user"},
    )
    assert created.status_code == 201
    user_id = created.json()["id"]

    patched = client.patch(
        f"/users/{user_id}",
        headers=headers,
        json={"password": "newpass1"},
    )
    assert patched.status_code == 200

    deactivated = client.delete(f"/users/{user_id}", headers=headers)
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    login_fail = client.post(
        "/login",
        json={"email": "ops@example.com", "password": "newpass1"},
    )
    assert login_fail.status_code == 401


def test_cannot_deactivate_last_super_admin(client) -> None:
    headers = login_super_admin(client)
    users = client.get("/users", headers=headers).json()["users"]
    admin = next(u for u in users if u["email"] == "admin@innovidio.com")
    blocked = client.delete(f"/users/{admin['id']}", headers=headers)
    assert blocked.status_code == 400


def test_deactivated_user_token_rejected(client) -> None:
    super_headers = login_super_admin(client)
    created = client.post(
        "/users",
        headers=super_headers,
        json={"email": "temp@example.com", "password": "secret12", "role": "user"},
    )
    assert created.status_code == 201
    user_id = created.json()["id"]

    user_headers = login(client, email="temp@example.com", password="secret12")
    assert client.get("/batches", headers=user_headers).status_code == 200

    assert client.delete(f"/users/{user_id}", headers=super_headers).status_code == 200
    assert client.get("/batches", headers=user_headers).status_code == 401
