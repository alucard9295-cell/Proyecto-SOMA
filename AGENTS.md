# SOMA React Frontend

## Scope

React/Vite SPA for the public SOMA landing page and the local operational
panel. The FastAPI control plane in `api/` remains the only backend boundary.

## Commands

- Install: `npm install`.
- Development: `npm run dev`.
- Production build: `npm run build`.
- Preview build: `npm run preview`.

## Architecture

- `src/App.jsx`: view routing and API-connected modules.
- `src/styles.css`: design tokens, responsive layout and animations.
- `src/assets/`: owned SVG assets and future project imagery.
- `VITE_API_BASE`: public backend URL only; never place secrets in frontend env. Local default is `http://127.0.0.1:8000`.
- The chat generation provider is selected in the UI, but Go credentials stay in the Python `.env`.

## Rules

- Keep business secrets in FastAPI, never in React.
- Treat the landing page as commercial and the panel as operational.
- Preserve accessible labels, keyboard actions and reduced-motion behavior.
- Use the design rules in `DESIGN.md` before adding components.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
