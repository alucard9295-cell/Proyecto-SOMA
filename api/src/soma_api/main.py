from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .agent import ArchitectureAgent
from .config import load_settings
from .database import init_db
from .routes.auth import router as auth_router
from .routes.summary import router as summary_router
from .routes.agent import router as agent_router
from .routes.simulation import router as simulation_router
from .routes.construction import router as construction_router


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
                {"detail": "Solicitud demasiado grande"}, status_code=413
            )
        return await call_next(request)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = load_settings()
    init_db(settings.database_path)
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
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(summary_router)
app.include_router(agent_router)
app.include_router(simulation_router)
app.include_router(construction_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
