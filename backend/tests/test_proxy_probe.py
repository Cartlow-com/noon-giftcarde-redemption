import csv
import socket
import threading
from pathlib import Path

import pytest

import app.modules.proxies.services.pool as pool_mod
from app.modules.proxies.services.pool import pick_next_proxy, reset_pool_for_tests
from app.modules.proxies.services.probe import tunnel_ok


def _fake_proxy(reply: bytes) -> tuple[int, threading.Thread]:
    """One-shot local server that reads a CONNECT request and sends `reply`."""
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]

    def serve() -> None:
        conn, _ = server.accept()
        with conn:
            conn.recv(1024)
            conn.sendall(reply)
        server.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    return port, thread


def test_tunnel_ok_accepts_connect_200() -> None:
    port, thread = _fake_proxy(b"HTTP/1.1 200 Connection established\r\n\r\n")
    assert tunnel_ok("http", "127.0.0.1", port, timeout=2, tls_check=False)
    thread.join(2)


def test_tunnel_ok_connect_200_but_tls_dies_is_rejected() -> None:
    """Seen live: proxy answers CONNECT 200 then drops the TLS handshake."""
    port, thread = _fake_proxy(b"HTTP/1.0 200 OK\r\n\r\n")
    assert not tunnel_ok("http", "127.0.0.1", port, timeout=2)
    thread.join(2)


def test_tunnel_ok_rejects_cdn_style_400() -> None:
    """Cloudflare edge IPs accept TCP on :80 but answer CONNECT with 400."""
    port, thread = _fake_proxy(b"HTTP/1.1 400 Bad Request\r\nServer: cloudflare\r\n\r\n")
    assert not tunnel_ok("http", "127.0.0.1", port, timeout=2)
    thread.join(2)


def test_tunnel_ok_rejects_silent_or_closed() -> None:
    port, thread = _fake_proxy(b"")
    assert not tunnel_ok("http", "127.0.0.1", port, timeout=2)
    thread.join(2)


def test_tunnel_ok_socks5_success() -> None:
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]

    def serve() -> None:
        conn, _ = server.accept()
        with conn:
            assert conn.recv(3) == b"\x05\x01\x00"
            conn.sendall(b"\x05\x00")
            conn.recv(1024)
            conn.sendall(b"\x05\x00\x00\x01" + b"\x00" * 6)
        server.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    assert tunnel_ok("socks5", "127.0.0.1", port, timeout=2, tls_check=False)
    thread.join(2)


def test_tunnel_ok_refused_port() -> None:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    assert not tunnel_ok("http", "127.0.0.1", port, timeout=1)


def _write_csv(path: Path, ids: list[int]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "proxy", "type", "is_blocked", "created_at", "updated_at"],
        )
        writer.writeheader()
        for pid in ids:
            writer.writerow(
                {"id": str(pid), "proxy": f"HTTPS://10.0.0.{pid}:80", "type": "t",
                 "is_blocked": "0", "created_at": "", "updated_at": ""}
            )


@pytest.fixture
def pool(tmp_path: Path, monkeypatch):
    reset_pool_for_tests()
    monkeypatch.setattr(pool_mod, "_DEFAULT_CSV", tmp_path / "proxies.csv")
    monkeypatch.setattr(pool_mod, "_OK_CSV", tmp_path / "proxies.ok.csv")
    monkeypatch.setattr(pool_mod, "_BLOCKED_PATH", tmp_path / "blocked.json")
    yield tmp_path
    reset_pool_for_tests()


def test_pick_next_never_returns_a_proxy_that_failed_probe(pool: Path, monkeypatch) -> None:
    _write_csv(pool / "proxies.csv", [1, 2, 3])
    monkeypatch.setattr(pool_mod, "tunnel_ok", lambda *a, **kw: False)
    with pytest.raises(ValueError, match="No working proxy"):
        pick_next_proxy(probe=True)


def test_pick_next_returns_the_proxy_that_tunnels(pool: Path, monkeypatch) -> None:
    _write_csv(pool / "proxies.csv", [1, 2, 3])
    monkeypatch.setattr(pool_mod, "tunnel_ok", lambda scheme, host, port: host == "10.0.0.2")
    assert pick_next_proxy(probe=True).id == 2


def test_empty_ok_file_means_no_proxies_not_raw_list(pool: Path) -> None:
    """A validated-but-empty OK list must not fall back to the 40k raw list."""
    _write_csv(pool / "proxies.csv", [1, 2, 3])
    _write_csv(pool / "proxies.ok.csv", [])
    with pytest.raises(ValueError, match="No unblocked proxies"):
        pick_next_proxy(probe=False)


def test_pick_next_returns_without_waiting_for_slow_probes(pool: Path, monkeypatch) -> None:
    import time

    _write_csv(pool / "proxies.csv", [1, 2, 3])

    def probe(scheme, host, port):
        if host == "10.0.0.2":
            return True
        time.sleep(2)
        return False

    monkeypatch.setattr(pool_mod, "tunnel_ok", probe)
    started = time.monotonic()
    assert pick_next_proxy(probe=True).id == 2
    assert time.monotonic() - started < 1.0


def test_proxies_next_is_switched_off_by_default(client) -> None:
    from conftest import login

    resp = client.get("/proxies/next", headers=login(client))
    assert resp.status_code == 409
    assert "switched off" in resp.json()["detail"]
    assert client.get("/runs/config").json()["proxy_rotation_enabled"] is False


def test_proxies_next_works_when_enabled(client, pool: Path, monkeypatch) -> None:
    from app.config.settings import settings
    from conftest import login

    _write_csv(pool / "proxies.csv", [4])
    monkeypatch.setattr(settings, "PROXY_ROTATION_ENABLED", True)
    monkeypatch.setattr(pool_mod, "tunnel_ok", lambda *a, **kw: True)
    resp = client.get("/proxies/next", headers=login(client))
    assert resp.status_code == 200
    assert resp.json()["id"] == 4
