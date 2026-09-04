from sqlalchemy.orm import Session

from app.modules.batches.helpers.batch_stats import refresh_batch_counts
from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.helpers.status import compute_row_status
from app.modules.batches.models.db_models import STAGE_ALREADY_REDEEMED, STAGE_SUCCESS
from app.modules.batches.models.request_models import UpdateRowRequest
from app.modules.batches.models.response_models import BatchRowResponse

STAGE_FIELDS = frozenset({"login_status", "redeem_status", "purchase_status"})
VALUE_TOLERANCE = 0.011


def _reconcile_face_value(row) -> None:
    if row.face_value is None or row.balance_delta is None:
        return
    if row.redeem_status not in (STAGE_SUCCESS, STAGE_ALREADY_REDEEMED):
        return
    matched = abs(float(row.balance_delta) - float(row.face_value)) <= VALUE_TOLERANCE
    row.value_match = 1 if matched else 0
    if matched:
        return
    note = (
        f"Value mismatch: face_value={row.face_value}, balance_delta={row.balance_delta}"
    )
    if row.redeem_error:
        if "Value mismatch" not in row.redeem_error:
            row.redeem_error = f"{row.redeem_error}; {note}"
    else:
        row.redeem_error = note


def update_batch_row(
    row_id: str,
    payload: UpdateRowRequest,
    db: Session,
    user_id: str | None = None,
) -> BatchRowResponse:
    row = get_owned_row(db, row_id, user_id)

    data = payload.model_dump(exclude_unset=True)
    explicit_status = data.pop("status", None)
    touches_stages = bool(STAGE_FIELDS & data.keys())

    for field, value in data.items():
        setattr(row, field, value)

    if explicit_status is not None:
        row.status = explicit_status
    elif touches_stages:
        row.status = compute_row_status(
            row.login_status,
            row.redeem_status,
            row.purchase_status,
            current=row.status,
        )

    _reconcile_face_value(row)

    db.commit()
    db.refresh(row)
    refresh_batch_counts(db, row.batch_id)
    return BatchRowResponse.model_validate(row)
