"""SSE dashboard events — snapshot, ping, delta."""

import io
import json
import time

from conftest import login
from app.modules.batches.services.dashboard_events import (
    build_dashboard_delta,
    build_dashboard_snapshot,
    compute_dashboard_revision,
)

SAMPLE_CSV = """email,password,gift_card_number,gift_card_pin,product_url,quantity,redeemed_at,redeem_status,order_id,purchased_at,purchase_status,status
a@example.com,secret1,1100 1705 2778 3945,2724,https://www.noon.com/uae-en/product/N27674082A/p/,1,,,,,,pending
b@example.com,secret2,1100 1705 2260 5796,2257,https://www.noon.com/uae-en/product/N27674082A/p/,2,,,,,,pending
"""


def _parse_sse_events(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in body.strip().split("\n\n"):
        if not block.strip():
            continue
        event_name = "message"
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("event:"):
                event_name = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].strip())
        if not data_lines:
            continue
        events.append((event_name, json.loads("\n".join(data_lines))))
    return events


def test_admin_events_requires_auth(client) -> None:
    response = client.get("/admin/events")
    assert response.status_code == 401


def test_admin_events_streams_dashboard_snapshot(client) -> None:
    headers = login(client)
    with client.stream("GET", "/admin/events?max_events=1", headers=headers) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")
        assert response.headers.get("cache-control") == "no-store"
        body = "".join(response.iter_text())

    events = _parse_sse_events(body)
    assert len(events) == 1
    name, data = events[0]
    assert name == "dashboard"
    assert data["health"] == "ok"
    assert "watermark" in data
    assert "extension" in data
    assert "batches" in data
    assert "active_run" in data
    assert "_revision" not in data


def test_admin_events_idle_sends_ping_not_full_batches(client) -> None:
    headers = login(client)
    client.app.state.sse_interval = 0.01
    try:
        with client.stream("GET", "/admin/events?max_events=2", headers=headers) as response:
            assert response.status_code == 200
            body = "".join(response.iter_text())
    finally:
        if hasattr(client.app.state, "sse_interval"):
            delattr(client.app.state, "sse_interval")

    events = _parse_sse_events(body)
    assert len(events) == 2
    assert events[0][0] == "dashboard"
    assert "batches" in events[0][1]
    assert events[1][0] == "ping"
    assert "watermark" in events[1][1]
    assert "batches" not in events[1][1]
    assert "rows" not in events[1][1]


def test_admin_events_batch_id_bootstraps_rows_without_secrets(client) -> None:
    headers = login(client)
    upload = client.post(
        "/batches/upload",
        headers=headers,
        files={"file": ("orders.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
    )
    batch_id = upload.json()["batch"]["id"]
    with client.stream(
        "GET",
        f"/admin/events?batch_id={batch_id}&max_events=1",
        headers=headers,
    ) as response:
        body = "".join(response.iter_text())
    events = _parse_sse_events(body)
    assert events[0][0] == "dashboard"
    rows_payload = events[0][1]["rows"]
    assert rows_payload["batch_id"] == batch_id
    assert rows_payload["replace"] is True
    assert len(rows_payload["rows"]) == 2
    for row in rows_payload["rows"]:
        assert "password" not in row
        assert "gift_card_pin" not in row


def test_dashboard_delta_changed_row_only_and_redacts_secrets(client, db_session) -> None:
    headers = login(client)
    upload = client.post(
        "/batches/upload",
        headers=headers,
        files={"file": ("orders.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
    )
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]
    rows = client.get(f"/batches/{batch_id}/rows", headers=headers).json()["rows"]
    assert len(rows) == 2
    row_id = rows[0]["id"]

    from sqlalchemy import select

    from app.modules.login.models.db_models import User

    db_session.expire_all()
    user = db_session.scalar(select(User).where(User.email == "user@example.com"))
    assert user is not None
    user_id = user.id

    before = compute_dashboard_revision(db_session, owner_id=user_id, batch_id=batch_id)
    snapshot = build_dashboard_snapshot(db_session, user_id=user_id, batch_id=batch_id)
    for row in (snapshot.get("rows") or {}).get("rows") or []:
        assert "password" not in row
        assert "gift_card_pin" not in row

    time.sleep(1.05)  # SQLite DateTime is second-resolution; ensure patched row > watermark
    patched = client.patch(
        f"/batches/rows/{row_id}",
        headers=headers,
        json={"login_status": "success"},
    )
    assert patched.status_code == 200
    db_session.expire_all()

    after = compute_dashboard_revision(db_session, owner_id=user_id, batch_id=batch_id)
    assert after["key"] != before["key"]

    delta = build_dashboard_delta(
        db_session,
        user_id=user_id,
        batch_id=batch_id,
        since=before["watermark"],
        prev=before,
    )
    assert "rows" in delta
    assert delta["rows"]["replace"] is False
    assert len(delta["rows"]["rows"]) == 1
    assert delta["rows"]["rows"][0]["id"] == row_id
    assert "password" not in delta["rows"]["rows"][0]
    assert "gift_card_pin" not in delta["rows"]["rows"][0]
    assert "batches" in delta  # batch counts refresh bumps batch.updated_at
