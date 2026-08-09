---
name: soma-deployment
description: Use when changing SOMA deployment, Docker, SQLite persistence, Vercel, GitHub Actions, uv, or the frontend/API boundary.
---

# SOMA Deployment

This is a monorepo with two deployment units:

- The repository root is the React/Vite site deployed to Vercel.
- `api/` is the FastAPI control plane deployed as a container or Python
  function, with SQLite on persistent storage only when the host guarantees a
  persistent volume.

Use Astral `uv` for Python dependency resolution and keep `api/uv.lock` under
version control. Never commit `api/.env`, `api/data/`, tokens, or password
material. The admin password is hashed before it is stored in SQLite; seed it
with `soma_api.bootstrap_admin` rather than adding a password to frontend or
deployment configuration.

Vercel receives only `VITE_API_BASE`. Keep the API secret, database path, CORS
origins, and provider credentials in the API host environment. Run the API
tests and `npm run build` before deployment.
