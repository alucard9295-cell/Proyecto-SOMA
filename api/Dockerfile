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
CMD ["uvicorn", "soma_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
