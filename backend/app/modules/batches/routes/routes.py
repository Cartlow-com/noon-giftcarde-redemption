from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.modules.batches.controllers.controller import (
    add_row_attempt,
    fetch_row,
    get_batch,
    get_batch_rows,
    get_batches,
    get_row_attempts,
    get_screenshot,
    patch_row,
    pull_next_row,
    remove_batch,
    send_order_notification,
    send_redeem_notification,
    upload_batch,
    upload_screenshot,
)
from app.modules.batches.helpers.auth import require_auth
from app.modules.batches.helpers.csv_parser import REQUIRED_COLUMNS
from app.modules.batches.models.request_models import CreateRowAttemptRequest, UpdateRowRequest
from app.modules.batches.models.response_models import (
    BatchDetailResponse,
    BatchListResponse,
    BatchRowListResponse,
    BatchRowResponse,
    RowAttemptListResponse,
    RowAttemptResponse,
    UploadBatchResponse,
)
from app.modules.email.models.response_models import SendEmailResponse

router = APIRouter(prefix="/batches", tags=["batches"])

SAMPLE_CSV_BODY = (
    ",".join(REQUIRED_COLUMNS)
    + "\n"
    + "user@example.com,YourPassword123,1100 1705 2778 3945,2724,"
    + "https://www.noon.com/uae-en/product/N27674082A/p/,1\n"
)


def _not_found(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


def _bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/upload", response_model=UploadBatchResponse, status_code=status.HTTP_201_CREATED)
def upload_batch_route(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> UploadBatchResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file required")
    try:
        return upload_batch(file, db, user_id=user_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.get("/sample.csv")
def sample_csv_route(user_id: str | None = Depends(require_auth)) -> Response:
    return Response(
        content=SAMPLE_CSV_BODY,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="noon_batch_sample.csv"'},
    )


@router.get("", response_model=BatchListResponse)
def list_batches_route(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchListResponse:
    return get_batches(db, user_id=user_id, limit=limit, offset=offset)


@router.get("/rows/next", response_model=BatchRowResponse)
def next_row_route(
    batch_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchRowResponse:
    try:
        return pull_next_row(batch_id, db, user_id=user_id)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.get("/rows/{row_id}", response_model=BatchRowResponse)
def get_row_route(
    row_id: str,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchRowResponse:
    try:
        return fetch_row(row_id, db, user_id=user_id)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.patch("/rows/{row_id}", response_model=BatchRowResponse)
def patch_row_route(
    row_id: str,
    payload: UpdateRowRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchRowResponse:
    try:
        return patch_row(row_id, payload, db, user_id=user_id)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.post("/rows/{row_id}/attempts", response_model=RowAttemptResponse, status_code=status.HTTP_201_CREATED)
def create_row_attempt_route(
    row_id: str,
    payload: CreateRowAttemptRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> RowAttemptResponse:
    try:
        return add_row_attempt(row_id, payload, db, user_id=user_id)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.get("/rows/{row_id}/attempts", response_model=RowAttemptListResponse)
def list_row_attempts_route(
    row_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> RowAttemptListResponse:
    try:
        return get_row_attempts(row_id, db, user_id=user_id, limit=limit)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.post("/rows/{row_id}/screenshots", response_model=BatchRowResponse)
def upload_screenshot_route(
    row_id: str,
    kind: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchRowResponse:
    try:
        return upload_screenshot(row_id, kind, file, db, user_id=user_id)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Row not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc


@router.get("/rows/{row_id}/screenshots/{kind}")
def get_screenshot_route(
    row_id: str,
    kind: str,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> FileResponse:
    try:
        path = get_screenshot(row_id, kind, db, user_id=user_id)
    except ValueError as exc:
        detail = str(exc)
        if detail in {"Row not found", "Screenshot not found"}:
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc
    return FileResponse(path, media_type="image/png", filename=f"{kind}.png")


@router.post("/rows/{row_id}/notify/redeem", response_model=SendEmailResponse)
def notify_redeem_route(
    row_id: str,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> SendEmailResponse:
    try:
        return send_redeem_notification(row_id, db, user_id=user_id)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Row not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc


@router.post("/rows/{row_id}/notify/order", response_model=SendEmailResponse)
def notify_order_route(
    row_id: str,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> SendEmailResponse:
    try:
        return send_order_notification(row_id, db, user_id=user_id)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Row not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc


@router.get("/{batch_id}", response_model=BatchDetailResponse)
def get_batch_route(
    batch_id: str,
    include_rows: bool = Query(default=False),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchDetailResponse:
    try:
        return get_batch(batch_id, db, user_id=user_id, include_rows=include_rows)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.get("/{batch_id}/rows", response_model=BatchRowListResponse)
def list_rows_route(
    batch_id: str,
    status: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> BatchRowListResponse:
    try:
        return get_batch_rows(batch_id, db, user_id=user_id, status=status, limit=limit, offset=offset)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch_route(
    batch_id: str,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> None:
    try:
        remove_batch(batch_id, db, user_id=user_id)
    except ValueError as exc:
        raise _not_found(exc) from exc
