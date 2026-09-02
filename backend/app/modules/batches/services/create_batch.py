import uuid

from sqlalchemy.orm import Session

from app.modules.batches.helpers.csv_parser import parse_orders_csv
from app.modules.batches.models.db_models import ROW_PENDING, STAGE_PENDING, Batch, BatchRow
from app.modules.batches.models.response_models import BatchSummaryResponse, UploadBatchResponse


def create_batch_from_csv(filename: str, content: bytes, db: Session) -> UploadBatchResponse:
    parsed_rows = parse_orders_csv(content)
    batch_id = str(uuid.uuid4())
    batch = Batch(
        id=batch_id,
        filename=filename or "upload.csv",
        total_rows=len(parsed_rows),
        pending_count=len(parsed_rows),
        status="uploaded",
    )
    db.add(batch)

    for row in parsed_rows:
        db.add(
            BatchRow(
                id=str(uuid.uuid4()),
                batch_id=batch_id,
                row_number=row.row_number,
                email=row.email,
                password=row.password,
                gift_card_number=row.gift_card_number,
                gift_card_pin=row.gift_card_pin,
                product_url=row.product_url,
                quantity=row.quantity,
                login_status=STAGE_PENDING,
                redeem_status=STAGE_PENDING,
                purchase_status=STAGE_PENDING,
                status=ROW_PENDING,
            )
        )

    db.commit()
    db.refresh(batch)
    return UploadBatchResponse(
        batch=BatchSummaryResponse.model_validate(batch),
        message=f"Uploaded {len(parsed_rows)} rows",
    )
