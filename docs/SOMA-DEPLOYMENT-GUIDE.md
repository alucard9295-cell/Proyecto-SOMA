---
type: Deployment Guide
title: SOMA deployment guide for Vercel and FastAPI
description: Step-by-step deployment model for the Vercel frontend and separately hosted FastAPI API.
tags: [soma, deployment, vercel, fastapi, docker, cloud-run]
status: draft
generated: { by: human:product-soma, at: 2026-08-11T00:00:00Z }
sources:
  - id: architecture-guide
    resource: SOMA.md
    title: SOMA architecture and deployment
  - id: deployment-plan
    resource: SOMA-ARCHITECTURE-PLAN-2026-08-11.md
    title: SOMA architecture plan
---

# Recommended topology

```text
Vercel
  React/Vite static frontend
       |
       | HTTPS, JSON and SSE
       v
Container host
  FastAPI API
       |-- managed Postgres or persistent SQLite volume
       |-- object storage for PDFs
       |-- queue and document worker
       `-- provider secrets
```

Vercel is the right home for the web build. It is not the right home for a
long-running PDF/OCR worker or a persistent SQLite file. Deploying the current
FastAPI container to a host with a persistent disk is the fastest demo path;
Cloud Run plus Postgres and object storage is the safer production path.

# 1. Prepare the repository

Run from `C:\proyectos_ia\arquitectura\Proyecto-SOMA`:

```powershell
npm ci
npm run build
uv sync --directory api --locked
uv run --directory api pytest
docker build --file api/Dockerfile --tag soma-api:local api
```

Do not commit `.env`, `api/data/`, tokens, SQLite files, `node_modules/` or
`dist/`.

# 2. Deploy the API first

Choose one host that supports a container, environment variables, health
checks, logs and persistent data. For a first deployment, a managed container
service with a persistent disk is simpler than splitting services.

Required production variables:

```text
ENVIRONMENT=production
JWT_SECRET=<random-strong-secret>
DATABASE_PATH=/app/data/soma.sqlite3
CORS_ORIGINS=https://<vercel-project>.vercel.app
ALLOWED_HOSTS=<api-domain>
AGENT_API_KEY=<server-side-only-key>
AGENT_BASE_URL=https://opencode.ai/zen/go/v1
AGENT_MODEL=deepseek-v4-pro
MCP_ENABLED=false
```

For a demo with SQLite, configure exactly one API instance and mount a
persistent volume at `/app/data`. Take backups before every migration. Do not
use ephemeral container storage for user data.

# 3. Cloud Run production path

Cloud Run is suitable when the API is stateless and the database is external.
Before using it, replace SQLite with managed Postgres and put PDFs in Cloud
Storage. Keep the worker as a separate Cloud Run Job or service.

Example commands, after creating a Google Cloud project and enabling billing:

```powershell
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud builds submit --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/soma/soma-api ./api
gcloud run deploy soma-api `
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/soma/soma-api `
  --region <REGION> `
  --port 8000 `
  --allow-unauthenticated `
  --set-env-vars ENVIRONMENT=production,MCP_ENABLED=false `
  --set-env-vars CORS_ORIGINS=https://<vercel-project>.vercel.app `
  --set-env-vars ALLOWED_HOSTS=<api-domain>
```

Set secrets through Secret Manager rather than putting them in shell history.
Configure a startup/readiness probe against `/health`, minimum instances only
when needed, and a maximum instance count while the rate limiter is still
process-local.

The current Docker image listens on port 8000. If the platform requires the
injected `PORT` variable, change the image command to use that variable before
deploying.

# 4. Configure the API domain and CORS

Use a stable HTTPS API domain, for example `api.soma.example.com`. Point DNS to
the container platform and set:

```text
CORS_ORIGINS=https://soma.example.com,https://<vercel-project>.vercel.app
ALLOWED_HOSTS=api.soma.example.com
```

Do not use `*` with credentials. The browser must call the API through HTTPS;
mixed HTTP/HTTPS requests will be blocked.

# 5. Deploy the frontend to Vercel

1. Import the GitHub repository into Vercel.
2. Set the root directory to the repository root, not `api/`.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add `VITE_API_BASE=https://api.soma.example.com` in Preview and Production.
7. Deploy a preview and verify the browser network calls use that API origin.
8. Add the final Vercel domain to `CORS_ORIGINS` on the API.

`VITE_API_BASE` is public configuration. Never put `AGENT_API_KEY`,
`JWT_SECRET`, database credentials or MCP credentials in Vercel variables named
`VITE_*`.

# 6. Smoke test after deployment

```powershell
curl https://api.soma.example.com/health
```

Then verify, in order:

1. `/ventas` loads without console errors.
2. The public agent returns SSE events.
3. Invalid login returns 401 and valid login returns a token.
4. The protected summary rejects requests without a Bearer token.
5. The simulator rejects negative values and returns deterministic results.
6. A browser request from the Vercel origin passes CORS.
7. Logs do not contain provider keys, passwords or JWTs.

# 7. When to add the worker

Do not add PDF processing to the first Vercel deployment. Implement the API
contract and a fake queue first, then deploy a worker beside the API. The
worker needs object storage, retry policy, dead-letter handling, memory/time
limits and an idempotency key based on the document hash.

# Rollback checklist

- Keep the previous frontend deployment available in Vercel.
- Roll back the API image without deleting the database or bucket.
- Apply backward-compatible migrations before deploying code that reads them.
- Restore a database backup in staging before using it in production.
- Disable MCP and the external model provider if they cause instability.
