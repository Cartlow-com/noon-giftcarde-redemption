from fastapi import APIRouter, Depends, HTTPException, status

from app.config.settings import settings
from app.modules.batches.helpers.auth import require_auth
from app.modules.proxies.services.pool import (
    block_proxy,
    pick_next_proxy,
    proxy_to_dict,
)

router = APIRouter(prefix="/proxies", tags=["proxies"])


@router.get("/next")
def proxies_next_route(
    user_id: str | None = Depends(require_auth),
) -> dict:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if not settings.PROXY_ROTATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Proxy rotation is switched off (PROXY_ROTATION_ENABLED=false)",
        )
    try:
        entry = pick_next_proxy(probe=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return proxy_to_dict(entry)


@router.post("/{proxy_id}/block")
def proxies_block_route(
    proxy_id: int,
    user_id: str | None = Depends(require_auth),
) -> dict:
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    ok = block_proxy(proxy_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proxy not found")
    return {"ok": True, "id": proxy_id, "blocked": True}
