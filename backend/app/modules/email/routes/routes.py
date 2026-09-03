from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.modules.batches.helpers.auth import require_auth
from app.modules.email.controllers.controller import get_history, send_email
from app.modules.email.models.request_models import SendTemplatedEmailRequest
from app.modules.email.models.response_models import EmailHistoryListResponse, SendEmailResponse

router = APIRouter(prefix="/emails", tags=["emails"])


@router.post("/send", response_model=SendEmailResponse)
def send_email_route(
    payload: SendTemplatedEmailRequest,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_auth),
) -> SendEmailResponse:
    return send_email(payload, db)


@router.get("/history", response_model=EmailHistoryListResponse)
def history_route(
    row_id: str | None = Query(default=None),
    to_email: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> EmailHistoryListResponse:
    return get_history(
        db,
        user_id=user_id,
        row_id=row_id,
        to_email=to_email,
        limit=limit,
        offset=offset,
    )
