---
type: Deployment Guide
title: SOMA deployment guide — Render blueprint
description: Pasos de despliegue de la web estática y del API FastAPI, ambos declarados en render.yaml.
tags: [soma, deployment, render, neon, fastapi, docker]
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

# Topología

Un solo proveedor de ejecución, declarado en `render.yaml` en la raíz del
repositorio — Render lo busca **solo ahí**. El razonamiento está en
[ADR-008](/SOMA-ADR-008-stack-de-despliegue.md).

```text
Render · static                 Render · docker              Neon
  soma-web  (dist/)  --HTTPS-->  soma-api (FastAPI)  --TLS-->  Postgres+pgvector
  React 19 + Vite                api/Dockerfile                (destino; hoy SQLite
  rewrite de SPA                 healthcheck /health            en disco efímero)
```

Dos consecuencias que sorprenden si no se avisan:

- **CORS hace falta.** Render da un dominio por servicio, así que web y API son
  orígenes distintos. En local no pasa porque Caddy los sirve tras el mismo
  origen.
- **El API gratuito duerme.** Tras inactividad, la primera petición tarda
  decenas de segundos. No es un fallo del despliegue. Se quita con el plan
  Starter ($7/mes) cuando el uso sea diario.

**Nota histórica:** hasta agosto de 2026 esta guía describía Vercel para la web.
Se descartó porque su plan Hobby prohíbe el uso comercial y SOMA sirve trabajo
facturable. `vercel.json` sigue en el repositorio pero ya no se usa.

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

Use a stable HTTPS API domain, for example `api.soma.example.com`. Mientras no haya dominio propio,
Render asigna uno por servicio. Configurar:

```text
CORS_ORIGINS=https://soma-web.onrender.com
ALLOWED_HOSTS=api.soma.example.com
```

Do not use `*` with credentials. The browser must call the API through HTTPS;
mixed HTTP/HTTPS requests will be blocked.

# 5. Desplegar con el blueprint

No hay pasos de dashboard que recordar: `render.yaml` declara los dos servicios.

1. En Render, **New → Blueprint** y apuntar al repositorio
   `alucard9295-cell/Proyecto-SOMA`.
2. Render lee `render.yaml` de la raíz y crea `soma-web` y `soma-api`.
3. `JWT_SECRET` lo genera Render (`generateValue: true`) y lo mantiene entre
   despliegues. **No ponerlo a mano.**
4. Los secretos de proveedor (`AGENT_API_KEY`, credenciales de MCP) se cargan a
   mano en el dashboard del servicio. Nunca en el repositorio.
5. Una vez creado `soma-web`, poner su dominio real en `CORS_ORIGINS` de
   `soma-api`, y el dominio de `soma-api` en `VITE_API_BASE` de `soma-web`.

`VITE_API_BASE` es configuración **pública** por definición: viaja al navegador
dentro del bundle. Nunca poner `AGENT_API_KEY`, `JWT_SECRET` ni credenciales de
base de datos en una variable `VITE_*` — es el invariante 6 del proyecto.

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
6. A browser request from the Render web origin passes CORS.
7. Logs do not contain provider keys, passwords or JWTs.

# 7. When to add the worker

Do not add PDF processing to the first deployment. Implement the API
contract and a fake queue first, then deploy a worker beside the API. The
worker needs object storage, retry policy, dead-letter handling, memory/time
limits and an idempotency key based on the document hash.

# Rollback checklist

- Keep the previous frontend deployment available in Render (rollback a un
  deploy anterior desde el dashboard del servicio).
- Roll back the API image without deleting the database or bucket.
- Apply backward-compatible migrations before deploying code that reads them.
- Restore a database backup in staging before using it in production.
- Disable MCP and the external model provider if they cause instability.
