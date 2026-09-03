import io

from conftest import login, login_admin

SAMPLE_CSV = """email,password,gift_card_number,gift_card_pin,product_url,quantity
a@b.com,secret,1111222233334444,1234,https://www.noon.com/uae-en/product/N1/p/,1
"""


def _upload(client, headers):
    return client.post(
        "/batches/upload",
        headers=headers,
        files={"file": ("orders.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
    )


def test_batches_are_user_scoped(client) -> None:
    user_headers = login(client)
    admin_headers = login_admin(client)

    upload = _upload(client, user_headers)
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]

    own_list = client.get("/batches", headers=user_headers)
    assert own_list.status_code == 200
    assert own_list.json()["total"] == 1

    other_list = client.get("/batches", headers=admin_headers)
    assert other_list.status_code == 200
    assert other_list.json()["total"] == 0

    other_detail = client.get(f"/batches/{batch_id}", headers=admin_headers)
    assert other_detail.status_code == 404


def test_both_users_can_create_active_runs(client) -> None:
    user_headers = login(client)
    admin_headers = login_admin(client)

    client.post("/runs/extension/heartbeat", headers=user_headers)
    client.post("/runs/extension/heartbeat", headers=admin_headers)

    user_batch = _upload(client, user_headers).json()["batch"]["id"]
    admin_batch = _upload(client, admin_headers).json()["batch"]["id"]

    user_row = client.get(f"/batches/{user_batch}/rows", headers=user_headers).json()["rows"][0]["id"]
    admin_row = client.get(f"/batches/{admin_batch}/rows", headers=admin_headers).json()["rows"][0]["id"]

    user_run = client.post(
        "/runs",
        headers=user_headers,
        json={"batch_id": user_batch, "row_ids": [user_row]},
    )
    assert user_run.status_code == 201

    admin_run = client.post(
        "/runs",
        headers=admin_headers,
        json={"batch_id": admin_batch, "row_ids": [admin_row]},
    )
    assert admin_run.status_code == 201

    user_claim = client.post(f"/runs/{user_run.json()['id']}/claim", headers=user_headers)
    assert user_claim.status_code == 200
    assert user_claim.json()["status"] == "running"

    admin_claim = client.post(f"/runs/{admin_run.json()['id']}/claim", headers=admin_headers)
    assert admin_claim.status_code == 200
    assert admin_claim.json()["status"] == "running"

    assert client.get("/runs/active", headers=user_headers).json()["id"] == user_run.json()["id"]
    assert client.get("/runs/active", headers=admin_headers).json()["id"] == admin_run.json()["id"]


def test_user_cannot_claim_other_users_run(client) -> None:
    user_headers = login(client)
    admin_headers = login_admin(client)
    client.post("/runs/extension/heartbeat", headers=user_headers)

    batch_id = _upload(client, user_headers).json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows", headers=user_headers).json()["rows"][0]["id"]
    run = client.post(
        "/runs",
        headers=user_headers,
        json={"batch_id": batch_id, "row_ids": [row_id]},
    )
    assert run.status_code == 201
    run_id = run.json()["id"]

    stolen = client.post(f"/runs/{run_id}/claim", headers=admin_headers)
    assert stolen.status_code == 404

    pending_other = client.get("/runs/pending", headers=admin_headers)
    assert pending_other.status_code == 200
    assert pending_other.json() is None
