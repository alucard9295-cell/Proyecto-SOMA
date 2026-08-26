from contextlib import asynccontextmanager
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .agent import ArchitectureAgent
from .config import load_settings
from .database import database_ready, init_db
from .observability import configure_logging
from .routes.auth import router as auth_router
from .routes.summary import router as summary_router
from .routes.agent import router as agent_router
from .routes.simulation import router as simulation_router
from .routes.construction import router as construction_router
from .routes.documents import router as documents_router


logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Content-Security-Policy", "frame-ancestors 'none'")
        if request.app.state.settings.environment == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class RequestSizeMiddleware(BaseHTTPMiddleware):
    max_bytes = 2 * 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        try:
            too_large = content_length and int(content_length) > self.max_bytes
        except ValueError:
            too_large = True
        if too_large:
            return JSONResponse(
                {
                    "detail": "Solicitud demasiado grande",
                    "request_id": request.state.request_id,
                },
                status_code=413,
            )
        return await call_next(request)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid4())
        request.state.request_id = request_id
        started = perf_counter()
        context = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "client": request.client.host if request.client else None,
        }
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Error no controlado",
                extra={**context, "duration_ms": round((perf_counter() - started) * 1000, 2)},
            )
            response = JSONResponse(
                {"detail": "Error interno del servidor", "request_id": request_id},
                status_code=500,
            )
        duration_ms = round((perf_counter() - started) * 1000, 2)
        # Un evento por peticion, correlacionable con el X-Request-ID que ve
        # el usuario cuando algo falla.
        logger.log(
            logging.WARNING if response.status_code >= 500 else logging.INFO,
            "request",
            extra={**context, "status": response.status_code, "duration_ms": duration_ms},
        )
        response.headers["X-Request-ID"] = request_id
        return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = load_settings()
    configure_logging(settings.log_level)
    app.state.settings = settings
    init_db(settings.database_path)
    logger.info(
        "api iniciada",
        extra={"environment": settings.environment, "database": settings.database_path},
    )
    await app.state.agent.initialize()
    yield


settings = load_settings()
app = FastAPI(title="SOMA API", version="0.1.0", lifespan=lifespan)
app.state.settings = settings
app.state.agent = ArchitectureAgent(settings)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(RequestIdMiddleware)
app.include_router(auth_router)
app.include_router(summary_router)
app.include_router(agent_router)
app.include_router(simulation_router)
app.include_router(construction_router)
app.include_router(documents_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["system"])
def ready(request: Request):
    if not database_ready(request.app.state.settings.database_path):
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return {"status": "ready"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        {"detail": exc.detail, "request_id": request.state.request_id},
        status_code=exc.status_code,
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"loc": error.get("loc"), "msg": error.get("msg"), "type": error.get("type")}
        for error in exc.errors()
    ]
    return JSONResponse(
        {"detail": errors, "request_id": request.state.request_id},
        status_code=422,
    )
