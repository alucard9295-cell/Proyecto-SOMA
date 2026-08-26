import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..agent import ArchitectureAgent, architecture_plan
from ..config import Settings
from ..dependencies import authenticate_bearer, get_settings
from ..rate_limit import SlidingWindowLimiter


router = APIRouter(prefix="/api/agui", tags=["agent"])
agent_limiter = SlidingWindowLimiter(limit=20, window_seconds=60)


class AgentMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = Field(min_length=1, max_length=4000)


class AgentRequest(BaseModel):
    messages: list[AgentMessage] = Field(min_length=1, max_length=20)
    threadId: str | None = Field(default=None, max_length=120)
    runId: str | None = Field(default=None, max_length=120)


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/architect")
async def architect(
    payload: AgentRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    client_key = request.client.host if request.client else "unknown"
    if not agent_limiter.allow(client_key):
        raise HTTPException(status_code=429, detail="Límite de consultas alcanzado")
    if settings.agent_require_auth:
        authorization = request.headers.get("authorization", "")
        authenticate_bearer(authorization, settings, request)

    user_message = next(
        (message.content for message in reversed(payload.messages) if message.role == "user"),
        "",
    ).strip()
    if not user_message:
        raise HTTPException(status_code=422, detail="Se requiere un mensaje de usuario")
    agent: ArchitectureAgent = request.app.state.agent
    plan = architecture_plan(user_message)

    async def stream_events():
        yield _event({"type": "RUN_STARTED", "runId": payload.runId})
        yield _event({"type": "CUSTOM", "name": "architecture_plan", "value": plan})
        try:
            async for delta in agent.stream(user_message):
                yield _event({"type": "TEXT_MESSAGE_CONTENT", "delta": delta})
            yield _event({"type": "RUN_FINISHED"})
        except Exception:
            yield _event(
                {
                    "type": "RUN_ERROR",
                    "message": "El asesor no pudo completar la consulta.",
                    "request_id": getattr(request.state, "request_id", None),
                }
            )

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
