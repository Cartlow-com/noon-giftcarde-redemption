"""SSE live updates for the admin dashboard."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, sessionmaker

from app.config.database import SessionLocal
from app.modules.batches.helpers.auth import require_auth
from app.modules.batches.services.dashboard_events import (
    build_dashboard_snapshot,
    format_sse_event,
)

router = APIRouter(tags=["admin-events"])

SNAPSHOT_INTERVAL_SECONDS = 2.0


def _session_factory(request: Request) -> sessionmaker[Session]:
    testing = getattr(request.app.state, "testing_session", None)
    if testing is not None:
        return testing
    return SessionLocal


async def _dashboard_event_stream(
    request: Request,
    *,
    user_id: str | None,
    batch_id: str | None,
    max_events: int | None,
) -> AsyncIterator[str]:
    factory = _session_factory(request)
    sent = 0
    while True:
        if await request.is_disconnected():
            break
        db = factory()
        try:
            snapshot = build_dashboard_snapshot(db, user_id=user_id, batch_id=batch_id)
        except Exception:
            snapshot = {
                "health": "error",
                "extension": {"online": False, "last_seen_at": None, "ttl_seconds": 0},
                "active_run": None,
                "batches": [],
                "batches_total": 0,
                "rows": None,
            }
        finally:
            db.close()
        yield format_sse_event("dashboard", snapshot)
        sent += 1
        if max_events is not None and sent >= max_events:
            break
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)


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
