from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.modules.batches.models.request_models import UpdateRowRequest
from app.modules.batches.models.response_models import (
    BatchDetailResponse,
    BatchListResponse,
    BatchRowListResponse,
    BatchRowResponse,
    UploadBatchResponse,
)
from app.modules.batches.services.create_batch import create_batch_from_csv
from app.modules.batches.services.delete_batch import delete_batch
from app.modules.batches.services.get_batch import get_batch_detail
from app.modules.batches.services.get_batch_rows import list_batch_rows
from app.modules.batches.services.get_batches import list_batches
from app.modules.batches.services.get_next_row import get_next_pending_row
from app.modules.batches.services.get_row import get_row
from app.modules.batches.services.get_screenshot import resolve_row_screenshot_path
from app.modules.batches.services.notify_email import notify_order_email, notify_redeem_email
from app.modules.batches.services.save_screenshot import save_row_screenshot
from app.modules.batches.services.update_row import update_batch_row
from app.modules.email.models.response_models import SendEmailResponse


def upload_batch(file: UploadFile, db: Session) -> UploadBatchResponse:
    content = file.file.read()
    return create_batch_from_csv(file.filename or "upload.csv", content, db)


def get_batches(db: Session, limit: int, offset: int) -> BatchListResponse:
    return list_batches(db, limit=limit, offset=offset)


def get_batch(batch_id: str, db: Session, include_rows: bool) -> BatchDetailResponse:
    return get_batch_detail(batch_id, db, include_rows=include_rows)


def get_batch_rows(
    batch_id: str,
    db: Session,
    status: str | None,
    limit: int,
    offset: int,
) -> BatchRowListResponse:
    return list_batch_rows(batch_id, db, status=status, limit=limit, offset=offset)


def pull_next_row(batch_id: str | None, db: Session) -> BatchRowResponse:
    return get_next_pending_row(batch_id, db)


def fetch_row(row_id: str, db: Session) -> BatchRowResponse:
    return get_row(row_id, db)


def patch_row(row_id: str, payload: UpdateRowRequest, db: Session) -> BatchRowResponse:
    return update_batch_row(row_id, payload, db)


def remove_batch(batch_id: str, db: Session) -> None:
    delete_batch(batch_id, db)


def upload_screenshot(
    row_id: str,
    kind: str,
    file: UploadFile,
    db: Session,
) -> BatchRowResponse:
    return save_row_screenshot(row_id, kind, file, db)


def get_screenshot(row_id: str, kind: str, db: Session) -> Path:
    return resolve_row_screenshot_path(row_id, kind, db)


def send_redeem_notification(row_id: str, db: Session) -> SendEmailResponse:
    return notify_redeem_email(row_id, db)


def send_order_notification(row_id: str, db: Session) -> SendEmailResponse:
    return notify_order_email(row_id, db)
