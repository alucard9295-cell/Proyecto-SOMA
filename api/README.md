# SOMA API

FastAPI control plane for the SOMA web application.

## Local setup

From the repository root:

```powershell
Copy-Item api\.env.example api\.env
uv sync --directory api
uv run --directory api python -m soma_api.bootstrap_admin --username admon --password 1234
uv run --directory api uvicorn soma_api.main:app --app-dir src --reload --port 8000
```

The API exposes `/health` (liveness), `/ready` (SQLite readiness),
`/api/admin/login`, `/api/admin/me` and the protected operational summary. It
also exposes the public agent stream at `/api/agui/architect` and the
deterministic remodel simulator at `/api/sales/simulation`.

The operational summary is currently an empty placeholder with zero values, not
a report populated from real SQLite document data. Document processing and
storage are not implemented.

Document processing, semantic retrieval and spreadsheet reports are planned,
but are not implemented and are intentionally absent from the UI/API contract.

## Tests

```powershell
uv run --directory api pytest
```

## Security

The admin password is hashed with Python's `scrypt` implementation before it is
stored in SQLite. `JWT_SECRET` is required to be changed for production. Keep
the database on a persistent volume and never commit `api/.env` or `api/data/`.
SQLite changes are applied by repeatable versioned Python migrations. Existing
users are preserved and login/authentication denials are recorded in
`audit_events` without credentials or tokens.

Caddy is the intended public edge. Keep port 8000 private in production, enable
TLS at the proxy, and preserve streaming with the supplied `flush_interval -1`
configuration. `AGENT_API_KEY` belongs only in the API environment.

MCP is disabled by default. If enabled, configure exact read-only tool names in
`MCP_ALLOWED_TOOLS`; unlisted and writing tools are rejected, with bounded
timeouts and output sizes.
