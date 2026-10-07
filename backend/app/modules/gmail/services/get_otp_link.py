"""
Fetch the latest Noon OTP email via the Gmail API.
Prefer a 6-digit code in subject/body; fall back to Click Here / get-otp link.
"""

import base64
import html
import re

import httpx
from sqlalchemy.orm import Session

from app.modules.gmail.models.db_models import GmailToken
from app.modules.gmail.services.get_gmail_email import _get_valid_access_token

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

NOON_OTP_QUERY = "from:noon.com newer_than:1d subject:(OTP OR verification OR login OR password)"

_LINK_RE = re.compile(
    r'href=["\']?(https?://[^\s"\'<>]+(?:noon\.com|mp-identity)[^\s"\'<>]*)["\']?',
    re.IGNORECASE,
)

# Inline email: "OTP is 845989" / "one time password (OTP) is 314529"
_INLINE_OTP_RE = re.compile(
    r"(?:one[\s-]*time[\s-]*password|otp)\s*(?:\(otp\))?\s*(?:is|:)\s*(\d{6})\b",
    re.IGNORECASE,
)

# Subject: "845989 is the OTP for your noon account verification"
_SUBJECT_OTP_RE = re.compile(
    r"\b(\d{6})\b\s+is\s+the\s+otp\b",
    re.IGNORECASE,
)

def _decode_base64url(data: str) -> str:
    try:
        padded = data + "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _header_value(payload: dict, name: str) -> str:
    headers = payload.get("headers") or []
    target = name.lower()
    for item in headers:
        if str(item.get("name") or "").lower() == target:
            return str(item.get("value") or "")
    return ""


def _extract_text_and_links(payload: dict, depth: int = 0) -> tuple[str, list[str]]:
    if depth > 10:
        return "", []

    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")
    text = ""
    links: list[str] = []

    if mime in ("text/plain", "text/html") and body_data:
        decoded = _decode_base64url(body_data)
        text = decoded
        links = [m.group(1) for m in _LINK_RE.finditer(decoded)]

    for part in payload.get("parts", []):
        sub_text, sub_links = _extract_text_and_links(part, depth + 1)
        if sub_text:
            text = text + "\n" + sub_text
        links.extend(sub_links)

    return text, links


def _pick_best_otp_link(links: list[str], body_text: str) -> str | None:
    noon_links = [
        link for link in links
        if re.search(r"noon\.com|mp-identity", link, re.IGNORECASE)
    ]
    for link in noon_links:
        if re.search(r"otp|verify|verif|token|one.time", link, re.IGNORECASE):
            return link
    # Prefer Click Here style only when body mentions it
    if re.search(r"click\s*here", body_text or "", re.IGNORECASE) and noon_links:
        return noon_links[0]
    return noon_links[0] if noon_links else None


DEFAULT_GRACE_MS = 30_000


def _pick_newest_eligible(
    items: list[tuple[int, str, str]],
    after_ms: int | None = None,
    grace_ms: int = DEFAULT_GRACE_MS,
) -> tuple[str, str] | None:
    """items: (internal_date, otp, url) — prefer newest with otp or url."""
    min_internal_date = (after_ms or 0) - grace_ms
    eligible = [
        item for item in items
        if (min_internal_date <= 0 or item[0] >= min_internal_date) and (item[1] or item[2])
    ]
    if not eligible:
        return None
    eligible.sort(key=lambda item: item[0], reverse=True)
    _, otp, url = eligible[0]
    return otp, url


def extract_otp_code(text: str) -> str | None:
    """
    Extract a 6-digit OTP from Noon email subject/body.

    Only trust explicit inline/subject forms:
      - "OTP is 845989" / "one time password (OTP) is 845989"
      - "845989 is the OTP for your noon account…"

    Do NOT scrape arbitrary digit runs from HTML (widths, years, tracking IDs).
    Click Here emails have no inline code — callers must open the get-otp URL.
    """
    raw = html.unescape(str(text or ""))
    plain = re.sub(r"<[^>]+>", " ", raw)

    for pattern in (_INLINE_OTP_RE, _SUBJECT_OTP_RE):
        match = pattern.search(plain)
        if match:
            return match.group(1)
    return None


async def fetch_otp_from_email(
    user_id: str,
    db: Session,
    after_ms: int | None = None,
    grace_ms: int = DEFAULT_GRACE_MS,
) -> tuple[str, str]:
    """
    Return (otp, url) from the newest eligible Noon OTP email.
    Prefer inline 6-digit OTP; otherwise return Click Here / get-otp URL.
    """
    token = db.get(GmailToken, user_id)
    if not token or not token.refresh_token:
        raise ValueError("Gmail not connected — connect Gmail first")

    access_token = await _get_valid_access_token(token, db)
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=20) as client:
        list_resp = await client.get(
            f"{GMAIL_API_BASE}/messages",
            headers=headers,
            params={"maxResults": 10, "q": NOON_OTP_QUERY},
        )
        if list_resp.status_code == 401:
            raise ValueError("Gmail access denied — reconnect Gmail")
        if not list_resp.is_success:
            raise ValueError(f"Gmail API error: {list_resp.text}")

        messages = list_resp.json().get("messages", [])
        if not messages:
            raise ValueError("No recent Noon OTP email found in Gmail inbox")

        min_internal_date = (after_ms or 0) - grace_ms
        found: list[tuple[int, str, str]] = []

        for msg in messages:
            full_resp = await client.get(
                f"{GMAIL_API_BASE}/messages/{msg['id']}",
                headers=headers,
                params={"format": "full"},
            )
            if not full_resp.is_success:
                continue

            data = full_resp.json()
            internal_date = int(data.get("internalDate") or 0)
            if min_internal_date > 0 and internal_date < min_internal_date:
                continue

            payload = data.get("payload", {})
            subject = _header_value(payload, "Subject")
            body_text, links = _extract_text_and_links(payload)
            combined = f"{subject}\n{body_text}"

            otp = extract_otp_code(combined) or ""
            url = _pick_best_otp_link(links, body_text) or ""
            # Prefer strict inline OTP; otherwise open Click Here / get-otp URL.
            # Never invent an OTP from HTML noise when a link is present.
            if otp:
                found.append((internal_date, otp, url))
            elif url:
                found.append((internal_date, "", url))

        picked = _pick_newest_eligible(found, after_ms=after_ms, grace_ms=grace_ms)
        if picked:
            return picked

    raise ValueError("No fresh OTP found in recent Noon emails — check your Gmail inbox")
