# SOMA

Plataforma de arquitectura: sitio público de ventas + control room administrativo
para lectura de facturas, costos unitarios (APU) y simulación de proyectos de obra.

Usuario objetivo actual: **una sola persona** (el dueño del producto). Cualquier
propuesta debe justificarse a esa escala antes de añadir servicios, réplicas o
capas.

## Layout

Monorepo con dos unidades de despliegue. **No dividir en varios repositorios**
(ver `SOMA-ADR-003`): la separación que importa es de *capas de código*, no de
repos.

| Unidad | Ruta | Stack | Destino |
| --- | --- | --- | --- |
| Web | raíz (`src/`) | React 19 + Vite | Vercel |
| API | `api/` | FastAPI + uv, Python 3.12 | Railway (Dockerfile) |

Documentación viva: bundle OKF en `docs/` de este repositorio (ver `docs/index.md`).
Toda decisión de arquitectura se registra ahí como ADR, no en comentarios de código.

## Comandos

```powershell
# API
uv sync --directory api
uv run --directory api pytest                    # 58 tests, deben pasar todos
uv run --directory api uvicorn soma_api.main:app --app-dir src --reload --port 8000
uv run --directory api python -m soma_api.bootstrap_admin --username admon --password <pwd>

# Web
npm install
npm run dev          # 127.0.0.1:5173
npm run build        # obligatorio antes de dar por hecho un cambio de frontend
```

## Invariantes (no romper sin un ADR)

1. **El esquema solo cambia por migraciones.** Toda tabla nueva se declara en
   `api/src/soma_api/migrations.py` como una función + entrada en `MIGRATIONS`.
   Nunca un `CREATE TABLE` suelto ni un `executescript` de esquema.
2. **Las reglas de negocio viven en `domain/`.** Sin FastAPI, sin sqlite3, sin
   LLM. `test_architecture_layering.py` lo verifica por AST. Un cálculo tiene
   **una** implementación: si el usuario lo ve antes de guardar, lo calculó el
   backend.
3. **El dinero es `Decimal`, nunca `float`.** Todo importe pasa por
   `domain.costing.money()` en cada paso del cálculo.
4. **El SQL vive en `repositories.py`.** Las rutas no abren conexiones ni
   escriben SQL. Si una ruta necesita datos, pasa por un repositorio.
5. **Nada en la UI que no exista en el backend.** Si una pantalla llama una ruta
   no implementada, se oculta la pantalla — no se deja fallar al usuario. Es
   criterio de aceptación de la Fase 0.
6. **Secretos jamás en `VITE_*`.** El frontend solo recibe `VITE_API_BASE`.
   Claves de proveedor, `JWT_SECRET` y `DATABASE_PATH` viven solo en el entorno
   del API.
7. **El LLM no es fuente de verdad numérica.** Los cálculos de costo, duración y
   ROI los hace Python de forma determinista. El agente puede leer, no calcular
   la cifra final.
8. **MCP es de solo lectura y con allowlist.** `MCP_ENABLED=false` por defecto;
   habilitarlo exige `MCP_ALLOWED_TOOLS` explícito.

## Estado real vs. documentado

El backend implementa: `/health`, `/ready`, `/api/admin/login|me|summary`,
`/api/admin/supplies|apus|proyectos`, `/api/sales/simulation`,
`/api/agui/architect` (SSE).

**No implementado** (no exponer en UI): `/api/pipeline/process`, `/api/rag/index`,
`/api/rag/query`, `/api/chat`, `/api/report/excel`.

## Convenciones

- Español para texto de usuario y mensajes de error de la API; inglés para
  identificadores de código.
- `App.jsx` usa un estilo muy denso (un componente por línea). Al editarlo,
  respetar ese estilo en vez de reformatear el archivo entero.
- Los tests de API viven en `api/tests/` y usan `TestClient` + `tmp_path` con
  `monkeypatch.setenv("DATABASE_PATH", ...)`.

## Entorno Windows

- `pkill` desde Git Bash **no mata procesos de Windows**. Usar `Stop-Process`.
- Antes de culpar a Docker por un 404/503, comprobar que nada más ocupe el
  puerto 8000: un `uvicorn` huérfano lo secuestra y el proxy no registra ni una
  línea. Ausencia de logs del proxy es la pista.
- En heredocs de Python, `"\n"` se convierte en salto real. Usar `chr(92)`.
- La exportación por CLI de draw.io se cuelga desde esta sesión: necesita el
  renderer de Electron. Ver la skill `soma-diagrams`.

## Skills del proyecto

`soma-domain` (reglas de negocio y capas), `soma-data-layer` (migraciones y
repositorios), `soma-frontend` (UI, textos, navegación), `soma-facturas`
(extracción de facturas en PDF), `soma-docs-okf` (documentación),
`soma-diagrams` (diagramas).

Las skills registran lecciones que ya costaron caro. Antes de reimplementar algo
con otra librería o enfoque, **leer la skill correspondiente**: en la extracción
de facturas se repitieron tres errores ya diagnosticados y resueltos horas antes,
y el resultado parecía un límite de la herramienta cuando era un error conocido.
