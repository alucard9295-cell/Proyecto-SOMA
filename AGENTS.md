# SOMA

Instrucciones para agentes que no son Claude Code (OpenCode, dsh). La versión
completa, con invariantes y comandos, está en `CLAUDE.md`, y manda sobre esta.

## Alcance

Un solo Worker de Cloudflare (Hono en `worker/`) sirve la SPA de React (`src/`)
y el API (`/api/*`). Las reglas de negocio viven en `domain/`, que comparten la
UI y el Worker. Los datos están en D1 (`migrations/`) y la IA es Workers AI.
Stack y motivos: `docs/SOMA-ADR-009-cloudflare.md`. Ya no existe `api/`
(FastAPI).

## Comandos

- `npm install`, `npm run dev`, `npm test` (vitest), `npm run typecheck` y
  `npm run build`.
- `npm run deploy` y `npm run db:migrate:remote` tocan producción: no se
  ejecutan sin que lo pida la persona.

## Reglas

- Capas: `routes → services → repositories`; el SQL solo en `repositories/`.
  Los tests de `tests/architecture/` lo verifican.
- El dinero se guarda en centavos enteros y se calcula con `big.js`. El LLM
  nunca calcula cifras.
- Ningún secreto en el frontend ni en `VITE_*`. No leer `.env` ni `.dev.vars`.
- La landing es comercial y el panel es operativo. Respetar las etiquetas
  accesibles, el teclado y `reduced-motion`. Reglas de diseño en `docs/design/`.
- Skills del proyecto en `.claude/skills/` (las lee OpenCode también).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
