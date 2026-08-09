from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..config import Settings
from ..database import find_user
from ..dependencies import current_user, get_settings
from ..security import issue_token, verify_password
from ..rate_limit import SlidingWindowLimiter


router = APIRouter(prefix="/api/admin", tags=["admin"])
login_limiter = SlidingWindowLimiter(limit=8, window_seconds=300)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    client_key = request.client.host if request.client else "unknown"
    if not login_limiter.allow(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera unos minutos.",
            headers={"Retry-After": "300"},
        )
    user = find_user(settings.database_path, payload.username)
    if not user or not user["is_active"] or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")
    login_limiter.clear(client_key)
    return {
        "token": issue_token(user["id"], user["username"], settings.jwt_secret),
        "user": {"id": user["id"], "username": user["username"], "role": user["role"]},
    }


@router.get("/me")
def me(user: dict[str, object] = Depends(current_user)):
    return {"id": user["id"], "username": user["username"], "role": user["role"]}
