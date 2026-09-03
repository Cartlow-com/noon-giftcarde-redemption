"""SSE dashboard events."""

from conftest import login


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

    assert "event: dashboard" in body
    assert "data:" in body
    assert '"health"' in body
    assert '"extension"' in body
    assert '"batches"' in body
    assert '"active_run"' in body
