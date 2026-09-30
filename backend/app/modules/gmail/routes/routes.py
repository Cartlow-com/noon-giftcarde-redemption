from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.modules.batches.helpers.auth import require_auth
from app.modules.gmail.controllers.controller import (
    gmail_connect_url,
    gmail_disconnect,
    gmail_fetch_emails,
    gmail_fetch_full_email,
    gmail_get_otp_link,
    gmail_handle_callback,
    gmail_status,
)
from app.modules.gmail.models.response_models import (
    GmailEmailsResponse,
    GmailStatusResponse,
)

router = APIRouter(prefix="/gmail", tags=["gmail"])


@router.get("/status", response_model=GmailStatusResponse)
async def gmail_status_route(
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> GmailStatusResponse:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return gmail_status(user_id, db)


@router.get("/connect")
async def gmail_connect_route(
    user_id: str | None = Depends(require_auth),
) -> RedirectResponse:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    url = gmail_connect_url(user_id)
    return RedirectResponse(url=url)


@router.get("/connect-url")
async def gmail_connect_url_route(
    user_id: str | None = Depends(require_auth),
) -> dict:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return {"url": gmail_connect_url(user_id)}


@router.get("/oauth/callback")
async def gmail_oauth_callback_route(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Google redirects here after user approves. state = user_id."""
    try:
        await gmail_handle_callback(code=code, user_id=state, db=db)
    except ValueError as exc:
        # Redirect to dashboard with error param
        return RedirectResponse(url=f"/?gmail_error={exc}", status_code=302)
    return RedirectResponse(url="/?gmail_connected=1", status_code=302)


@router.delete("/disconnect", response_model=GmailStatusResponse)
async def gmail_disconnect_route(
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> GmailStatusResponse:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return gmail_disconnect(user_id, db)


@router.get("/emails", response_model=GmailEmailsResponse)
async def gmail_emails_route(
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> GmailEmailsResponse:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        return await gmail_fetch_emails(user_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/emails/{message_id}")
async def gmail_email_detail_route(
    message_id: str,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> dict:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        return await gmail_fetch_full_email(user_id, message_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/otp-link")
async def gmail_otp_link_route(
    after_ms: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(require_auth),
) -> dict:
    """Return OTP link URL only — extension must open the page and scrape the visible code."""
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        link = await gmail_get_otp_link(user_id, db, after_ms=after_ms)
        return {"url": link, "otp": ""}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
