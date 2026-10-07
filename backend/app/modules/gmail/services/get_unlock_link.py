"""
Fetch the latest Noon "Unlock more sign in attempts" email via the Gmail API.
Noon locks an account after too many OTP requests and emails a
"Verify my account" link; opening that link unlocks further attempts.
"""

import html
import re
from email.utils import getaddresses
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from app.modules.gmail.models.db_models import GmailToken
from app.modules.gmail.services.get_gmail_email import _get_valid_access_token
from app.modules.gmail.services.get_otp_link import (
    GMAIL_API_BASE,
    _decode_base64url,
    _header_value,
)

NOON_UNLOCK_QUERY = 'from:noon.com newer_than:1d subject:"Unlock more sign in attempts"'

_ANCHOR_RE = re.compile(
    r"<a\b[^>]*?href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)

_VERIFY_TEXT_RE = re.compile(r"verify\s+my\s+account|verify\s+account|unlock", re.IGNORECASE)

# Plain address only — also keeps `"` out of the Gmail `to:"…"` query.
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _is_noon_url(href: str) -> bool:
    parsed = urlparse(href)
    host = (parsed.hostname or "").lower()
    return parsed.scheme in ("http", "https") and (host == "noon.com" or host.endswith(".noon.com"))


def _collect_html(payload: dict, depth: int = 0) -> str:
    if depth > 10:
        return ""
    out = ""
    if payload.get("mimeType") == "text/html":
        out = _decode_base64url(payload.get("body", {}).get("data", ""))
    for part in payload.get("parts", []):
        out += _collect_html(part, depth + 1)
    return out


def extract_unlock_link(body_html: str) -> str | None:
    """Return the href of the "Verify my account" button (Noon click-tracker URL)."""
    for match in _ANCHOR_RE.finditer(body_html or ""):
        href = html.unescape(match.group(1)).strip()
        label = re.sub(r"<[^>]+>", " ", match.group(2))
        label = re.sub(r"\s+", " ", html.unescape(label)).strip()
        if not _is_noon_url(href):
            continue
        if _VERIFY_TEXT_RE.search(label):
            return href
    return None


def base_address(email: str) -> str:
    """Noon mails the account's base address: y.w.x+shop@gmail.com → y.w.x@gmail.com."""
    raw = email.strip().lower()
    local, sep, domain = raw.rpartition("@")
    if not sep or not local:
        return raw
    return f"{local.split('+', 1)[0]}@{domain}"


def _addressed_to(payload: dict, email: str) -> bool:
    """Exact (base) address match — never a substring, so y.w.x@ can't match w.x@."""
    target = base_address(email)
    addresses = {base_address(addr) for _, addr in getaddresses([_header_value(payload, "To")]) if addr}
    return bool(target) and target in addresses


async def fetch_unlock_link_from_email(
    user_id: str,
    db: Session,
    email: str,
    after_ms: int | None = None,
) -> str:
    """Return the newest unlock URL addressed to `email` (never another account's)."""
    if not email or not EMAIL_RE.match(email.strip()):
        raise ValueError("A valid row email is required to find the unlock email")

    token = db.get(GmailToken, user_id)
    if not token or not token.refresh_token:
        raise ValueError("Gmail not connected — connect Gmail first")

    access_token = await _get_valid_access_token(token, db)
    headers = {"Authorization": f"Bearer {access_token}"}
    query = f'{NOON_UNLOCK_QUERY} to:"{base_address(email)}"'

    async with httpx.AsyncClient(timeout=20) as client:
        list_resp = await client.get(
            f"{GMAIL_API_BASE}/messages",
            headers=headers,
            params={"maxResults": 5, "q": query},
        )
        if list_resp.status_code == 401:
            raise ValueError("Gmail access denied — reconnect Gmail")
        if not list_resp.is_success:
            raise ValueError(f"Gmail API error: {list_resp.text}")

        found: list[tuple[int, str]] = []
        for msg in list_resp.json().get("messages", []):
            full_resp = await client.get(
                f"{GMAIL_API_BASE}/messages/{msg['id']}",
                headers=headers,
                params={"format": "full"},
            )
            if not full_resp.is_success:
                continue
            data = full_resp.json()
            internal_date = int(data.get("internalDate") or 0)
            if after_ms and internal_date < after_ms:
                continue
            payload = data.get("payload", {})
            if not _addressed_to(payload, email):
                continue
            url = extract_unlock_link(_collect_html(payload))
            if url:
                found.append((internal_date, url))

    if not found:
        raise ValueError(f"No Noon unlock email found for {email} in the last day")
    found.sort(key=lambda item: item[0], reverse=True)
    return found[0][1]
