#!/usr/bin/env python3
"""
Probe proxies.csv and write proxies.ok.csv with only TCP-reachable entries.

Usage (from repo root or backend/):
  PYTHONPATH=backend uv run python backend/scripts/filter_ok_proxies.py
  PYTHONPATH=backend uv run python backend/scripts/filter_ok_proxies.py --workers 80 --timeout 1.0
"""

from __future__ import annotations

import argparse
import csv
import socket
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_CSV = REPO_ROOT / "proxies.csv"
OUT_CSV = REPO_ROOT / "proxies.ok.csv"

FIELDNAMES = ["id", "proxy", "type", "is_blocked", "created_at", "updated_at"]


def _parse_host_port(raw: str) -> tuple[str, int] | None:
    text = str(raw or "").strip()
    if "://" in text:
        text = text.split("://", 1)[1]
    if ":" not in text:
        return None
    host, port_s = text.rsplit(":", 1)
    try:
        return host.strip(), int(port_s.strip())
    except ValueError:
        return None


def _tcp_ok(host: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Write proxies.ok.csv from live TCP probes")
    parser.add_argument("--src", type=Path, default=SRC_CSV)
    parser.add_argument("--out", type=Path, default=OUT_CSV)
    parser.add_argument("--workers", type=int, default=80)
    parser.add_argument("--timeout", type=float, default=1.0)
    parser.add_argument("--max-scan", type=int, default=0, help="0 = all rows")
    parser.add_argument("--limit-ok", type=int, default=0, help="Stop after N OK (0 = no limit)")
    args = parser.parse_args()

    if not args.src.is_file():
        print(f"Missing source CSV: {args.src}", file=sys.stderr)
        return 1

    rows: list[dict[str, str]] = []
    with args.src.open(newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if str(row.get("is_blocked") or "0").strip() == "1":
                continue
            parsed = _parse_host_port(row.get("proxy") or "")
            if not parsed:
                continue
            rows.append(row)
            if args.max_scan and len(rows) >= args.max_scan:
                break

    print(f"Scanning {len(rows)} unblocked proxies with {args.workers} workers…")
    ok_rows: list[dict[str, str]] = []

    def check(row: dict[str, str]) -> dict[str, str] | None:
        parsed = _parse_host_port(row.get("proxy") or "")
        if not parsed:
            return None
        host, port = parsed
        if _tcp_ok(host, port, args.timeout):
            return row
        return None

    scanned = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(check, row): row for row in rows}
        for fut in as_completed(futures):
            scanned += 1
            hit = fut.result()
            if hit:
                ok_rows.append(hit)
                if args.limit_ok and len(ok_rows) >= args.limit_ok:
                    break
            if scanned % 500 == 0 or (hit and len(ok_rows) % 25 == 0):
                print(f"  scanned={scanned} ok={len(ok_rows)}")

    # Stable order by id
    def sort_key(row: dict[str, str]) -> int:
        try:
            return int(row.get("id") or 0)
        except ValueError:
            return 0

    ok_rows.sort(key=sort_key)

    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        for row in ok_rows:
            out = {key: row.get(key, "") for key in FIELDNAMES}
            out["is_blocked"] = "0"
            writer.writerow(out)

    print(f"Wrote {len(ok_rows)} OK proxies → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
