from sqlalchemy.orm import Session

from app.modules.batches.helpers.batch_stats import refresh_batch_counts
from app.modules.batches.helpers.status import compute_row_status
from app.modules.batches.models.db_models import BatchRow
from app.modules.batches.models.request_models import UpdateRowRequest
from app.modules.batches.models.response_models import BatchRowResponse


def update_batch_row(row_id: str, payload: UpdateRowRequest, db: Session) -> BatchRowResponse:
    row = db.get(BatchRow, row_id)
    if not row:
        raise ValueError("Row not found")

    data = payload.model_dump(exclude_unset=True)
    explicit_status = data.pop("status", None)

    for field, value in data.items():
        setattr(row, field, value)

    if explicit_status is not None:
        row.status = explicit_status
    else:
        row.status = compute_row_status(
            row.login_status,
            row.redeem_status,
            row.purchase_status,
            current=row.status,
        )

    db.commit()
    db.refresh(row)
    refresh_batch_counts(db, row.batch_id)
    return BatchRowResponse.model_validate(row)
