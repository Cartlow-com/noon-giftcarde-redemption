from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config.settings import settings

from app.modules.gmail.models.db_models import GmailToken
from app.modules.gmail.models.response_models import (
    GmailEmailsResponse,
    GmailStatusResponse,
)
from app.modules.gmail.services.exchange_code import exchange_code_for_tokens
from app.modules.gmail.services.get_gmail_email import fetch_latest_emails
from app.modules.gmail.services.get_gmail_email_full import fetch_full_email
from app.modules.gmail.services.get_oauth_url import get_oauth_url
from app.modules.gmail.services.get_otp_link import fetch_otp_from_email
from app.modules.gmail.services.get_unlock_link import fetch_unlock_link_from_email
from app.modules.gmail.services.save_token import (
    delete_gmail_token,
    get_gmail_email_address,
    upsert_gmail_token,
)


def gmail_status(user_id: str, db: Session) -> GmailStatusResponse:
    token = db.get(GmailToken, user_id)
    if not token or not token.refresh_token:
        return GmailStatusResponse(connected=False)
    return GmailStatusResponse(connected=True, gmail_email=token.gmail_email or "")


OAUTH_STATE_TTL_MINUTES = 15


def make_oauth_state(user_id: str) -> str:
    """Signed, short-lived state so a callback can't bind Gmail to another user."""
    payload = {
        "sub": user_id,
        "purpose": "gmail_oauth",
        "exp": datetime.now(UTC) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def user_id_from_oauth_state(state: str) -> str:
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Gmail connect link expired or invalid — try Connect Gmail again") from exc
    if payload.get("purpose") != "gmail_oauth" or not payload.get("sub"):
        raise ValueError("Gmail connect link expired or invalid — try Connect Gmail again")
    return str(payload["sub"])


def gmail_connect_url(user_id: str) -> str:
    """Return the Google OAuth URL — state is a signed token for user_id."""
    return get_oauth_url(state=make_oauth_state(user_id))


async def gmail_handle_callback(code: str, user_id: str, db: Session) -> GmailStatusResponse:
    tokens = await exchange_code_for_tokens(code)
    gmail_email = await get_gmail_email_address(tokens["access_token"])
    upsert_gmail_token(
        user_id=user_id,
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_expiry=tokens["token_expiry"],
        gmail_email=gmail_email,
        db=db,
    )
    return GmailStatusResponse(connected=True, gmail_email=gmail_email)


def gmail_disconnect(user_id: str, db: Session) -> GmailStatusResponse:
    delete_gmail_token(user_id, db)
    return GmailStatusResponse(connected=False)


async def gmail_fetch_emails(user_id: str, db: Session) -> GmailEmailsResponse:
    emails = await fetch_latest_emails(user_id, db, limit=5)
    return GmailEmailsResponse(emails=emails)


async def gmail_fetch_full_email(user_id: str, message_id: str, db: Session) -> dict:
    return await fetch_full_email(user_id, message_id, db)


async def gmail_get_otp_from_email(
    user_id: str,
    db: Session,
    after_ms: int | None = None,
    grace_ms: int = 30_000,
) -> tuple[str, str]:
    """Return (otp, url) — prefer inline email OTP, else Click Here link."""
    return await fetch_otp_from_email(user_id, db, after_ms=after_ms, grace_ms=grace_ms)


async def gmail_get_unlock_link(
    user_id: str,
    db: Session,
    email: str,
    after_ms: int | None = None,
) -> str:
    """Return the "Verify my account" URL from Noon's lockout email for `email`."""
    return await fetch_unlock_link_from_email(user_id, db, email, after_ms=after_ms)
