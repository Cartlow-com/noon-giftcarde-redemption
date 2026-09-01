from jose import JWTError, jwt

from app.config.settings import settings
from app.modules.login.models.response_models import SessionResponse

ALGORITHM = "HS256"


def get_session(access_token: str) -> SessionResponse:
    try:
        payload = jwt.decode(access_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc

    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise ValueError("Invalid token payload")

    return SessionResponse(user_id=user_id, email=email)
