# SOMA

Plataforma de arquitectura: sitio público de ventas y control room administrativo
para lectura de facturas, costos unitarios (APU) y simulación de proyectos de obra.

Monorepo con dos unidades de despliegue. La separación que importa es de *capas
de código*, no de repositorios (ver `SOMA-ADR-003`).

| Unidad | Ruta | Stack |
| --- | --- | --- |
| Web | raíz (`src/`) | React 19 + Vite |
| API | `api/` | FastAPI + uv, Python 3.12 |

## Estado real

Este apartado describe lo que **funciona hoy**, no lo planeado. Una pantalla que
llame a una ruta inexistente se oculta en vez de fallarle al usuario, y un test
de contrato (`test_frontend_route_contract.py`) impide que eso se rompa.

**Implementado:**

- Sitio público de ventas con asesor arquitectónico por SSE (`/api/agui/architect`).
  Sin clave de proveedor configurada responde con un fallback determinista, así
  que el flujo se puede probar sin facturar llamadas de IA.
- Control room: autenticación con JWT propio, resumen operativo, catálogo de
  insumos normalizado, constructor de APU y simulador de proyectos que programa
  partidas por rendimiento/día.
- Ingesta de facturas por línea de comandos: de un PDF de proveedor a filas de
  `facturas` y `factura_items`, con validación aritmética. Ver más abajo.
- Migraciones SQLite versionadas, con la capa de repositorios como único camino
  a la base.

**No implementado** (no exponer en la UI): `/api/pipeline/process`,
`/api/rag/index`, `/api/rag/query`, `/api/chat`, `/api/report/excel`.

No hay RAG ni base vectorial en funcionamiento. Cuando los haya, será Postgres
con `pgvector`, no un servicio aparte (`SOMA-ADR-004`).

## Desarrollo local

```powershell
# Web
npm install
npm run dev                   # 127.0.0.1:5173

# API
uv sync --directory api
uv run --directory api pytest                    # deben pasar todos
uv run --directory api uvicorn soma_api.main:app --app-dir src --reload --port 8000
```

La web espera el API en `http://127.0.0.1:8000`. Para apuntar a otra dirección,
crear un `.env` en la raíz con `VITE_API_BASE=https://api.ejemplo.com`.

Crear la cuenta de administración una vez:

```powershell
uv run --directory api python -m soma_api.bootstrap_admin --username admon --password 1234
```

Solo se guarda el hash. Esa contraseña de desarrollo no se reutiliza en ningún
entorno compartido.

### Stack completo con Docker

```powershell
docker compose up --build     # web + API tras Caddy en 127.0.0.1:8000
docker compose up -d db       # solo Postgres 17 con pgvector, en 127.0.0.1:5432
```

El servicio `db` existe para desarrollar la migración de `SOMA-ADR-004` contra un
Postgres real y para inspeccionar datos con DBeaver. Está desacoplado: el API
sigue usando SQLite y nada dentro de compose lo consume todavía. **No instalar
Postgres en Windows**: la versión y las extensiones diferirían de producción, que
es justo lo que esta imagen evita.

### Agente y MCP

```text
AGENT_API_KEY=...
AGENT_BASE_URL=https://opencode.ai/zen/go/v1
AGENT_MODEL=deepseek-v4-pro
```

Van únicamente en `api/.env`. La web nunca recibe `AGENT_API_KEY`. `MCP_ENABLED`
es `false` por defecto; habilitarlo exige además una lista explícita en
`MCP_ALLOWED_TOOLS`, y las herramientas que no estén listadas o que puedan
escribir se ignoran.

## Ingesta de facturas

```powershell
uv run --directory api python -m soma_api.jobs.ingest <carpeta> --recursivo
```

El mismo comando corre a mano o desde un cron de la plataforma. Es idempotente
por `content_hash`: volver a pasar la misma carpeta no duplica una sola factura.

Cómo funciona, y por qué así:

- **Sin OCR.** Las facturas de proveedor traen capa de texto: los dígitos exactos
  ya están en el archivo. Rasterizar para que un motor los adivine degrada un
  dato correcto, y un `8` leído como `3` corrompe el APU en silencio.
- **Extracción posicional.** Las palabras se agrupan por coordenada Y y se
  reparten según la X de los títulos de columna. El orden de lectura del PDF no
  coincide con el visual, y `extract_tables()` no sirve porque estas facturas
  alinean columnas sin dibujar líneas.
- **Un solo lector de dinero.** Los proveedores escriben `$150,000.00`,
  `73.361,34` y `330.000`: el punto es decimal para uno y separador de miles para
  otro. La regla que resuelve los tres es que el último separador es decimal solo
  si le siguen exactamente dos dígitos.
- **Dos validaciones, y hacen falta las dos.** Que la suma de los ítems dé el
  subtotal, y que subtotal más IVA dé el total. La segunda sola no alcanza: los
  importes del pie se leen aparte de la tabla, así que los renglones pueden estar
  ilegibles y la factura igual "cuadrar".
- **Una factura que no cierra no entra.** Queda como job en `needs_review` con el
  motivo escrito. `silver` es la fuente de verdad numérica y no admite cifras sin
  verificar.

Sobre 60 documentos reales de seis meses, 15 quedan registradas y 45 en revisión:
20 porque los ítems no se leen bien y 14 porque el emisor no tiene perfil. Añadir
un proveedor es añadir un `PerfilEmisor` en `invoice_parsing.py`; no toca el
comando, ni el repositorio, ni las rutas.

## Despliegue

`render.yaml` en la raíz despliega ambas unidades en Render, las dos en plan
gratuito: `soma-web` como sitio estático y `soma-api` como contenedor.

Reemplaza a Vercel a propósito: su plan Hobby es solo para uso **no comercial**, y
si SOMA sirve trabajo facturable corresponde Pro ($20/mes). Los cinco headers de
seguridad que vivían en `vercel.json` están portados al blueprint.

Después del primer despliegue hay que ajustar `VITE_API_BASE` y `CORS_ORIGINS`
con los dominios que Render asigne realmente, y crear la cuenta de administración
una vez contra el servicio desplegado.

**Aviso:** mientras el API siga en SQLite sobre disco efímero, la base se
reinicia en cada despliegue. Sirve para probar, no para datos reales. Lo resuelve
`SOMA-ADR-004` con Postgres gestionado.

## Próximos pasos

En orden. El detalle está en [`docs/PLAN-INGESTA-FACTURAS.md`](docs/PLAN-INGESTA-FACTURAS.md).

1. **Pantalla de `needs_review`.** Hoy las 45 facturas en revisión existen solo en
   la base. Sin una pantalla que las muestre y permita corregirlas, un documento
   que el parser no entiende desaparece en silencio — peor que no procesarlo. Es
   criterio de aceptación, no una mejora posterior.
2. **Perfiles de emisor faltantes.** Catorce facturas no tienen parser. Cada
   perfil nuevo es una entrada en `PERFILES`, con la factura real como evidencia.
3. **Ítems de Sodimac y similares.** Veinte facturas reconocen al emisor pero no
   separan la tabla: su encabezado ocupa tres líneas y los importes no tienen
   columna titulada.
4. **`bootstrap_admin` en producción.** Sigue siendo un `python -m` que alguien
   debe ejecutar dentro del contenedor. Hay que decidir entre un shell del
   servicio, un job de una sola vez, o un arranque idempotente.
5. **Postgres gestionado** (`SOMA-ADR-004`): migrar a Neon, mover los binarios a
   almacenamiento de objetos y dejar en la base solo referencia y hash.
6. **Cron de ingesta.** Último, y el único costo fijo del plan: $1/mes en Render.
   Un cron solo *agenda* un comando que ya funciona.

Pendiente de decidir, fuera del plan: el bundle de documentación OKF vive en
`C:\proyectos_ia\docs`, **fuera de control de versiones**. Quien clone este
repositorio no recibe ningún ADR.

## Seguridad

Las credenciales de proveedor y las claves de API nunca van en la web ni en
variables `VITE_*`: viven solo en el entorno del API. No se commitean `.env`,
`node_modules/` ni `dist/`.

El texto extraído de un documento es **contenido no confiable**: no puede
originar SQL, shell, filesystem ni llamadas a herramientas con escritura.
