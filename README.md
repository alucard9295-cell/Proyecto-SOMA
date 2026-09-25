# SOMA

Plataforma de arquitectura con dos caras: un sitio público de ventas, con
simulador y asesor, y un panel administrativo para leer facturas, llevar costos
unitarios (APU) y simular proyectos de obra.

Todo corre en **un Worker de Cloudflare, en el plan gratis**
([ADR-009](docs/SOMA-ADR-009-cloudflare.md)):

| Pieza | Ruta | Stack |
| --- | --- | --- |
| UI | `src/` | React 19 + Vite, servida como assets del Worker |
| API | `worker/` | Hono en TypeScript: `routes → services → repositories` |
| Dominio | `domain/` | Reglas puras, compartidas por la UI y el Worker |
| Datos | `migrations/` | D1 (SQLite), dinero en centavos |
| IA | — | Workers AI, con CopilotKit y un endpoint AG-UI propio |

Producción: <https://soma.mireya-compromisos.workers.dev>.

Es un monorepo a propósito: la separación que importa es de capas de código, no
de repositorios ([ADR-003](docs/SOMA-ADR-003-layering-and-boundaries.md)).

## Qué funciona hoy

- **Sitio público**: portada con contacto y mapa, simulador de proyecto y un
  asesor que calcula el escenario con el dominio y lo comenta. El asesor tiene
  un límite por IP y un tope diario.
- **Panel `/admin`**, detrás de Cloudflare Access y de la lista
  `ADMIN_EMAILS`:
  - resumen;
  - catálogo de insumos;
  - constructor de APU;
  - proyectos con partidas programadas por rendimiento diario;
  - copiloto;
  - consumo del plan gratis;
  - revisión de facturas.
- **Facturas**: el PDF se lee en el navegador con pdf.js y `domain/extraction`
  interpreta las palabras. Después, el Worker revalida con las mismas reglas.
  Una factura que no cierra queda en revisión, y se aprueba o descarta desde el
  panel, con auditoría.

`tests/architecture/route-contract.test.ts` impide que la UI llame a una ruta
que el Worker no tiene.

## Desarrollo local

```powershell
npm install
npm run db:migrate:local     # D1 local; repetir tras cada migración nueva
npm run dev                  # vite con el runtime de Workers
npm test                     # vitest: dominio, API y arquitectura (127 tests)
npm run typecheck
npm run build
```

El asesor y el copiloto usan Workers AI, que solo responde con
`npx wrangler dev` (el binding `AI` es remoto). Cómo levantar cada servidor y
sus trampas en Windows: `.claude/skills/soma-verificar`.

Los secretos locales van en `.dev.vars` (ignorado por git):

- `ADMIN_EMAILS`
- `CF_ANALYTICS_TOKEN`

## Despliegue

```powershell
npm run deploy               # typecheck + test + build + wrangler deploy
npm run db:migrate:remote    # antes, si hay migraciones nuevas
```

Los secretos de producción se cargan con `wrangler secret put <NOMBRE>`. R2 (el
binding `FILES`) está comentado en `wrangler.jsonc` hasta activarlo en el
dashboard.

## Cómo se leen las facturas, y por qué así

- **Sin OCR.** Las facturas de proveedor traen capa de texto, así que los
  dígitos exactos ya están en el archivo. Rasterizarlas para que un motor los
  adivine degrada un dato correcto.
- **Extracción posicional.** Las palabras se agrupan por su coordenada Y y se
  reparten según la X de los títulos de columna. El orden de lectura del PDF no
  coincide con el visual.
- **Un solo lector de dinero** (`domain/facturas.ts`) para `$150,000.00`,
  `73.361,34` y `330.000`. El último separador es decimal solo si le siguen
  exactamente dos dígitos.
- **Dos validaciones**: que los ítems sumen el subtotal, y que subtotal más IVA
  dé el total, con una tolerancia de un peso.
- **Añadir un proveedor** es añadir un perfil de emisor en
  `domain/extraction.ts`. No toca las rutas ni los repositorios.

## Herramientas

- `docker compose up -d dsh` levanta el harness de DeepSeek aislado sobre el
  repo. La clave va en `.env`; la plantilla está en `.env.example`.
- `tools/e2e/` tiene scripts de navegador para el asesor y las secciones.
- Las skills del proyecto están en `.claude/skills/`, y la documentación viva
  en [`docs/index.md`](docs/index.md).

## Próximos pasos

1. **Playwright en Docker**: pruebas E2E reproducibles, con capturas y videos,
   contra `wrangler dev`.
2. **Subida de videos a R2**: pide activar R2 y escribir un ADR para las
   subidas grandes.
3. **Verificar Access en `/admin`** con Google y OTP en producción.

## Seguridad

- Ningún secreto va en la UI ni en variables `VITE_*`: el frontend es del mismo
  origen y no lee entorno.
- No se commitean `.env`, `.dev.vars`, `node_modules/`, `dist/` ni facturas
  reales.
- El texto extraído de un documento es **contenido no confiable**. No puede
  originar SQL, shell ni llamadas a herramientas con escritura.
- El LLM no calcula cifras: llama tools del servidor que usan `domain/`.
- El Worker añade CSRF, cabeceras de seguridad y límites de tamaño. La CSP
  está en `public/_headers`.
