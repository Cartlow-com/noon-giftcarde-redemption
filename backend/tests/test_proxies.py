import csv
from pathlib import Path

from app.modules.proxies.services.pool import (
    _parse_proxy,
    block_proxy,
    load_proxies,
    pick_next_proxy,
    proxy_to_dict,
    reset_pool_for_tests,
)


def test_parse_proxy_https_scheme_becomes_http() -> None:
    assert _parse_proxy("HTTPS://20.111.54.16:80") == ("http", "20.111.54.16", 80)
    assert _parse_proxy("http://1.2.3.4:8080") == ("http", "1.2.3.4", 8080)


def test_pick_and_block_from_temp_csv(tmp_path: Path, monkeypatch) -> None:
    reset_pool_for_tests()
    csv_path = tmp_path / "proxies.csv"
    blocked_path = tmp_path / "proxies_blocked.json"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "proxy", "type", "is_blocked", "created_at", "updated_at"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "id": "1",
                "proxy": "HTTPS://127.0.0.1:9",
                "type": "test",
                "is_blocked": "0",
                "created_at": "",
                "updated_at": "",
            }
        )
        writer.writerow(
            {
                "id": "2",
                "proxy": "HTTPS://127.0.0.1:10",
                "type": "test",
                "is_blocked": "1",
                "created_at": "",
                "updated_at": "",
            }
        )
        writer.writerow(
            {
                "id": "3",
                "proxy": "HTTPS://127.0.0.1:11",
                "type": "test",
                "is_blocked": "0",
                "created_at": "",
                "updated_at": "",
            }
        )

    import app.modules.proxies.services.pool as pool_mod

    monkeypatch.setattr(pool_mod, "_DEFAULT_CSV", csv_path)
    monkeypatch.setattr(pool_mod, "_OK_CSV", tmp_path / "missing.ok.csv")
    monkeypatch.setattr(pool_mod, "_BLOCKED_PATH", blocked_path)

    assert load_proxies(force=True) == 3
    entry = pick_next_proxy(probe=False)
    assert entry.id in (1, 3)
    data = proxy_to_dict(entry)
    assert data["host"] == "127.0.0.1"
    assert data["port"] in (9, 11)

    assert block_proxy(entry.id) is True
    other = pick_next_proxy(probe=False)
    assert other.id != entry.id
    assert other.id in (1, 3)
    assert blocked_path.is_file()

    reset_pool_for_tests()


def test_pick_next_does_not_deadlock_without_preload(tmp_path: Path, monkeypatch) -> None:
    """Regression: first /proxies/next must not hang on nested lock."""
    reset_pool_for_tests()
    csv_path = tmp_path / "proxies.csv"
    blocked_path = tmp_path / "proxies_blocked.json"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "proxy", "type", "is_blocked", "created_at", "updated_at"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "id": "7",
                "proxy": "HTTPS://127.0.0.1:9",
                "type": "test",
                "is_blocked": "0",
                "created_at": "",
                "updated_at": "",
            }
        )

    import app.modules.proxies.services.pool as pool_mod

    monkeypatch.setattr(pool_mod, "_DEFAULT_CSV", csv_path)
    monkeypatch.setattr(pool_mod, "_OK_CSV", tmp_path / "missing.ok.csv")
    monkeypatch.setattr(pool_mod, "_BLOCKED_PATH", blocked_path)

    entry = pick_next_proxy(probe=False)
    assert entry.id == 7
    reset_pool_for_tests()
