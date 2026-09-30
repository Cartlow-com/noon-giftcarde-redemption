from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from app.modules.gmail.models.db_models import GmailToken
from app.modules.gmail.models.response_models import GmailEmailItem
from app.modules.gmail.services.exchange_code import refresh_access_token

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


async def _get_valid_access_token(token: GmailToken, db: Session) -> str:
    """Return a valid access token, refreshing if expired."""
    now = datetime.now(UTC)
    expiry = token.token_expiry
    # Make expiry tz-aware if it isn't (SQLite strips tz)
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)

    if not token.access_token or (expiry and now >= expiry):
        if not token.refresh_token:
            raise ValueError("Gmail token expired and no refresh token available — reconnect Gmail")
        refreshed = await refresh_access_token(token.refresh_token)
        token.access_token = refreshed["access_token"]
        token.token_expiry = refreshed["token_expiry"]
        token.updated_at = now
        db.commit()

    return token.access_token


async def fetch_latest_emails(user_id: str, db: Session, limit: int = 5) -> list[GmailEmailItem]:
    """Fetch the latest `limit` emails from the connected Gmail account."""
    token = db.get(GmailToken, user_id)
    if not token or not token.refresh_token:
        raise ValueError("Gmail not connected")

    access_token = await _get_valid_access_token(token, db)
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        # List latest message IDs
        list_resp = await client.get(
            f"{GMAIL_API_BASE}/messages",
            headers=headers,
            params={"maxResults": limit, "q": "in:inbox"},
        )
        if list_resp.status_code == 401:
            raise ValueError("Gmail access denied — reconnect Gmail")
        if not list_resp.is_success:
            raise ValueError(f"Gmail API error: {list_resp.text}")

        messages = list_resp.json().get("messages", [])
        if not messages:
            return []

        # Fetch metadata for each message
        emails: list[GmailEmailItem] = []
        for msg in messages[:limit]:
            meta_resp = await client.get(
                f"{GMAIL_API_BASE}/messages/{msg['id']}",
                headers=headers,
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
            )
            if not meta_resp.is_success:
                continue
            data = meta_resp.json()
            headers_list = data.get("payload", {}).get("headers", [])
            header_map = {h["name"].lower(): h["value"] for h in headers_list}
            emails.append(GmailEmailItem(
                message_id=msg["id"],
                subject=header_map.get("subject", "(no subject)"),
                from_email=header_map.get("from", ""),
                date=header_map.get("date", ""),
                snippet=data.get("snippet", ""),
            ))

    return emails
