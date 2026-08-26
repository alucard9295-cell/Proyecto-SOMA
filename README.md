# SOMA Frontend

React/Vite single-page application for the SOMA public architecture site and
administrative control room. The repository also contains the independently
deployable FastAPI API under `api/`.

## Features

- Public commercial experience at `/ventas` and `/soma`, with a live
  architectural assistant streaming through FastAPI.
- Administrative control room: invoice pipeline (PDF/ZIP/XML), operational
  summary, and a Chroma-backed RAG assistant.
- Construction control plane: normalized supply catalog, APU (unit cost)
  builder, and a project simulator that schedules partidas by yield/day.
- Versioned SQLite migrations (`api/src/soma_api/migrations.py`) with a
  repository layer as the only path to the database — no ad-hoc schema
  strings.

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

### Deploying: backend on Railway, frontend on Vercel

CLIs (installed once, globally):

```powershell
npm i -g @railway/cli vercel
```

**Backend (Railway)** — run from the repository root:

```powershell
railway login
railway init                     # or: railway link, to attach an existing project
railway volume create --mount-path /app/data   # persistent SQLite storage
```

In the Railway project settings, set **Root Directory** to `api` (the service
builds from `api/Dockerfile`). Then set these environment variables on the
Railway service (mirrors `api/.env.example`):

```text
ENVIRONMENT=production
JWT_SECRET=<generate a long random secret>
DATABASE_PATH=/app/data/soma.sqlite3
CORS_ORIGINS=https://<your-vercel-domain>
ALLOWED_HOSTS=<your-railway-domain>
```

Deploy with `railway up`, then seed the admin account once against the deployed
service (`railway run python -m soma_api.bootstrap_admin --username ... --password ...`
from within `api/`, never by putting a password in config).

**Frontend (Vercel)** — run from the repository root:

```powershell
vercel login
vercel link
vercel env add VITE_API_BASE production   # paste the Railway backend URL
vercel --prod
```

`VITE_API_BASE` is the only variable Vercel should ever receive — keep secrets,
the database path and provider credentials on the Railway side.

## Security

Never put provider credentials or API keys in this frontend or in `VITE_*`
variables. Keep them in the FastAPI backend environment. Do not commit `.env`,
`node_modules/` or `dist/`.
