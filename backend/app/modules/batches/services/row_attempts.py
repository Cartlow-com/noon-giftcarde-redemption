"""Per-row automation attempt history (1st run, 2nd run, …)."""

from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.models.db_models import BatchRowAttempt
from app.modules.batches.models.request_models import CreateRowAttemptRequest
from app.modules.batches.models.response_models import RowAttemptListResponse, RowAttemptResponse


def _to_response(row: BatchRowAttempt) -> RowAttemptResponse:
    return RowAttemptResponse(
        id=row.id,
        row_id=row.row_id,
        batch_id=row.batch_id,
        batch_run_id=row.batch_run_id,
        attempt_number=row.attempt_number,
        login_status=row.login_status,
        redeem_status=row.redeem_status,
        purchase_status=row.purchase_status,
        status=row.status,
        outcome=row.outcome,
        message=row.message,
        login_error=row.login_error,
        redeem_error=row.redeem_error,
        purchase_error=row.purchase_error,
        order_id=row.order_id,
        duration_ms=row.duration_ms,
        created_at=row.created_at,
    )


def create_row_attempt(
    row_id: str,
    payload: CreateRowAttemptRequest,
    db: Session,
    user_id: str | None = None,
) -> RowAttemptResponse:
    owned = get_owned_row(db, row_id, user_id)
    next_num = (
        db.scalar(
            select(func.coalesce(func.max(BatchRowAttempt.attempt_number), 0)).where(
                BatchRowAttempt.row_id == row_id
            )
        )
        or 0
    ) + 1
    attempt = BatchRowAttempt(
        id=str(uuid.uuid4()),
        row_id=owned.id,
        batch_id=owned.batch_id,
        batch_run_id=payload.batch_run_id,
        attempt_number=next_num,
        login_status=payload.login_status,
        redeem_status=payload.redeem_status,
        purchase_status=payload.purchase_status,
        status=payload.status,
        outcome=payload.outcome,
        message=payload.message,
        login_error=payload.login_error,
        redeem_error=payload.redeem_error,
        purchase_error=payload.purchase_error,
        order_id=payload.order_id,
        duration_ms=payload.duration_ms,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _to_response(attempt)


def list_row_attempts(
    row_id: str,
    db: Session,
    user_id: str | None = None,
    limit: int = 50,
) -> RowAttemptListResponse:
    get_owned_row(db, row_id, user_id)
    rows = db.scalars(
        select(BatchRowAttempt)
        .where(BatchRowAttempt.row_id == row_id)
        .order_by(desc(BatchRowAttempt.attempt_number))
        .limit(limit)
    ).all()
    total = (
        db.scalar(
            select(func.count()).select_from(BatchRowAttempt).where(BatchRowAttempt.row_id == row_id)
        )
        or 0
    )
    return RowAttemptListResponse(
        attempts=[_to_response(r) for r in rows],
        total=total,
    )
