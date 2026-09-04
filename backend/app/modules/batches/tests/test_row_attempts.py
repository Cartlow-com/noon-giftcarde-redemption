"""Row attempt history API."""

import io

from conftest import login

SAMPLE_CSV = """email,password,gift_card_number,gift_card_pin,product_url,quantity
a@b.com,secret,1111222233334444,1234,https://www.noon.com/uae-en/product/N1/p/,1
"""


def _upload(client, headers):
    return client.post(
        "/batches/upload",
        headers=headers,
        files={"file": ("orders.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
    )


def test_row_attempt_history(client) -> None:
    headers = login(client)
    upload = _upload(client, headers)
    row_id = client.get(
        f"/batches/{upload.json()['batch']['id']}/rows", headers=headers
    ).json()["rows"][0]["id"]

    empty = client.get(f"/batches/rows/{row_id}/attempts", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    first = client.post(
        f"/batches/rows/{row_id}/attempts",
        headers=headers,
        json={
            "outcome": "failed_login",
            "message": "Too many failed attempts",
            "login_status": "failed",
            "redeem_status": "pending",
            "purchase_status": "pending",
            "status": "failed",
            "login_error": "Too many failed attempts",
        },
    )
    assert first.status_code == 201
    assert first.json()["attempt_number"] == 1

    second = client.post(
        f"/batches/rows/{row_id}/attempts",
        headers=headers,
        json={
            "outcome": "completed",
            "message": "Order 123",
            "login_status": "success",
            "redeem_status": "already_redeemed",
            "purchase_status": "success",
            "status": "completed",
            "order_id": "123",
            "duration_ms": 45000,
        },
    )
    assert second.status_code == 201
    assert second.json()["attempt_number"] == 2

    listed = client.get(f"/batches/rows/{row_id}/attempts", headers=headers)
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 2
    assert body["attempts"][0]["attempt_number"] == 2
    assert body["attempts"][1]["attempt_number"] == 1


def test_row_attempt_start_then_patch(client) -> None:
    headers = login(client)
    upload = _upload(client, headers)
    row_id = client.get(
        f"/batches/{upload.json()['batch']['id']}/rows", headers=headers
    ).json()["rows"][0]["id"]

    started = client.post(
        f"/batches/rows/{row_id}/attempts",
        headers=headers,
        json={"outcome": "started", "status": "in_progress"},
    )
    assert started.status_code == 201
    attempt_id = started.json()["id"]

    finished = client.patch(
        f"/batches/attempts/{attempt_id}",
        headers=headers,
        json={
            "outcome": "completed",
            "status": "completed",
            "login_status": "success",
            "redeem_status": "success",
            "purchase_status": "success",
            "duration_ms": 1200,
        },
    )
    assert finished.status_code == 200
    assert finished.json()["id"] == attempt_id
    assert finished.json()["outcome"] == "completed"
    assert finished.json()["duration_ms"] == 1200


def test_screenshots_are_isolated_per_attempt(client, tmp_path, monkeypatch) -> None:
    headers = login(client)
    upload = _upload(client, headers)
    row_id = client.get(
        f"/batches/{upload.json()['batch']['id']}/rows", headers=headers
    ).json()["rows"][0]["id"]

    monkeypatch.setattr(
        "app.modules.batches.services.save_screenshot.settings.SCREENSHOT_STORAGE_DIR",
        str(tmp_path / "shots"),
    )
    monkeypatch.setattr(
        "app.modules.batches.services.get_screenshot.settings.SCREENSHOT_STORAGE_DIR",
        str(tmp_path / "shots"),
    )

    run1 = client.post(
        f"/batches/rows/{row_id}/attempts",
        headers=headers,
        json={"outcome": "started", "status": "in_progress"},
    ).json()
    run2 = client.post(
        f"/batches/rows/{row_id}/attempts",
        headers=headers,
        json={"outcome": "started", "status": "in_progress"},
    ).json()

    shot1 = b"\x89PNG\r\n\x1a\nrun-one"
    shot2 = b"\x89PNG\r\n\x1a\nrun-two"
    up1 = client.post(
        f"/batches/rows/{row_id}/screenshots",
        headers=headers,
        params={"kind": "before_redeem", "attempt_id": run1["id"]},
        files={"file": ("a.png", shot1, "image/png")},
    )
    up2 = client.post(
        f"/batches/rows/{row_id}/screenshots",
        headers=headers,
        params={"kind": "before_redeem", "attempt_id": run2["id"]},
        files={"file": ("b.png", shot2, "image/png")},
    )
    assert up1.status_code == 200
    assert up2.status_code == 200

    listed = client.get(f"/batches/rows/{row_id}/attempts", headers=headers).json()
    by_id = {a["id"]: a for a in listed["attempts"]}
    assert by_id[run1["id"]]["screenshot_before_redeem"]
    assert by_id[run2["id"]]["screenshot_before_redeem"]
    assert by_id[run1["id"]]["screenshot_before_redeem"] != by_id[run2["id"]]["screenshot_before_redeem"]

    get1 = client.get(
        f"/batches/rows/{row_id}/screenshots/before_redeem",
        headers=headers,
        params={"attempt_id": run1["id"]},
    )
    get2 = client.get(
        f"/batches/rows/{row_id}/screenshots/before_redeem",
        headers=headers,
        params={"attempt_id": run2["id"]},
    )
    assert get1.status_code == 200 and get1.content == shot1
    assert get2.status_code == 200 and get2.content == shot2

    latest = client.get(f"/batches/rows/{row_id}/screenshots/before_redeem", headers=headers)
    assert latest.status_code == 200
    assert latest.content == shot2
