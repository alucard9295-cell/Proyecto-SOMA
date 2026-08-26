# Plan de ingesta de facturas

**Estado:** en curso · **Rama:** `feat/ingesta-facturas` · **Fecha:** 2026-08-26

Este documento vive **dentro del repo** a propósito: el bundle de documentación
OKF está en `C:\proyectos_ia\docs`, fuera de control de versiones, así que quien
clone este repositorio no recibe ningún ADR. Mientras eso no se resuelva, lo que
haga falta para retomar el trabajo tiene que estar acá.

Objetivo: convertir PDFs de facturas de proveedor en filas de `facturas` y
`factura_items`, de forma automática y verificable, sin que el LLM toque una
sola cifra.

---

## 1. Qué ya está hecho y verificado

| Cambio | Verificación |
| --- | --- |
| `api/Dockerfile` respeta `$PORT` | Contenedor arrancado con `PORT=9999`: uvicorn escucha ahí, `/health` y `/ready` responden 200 |
| `render.yaml` en la raíz | Blueprint con dos servicios gratuitos; **no validado contra un despliegue real** |
| Servicio `db` en `docker-compose.yml` | PostgreSQL 17.11 + extensión `vector` 0.8.6 corriendo |

### Sobre el Dockerfile

```dockerfile
CMD ["sh", "-c", "exec uvicorn soma_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

Render y Railway inyectan `PORT`. Con el puerto fijo en 8000 el proceso arranca
**sano en el puerto equivocado**: el health check queda en rojo y los logs salen
limpios, que es de los fallos más difíciles de diagnosticar. El `exec` deja a
uvicorn como PID 1 para que reciba `SIGTERM` y cierre ordenado en cada deploy.

### Sobre `render.yaml`

Reemplaza a Vercel. El plan Hobby de Vercel es solo para uso **no comercial**;
si SOMA sirve trabajo facturable corresponde Pro ($20/mes). Un sitio estático de
Render cubre lo mismo gratis y deja todo el despliegue en un proveedor.

Los cinco headers de seguridad de `vercel.json` están portados al blueprint. Al
abandonar Vercel se habrían perdido en silencio.

**Pendiente al primer deploy:** los dominios `soma-api.onrender.com` y
`soma-web.onrender.com` son los que Render asigna por convención. Si están
tomados, asigna otros y hay que corregir `VITE_API_BASE` y `CORS_ORIGINS`.

---

## 2. Lo que aprendimos de las facturas reales

Seis facturas en `C:\proyectos_ia\arquitectura\facturas_db_pdf`, de tres
emisores. Todo lo que sigue está verificado sobre esos archivos, no supuesto.

### No hace falta OCR

Las seis tienen capa de texto. Los caracteres exactos están dentro del PDF.
Aplicar OCR sería rasterizar la página y **adivinar** dígitos que ya son
exactos: en facturas, un `8` leído como `3` corrompe el APU en silencio. OCR es
el recurso para documentos escaneados, y estos no lo son.

Consecuencia práctica: no entra Tesseract, la imagen Docker no crece cientos de
MB, y no hace falta una segunda imagen para el worker.

### El CUFE está siempre disponible

Las seis traen el CUFE (96 caracteres hexadecimales) extraíble con regex. Da una
clave única y determinista para deduplicar **sin depender de parsear una sola
cifra**. El NIT del comprador (Mermont, `901687820`) también aparece en las seis:
si no está, la factura no es nuestra y va a `needs_review`.

Ninguna trae el XML DIAN adjunto. El XML sigue siendo preferible cuando se pueda
conseguir del correo original (ver ADR-006), pero el PDF alcanza.

### Un solo parser de dinero, no tres

Los tres emisores escriben los importes distinto:

| Emisor | Escribe | Vale |
| --- | --- | --- |
| Ferretería Constructiva | `$150,000.00` | 150000.00 |
| Eleequipos | `330.000` | 330000 |
| Sodimac | `73.361,34` | 73361.34 |

El punto es decimal para el primero y separador de miles para el tercero: los
mismos caracteres significan cosas opuestas.

La regla que resuelve los tres sin saber de antemano el emisor: **el último
separador es decimal solo si le siguen exactamente dos dígitos.** La validación
aritmética confirma después si la lectura fue correcta.

*(Una versión anterior de este plan proponía configurar el formato por emisor.
Resultó innecesario.)*

### La técnica de extracción que funciona

`extract_tables()` de pdfplumber no encuentra nada: las facturas no tienen
líneas dibujadas, son columnas alineadas visualmente. Lo que sí funciona:

1. Agrupar las palabras de la página por coordenada Y → filas visuales.
2. Localizar la fila de encabezado y tomar la coordenada X de cada título.
3. Asignar cada palabra de cada fila a la columna cuyo borde esté más cerca.

Un solo algoritmo. Lo único que cambia por emisor es qué títulos buscar y a qué
campo mapea cada columna.

### Tres reglas que costaron iteraciones

Están documentadas porque volverán a aparecer al añadir un proveedor nuevo:

1. **Los totales del pie solo se buscan debajo de la última fila de ítem.** Sin
   esa frontera, `IVA` hace match dentro de una fila (`IVA 19% $285,714.00`) y el
   impuesto de la factura termina siendo el de un renglón.
2. **La etiqueta debe coincidir como palabra completa.** Sin `\b`, `Total` hace
   match dentro de `Subtotal`.
3. **Un importe debe traer separador de miles.** Sin esa exigencia, el `19` de
   `IVA 19%` y el `2026` de una fecha se cuelan como si fueran montos.

### El hallazgo que más importa

Sobre las seis facturas, `subtotal + iva = total` **cuadra en las seis**. Pero
los ítems solo salen bien en las cuatro de Ferretería (19 renglones limpios);
Eleequipos pierde la descripción y Sodimac mete todos los importes en una sola
celda.

**Validar los totales del pie no valida los ítems**: los tres importes del pie se
leen independientemente de la tabla, así que los renglones pueden estar
destrozados y la factura igual "cuadra".

La regla completa de ADR-006 §6 incluye *"la suma de los ítems coincide con el
subtotal"*, y es justamente esa mitad la que atrapa este caso. Hay que
implementar las dos.

El prototipo está en el scratchpad de la sesión (`parsers_proto.py`), no en el
repo: es material de exploración, y su contenido se reescribe siguiendo las
convenciones del proyecto al pasar a `api/`.

---

## 3. Corrección al estado documentado

`facturas` y `factura_items` **ya existen**, creadas por la migración 4
(`_create_invoices` en `api/src/soma_api/migrations.py`). Se pueden usar tal cual
para la primera versión.

No existen todavía: `documentos_raw`, `document_jobs`, `InvoiceRepository`,
rutas de documentos, ni módulo de dominio de facturas.

Esto permite correr el pipeline completo **sobre SQLite**, sin Postgres ni
almacenamiento de objetos, y verificarlo antes de migrar nada.

---

## 4. Plan por fases

El orden importa: las fases 1 a 4 no cuestan dinero y no requieren Postgres, R2
ni cron.

### Fase 1 — Desplegar lo que ya existe

Requiere intervención manual (cuenta y dashboard):

1. Crear cuenta en Render y conectar el repositorio.
2. Desplegar con el blueprint. Ajustar `VITE_API_BASE` y `CORS_ORIGINS` con los
   dominios reales asignados.
3. Ejecutar `bootstrap_admin` una vez para crear el usuario administrador.

**Sin resolver:** cómo se ejecuta `bootstrap_admin` en producción. Hoy es un
`python -m` que alguien debe correr dentro del contenedor. Hay que decidir entre
un shell del servicio, un job de una sola vez, o un arranque idempotente.

**Aviso:** mientras el API siga en SQLite sobre disco efímero, la base se
reinicia en cada despliegue. Sirve para probar, no para datos reales.

### Fase 2 — Ingesta funcionando sobre SQLite

1. **Migración 7**: `documentos_raw` (con `content_hash` único para
   idempotencia) y `document_jobs` (estado, intentos, error, timestamps).
2. **`domain/facturas.py`**: `parse_money` y las validaciones aritméticas
   —incluida la suma de ítems—. **Puro**: sin pdfplumber, sin sqlite3, sin
   FastAPI. `test_architecture_layering.py` lo verifica por AST.
3. **Parsers en infraestructura**: los tres emisores detrás de un protocolo
   común, con registro ordenado y fallback a `needs_review`.
4. **`InvoiceRepository`** siguiendo el patrón de `repositories.py`: hereda de
   `_Repository`, una sola conexión por operación atómica, devuelve `None` en vez
   de lanzar. Registrarlo en `UnitOfWork`.
5. **Comando `python -m soma_api.jobs.ingest <carpeta>`**. Trabajo nuevo real:
   **no existe forma de generar `request_id` fuera de una request HTTP**. Se
   genera en `RequestIdMiddleware` y vive en `request.state`. Un comando de cron
   corre sin request, así que hay que escribir ese helper por primera vez,
   siguiendo la forma del middleware.
6. **Tests** con el patrón existente: `tmp_path` + `monkeypatch.setenv("DATABASE_PATH", ...)`.

### Fase 3 — Arreglar Eleequipos y Sodimac

Con la validación de suma de ítems activa, ambos caen a `needs_review` como
corresponde. Se corrigen uno a uno, con la factura real como evidencia.

### Fase 4 — Ruta y pantalla de `needs_review`

Criterio de aceptación, no mejora posterior: sin esta pantalla, una factura que
el parser no entiende desaparece en silencio, que es peor que no procesarla.

Respetar el invariante 5: nada en la UI que no exista en el backend.

### Fase 5 — Postgres (ADR-004) y almacenamiento de objetos

Recién cuando el pipeline funcione a mano. Migrar a Neon y mover los binarios a
Cloudflare R2, dejando en la base solo referencia y hash.

### Fase 6 — El cron

Último. Un cron solo *agenda* un comando que ya funciona. En Render son **$1/mes
mínimo** y es el único costo fijo de todo el plan.

---

## 5. Costos

Todo lo anterior hasta la fase 4 cuesta **$0**.

| Componente | Plan | Coste |
| --- | --- | --- |
| Render — sitio estático | Free | $0 |
| Render — API | Free (duerme a los 15 min) | $0 |
| Neon — Postgres | Free, permanente, sin tarjeta | $0 (0,5 GB, 100 CU-h/mes) |
| Cloudflare R2 | Free | $0 (10 GB, sin cargo de egreso) |
| Render — cron | mínimo | **$1/mes** |

Probar no consume cuota apreciable: seis facturas son kilobytes y cada corrida
dura segundos. Neon permite 10 branches por proyecto, así que cada prueba puede
arrancar de una base limpia y desecharla después.

**No usar Airflow.** MWAA arranca en ~$350/mes y Cloud Composer en ~$300/mes.
Para decenas de facturas al mes, un cron de $1 sobra. Airflow se justifica con
decenas de pipelines interdependientes.

---

## 6. Cómo retomar esto

```powershell
git checkout feat/ingesta-facturas
docker compose up -d db                       # Postgres local con pgvector
uv sync --directory api
uv run --directory api pytest                 # 58 tests, deben pasar todos
```

Las facturas de prueba están en `C:\proyectos_ia\arquitectura\facturas_db_pdf`
(fuera del repo: son documentos comerciales reales).

Lecturas previas, en el bundle externo `C:\proyectos_ia\docs`:

- `SOMA-ADR-006-ingesta-documental.md` — decisiones de origen, disparo y parsers
- `SOMA-ADR-004-postgres-pgvector.md` — motor de datos y entornos por branch
- `SOMA-DATA-GOVERNANCE.md` — capas medallón y nomenclatura
- `SOMA-INFRA-AND-COSTS.md` — topología y costos
