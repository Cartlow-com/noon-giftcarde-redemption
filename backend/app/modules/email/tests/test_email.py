import json
from pathlib import Path
from unittest.mock import patch

from app.modules.email.helpers.templates import render_template
from conftest import login


def test_render_redeem_and_order_templates() -> None:
    redeem = render_template(
        "redeem_report",
        {
            "email": "a@b.com",
            "row_number": 1,
            "redeem_status": "success",
            "balance_before": 1.0,
            "balance_after": 5.0,
            "balance_delta": 4.0,
            "gift_card_masked": "****1234",
        },
    )
    assert "redeem" in redeem.subject.lower()
    assert "a@b.com" in redeem.body_text

    order = render_template(
        "order_report",
        {
            "email": "a@b.com",
            "row_number": 1,
            "order_id": "N123",
            "product_url": "https://www.noon.com/x",
            "purchased_at": "2026-09-03T10:00:00Z",
        },
    )
    assert "N123" in order.subject
    assert "https://www.noon.com/x" in order.body_text


def test_send_templated_email_writes_history(client) -> None:
    headers = login(client)
    sample = (
        "email,password,gift_card_number,gift_card_pin,product_url,quantity\n"
        "a@b.com,secret,1111222233334444,1234,https://www.noon.com/uae-en/product/N1/p/,1\n"
    )
    upload = _upload_csv(client, headers, sample)
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows", headers=headers).json()["rows"][0]["id"]

    with patch("app.modules.email.services.send_email.send_raw_email") as mocked:
        mocked.return_value = None
        response = client.post(
            "/emails/send",
            headers=headers,
            json={
                "template_key": "order_report",
                "to_email": "user@example.com",
                "context": {
                    "email": "user@example.com",
                    "row_number": 2,
                    "order_id": "ORD-1",
                    "product_url": "https://www.noon.com/p",
                },
                "related_batch_id": batch_id,
                "related_row_id": row_id,
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["history"]["status"] == "sent"
    assert body["history"]["to_email"] == "user@example.com"

    history = client.get("/emails/history", headers=headers, params={"to_email": "user@example.com"})
    assert history.status_code == 200
    assert history.json()["total"] >= 1


def test_send_templated_email_failure_still_writes_history(client) -> None:
    headers = login(client)
    with patch(
        "app.modules.email.services.send_email.send_raw_email",
        side_effect=RuntimeError("smtp down"),
    ):
        response = client.post(
            "/emails/send",
            headers=headers,
            json={
                "template_key": "redeem_report",
                "to_email": "user@example.com",
                "context": {"email": "user@example.com", "row_number": 1, "redeem_status": "success"},
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["history"]["status"] == "failed"
    assert "smtp down" in (body["history"]["error"] or "")


def _upload_csv(client, headers, content: str):
    return client.post(
        "/batches/upload",
        headers=headers,
        files={"file": ("orders.csv", content.encode("utf-8"), "text/csv")},
    )


def test_screenshot_upload_and_notify_gates(client, tmp_path) -> None:
    headers = login(client)
    sample = (
        "email,password,gift_card_number,gift_card_pin,product_url,quantity\n"
        "a@b.com,secret,1111222233334444,1234,https://www.noon.com/uae-en/product/N1/p/,1\n"
    )
    upload = _upload_csv(client, headers, sample)
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]
    row_id = client.get(f"/batches/{batch_id}/rows", headers=headers).json()["rows"][0]["id"]

    png = tmp_path / "shot.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\nfake")
    shot_dir = str(tmp_path / "shots")

    with (
        patch("app.modules.batches.services.save_screenshot.settings") as shot_settings,
        patch("app.modules.batches.services.notify_email.settings") as notify_settings,
    ):
        shot_settings.SCREENSHOT_STORAGE_DIR = shot_dir
        notify_settings.SCREENSHOT_STORAGE_DIR = shot_dir
        before = client.post(
            f"/batches/rows/{row_id}/screenshots",
            headers=headers,
            params={"kind": "before_redeem"},
            files={"file": ("before.png", png.read_bytes(), "image/png")},
        )
        after = client.post(
            f"/batches/rows/{row_id}/screenshots",
            headers=headers,
            params={"kind": "after_redeem"},
            files={"file": ("after.png", png.read_bytes(), "image/png")},
        )
        assert before.status_code == 200
        assert before.json()["screenshot_before_redeem"]
        assert after.status_code == 200

        blocked = client.post(f"/batches/rows/{row_id}/notify/redeem", headers=headers)
        assert blocked.status_code == 400

        client.patch(
            f"/batches/rows/{row_id}",
            headers=headers,
            json={"login_status": "success", "redeem_status": "already_redeemed"},
        )
        with patch("app.modules.email.services.send_email.send_raw_email") as mocked:
            mocked.return_value = None
            redeem_mail = client.post(f"/batches/rows/{row_id}/notify/redeem", headers=headers)
        assert redeem_mail.status_code == 200
        assert redeem_mail.json()["history"]["template_key"] == "redeem_report"
        paths = json.loads(redeem_mail.json()["history"]["attachment_paths"] or "[]")
        assert len(paths) >= 1

        order_blocked = client.post(f"/batches/rows/{row_id}/notify/order", headers=headers)
        assert order_blocked.status_code == 400

        client.patch(
            f"/batches/rows/{row_id}",
            headers=headers,
            json={
                "purchase_status": "success",
                "order_id": "NOON-99",
            },
        )
        order_shot = client.post(
            f"/batches/rows/{row_id}/screenshots",
            headers=headers,
            params={"kind": "after_order"},
            files={"file": ("order.png", png.read_bytes(), "image/png")},
        )
        assert order_shot.status_code == 200
        with patch("app.modules.email.services.send_email.send_raw_email") as mocked:
            mocked.return_value = None
            order_mail = client.post(f"/batches/rows/{row_id}/notify/order", headers=headers)
        assert order_mail.status_code == 200
        assert order_mail.json()["history"]["template_key"] == "order_report"
