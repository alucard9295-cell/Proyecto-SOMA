import logging

from fastapi import Depends, Header, HTTPException, Request, status

from .config import Settings, load_settings
from .repositories import AuditRepository, UserRepository
from .security import verify_token


logger = logging.getLogger(__name__)


def get_settings() -> Settings:
    return load_settings()


def current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    return authenticate_bearer(authorization, settings, request)


def authenticate_bearer(
    authorization: str | None,
    settings: Settings,
    request: Request | None = None,
) -> dict[str, object]:
    request_id = getattr(getattr(request, "state", None), "request_id", None)
    ip_address = request.client.host if request and request.client else None

    def denied(reason: str, username: str | None = None) -> None:
        try:
            AuditRepository(settings.database_path).record(
                "authorization_denied",
                username=username,
                request_id=request_id,
                ip_address=ip_address,
                details={"reason": reason},
            )
        except Exception:
            logger.warning("Could not record authorization audit event", exc_info=True)

    if not authorization or not authorization.startswith("Bearer "):
        denied("missing_bearer")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticación requerida")
    payload = verify_token(
        authorization.removeprefix("Bearer ").strip(), settings.jwt_secret
    )
    if not payload:
        denied("invalid_token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida o vencida")
    username = str(payload["username"])
    user = UserRepository(settings.database_path).find_by_username(username)
    if not user or not user["is_active"]:
        denied("inactive_or_unknown_user", username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
    return dict(user)
