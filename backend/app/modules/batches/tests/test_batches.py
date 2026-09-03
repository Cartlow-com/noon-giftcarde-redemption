import io

import pytest

SAMPLE_CSV = """email,password,gift_card_number,gift_card_pin,product_url,quantity,redeemed_at,redeem_status,order_id,purchased_at,purchase_status,status
msajjadawan@hotmail.com,sajjad@noon,1100 1705 2778 3945,2724,https://www.noon.com/uae-en/product/N27674082A/p/,1,,,,,,pending
m.jammal@outlook.com,Jammal@12345,1100 1705 2260 5796,2257,https://www.noon.com/uae-en/product/N27674082A/p/,2,,,,,,pending
"""


def _upload_csv(client, csv_text: str, filename: str = "orders.csv"):
    return client.post(
        "/batches/upload",
        files={"file": (filename, io.BytesIO(csv_text.encode()), "text/csv")},
    )


def test_upload_list_and_rows(client) -> None:
    upload = _upload_csv(client, SAMPLE_CSV)
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]
    assert upload.json()["batch"]["total_rows"] == 2

    listing = client.get("/batches")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    detail = client.get(f"/batches/{batch_id}")
    assert detail.status_code == 200
    assert detail.json()["pending_count"] == 2

    rows = client.get(f"/batches/{batch_id}/rows")
    assert rows.status_code == 200
    assert rows.json()["total"] == 2


def test_pull_next_and_patch(client) -> None:
    upload = _upload_csv(client, SAMPLE_CSV)
    batch_id = upload.json()["batch"]["id"]

    next_row = client.get("/batches/rows/next", params={"batch_id": batch_id})
    assert next_row.status_code == 200
    row = next_row.json()
    assert row["status"] == "in_progress"
    row_id = row["id"]

    patched = client.patch(
        f"/batches/rows/{row_id}",
        json={
            "login_status": "success",
            "redeem_status": "success",
            "purchase_status": "success",
            "order_id": "NOON-123",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "completed"

    batch = client.get(f"/batches/{batch_id}")
    assert batch.json()["completed_count"] == 1
    assert batch.json()["in_progress_count"] == 0


def test_upload_rejects_bad_csv(client) -> None:
    response = _upload_csv(client, "email,password\na@b.com,secret")
    assert response.status_code == 400


def test_delete_batch(client) -> None:
    batch_id = _upload_csv(client, SAMPLE_CSV).json()["batch"]["id"]
    deleted = client.delete(f"/batches/{batch_id}")
    assert deleted.status_code == 204
    assert client.get(f"/batches/{batch_id}").status_code == 404


def test_redeem_success_stores_timestamp(client) -> None:
    upload = _upload_csv(client, SAMPLE_CSV)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]

    patched = client.patch(
        f"/batches/rows/{row_id}",
        json={
            "login_status": "success",
            "redeem_status": "success",
            "redeemed_at": "2026-09-01T12:30:00Z",
            "redeem_error": None,
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["redeem_status"] == "success"
    assert body["redeemed_at"] is not None
    assert body["status"] == "in_progress"


def test_already_redeemed_not_failed(client) -> None:
    upload = _upload_csv(client, SAMPLE_CSV)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]

    patched = client.patch(
        f"/batches/rows/{row_id}",
        json={
            "login_status": "success",
            "redeem_status": "already_redeemed",
            "redeem_error": "Gift card is already redeemed",
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["redeem_status"] == "already_redeemed"
    assert body["status"] == "in_progress"
    assert body["status"] != "failed"


def test_payment_issue_marks_partial(client) -> None:
    upload = _upload_csv(client, SAMPLE_CSV)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]

    patched = client.patch(
        f"/batches/rows/{row_id}",
        json={
            "login_status": "success",
            "redeem_status": "success",
            "purchase_status": "payment_issue",
            "purchase_error": "Insufficient credits — Select Payment Method required",
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["purchase_status"] == "payment_issue"
    assert body["status"] == "partial"


def test_get_screenshot_served_and_missing(client, tmp_path, monkeypatch) -> None:
    upload = _upload_csv(client, SAMPLE_CSV)
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows").json()["rows"][0]["id"]

    missing = client.get(f"/batches/rows/{row_id}/screenshots/before_redeem")
    assert missing.status_code == 404

    bad_kind = client.get(f"/batches/rows/{row_id}/screenshots/not_a_kind")
    assert bad_kind.status_code == 400

    png_bytes = b"\x89PNG\r\n\x1a\nfake-shot"
    monkeypatch.setattr(
        "app.modules.batches.services.save_screenshot.settings.SCREENSHOT_STORAGE_DIR",
        str(tmp_path / "shots"),
    )
    uploaded = client.post(
        f"/batches/rows/{row_id}/screenshots",
        params={"kind": "before_redeem"},
        files={"file": ("before.png", png_bytes, "image/png")},
    )
    assert uploaded.status_code == 200

    served = client.get(f"/batches/rows/{row_id}/screenshots/before_redeem")
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/png")
    assert served.content == png_bytes
