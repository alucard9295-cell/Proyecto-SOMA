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

The API exposes `/health`, `/api/admin/login`, `/api/admin/me` and the protected
empty dashboard summary. It also exposes the public agent stream at
`/api/agui/architect` and the deterministic remodel simulator at
`/api/sales/simulation`. Invoice, RAG and Excel modules are planned for the
administrative control room.

## Tests

```powershell
uv run --directory api pytest
```

## Security

The admin password is hashed with Python's `scrypt` implementation before it is
stored in SQLite. `JWT_SECRET` is required to be changed for production. Keep
the database on a persistent volume and never commit `api/.env` or `api/data/`.

Caddy is the intended public edge. Keep port 8000 private in production, enable
TLS at the proxy, and preserve streaming with the supplied `flush_interval -1`
configuration. `AGENT_API_KEY` belongs only in the API environment.
