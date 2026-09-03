import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.batches.helpers.batch_stats import refresh_batch_counts
from app.modules.batches.helpers.ownership import get_owned_batch, get_owned_run
from app.modules.batches.helpers.status import compute_row_status
from app.modules.batches.services.extension_presence import is_extension_online
from app.modules.batches.helpers.auth import resolve_owner_user_id
from app.modules.batches.models.db_models import (
    ROW_FAILED,
    ROW_IN_PROGRESS,
    ROW_PARTIAL,
    ROW_PENDING,
    STAGE_ALREADY_REDEEMED,
    STAGE_FAILED,
    STAGE_RUNNING,
    STAGE_SKIPPED,
    STAGE_SUCCESS,
    BatchRun,
    BatchRow,
)
from app.modules.batches.models.response_models import BatchRunResponse

ACTIVE_STATUSES = ("queued", "claimed", "running", "stopping")
TERMINAL_STATUSES = frozenset({"completed", "stopped", "failed"})
STOP_MESSAGE = "Stopped by user"


def _to_response(run: BatchRun) -> BatchRunResponse:
    return BatchRunResponse(
        id=run.id,
        batch_id=run.batch_id,
        row_ids=json.loads(run.row_ids_json),
        place_order=bool(run.place_order),
        send_redeem_emails=bool(run.send_redeem_emails),
        send_order_emails=bool(run.send_order_emails),
        hide_window=bool(getattr(run, "hide_window", 0)),
        login_only=bool(getattr(run, "login_only", 0)),
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
    hide_window: bool = False,
    login_only: bool = False,
    db: Session,
    user_id: str | None = None,
) -> BatchRunResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    batch = get_owned_batch(db, batch_id, owner_id)
    if not row_ids:
        raise ValueError("At least one row_id is required")

    unique_ids = list(dict.fromkeys(row_ids))
    rows = db.scalars(
        select(BatchRow).where(BatchRow.batch_id == batch_id, BatchRow.id.in_(unique_ids))
    ).all()
    if len(rows) != len(unique_ids):
        raise ValueError("One or more row_ids do not belong to this batch")

    existing = db.scalars(
        select(BatchRun)
        .where(BatchRun.user_id == owner_id, BatchRun.status.in_(ACTIVE_STATUSES))
        .limit(1)
    ).first()
    if existing:
        raise ValueError("Another run is already active — stop it first")

    if not is_extension_online(db, owner_id):
        raise ValueError(
            "Extension is not loaded/online — open Chrome with Noon Automation extension and sign in on the dashboard"
        )

    run = BatchRun(
        id=str(uuid.uuid4()),
        user_id=owner_id,
        batch_id=batch.id,
        row_ids_json=json.dumps(unique_ids),
        place_order=1 if place_order else 0,
        send_redeem_emails=1 if send_redeem_emails else 0,
        send_order_emails=1 if send_order_emails else 0,
        hide_window=1 if hide_window else 0,
        login_only=1 if login_only else 0,
        status="queued",
        message=f"Queued {len(unique_ids)} row(s)" + (" — login only" if login_only else ""),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_response(run)


def get_pending_run(db: Session, user_id: str | None = None) -> BatchRunResponse | None:
    query = select(BatchRun).where(BatchRun.status == "queued").order_by(BatchRun.created_at.asc())
    if user_id:
        query = query.where(BatchRun.user_id == user_id)
    run = db.scalars(query.limit(1)).first()
    return _to_response(run) if run else None


def get_run(run_id: str, db: Session, user_id: str | None = None) -> BatchRunResponse:
    run = get_owned_run(db, run_id, user_id)
    return _to_response(run)


def get_active_run(db: Session, user_id: str | None = None) -> BatchRunResponse | None:
    query = (
        select(BatchRun)
        .where(BatchRun.status.in_(ACTIVE_STATUSES))
        .order_by(BatchRun.created_at.desc())
    )
    if user_id:
        query = query.where(BatchRun.user_id == user_id)
    run = db.scalars(query.limit(1)).first()
    return _to_response(run) if run else None


def claim_batch_run(run_id: str, db: Session, user_id: str | None = None) -> BatchRunResponse:
    run = get_owned_run(db, run_id, user_id)
    if run.status != "queued":
        raise ValueError(f"Run is not claimable (status={run.status})")
    run.status = "running"
    run.message = "Claimed by extension"
    run.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(run)
    return _to_response(run)


def _finalize_interrupted_rows(run: BatchRun, db: Session) -> int:
    """Clear stuck in-progress/running stages for rows in this run."""
    try:
        row_ids = json.loads(run.row_ids_json)
    except json.JSONDecodeError:
        row_ids = []
    if not row_ids:
        return 0

    now = datetime.now(UTC)
    rows = db.scalars(
        select(BatchRow).where(
            BatchRow.batch_id == run.batch_id,
            BatchRow.id.in_(row_ids),
            BatchRow.status == ROW_IN_PROGRESS,
        )
    ).all()

    changed = 0
    for row in rows:
        touched = False
        if row.login_status == STAGE_RUNNING:
            row.login_status = STAGE_FAILED
            row.login_at = now
            row.login_error = STOP_MESSAGE
            touched = True
        if row.redeem_status == STAGE_RUNNING:
            row.redeem_status = STAGE_FAILED
            row.redeemed_at = now
            row.redeem_error = STOP_MESSAGE
            touched = True
        if row.purchase_status == STAGE_RUNNING:
            row.purchase_status = STAGE_SKIPPED
            row.purchased_at = now
            row.purchase_error = STOP_MESSAGE
            touched = True
        if touched or row.status == ROW_IN_PROGRESS:
            row.status = compute_row_status(
                row.login_status,
                row.redeem_status,
                row.purchase_status,
                current=row.status,
            )
            if row.status == ROW_IN_PROGRESS:
                if row.login_status == STAGE_FAILED:
                    row.status = ROW_FAILED
                elif row.redeem_status in (STAGE_SUCCESS, STAGE_ALREADY_REDEEMED):
                    row.status = ROW_PARTIAL
                else:
                    row.status = ROW_PENDING
            if row.run_finished_at is None and row.run_started_at is not None:
                row.run_finished_at = now
                started = row.run_started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=UTC)
                row.duration_ms = max(0, int((now - started).total_seconds() * 1000))
            changed += 1
    return changed


def stop_batch_run(run_id: str, db: Session, user_id: str | None = None) -> BatchRunResponse:
    run = get_owned_run(db, run_id, user_id)
    interrupted = _finalize_interrupted_rows(run, db)

    if run.status in TERMINAL_STATUSES:
        if interrupted:
            run.message = f"Cleared {interrupted} stuck in-progress row(s)"
            run.updated_at = datetime.now(UTC)
            db.commit()
            refresh_batch_counts(db, run.batch_id)
            db.refresh(run)
        return _to_response(run)

    run.stop_requested = 1
    run.status = "stopped"
    run.message = (
        f"Stopped — finalized {interrupted} in-progress row(s)"
        if interrupted
        else "Stopped"
    )
    run.updated_at = datetime.now(UTC)
    db.commit()
    refresh_batch_counts(db, run.batch_id)
    db.refresh(run)
    return _to_response(run)


def update_batch_run(
    run_id: str,
    *,
    status: str | None,
    message: str | None,
    db: Session,
    user_id: str | None = None,
) -> BatchRunResponse:
    run = get_owned_run(db, run_id, user_id)
    # Ignore late extension patches after stop/complete/fail.
    if run.status in TERMINAL_STATUSES:
        return _to_response(run)
    if status is not None:
        run.status = status
        if status == "stopped":
            run.stop_requested = 1
    if message is not None:
        run.message = message
    run.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(run)
    return _to_response(run)
