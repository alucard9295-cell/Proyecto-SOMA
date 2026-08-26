FROM ghcr.io/astral-sh/uv:0.11.19 AS uv
FROM python:3.12-slim

COPY --from=uv /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"
ENV PYTHONDONTWRITEBYTECODE="1"

EXPOSE 8000
# El puerto lo decide la plataforma: Render y Railway inyectan PORT. Si se fija
# 8000 aqui, el proceso arranca sano en el puerto equivocado y el sintoma es
# enganoso (health check en rojo, logs limpios). `exec` deja a uvicorn como
# PID 1 para que reciba SIGTERM y cierre ordenado en cada despliegue.
CMD ["sh", "-c", "exec uvicorn soma_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
