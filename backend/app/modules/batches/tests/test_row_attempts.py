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
