def delete_session(refresh_token: str) -> dict[str, str]:
    if not refresh_token:
        raise ValueError("Refresh token required")
    return {"message": "Session revoked"}
