# SOMA Frontend

React/Vite single-page application for the SOMA public architecture site and
administrative control room. The repository also contains the independently
deployable FastAPI API under `api/`.

## Features

- Public commercial experience at `/ventas` and `/soma`.
- Administrative login and an empty operational summary placeholder.
- Remodeling simulator and architectural assistant streaming through FastAPI.
- Future document processing, semantic retrieval and spreadsheet reports are not
  exposed by the current UI or API scope.

The operational summary currently returns zero values and is not populated with
real SQLite document data. Document ingestion is not implemented.

## Local development

Install dependencies and start Vite:

```powershell
npm install
npm run dev
```

The frontend expects the FastAPI control plane at
`http://127.0.0.1:8000` by default. Start the API from the repository root with
`uv run --directory api uvicorn soma_api.main:app --app-dir src --reload`.
To use another API address, create a local
`.env` file with:

```text
VITE_API_BASE=https://api.example.com
```

The API is kept in this monorepo so frontend and backend changes can be reviewed
together, but it has its own dependencies, Dockerfile, database volume and
deployment target.

Initialize the local admin account once:

```powershell
uv run --directory api python -m soma_api.bootstrap_admin --username admon --password 1234
```

The command stores only a password hash in SQLite. Do not reuse this development
password in any shared or production environment.

To enable the backend agent, configure these variables in `api/.env` only:

```text
AGENT_API_KEY=...
AGENT_BASE_URL=https://opencode.ai/zen/go/v1
AGENT_MODEL=deepseek-v4-pro
```

The frontend never receives `AGENT_API_KEY`. Without a key, the API uses a
deterministic fallback so the sales flow can still be tested. `MCP_ENABLED=false`
is the default. Enabling MCP also requires an explicit comma-separated
`MCP_ALLOWED_TOOLS` list; tools that are not listed or that can write are ignored.

## Production build

```powershell
npm run build
npm run preview
```

Deploy the generated `dist/` directory to Vercel. Configure the backend URL at
build time using `VITE_API_BASE`. Deploy `api/` separately as a container with a
persistent volume; Vercel's ephemeral filesystem is not a suitable home for the
SQLite database.

For local Docker, Caddy exposes the API at `http://127.0.0.1:8000` and keeps the
FastAPI container private. In production, replace the local Caddy address with a
real domain so the proxy terminates HTTPS and preserves SSE streaming.

## Security

Never put provider credentials or API keys in this frontend or in `VITE_*`
variables. Keep them in the FastAPI backend environment. Do not commit `.env`,
`node_modules/` or `dist/`.
