from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.modules.batches.helpers.auth import require_auth
from app.modules.batches.models.request_models import CreateRunRequest, UpdateRunRequest
from app.modules.batches.models.response_models import (
    AppConfigResponse,
    BatchRunResponse,
    ExtensionStatusResponse,
)
from app.modules.batches.services.extension_presence import (
    get_extension_last_seen,
    is_extension_online,
    touch_extension_heartbeat,
)
from app.modules.batches.services.run_jobs import (
    claim_batch_run,
    create_batch_run,
    get_active_run,
    get_pending_run,
    get_run,
    stop_batch_run,
    update_batch_run,
)

router = APIRouter(prefix="/runs", tags=["runs"])


def _not_found(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


def _bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/config", response_model=AppConfigResponse)
def config_route() -> AppConfigResponse:
    return AppConfigResponse(
        expected_row_seconds=settings.EXPECTED_ROW_SECONDS,
        auth_required=settings.AUTH_REQUIRED,
    )


@router.get("/extension/status", response_model=ExtensionStatusResponse)
def extension_status_route() -> ExtensionStatusResponse:
    last = get_extension_last_seen()
    return ExtensionStatusResponse(
        online=is_extension_online(),
        last_seen_at=last,
        ttl_seconds=settings.EXTENSION_HEARTBEAT_TTL_SECONDS,
    )


@router.post("/extension/heartbeat", response_model=ExtensionStatusResponse)
def extension_heartbeat_route(
    _: str | None = Depends(require_auth),
) -> ExtensionStatusResponse:
    last = touch_extension_heartbeat()
    return ExtensionStatusResponse(
        online=True,
        last_seen_at=last,
        ttl_seconds=settings.EXTENSION_HEARTBEAT_TTL_SECONDS,
    )


@router.post("", response_model=BatchRunResponse, status_code=status.HTTP_201_CREATED)
def create_run_route(
    payload: CreateRunRequest,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse:
    try:
        return create_batch_run(
            batch_id=payload.batch_id,
            row_ids=payload.row_ids,
            place_order=payload.place_order,
            send_redeem_emails=payload.send_redeem_emails,
            send_order_emails=payload.send_order_emails,
            db=db,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "Batch not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc


@router.get("/pending", response_model=BatchRunResponse | None)
def pending_run_route(
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse | None:
    return get_pending_run(db)


@router.get("/active", response_model=BatchRunResponse | None)
def active_run_route(
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse | None:
    return get_active_run(db)


@router.get("/{run_id}", response_model=BatchRunResponse)
def get_run_route(
    run_id: str,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse:
    try:
        return get_run(run_id, db)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.post("/{run_id}/claim", response_model=BatchRunResponse)
def claim_run_route(
    run_id: str,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse:
    try:
        return claim_batch_run(run_id, db)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Run not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc


@router.post("/{run_id}/stop", response_model=BatchRunResponse)
def stop_run_route(
    run_id: str,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse:
    try:
        return stop_batch_run(run_id, db)
    except ValueError as exc:
        raise _not_found(exc) from exc


@router.patch("/{run_id}", response_model=BatchRunResponse)
def patch_run_route(
    run_id: str,
    payload: UpdateRunRequest,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> BatchRunResponse:
    try:
        return update_batch_run(
            run_id,
            status=payload.status,
            message=payload.message,
            db=db,
        )
    except ValueError as exc:
        raise _not_found(exc) from exc
