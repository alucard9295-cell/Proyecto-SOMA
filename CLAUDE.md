# SOMA

Plataforma de arquitectura con dos caras: un sitio público de ventas, con
simulador y asesor, y un panel administrativo para leer facturas, llevar costos
unitarios (APU) y simular proyectos de obra.

Hay **un solo usuario** real, la dueña del producto. Cualquier propuesta tiene
que justificarse a esa escala antes de añadir servicios, colas o capas.

## Stack (ver `docs/SOMA-ADR-009-cloudflare.md`)

Un solo Worker de Cloudflare, en el plan gratis, sirve la SPA y el API:

| Pieza | Ruta | Qué es |
| --- | --- | --- |
| UI | `src/` | React 19 + Vite. Se sirve como assets desde `dist/client` |
| API | `worker/` | Hono en TS: `routes/ → services/ → repositories/` |
| Dominio | `domain/` | Reglas puras (costeo, simulación, facturas, dinero), compartidas por la UI y el Worker |
| Esquema | `migrations/` | SQL de D1, numerado |
| Config | `wrangler.jsonc` | Bindings `DB` (D1), `AI`, `ASESOR_LIMITE`, `ASSETS`; `FILES` (R2) comentado hasta activarlo |

- Producción: `https://soma.mireya-compromisos.workers.dev`.
- `/admin` y `/api/admin` están detrás de Cloudflare Access, y además el Worker
  exige que el correo esté en `ADMIN_EMAILS`.
- **Es un monorepo, y no se divide en repos** (ADR-003 y ADR-009). La separación
  que importa es de capas, y `domain/` se comparte entre la UI y el Worker.
- Ya no existen `api/` (FastAPI), Render, Neon, Vercel ni Caddy. Si un documento
  viejo los menciona, manda el ADR-009.

Documentación viva: el bundle OKF de `docs/` (empezar por `docs/index.md`).
Toda decisión de arquitectura va ahí como ADR, no en comentarios de código.

## Comandos

```powershell
npm install
npm run dev                  # vite con el runtime de Workers
npm test                     # vitest: 127 tests, tienen que pasar todos
npm run typecheck
npm run build                # obligatorio antes de dar por hecho un cambio
npm run db:migrate:local     # tras añadir un archivo en migrations/
npx wrangler dev --port 8787 --ip 127.0.0.1   # hace falta para probar Workers AI
```

`npm run deploy` corre typecheck, test y build, y después `wrangler deploy`. Toca
producción: **se pide confirmación antes**. `db:migrate:remote` también.

Los secretos locales van en `.dev.vars` (ignorado). En producción se cargan con
`wrangler secret put`. Nunca se leen ni se imprimen en el chat.

## Invariantes (no romper sin un ADR)

`tests/architecture/` verifica la mayoría. Si un test de arquitectura falla, se
arregla el código, no el test.

1. **El esquema solo cambia por migraciones.** Cada cambio es un archivo nuevo
   en `migrations/`. Nunca se edita una migración ya aplicada.
2. **Las reglas de negocio viven en `domain/`**, sin Hono, D1 ni LLM. Un cálculo
   tiene **una** implementación: la UI importa la misma función del dominio que
   usa el Worker.
3. **El dinero son centavos enteros** en D1 y `big.js` en los cálculos. Nunca un
   `number` con decimales para un importe.
4. **El SQL vive solo en `worker/repositories/`.** Las rutas no escriben SQL ni
   calculan costos: llaman a `services/`. Las escrituras de varios pasos van en
   `db.batch`, porque D1 no tiene transacciones interactivas.
5. **Nada en la UI que no exista en el API.** `route-contract.test.ts` falla si
   el frontend llama una ruta que el Worker no tiene.
6. **El frontend no lee variables de entorno.** Todo es del mismo origen. Los
   secretos (`ADMIN_EMAILS`, `CF_ANALYTICS_TOKEN`) viven solo en el Worker, y
   nunca en `VITE_*`.
7. **El LLM no es fuente de verdad numérica.** Costo, duración y ROI los calcula
   `domain/`. El asesor y el copiloto llaman tools que ejecuta el servidor y
   comentan el resultado.
8. **Toda IA pública tiene tope**: el límite por IP (`ASESOR_LIMITE`) y el tope
   diario en D1 (`uso_asesor`). Una ruta nueva que llame a Workers AI necesita
   los dos.
9. **Los datos reales de facturas nunca se commitean.**

## Convenciones

- Español para el texto de usuario y los mensajes de error del API; inglés o
  español llano en los identificadores, según lo que ya use el archivo.
- Las pruebas del Worker viven en `tests/api` (runtime de Workers), las del
  dominio en `tests/domain` y las de capas en `tests/architecture`.

## Skills del proyecto (`.claude/skills/`)

| Skill | Cuándo |
| --- | --- |
| `soma-verificar` | Levantar servidores, probar el asesor, navegador y producción |
| `soma-domain` | Reglas de negocio y capas |
| `soma-data-layer` | Migraciones D1 y repositorios |
| `soma-frontend` | UI, textos y navegación |
| `soma-facturas` | Extracción de facturas en PDF |
| `soma-docs-okf` | Documentación y ADRs |
| `soma-diagrams` | Diagramas |

Las skills guardan lecciones que ya costaron caro. **Leer la que toque antes de
reimplementar algo**: en la extracción de facturas se repitieron tres errores
que ya estaban diagnosticados. Lo que se aprenda del entorno se registra en la
skill en el momento (skill global `registrar-leccion`).

## Herramientas de desarrollo

- `docker compose up -d dsh` levanta el harness de DeepSeek (dsh) aislado sobre
  el repo. Ver la skill global `dsh-harness`.
- `tools/e2e/` tiene scripts de navegador para el asesor y las secciones.
- Windows: `pkill` no mata procesos y `TaskStop` no libera puertos. Ver la
  skill global `windows-dev`.
