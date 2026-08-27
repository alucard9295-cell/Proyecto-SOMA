# Log

## 2026-08-27

- [ADR-008](SOMA-ADR-008-stack-de-despliegue.md): stack de despliegue. **Render
  para web y API, Neon para datos.** Se descarta Vercel por una razón que no es
  técnica: su plan Hobby prohíbe el uso comercial, y SOMA sirve trabajo
  facturable de un despacho, así que la opción «gratis» costaba $20/mes de Pro.
  Render static es gratuito y sí permite uso comercial. Se descarta Railway
  ($5/mes) porque a escala de un usuario repartir web y API entre dos
  proveedores no compra nada. Total real: **~$1/mes**, el dominio. Contrapartida
  aceptada: el API gratuito de Render duerme y la primera petición tarda decenas
  de segundos; la salida es el plan Starter a $7/mes cuando el uso sea diario.
  Sustituye la elección de proveedores del ADR-001 y la tabla de costos previa.

- [ADR-007](SOMA-ADR-007-frontera-de-la-documentacion.md): el bundle OKF pasa al
  repositorio; la doctrina transversal y la infraestructura de memoria se quedan
  fuera a propósito.

- Diagramas rehechos: tres, uno por pregunta, en lectura izquierda→derecha y con
  franja transversal. Y una corrección de fondo — pintaban el **destino** como si
  fuera el **presente**. Verificado contra el código: hoy es Render (no Vercel ni
  Railway), SQLite en disco efímero (no Neon), sin bucket R2 y sin cron. Trazo
  sólido pasa a significar «existe hoy»; punteado, «decidido, sin construir».

## 2026-08-25

- [ADR-006](SOMA-ADR-006-ingesta-documental.md): ingesta documental. Se decide el
  prefijo `inbox/` del bucket R2 como único origen canónico (correo y Drive
  quedan como adaptadores que depositan ahí, no como orígenes), el disparo por
  **cron de Render** —elegido sobre Railway por su garantía de una sola corrida
  activa y por reutilizar `api/Dockerfile` sin una segunda imagen—, la
  precedencia de **XML DIAN sobre PDF** (en Colombia el XML UBL *es* la factura;
  el PDF es su representación gráfica), y un puerto `ParserFactura` con registro
  ordenado para que agregar un proveedor no toque el pipeline. Un documento cuyos
  totales no cuadran nunca entra a `silver`: va a `needs_review`.
- Verificado que el harness de despliegue no está en las skills: `soma-data-layer`,
  `soma-diagrams` y `soma-docs-okf` no cubren infraestructura, ingesta ni pruebas
  entre servicios.
- Verificado que **ningún proyecto de la máquina tiene parsers de PDF**. El
  `agente_finanzas` del hackathon parsea CSV y XLSX con pandas/openpyxl; sus
  aciertos de "factura" son la métrica `facturacion_real`, no extracción. Lo que
  sí es reutilizable de ahí: el patrón `loader.py` + `metrics.py` (cada métrica
  cita la regla de negocio que implementa), el manejo de datos colombianos
  (separador `;`, decimal `,`, deduplicación por clave compuesta) y un
  `render.yaml` probado que documenta que **Render no corta conexiones largas**
  — evidencia real a favor del SSE del asesor.
- Evaluados y descartados para el harness: `browser-use` (instalado aislado en
  `_sandbox/browser-use-lab`, sin tarea real hoy; no entra en `api/` porque
  Playwright+Chromium pesan ~1 GB y un agente de navegador es escritura pura
  frente al invariante 6) y el leaderboard de MCP de artifacta (es un directorio
  ordenado por popularidad, no por calidad; queda como referencia, no como lista
  de instalación).

## 2026-08-24

- [`7f293ed`](https://github.com/alucard9295-cell/Proyecto-SOMA/commit/7f293ed) refactor: extraer dominio, unidad de trabajo,
  logging JSON y stack Docker. Nace `domain/costing.py` y
  `domain/scheduling.py`; se elimina la fórmula AIU duplicada entre
  `App.jsx` y `construction.py` vía `POST /api/admin/apus/preview`; dinero
  pasa a `Decimal`; listar 50 APUs baja de 101 conexiones SQLite a 2
  (medido); logging JSON con `request_id`; stack Docker verificado extremo
  a extremo. Tests 21 → 58. Esto es lo que sostiene el "después" de
  [la evaluación](SOMA-EVALUATION-2026-08-24.md).
- [`0afb762`](https://github.com/alucard9295-cell/Proyecto-SOMA/commit/0afb762) fix: navegación con historial, textos en
  YAML y asesor como widget flotante. Corrige que el botón Atrás no
  cambiaba de vista (faltaba listener `popstate`) y que volver de ventas
  pedía login otra vez; los textos migran a `site.yaml`; el asesor pasa a
  globo flotante; se corrige una colisión de CSS
  (`.simulator-result`/`.simulator-kpis` definidas dos veces).
- [`d4c33fe`](https://github.com/alucard9295-cell/Proyecto-SOMA/commit/d4c33fe) fix: acceso a ventas desde el login,
  asesor con icono de chat y reinicio. Botón "Ver ventas" y logo navegables
  desde el login; icono de chat en vez de punto verde; botón de reinicio de
  conversación; `AdminLogin` lee textos de `site.yaml`.

- Diagnóstico completo tras integrar el control plane de construcción:
  [SOMA-DIAGNOSTIC-2026-08-24](SOMA-DIAGNOSTIC-2026-08-24.md). Ocho hallazgos,
  dos críticos (superficie muerta en la UI, dashboard con ceros hardcodeados).
- [ADR-003](SOMA-ADR-003-layering-and-boundaries.md): se mantiene el monorepo y
  se adopta capas hexagonales (`domain` / `application` / `infrastructure` /
  `interface`). Se fija el criterio REST vs SSE vs cola de jobs.
- [ADR-004](SOMA-ADR-004-postgres-pgvector.md): Postgres con pgvector como motor
  único; se descarta Chroma como servicio aparte y los prefijos de entorno se
  reemplazan por branches de base de datos.
- Nuevos documentos: [gobierno de datos](SOMA-DATA-GOVERNANCE.md),
  [topología y costos](SOMA-INFRA-AND-COSTS.md), [harness](SOMA-HARNESS.md).
- [Evaluación multi-arista](SOMA-EVALUATION-2026-08-24.md): global ~5,3/10. Hallazgos
  nuevos: la fórmula AIU está duplicada en frontend y backend, y el refactor de
  repositorios introdujo 101 conexiones SQLite para listar 50 APUs.
- [Plan E2E](SOMA-E2E-TEST-PLAN.md) con Playwright en `e2e/` del mismo repo.
- Restaurada la Fase 0 en el repositorio: se retiró la UI que llamaba rutas
  inexistentes y se añadió un test de contrato frontend↔API que impide la
  regresión.

## 2026-08-11

- Plan de arquitectura por fases y revisión de Clean Code.
- Fase 0 implementada: migraciones versionadas, repositorio de usuarios,
  auditoría con redacción, MCP con allowlist, CORS restringido, `/ready`.

## 2026-08-08

- Auditoría externa inicial.
- [ADR-001](SOMA-ADR-001-api-boundary.md) y
  [ADR-002](SOMA-ADR-002-agent-streaming-and-mcp.md).
