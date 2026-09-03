from sqlalchemy.orm import Session

from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.models.response_models import BatchRowResponse


def get_row(row_id: str, db: Session, user_id: str | None = None) -> BatchRowResponse:
    row = get_owned_row(db, row_id, user_id)
    return BatchRowResponse.model_validate(row)
