import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.batches.services.extension_presence import is_extension_online
from app.modules.batches.models.db_models import Batch, BatchRun, BatchRow
from app.modules.batches.models.response_models import BatchRunResponse

ACTIVE_STATUSES = ("queued", "claimed", "running", "stopping")


def _to_response(run: BatchRun) -> BatchRunResponse:
    return BatchRunResponse(
        id=run.id,
        batch_id=run.batch_id,
        row_ids=json.loads(run.row_ids_json),
        place_order=bool(run.place_order),
        send_redeem_emails=bool(run.send_redeem_emails),
        send_order_emails=bool(run.send_order_emails),
        status=run.status,
        message=run.message,
        stop_requested=bool(run.stop_requested),
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def create_batch_run(
    *,
    batch_id: str,
    row_ids: list[str],
    place_order: bool,
    send_redeem_emails: bool,
    send_order_emails: bool,
    db: Session,
) -> BatchRunResponse:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise ValueError("Batch not found")
    if not row_ids:
        raise ValueError("At least one row_id is required")

    unique_ids = list(dict.fromkeys(row_ids))
    rows = db.scalars(
        select(BatchRow).where(BatchRow.batch_id == batch_id, BatchRow.id.in_(unique_ids))
    ).all()
    if len(rows) != len(unique_ids):
        raise ValueError("One or more row_ids do not belong to this batch")

    existing = db.scalars(
        select(BatchRun).where(BatchRun.status.in_(ACTIVE_STATUSES)).limit(1)
    ).first()
    if existing:
        raise ValueError("Another run is already active — stop it first")

    if not is_extension_online():
        raise ValueError("Extension is not loaded/online — open Chrome with Noon Automation extension")

    run = BatchRun(
        id=str(uuid.uuid4()),
        batch_id=batch_id,
        row_ids_json=json.dumps(unique_ids),
        place_order=1 if place_order else 0,
        send_redeem_emails=1 if send_redeem_emails else 0,
        send_order_emails=1 if send_order_emails else 0,
        status="queued",
        message=f"Queued {len(unique_ids)} row(s)",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_response(run)


def get_pending_run(db: Session) -> BatchRunResponse | None:
    run = db.scalars(
        select(BatchRun)
        .where(BatchRun.status == "queued")
        .order_by(BatchRun.created_at.asc())
        .limit(1)
    ).first()
    return _to_response(run) if run else None


def get_run(run_id: str, db: Session) -> BatchRunResponse:
    run = db.get(BatchRun, run_id)
    if not run:
        raise ValueError("Run not found")
    return _to_response(run)


def get_active_run(db: Session) -> BatchRunResponse | None:
    run = db.scalars(
        select(BatchRun)
        .where(BatchRun.status.in_(ACTIVE_STATUSES))
        .order_by(BatchRun.created_at.desc())
        .limit(1)
    ).first()
    return _to_response(run) if run else None


def claim_batch_run(run_id: str, db: Session) -> BatchRunResponse:
    run = db.get(BatchRun, run_id)
    if not run:
        raise ValueError("Run not found")
    if run.status != "queued":
        raise ValueError(f"Run is not claimable (status={run.status})")
    run.status = "running"
    run.message = "Claimed by extension"
    run.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(run)
    return _to_response(run)


def stop_batch_run(run_id: str, db: Session) -> BatchRunResponse:
    run = db.get(BatchRun, run_id)
    if not run:
        raise ValueError("Run not found")
    if run.status in ("completed", "stopped", "failed"):
        return _to_response(run)
    run.stop_requested = 1
    run.status = "stopping"
    run.message = "Stop requested"
    run.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(run)
    return _to_response(run)


def update_batch_run(
    run_id: str,
    *,
    status: str | None,
    message: str | None,
    db: Session,
) -> BatchRunResponse:
    run = db.get(BatchRun, run_id)
    if not run:
        raise ValueError("Run not found")
    if status is not None:
        run.status = status
        if status in ("stopped", "completed", "failed"):
            run.stop_requested = 1 if status == "stopped" else run.stop_requested
    if message is not None:
        run.message = message
    run.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(run)
    return _to_response(run)
