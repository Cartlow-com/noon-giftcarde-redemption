import base64

import httpx
from sqlalchemy.orm import Session

from app.modules.gmail.models.db_models import GmailToken
from app.modules.gmail.services.get_gmail_email import _get_valid_access_token

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


def _decode_part(data: str) -> str:
    """Base64url-decode a Gmail message part."""
    try:
        padded = data + "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_body(payload: dict) -> tuple[str, str]:
    """
    Recursively walk the MIME tree and return (plain_text, html).
    Prefers text/html for html, text/plain for plain.
    """
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime == "text/plain":
        return _decode_part(body_data), ""
    if mime == "text/html":
        return "", _decode_part(body_data)

    plain, html = "", ""
    for part in payload.get("parts", []):
        p, h = _extract_body(part)
        if p:
            plain = p
        if h:
            html = h
    return plain, html


async def fetch_full_email(user_id: str, message_id: str, db: Session) -> dict:
    """Return full email data including decoded body."""
    token = db.get(GmailToken, user_id)
    if not token or not token.refresh_token:
        raise ValueError("Gmail not connected")

    access_token = await _get_valid_access_token(token, db)
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GMAIL_API_BASE}/messages/{message_id}",
            headers=headers,
            params={"format": "full"},
        )
        if resp.status_code == 401:
            raise ValueError("Gmail access denied — reconnect Gmail")
        if not resp.is_success:
            raise ValueError(f"Gmail API error: {resp.text}")

        data = resp.json()
        payload = data.get("payload", {})
        headers_list = payload.get("headers", [])
        header_map = {h["name"].lower(): h["value"] for h in headers_list}

        plain, html = _extract_body(payload)

        return {
            "message_id": message_id,
            "subject": header_map.get("subject", "(no subject)"),
            "from_email": header_map.get("from", ""),
            "to": header_map.get("to", ""),
            "date": header_map.get("date", ""),
            "snippet": data.get("snippet", ""),
            "body_plain": plain,
            "body_html": html,
        }
