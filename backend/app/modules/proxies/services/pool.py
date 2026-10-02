"""Proxy pool: load proxies.csv, pick random unblocked, mark blocked."""

from __future__ import annotations

import csv
import json
import random
import re
import socket
import threading
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

# pool.py → services → proxies → modules → app → backend → repo root
_REPO_ROOT = Path(__file__).resolve().parents[5]
_DEFAULT_CSV = _REPO_ROOT / "proxies.csv"
_OK_CSV = _REPO_ROOT / "proxies.ok.csv"
_BLOCKED_PATH = Path(__file__).resolve().parents[4] / "data" / "proxies_blocked.json"

_PROXY_RE = re.compile(
    r"^(?:(?P<scheme>https?|socks5?)://)?(?P<host>[^:/\s]+):(?P<port>\d+)\s*$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ProxyEntry:
    id: int
    raw: str
    host: str
    port: int
    scheme: str
    source_type: str


_lock = threading.RLock()
_loaded = False
_by_id: dict[int, ProxyEntry] = {}
_blocked: set[int] = set()


def _parse_proxy(raw: str) -> tuple[str, str, int] | None:
    text = str(raw or "").strip()
    if not text:
        return None
    match = _PROXY_RE.match(text)
    if match:
        scheme = (match.group("scheme") or "http").lower()
        if scheme == "https":
            scheme = "http"
        return scheme, match.group("host"), int(match.group("port"))
    if "://" not in text:
        text = "http://" + text
    parsed = urlparse(text)
    if not parsed.hostname or not parsed.port:
        return None
    scheme = (parsed.scheme or "http").lower()
    if scheme == "https":
        scheme = "http"
    return scheme, parsed.hostname, int(parsed.port)


def _load_blocked_file() -> set[int]:
    if not _BLOCKED_PATH.is_file():
        return set()
    try:
        data = json.loads(_BLOCKED_PATH.read_text(encoding="utf-8"))
        ids = data.get("blocked_ids") if isinstance(data, dict) else data
        return {int(x) for x in (ids or [])}
    except Exception:
        return set()


def _save_blocked_file(blocked: set[int]) -> None:
    _BLOCKED_PATH.parent.mkdir(parents=True, exist_ok=True)
    _BLOCKED_PATH.write_text(
        json.dumps({"blocked_ids": sorted(blocked)}),
        encoding="utf-8",
    )


def _resolve_csv_path(csv_path: Path | None = None) -> Path:
    if csv_path is not None:
        return csv_path
    # Prefer the filtered "known OK" list when present and non-empty.
    if _OK_CSV.is_file() and _OK_CSV.stat().st_size > 40:
        return _OK_CSV
    return _DEFAULT_CSV


def load_proxies(csv_path: Path | None = None, force: bool = False) -> int:
    """Load CSV into memory. Returns count of parsed proxies."""
    global _loaded, _by_id, _blocked
    path = _resolve_csv_path(csv_path)
    with _lock:
        if _loaded and not force:
            return len(_by_id)
        by_id: dict[int, ProxyEntry] = {}
        csv_blocked_ids: set[int] = set()
        if not path.is_file():
            _by_id = {}
            _blocked = _load_blocked_file()
            _loaded = True
            return 0

        with path.open(newline="", encoding="utf-8", errors="replace") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    pid = int(row.get("id") or 0)
                except ValueError:
                    continue
                if pid <= 0:
                    continue
                parsed = _parse_proxy(row.get("proxy") or "")
                if not parsed:
                    continue
                scheme, host, port = parsed
                by_id[pid] = ProxyEntry(
                    id=pid,
                    raw=str(row.get("proxy") or "").strip(),
                    host=host,
                    port=port,
                    scheme=scheme,
                    source_type=str(row.get("type") or "").strip(),
                )
                if str(row.get("is_blocked") or "0").strip() == "1":
                    csv_blocked_ids.add(pid)

        _by_id = by_id
        _blocked = _load_blocked_file() | csv_blocked_ids
        _loaded = True
        return len(_by_id)


def _ensure_loaded() -> None:
    if not _loaded:
        load_proxies()


def _tcp_alive(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def pick_next_proxy(exclude_ids: set[int] | None = None, probe: bool = True) -> ProxyEntry:
    """Return a random unblocked proxy. Optionally TCP-probe a few candidates."""
    _ensure_loaded()
    exclude = exclude_ids or set()
    with _lock:
        candidates = [
            _by_id[pid]
            for pid in _by_id
            if pid not in _blocked and pid not in exclude
        ]
    if not candidates:
        raise ValueError("No unblocked proxies available")

    random.shuffle(candidates)
    tries = candidates[:5] if probe else [candidates[0]]
    for entry in tries:
        if not probe or _tcp_alive(entry.host, entry.port):
            return entry
    return candidates[0]


def block_proxy(proxy_id: int) -> bool:
    """Mark proxy blocked. Returns True if id existed."""
    _ensure_loaded()
    with _lock:
        if proxy_id not in _by_id:
            return False
        _blocked.add(proxy_id)
        _save_blocked_file(_blocked)
        return True


def proxy_to_dict(entry: ProxyEntry) -> dict:
    return {
        "id": entry.id,
        "proxy": entry.raw,
        "host": entry.host,
        "port": entry.port,
        "scheme": entry.scheme,
        "type": entry.source_type,
    }


def reset_pool_for_tests() -> None:
    global _loaded, _by_id, _blocked
    with _lock:
        _loaded = False
        _by_id = {}
        _blocked = set()
