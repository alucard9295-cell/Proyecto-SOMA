---
name: soma-frontend
description: Use when changing the SOMA React/Vite frontend, visual design, login UI, responsive behavior, or files under src/.
---

# SOMA Frontend

Preserve the existing editorial architecture language: warm paper, graphite,
terracotta, muted olive, serif display headings, system sans body text, and
compact monospace metadata. Read `DESIGN.md` before changing visual behavior.

Keep public sales storytelling separate from the administrative control room.
Keep secrets and business logic out of React. `VITE_API_BASE` may contain only a
public API origin. The API is the FastAPI service in `api/` and defaults to
`http://127.0.0.1:8000` locally.

Maintain accessible labels, keyboard actions, mobile layouts, and reduced-motion
behavior. Run `npm run build` after frontend changes.
