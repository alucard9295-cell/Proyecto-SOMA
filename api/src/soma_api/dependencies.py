from fastapi import Depends, Header, HTTPException, status

from .config import Settings, load_settings
from .database import find_user
from .security import verify_token


def get_settings() -> Settings:
    return load_settings()


def current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    return authenticate_bearer(authorization, settings)


def authenticate_bearer(
    authorization: str | None, settings: Settings
) -> dict[str, object]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticación requerida")
    payload = verify_token(authorization.removeprefix("Bearer ").strip(), settings.jwt_secret)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida o vencida")
    user = find_user(settings.database_path, str(payload["username"]))
    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
    return dict(user)
