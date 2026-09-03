"""Build per-user dashboard snapshots for SSE."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.helpers.auth import resolve_owner_user_id
from app.modules.batches.models.response_models import ExtensionStatusResponse
from app.modules.batches.services.extension_presence import (
    get_extension_last_seen,
    is_extension_online,
)
from app.modules.batches.services.get_batch_rows import list_batch_rows
from app.modules.batches.services.get_batches import list_batches
from app.modules.batches.services.run_jobs import get_active_run


def build_dashboard_snapshot(
    db: Session,
    *,
    user_id: str | None,
    batch_id: str | None = None,
) -> dict[str, Any]:
    owner_id = resolve_owner_user_id(user_id, db)
    batches = list_batches(db, user_id=owner_id, limit=100)
    extension = ExtensionStatusResponse(
        online=is_extension_online(db, owner_id),
        last_seen_at=get_extension_last_seen(db, owner_id),
        ttl_seconds=settings.EXTENSION_HEARTBEAT_TTL_SECONDS,
    )
    active = get_active_run(db, user_id=owner_id)

    rows_payload: dict[str, Any] | None = None
    if batch_id:
        try:
            rows = list_batch_rows(batch_id, db, user_id=owner_id, limit=500)
            rows_payload = {
                "batch_id": batch_id,
                "rows": [row.model_dump(mode="json") for row in rows.rows],
                "total": rows.total,
            }
        except ValueError:
            rows_payload = {"batch_id": batch_id, "rows": [], "total": 0}

    return {
        "health": "ok",
        "extension": extension.model_dump(mode="json"),
        "active_run": active.model_dump(mode="json") if active else None,
        "batches": [b.model_dump(mode="json") for b in batches.batches],
        "batches_total": batches.total,
        "rows": rows_payload,
    }


def format_sse_event(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, separators=(",", ":"), default=str)
    return f"event: {event}\ndata: {payload}\n\n"
