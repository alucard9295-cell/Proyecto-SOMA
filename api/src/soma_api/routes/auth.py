from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..config import Settings
from ..dependencies import current_user, get_settings
from ..repositories import AuditRepository, UserRepository
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
        AuditRepository(settings.database_path).record(
            "login_failure",
            username=payload.username.strip(),
            request_id=getattr(request.state, "request_id", None),
            ip_address=client_key,
            details={"reason": "rate_limited"},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera unos minutos.",
            headers={"Retry-After": "300"},
        )
    user = UserRepository(settings.database_path).find_by_username(payload.username)
    valid = bool(
        user
        and user["is_active"]
        and verify_password(payload.password, user["password_hash"])
    )
    request_id = getattr(request.state, "request_id", None)
    ip_address = request.client.host if request.client else None
    if not valid:
        AuditRepository(settings.database_path).record(
            "login_failure",
            username=payload.username.strip(),
            request_id=request_id,
            ip_address=ip_address,
            details={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")
    login_limiter.clear(client_key)
    AuditRepository(settings.database_path).record(
        "login_success",
        user_id=user["id"],
        username=user["username"],
        request_id=request_id,
        ip_address=ip_address,
    )
    return {
        "token": issue_token(user["id"], user["username"], settings.jwt_secret),
        "user": {"id": user["id"], "username": user["username"], "role": user["role"]},
    }


@router.get("/me")
def me(user: dict[str, object] = Depends(current_user)):
    return {"id": user["id"], "username": user["username"], "role": user["role"]}
