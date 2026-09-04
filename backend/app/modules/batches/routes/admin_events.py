"""SSE live updates for the admin dashboard."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, sessionmaker

from app.config.database import SessionLocal
from app.modules.batches.helpers.auth import require_auth, resolve_owner_user_id
from app.modules.batches.services.dashboard_events import (
    build_dashboard_delta,
    build_dashboard_snapshot,
    compute_dashboard_revision,
    format_sse_event,
)

router = APIRouter(tags=["admin-events"])

SNAPSHOT_INTERVAL_SECONDS = 2.0


def _session_factory(request: Request) -> sessionmaker[Session]:
    testing = getattr(request.app.state, "testing_session", None)
    if testing is not None:
        return testing
    return SessionLocal


def _interval_seconds(request: Request) -> float:
    override = getattr(request.app.state, "sse_interval", None)
    if isinstance(override, (int, float)) and override >= 0:
        return float(override)
    return SNAPSHOT_INTERVAL_SECONDS


async def _dashboard_event_stream(
    request: Request,
    *,
    user_id: str | None,
    batch_id: str | None,
    max_events: int | None,
) -> AsyncIterator[str]:
    factory = _session_factory(request)
    interval = _interval_seconds(request)
    sent = 0
    last_key: str | None = None
    last_revision: dict | None = None
    last_watermark: datetime | None = None

    while True:
        if await request.is_disconnected():
            break
        db = factory()
        try:
            if last_revision is None:
                snapshot = build_dashboard_snapshot(db, user_id=user_id, batch_id=batch_id)
                revision = snapshot.get("_revision") or {}
                last_revision = revision
                last_key = revision.get("key")
                last_watermark = revision.get("watermark")
                yield format_sse_event("dashboard", snapshot)
            else:
                owner_id = resolve_owner_user_id(user_id, db)
                revision = compute_dashboard_revision(
                    db, owner_id=owner_id, batch_id=batch_id
                )
                if revision["key"] == last_key:
                    yield format_sse_event(
                        "ping",
                        {"watermark": revision["watermark"].isoformat()},
                    )
                else:
                    since = last_watermark or revision["watermark"]
                    delta = build_dashboard_delta(
                        db,
                        user_id=user_id,
                        batch_id=batch_id,
                        since=since,
                        prev=last_revision,
                        revision=revision,
                    )
                    last_revision = delta.get("_revision") or revision
                    last_key = last_revision.get("key")
                    last_watermark = last_revision.get("watermark")
                    yield format_sse_event("dashboard_delta", delta)
        except Exception:
            yield format_sse_event(
                "dashboard",
                {
                    "health": "error",
                    "extension": {"online": False, "last_seen_at": None, "ttl_seconds": 0},
                    "active_run": None,
                    "batches": [],
                    "batches_total": 0,
                    "rows": None,
                    "watermark": None,
                },
            )
            last_revision = None
            last_key = None
            last_watermark = None
        finally:
            db.close()

        sent += 1
        if max_events is not None and sent >= max_events:
            break
        await asyncio.sleep(interval)


@router.get("/admin/events")
async def admin_events_route(
    request: Request,
    batch_id: str | None = Query(default=None),
    max_events: int | None = Query(default=None, ge=1, le=10),
    user_id: str | None = Depends(require_auth),
) -> StreamingResponse:
    stream = _dashboard_event_stream(
        request,
        user_id=user_id,
        batch_id=batch_id,
        max_events=max_events,
    )
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
