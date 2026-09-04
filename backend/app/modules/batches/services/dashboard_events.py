"""Build per-user dashboard snapshots and deltas for SSE."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.helpers.auth import resolve_owner_user_id
from app.modules.batches.models.db_models import Batch, BatchRow, BatchRun, ExtensionPresence
from app.modules.batches.models.response_models import (
    BatchRowResponse,
    BatchSummaryResponse,
    ExtensionStatusResponse,
)
from app.modules.batches.services.extension_presence import (
    get_extension_last_seen,
    is_extension_online,
)
from app.modules.batches.services.get_batch_rows import list_batch_rows
from app.modules.batches.services.get_batches import list_batches
from app.modules.batches.services.run_jobs import get_active_run

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_SSE_ROW_EXCLUDE = frozenset({"password", "gift_card_pin"})


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _iso(value: datetime) -> str:
    aware = _aware(value)
    assert aware is not None
    return aware.isoformat()


def _redact_row(row: BatchRowResponse) -> dict[str, Any]:
    data = row.model_dump(mode="json")
    for key in _SSE_ROW_EXCLUDE:
        data.pop(key, None)
    return data


def _max_timestamp(*values: datetime | None) -> datetime:
    stamps = [v for v in (_aware(x) for x in values) if v is not None]
    return max(stamps) if stamps else _EPOCH


def _naive_utc(value: datetime) -> datetime:
    aware = _aware(value) or _EPOCH
    return aware.replace(tzinfo=None)


def compute_dashboard_revision(
    db: Session,
    *,
    owner_id: str,
    batch_id: str | None = None,
) -> dict[str, Any]:
    batch_max = db.scalar(
        select(func.max(Batch.updated_at)).where(Batch.user_id == owner_id)
    )
    run_max = db.scalar(
        select(func.max(BatchRun.updated_at)).where(BatchRun.user_id == owner_id)
    )
    presence = db.get(ExtensionPresence, owner_id)
    presence_seen = _aware(presence.last_seen_at) if presence else None

    rows_max = None
    rows_total = 0
    if batch_id:
        rows_max = db.scalar(
            select(func.max(BatchRow.updated_at)).where(BatchRow.batch_id == batch_id)
        )
        rows_total = (
            db.scalar(
                select(func.count()).select_from(BatchRow).where(BatchRow.batch_id == batch_id)
            )
            or 0
        )

    batches_total = (
        db.scalar(select(func.count()).select_from(Batch).where(Batch.user_id == owner_id)) or 0
    )
    active = get_active_run(db, user_id=owner_id)
    extension_online = is_extension_online(db, owner_id)

    watermark = _max_timestamp(batch_max, run_max, presence_seen, rows_max)
    key = "|".join(
        [
            _iso(watermark),
            str(batches_total),
            str(rows_total),
            active.id if active else "",
            "1" if extension_online else "0",
            _iso(presence_seen) if presence_seen else "",
        ]
    )
    return {
        "key": key,
        "watermark": watermark,
        "batches_total": batches_total,
        "rows_total": rows_total,
        "active_run_id": active.id if active else None,
        "extension_online": extension_online,
        "extension_seen": presence_seen,
        "active_run": active,
    }


def build_dashboard_snapshot(
    db: Session,
    *,
    user_id: str | None,
    batch_id: str | None = None,
) -> dict[str, Any]:
    owner_id = resolve_owner_user_id(user_id, db)
    from app.modules.batches.services.run_jobs import reclaim_stale_user_runs

    reclaim_stale_user_runs(db, owner_id)
    revision = compute_dashboard_revision(db, owner_id=owner_id, batch_id=batch_id)
    batches = list_batches(db, user_id=owner_id, limit=100)
    extension = ExtensionStatusResponse(
        online=revision["extension_online"],
        last_seen_at=get_extension_last_seen(db, owner_id),
        ttl_seconds=settings.EXTENSION_HEARTBEAT_TTL_SECONDS,
    )
    active = revision["active_run"]

    rows_payload: dict[str, Any] | None = None
    if batch_id:
        try:
            rows = list_batch_rows(batch_id, db, user_id=owner_id, limit=500)
            rows_payload = {
                "batch_id": batch_id,
                "rows": [_redact_row(row) for row in rows.rows],
                "total": rows.total,
                "replace": True,
            }
        except ValueError:
            rows_payload = {"batch_id": batch_id, "rows": [], "total": 0, "replace": True}

    return {
        "health": "ok",
        "watermark": _iso(revision["watermark"]),
        "extension": extension.model_dump(mode="json"),
        "active_run": active.model_dump(mode="json") if active else None,
        "batches": [b.model_dump(mode="json") for b in batches.batches],
        "batches_total": batches.total,
        "rows": rows_payload,
        "_revision": revision,
    }


def build_dashboard_delta(
    db: Session,
    *,
    user_id: str | None,
    batch_id: str | None,
    since: datetime,
    prev: dict[str, Any],
    revision: dict[str, Any] | None = None,
) -> dict[str, Any]:
    owner_id = resolve_owner_user_id(user_id, db)
    if revision is None:
        revision = compute_dashboard_revision(db, owner_id=owner_id, batch_id=batch_id)
    since_naive = _naive_utc(since)
    since_aware = _aware(since) or _EPOCH
    payload: dict[str, Any] = {
        "health": "ok",
        "watermark": _iso(revision["watermark"]),
        "_revision": revision,
    }

    if (
        revision["extension_online"] != prev.get("extension_online")
        or revision["extension_seen"] != prev.get("extension_seen")
    ):
        payload["extension"] = ExtensionStatusResponse(
            online=revision["extension_online"],
            last_seen_at=get_extension_last_seen(db, owner_id),
            ttl_seconds=settings.EXTENSION_HEARTBEAT_TTL_SECONDS,
        ).model_dump(mode="json")

    if revision["active_run_id"] != prev.get("active_run_id"):
        active = revision["active_run"]
        payload["active_run"] = active.model_dump(mode="json") if active else None
    elif revision["active_run"] is not None:
        run_updated = _aware(revision["active_run"].updated_at)
        if run_updated and run_updated > since_aware:
            payload["active_run"] = revision["active_run"].model_dump(mode="json")

    if revision["batches_total"] != prev.get("batches_total"):
        batches = list_batches(db, user_id=owner_id, limit=100)
        payload["batches"] = [b.model_dump(mode="json") for b in batches.batches]
        payload["batches_total"] = batches.total
        payload["batches_replace"] = True
    else:
        changed = db.scalars(
            select(Batch)
            .where(Batch.user_id == owner_id, Batch.updated_at > since_naive)
            .order_by(Batch.updated_at.desc())
            .limit(100)
        ).all()
        if changed:
            payload["batches"] = [
                BatchSummaryResponse.model_validate(b).model_dump(mode="json") for b in changed
            ]
            payload["batches_total"] = revision["batches_total"]

    if batch_id:
        if revision["rows_total"] != prev.get("rows_total"):
            try:
                rows = list_batch_rows(batch_id, db, user_id=owner_id, limit=500)
                payload["rows"] = {
                    "batch_id": batch_id,
                    "rows": [_redact_row(row) for row in rows.rows],
                    "total": rows.total,
                    "replace": True,
                }
            except ValueError:
                payload["rows"] = {
                    "batch_id": batch_id,
                    "rows": [],
                    "total": 0,
                    "replace": True,
                }
        else:
            changed_rows = db.scalars(
                select(BatchRow)
                .where(BatchRow.batch_id == batch_id, BatchRow.updated_at > since_naive)
                .order_by(BatchRow.row_number)
                .limit(500)
            ).all()
            if changed_rows:
                payload["rows"] = {
                    "batch_id": batch_id,
                    "rows": [
                        _redact_row(BatchRowResponse.model_validate(r)) for r in changed_rows
                    ],
                    "total": revision["rows_total"],
                    "replace": False,
                }

    return payload


def public_event_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Strip internal keys before sending on the wire."""
    return {k: v for k, v in data.items() if not k.startswith("_")}


def format_sse_event(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(public_event_payload(data), separators=(",", ":"), default=str)
    return f"event: {event}\ndata: {payload}\n\n"
