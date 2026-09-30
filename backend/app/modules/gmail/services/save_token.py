from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from app.modules.gmail.models.db_models import GmailToken

GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


async def get_gmail_email_address(access_token: str) -> str:
    """Fetch the Gmail address for the connected account."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.is_success:
        return resp.json().get("email", "")
    return ""


def upsert_gmail_token(
    user_id: str,
    access_token: str,
    refresh_token: str,
    token_expiry: datetime,
    gmail_email: str,
    db: Session,
) -> GmailToken:
    now = datetime.now(UTC)
    token = db.get(GmailToken, user_id)
    if token:
        token.access_token = access_token
        if refresh_token:
            token.refresh_token = refresh_token
        token.token_expiry = token_expiry
        token.gmail_email = gmail_email
        token.updated_at = now
    else:
        token = GmailToken(
            user_id=user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=token_expiry,
            gmail_email=gmail_email,
            created_at=now,
            updated_at=now,
        )
        db.add(token)
    db.commit()
    db.refresh(token)
    return token


def delete_gmail_token(user_id: str, db: Session) -> None:
    token = db.get(GmailToken, user_id)
    if token:
        db.delete(token)
        db.commit()
