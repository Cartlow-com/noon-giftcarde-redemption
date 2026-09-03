import io

from app.modules.batches.services.extension_presence import clear_extension_heartbeat

SAMPLE_CSV = """email,password,gift_card_number,gift_card_pin,product_url,quantity
a@b.com,secret,1111222233334444,1234,https://www.noon.com/uae-en/product/N1/p/,1
c@d.com,secret2,1111222233335555,9999,https://www.noon.com/uae-en/product/N2/p/,1
"""


def _upload(client):
    return client.post(
        "/batches/upload",
        files={"file": ("orders.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
    )


def _mark_extension_online(client) -> None:
    clear_extension_heartbeat()
    assert client.get("/runs/pending").status_code == 200
    status = client.get("/runs/extension/status")
    assert status.status_code == 200
    assert status.json()["online"] is True


def test_rejects_run_when_extension_offline(client) -> None:
    clear_extension_heartbeat()
    upload = _upload(client)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]
    offline = client.get("/runs/extension/status")
    assert offline.status_code == 200
    assert offline.json()["online"] is False
    created = client.post("/runs", json={"batch_id": batch_id, "row_ids": [row_id]})
    assert created.status_code == 400
    assert "Extension" in created.json()["detail"]


def test_create_claim_stop_run(client) -> None:
    _mark_extension_online(client)
    upload = _upload(client)
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]
    rows = client.get(f"/batches/{batch_id}/rows").json()["rows"]
    row_ids = [rows[0]["id"]]

    created = client.post(
        "/runs",
        json={
            "batch_id": batch_id,
            "row_ids": row_ids,
            "place_order": True,
            "send_redeem_emails": True,
            "send_order_emails": False,
        },
    )
    assert created.status_code == 201
    run = created.json()
    assert run["status"] == "queued"
    assert run["row_ids"] == row_ids
    assert run["place_order"] is True
    assert run["send_redeem_emails"] is True
    assert run["hide_window"] is False

    pending = client.get("/runs/pending")
    assert pending.status_code == 200
    assert pending.json()["id"] == run["id"]

    claimed = client.post(f"/runs/{run['id']}/claim")
    assert claimed.status_code == 200
    assert claimed.json()["status"] == "running"

    stopped = client.post(f"/runs/{run['id']}/stop")
    assert stopped.status_code == 200
    assert stopped.json()["stop_requested"] is True
    assert stopped.json()["status"] == "stopped"

    active = client.get("/runs/active")
    assert active.status_code == 200
    assert active.json() is None


def test_rejects_second_active_run(client) -> None:
    _mark_extension_online(client)
    upload = _upload(client)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]
    first = client.post("/runs", json={"batch_id": batch_id, "row_ids": [row_id]})
    assert first.status_code == 201
    second = client.post("/runs", json={"batch_id": batch_id, "row_ids": [row_id]})
    assert second.status_code == 400


def test_config_expected_row_seconds(client) -> None:
    response = client.get("/runs/config")
    assert response.status_code == 200
    assert response.json()["expected_row_seconds"] >= 1
    assert "auth_required" in response.json()


def test_row_timing_patch(client) -> None:
    upload = _upload(client)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]
    patched = client.patch(
        f"/batches/rows/{row_id}",
        json={
            "run_started_at": "2026-09-03T10:00:00Z",
            "run_finished_at": "2026-09-03T10:02:30Z",
            "duration_ms": 150000,
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["duration_ms"] == 150000
    assert body["run_started_at"] is not None


def test_stop_finalizes_in_progress_row(client) -> None:
    _mark_extension_online(client)
    upload = _upload(client)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]

    created = client.post("/runs", json={"batch_id": batch_id, "row_ids": [row_id]})
    assert created.status_code == 201
    run = created.json()
    assert client.post(f"/runs/{run['id']}/claim").status_code == 200

    patched = client.patch(
        f"/batches/rows/{row_id}",
        json={
            "login_status": "success",
            "redeem_status": "already_redeemed",
            "purchase_status": "running",
            "status": "in_progress",
            "run_started_at": "2026-09-03T10:00:00Z",
        },
    )
    assert patched.status_code == 200

    stopped = client.post(f"/runs/{run['id']}/stop")
    assert stopped.status_code == 200
    assert stopped.json()["status"] == "stopped"
    assert "finalized" in stopped.json()["message"]

    row = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]
    assert row["id"] == row_id
    assert row["purchase_status"] == "skipped"
    assert row["purchase_error"] == "Stopped by user"
    assert row["status"] == "partial"
    assert row["run_finished_at"] is not None
    assert client.get("/runs/active").json() is None

    # Late extension PATCH must not revive a stopped run.
    late = client.patch(f"/runs/{run['id']}", json={"status": "completed", "message": "Completed"})
    assert late.status_code == 200
    assert late.json()["status"] == "stopped"


def test_create_run_login_only(client) -> None:
    _mark_extension_online(client)
    upload = _upload(client)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]
    created = client.post(
        "/runs",
        json={"batch_id": batch_id, "row_ids": [row_id], "login_only": True},
    )
    assert created.status_code == 201
    assert created.json()["login_only"] is True
    assert "login only" in created.json()["message"]


def test_create_run_hide_window(client) -> None:
    _mark_extension_online(client)
    upload = _upload(client)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]
    created = client.post(
        "/runs",
        json={
            "batch_id": batch_id,
            "row_ids": [row_id],
            "hide_window": True,
        },
    )
    assert created.status_code == 201
    assert created.json()["hide_window"] is True
    pending = client.get("/runs/pending")
    assert pending.status_code == 200
    assert pending.json()["hide_window"] is True


def test_heartbeat_marks_extension_online(client) -> None:
    clear_extension_heartbeat()
    before = client.get("/runs/extension/status")
    assert before.headers["cache-control"] == "no-store"
    assert before.json()["online"] is False
    beat = client.post("/runs/extension/heartbeat")
    assert beat.status_code == 200
    assert beat.headers["cache-control"] == "no-store"
    assert beat.json()["online"] is True
    after = client.get("/runs/extension/status")
    assert after.headers["cache-control"] == "no-store"
    assert after.json()["online"] is True
