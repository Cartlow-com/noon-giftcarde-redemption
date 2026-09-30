from datetime import UTC, datetime, timedelta

import httpx

from app.config.settings import settings

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange OAuth authorization code for access + refresh tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GMAIL_CLIENT_ID,
                "client_secret": settings.GMAIL_CLIENT_SECRET,
                "redirect_uri": settings.GMAIL_REDIRECT_URL,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        raise ValueError(f"Token exchange failed: {resp.text}")

    data = resp.json()
    expires_in = data.get("expires_in", 3600)
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "token_expiry": datetime.now(UTC) + timedelta(seconds=expires_in),
    }


async def refresh_access_token(refresh_token: str) -> dict:
    """Use refresh token to get a fresh access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": settings.GMAIL_CLIENT_ID,
                "client_secret": settings.GMAIL_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        raise ValueError(f"Token refresh failed: {resp.text}")

    data = resp.json()
    expires_in = data.get("expires_in", 3600)
    return {
        "access_token": data["access_token"],
        "token_expiry": datetime.now(UTC) + timedelta(seconds=expires_in),
    }
