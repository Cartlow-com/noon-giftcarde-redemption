from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.modules.batches.helpers.auth import resolve_owner_user_id
from app.modules.batches.models.request_models import (
    CreateRowAttemptRequest,
    UpdateRowAttemptRequest,
    UpdateRowRequest,
)
from app.modules.batches.models.response_models import (
    BatchDetailResponse,
    BatchListResponse,
    BatchRowListResponse,
    BatchRowResponse,
    BatchRowWorkResponse,
    RowAttemptListResponse,
    RowAttemptResponse,
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
from app.modules.batches.services.row_attempts import (
    create_row_attempt,
    list_row_attempts,
    update_row_attempt,
)
from app.modules.batches.services.save_screenshot import save_row_screenshot
from app.modules.batches.services.update_row import update_batch_row
from app.modules.email.models.response_models import SendEmailResponse


def upload_batch(file: UploadFile, db: Session, user_id: str | None = None) -> UploadBatchResponse:
    content = file.file.read()
    return create_batch_from_csv(file.filename or "upload.csv", content, db, user_id=user_id)


def get_batches(
    db: Session,
    user_id: str | None,
    limit: int,
    offset: int,
) -> BatchListResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return list_batches(db, user_id=owner_id, limit=limit, offset=offset)


def get_batch(
    batch_id: str,
    db: Session,
    user_id: str | None,
    include_rows: bool,
) -> BatchDetailResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return get_batch_detail(batch_id, db, user_id=owner_id, include_rows=include_rows)


def get_batch_rows(
    batch_id: str,
    db: Session,
    user_id: str | None,
    status: str | None,
    limit: int,
    offset: int,
) -> BatchRowListResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return list_batch_rows(
        batch_id, db, user_id=owner_id, status=status, limit=limit, offset=offset
    )


def pull_next_row(
    batch_id: str | None,
    db: Session,
    user_id: str | None = None,
) -> BatchRowWorkResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return get_next_pending_row(batch_id, db, user_id=owner_id)


def fetch_row(row_id: str, db: Session, user_id: str | None = None) -> BatchRowWorkResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return get_row(row_id, db, user_id=owner_id)


def patch_row(
    row_id: str,
    payload: UpdateRowRequest,
    db: Session,
    user_id: str | None = None,
) -> BatchRowResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return update_batch_row(row_id, payload, db, user_id=owner_id)


def remove_batch(batch_id: str, db: Session, user_id: str | None = None) -> None:
    owner_id = resolve_owner_user_id(user_id, db)
    delete_batch(batch_id, db, user_id=owner_id)


def upload_screenshot(
    row_id: str,
    kind: str,
    file: UploadFile,
    db: Session,
    user_id: str | None = None,
    attempt_id: str | None = None,
) -> BatchRowResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return save_row_screenshot(
        row_id, kind, file, db, user_id=owner_id, attempt_id=attempt_id
    )


def get_screenshot(
    row_id: str,
    kind: str,
    db: Session,
    user_id: str | None = None,
    attempt_id: str | None = None,
) -> Path:
    owner_id = resolve_owner_user_id(user_id, db)
    return resolve_row_screenshot_path(
        row_id, kind, db, user_id=owner_id, attempt_id=attempt_id
    )


def send_redeem_notification(
    row_id: str,
    db: Session,
    user_id: str | None = None,
) -> SendEmailResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return notify_redeem_email(row_id, db, user_id=owner_id)


def send_order_notification(
    row_id: str,
    db: Session,
    user_id: str | None = None,
) -> SendEmailResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return notify_order_email(row_id, db, user_id=owner_id)


def add_row_attempt(
    row_id: str,
    payload: CreateRowAttemptRequest,
    db: Session,
    user_id: str | None = None,
) -> RowAttemptResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return create_row_attempt(row_id, payload, db, user_id=owner_id)


def patch_row_attempt(
    attempt_id: str,
    payload: UpdateRowAttemptRequest,
    db: Session,
    user_id: str | None = None,
) -> RowAttemptResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return update_row_attempt(attempt_id, payload, db, user_id=owner_id)


def get_row_attempts(
    row_id: str,
    db: Session,
    user_id: str | None = None,
    limit: int = 50,
) -> RowAttemptListResponse:
    owner_id = resolve_owner_user_id(user_id, db)
    return list_row_attempts(row_id, db, user_id=owner_id, limit=limit)
