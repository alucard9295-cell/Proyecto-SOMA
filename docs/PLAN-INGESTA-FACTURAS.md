# Plan de ingesta de facturas

**Estado:** en curso · **Rama:** `feat/ingesta-lote-historico` · **Actualizado:** 2026-08-26

Este documento vive **dentro del repo** a propósito: el bundle de documentación
OKF está en `C:\proyectos_ia\docs`, fuera de control de versiones, así que quien
clone este repositorio no recibe ningún ADR. Mientras eso no se resuelva, lo que
haga falta para retomar el trabajo tiene que estar acá.

Objetivo: convertir PDFs de facturas de proveedor en filas de `facturas` y
`factura_items`, de forma verificable, sin que el LLM toque una sola cifra.

---

## 1. Arquitectura elegida

**Lo pesado corre local. La nube solo sirve y lee.**

```
TU MÁQUINA                                    NUBE
──────────                                    ────
PDFs (carpeta por mes)
      │
      ▼
Docling + parser genérico     ── escribe ──►  Neon · Postgres + pgvector
(~1,8 GB, ~10-40 s/factura)                          ▲
      │                                              │ lee
      ▼                                              │
document_jobs: indexed / needs_review        API FastAPI · Render free
                                                     ▲
                                                     │
                                             Sitio estático · Render free
```

### Por qué así

El extractor necesita ~1,1 GB de RAM. En Render el escalón que lo aguanta es
**Standard: $25/mes** — $300 al año para correr un lote de 40 minutos una vez al
mes. Corriéndolo en la máquina cuesta $0 y va más rápido, porque usa varios
núcleos en vez del único de la instancia.

El worker pesado **no necesita estar online**. Se lanza a mano o con el
Programador de tareas de Windows.

### Costo total

| Componente | Dónde | Costo |
| --- | --- | --- |
| Sitio estático | Render | $0 |
| API FastAPI | Render free | $0 |
| Postgres + pgvector | Neon free (0,5 GB, 100 CU-h/mes, permanente) | $0 |
| Archivos originales | Cloudflare R2 free (10 GB, sin egreso) | $0 |
| Ingesta | máquina local | $0 |
| **Total** | | **$0 / año** |

Único compromiso: el plan free de Render duerme el servicio a los 15 minutos y
despierta en ~1 minuto. Si molesta, el siguiente paso **también es gratis**:
Koyeb free duerme a la hora en vez de a los quince minutos. Solo se mueve si el
problema aparece de verdad.

**El cron de $1/mes ya no hace falta.** Se recomendó cuando la ingesta iba a
correr en la nube; al pasar a local, lo programa el sistema operativo.

### Descartados, con números

| Opción | Por qué no |
| --- | --- |
| Cloudflare Workers | Corre JS/WASM. El API es Python (FastAPI + LangGraph). Elegirlo es reescribirlo entero |
| VPS + Coolify/Dokploy | €5–7/mes = $65–90/año, y te vuelve sysadmin. Solo vale con varios proyectos |
| DigitalOcean App Platform | $5/mes = $60/año, por encima del presupuesto |
| Fly.io | ~$3/mes = $36/año. Su ventaja son los procesos persistentes, que ya no necesitamos |
| Modal | Para cargas de IA que ahora corren en la máquina local |
| Render Standard | $25/mes solo para aguantar el extractor |

---

## 2. Flujo de trabajo

### Cada mes

```powershell
# 1. Dejar los PDFs del mes en su carpeta
#    facturas_db_pdf\FACTURAS PROYECTO CASA <MES>\

# 2. Procesar (idempotente: repetir no duplica nada)
uv run --directory api python -m soma_api.jobs.ingest <carpeta> --recursivo

# 3. Revisar lo que no cerró, en la pantalla de needs_review
```

### Qué hace cada paso

1. **Registro.** Cada archivo se hashea (SHA-256). Si ese hash ya existe, se
   omite. Por eso se puede volver a correr sobre la misma carpeta sin miedo, y
   por eso la copia anidada de DICIEMBRE no ensució nada.
2. **Extracción.** Sin OCR: las facturas traen capa de texto y los dígitos
   exactos ya están en el archivo.
3. **Validación.** Dos comprobaciones, y hacen falta las dos: que la suma de los
   ítems dé el subtotal, y que subtotal más IVA dé el total.
4. **Destino.** Si cierra, entra a `facturas` y `factura_items`. Si no cierra,
   **no entra**: queda como job en `needs_review` con el motivo escrito.

### Estados de un documento

```
received ──► extracting ──┬──► indexed        (cerró: está en la base)
                          └──► needs_review   (no cerró: espera a una persona)
```

Nada pasa a `indexed` sin cuadrar. Ese es el contrato del pipeline.

---

## 3. Lo que ya está hecho y verificado

| Cambio | Verificación |
| --- | --- |
| `api/Dockerfile` respeta `$PORT` | Contenedor con `PORT=9999`: uvicorn escucha ahí, `/health` y `/ready` en 200 |
| `render.yaml` | Blueprint con dos servicios gratuitos. **No validado contra un despliegue real** |
| Servicio `db` en compose | PostgreSQL 17.11 + `vector` 0.8.6 corriendo |
| Migración 7 | `documentos_raw`, `document_jobs`, y `facturas` completada con CUFE e importes |
| Pipeline sobre SQLite | 60 documentos únicos de 67 archivos; 15 facturas, 63 ítems; segunda corrida: 67 repetidos, 0 duplicados |
| 88 tests | Verdes |

---

## 4. Lo aprendido de las facturas reales

Seis meses de facturas, 60 documentos únicos, varios emisores. Todo verificado
sobre esos archivos.

### No hace falta OCR

Todas traen capa de texto. Se extrae el **100% del texto** y **60 de 60 CUFE**.
Las que fallan no fallan por caracteres ilegibles, sino por **estructura de
tabla**. OCR devolvería el mismo texto y el mismo problema, a cambio de cientos
de MB.

### El CUFE está siempre

96 hexadecimales, extraíbles con una expresión regular en las 60. Da una clave
determinista para deduplicar **sin leer una sola cifra**, y es el puntero al
documento legal.

### Un solo lector de dinero

Los proveedores escriben `$150,000.00`, `73.361,34` y `330.000`. El punto es
decimal para uno y separador de miles para otro: los mismos caracteres
significan cosas opuestas. La regla que resuelve los tres es que **el último
separador es decimal solo si le siguen exactamente dos dígitos**.

### Tres reglas que se aprendieron por las malas

Volverán a aparecer con cada emisor nuevo. Están en el código con su comentario:

1. **Los totales solo se buscan debajo de la última fila de ítem.** Sin esa
   frontera, `IVA` hace match dentro de un renglón (`IVA 19% $285,714.00`) y el
   impuesto de la factura termina siendo el de una línea.
2. **La etiqueta debe coincidir como palabra completa, y las largas primero.**
   Sin eso, `Total` hace match dentro de `Subtotal`, y `TOTAL` le gana a
   `TOTAL A PAGAR`.
3. **Un importe debe traer separador de miles.** Sin esa exigencia, el `19` de
   `IVA 19%` entra como si fuera el impuesto, y el `2026` de una fecha como si
   fuera un monto.

### Validar los totales no valida los ítems

Los tres importes del pie se leen aparte de la tabla, así que los renglones
pueden estar destrozados y la factura igual "cuadrar". Verificado: seis de seis
pasaban la comprobación del pie mientras dos tenían los ítems ilegibles. Por eso
la suma de ítems es obligatoria.

---

## 5. Evaluación de Docling (en curso)

El parser posicional propio resuelve el **25%** (15 de 60). El resto falla por
estructura de tabla, no por texto.

[Docling](https://github.com/docling-project/docling) (IBM, **licencia MIT**)
usa TableFormer, entrenado para tablas **sin bordes dibujados** — exactamente el
caso. Devuelve encabezados **semánticos** (`Descripción`, `Valor unitario`) en
vez de coordenadas, así que un mapeo de sinónimos generaliza a emisores nunca
vistos y **elimina la necesidad de un perfil por proveedor**.

Probado en tres facturas, incluidas dos que el parser propio no puede leer:
reconstruyó las tres correctamente, y en la de control separó `REF` de
`DESCRIPCIÓN` mejor que el parser propio.

**Costo medido:** 1,2 GB de entorno + 593 MB de modelos, ~1,1 GB de RAM,
entre 6 y 40 s por factura. Es lo que obliga a correrlo local.

**Estado honesto de la medición sobre las 60:** los primeros resultados dan
pocas validadas, y la causa son bugs del mapeo, no de Docling — repite las tres
reglas de la sección anterior que no se trasladaron al script nuevo (tomó el
`19.00` del porcentaje de IVA como si fuera el monto, y `TOTAL Base Imponible`
le ganó a `TOTAL`). Las tablas que Docling entrega están bien; la capa que las
interpreta está verde.

**No se ha adoptado todavía.** La decisión se toma con la medición corregida.

### Alternativas descartadas

- **Marker**: rápido, pero GPL-3.0 más una licencia de pesos que restringe el
  uso comercial por encima de cierta facturación. Riesgo legal innecesario.
- **MinerU**: fuerte en fórmulas y documentos CJK, que no es el problema.
- **OCR (Tesseract)**: no aporta nada donde ya hay capa de texto, y degrada
  dígitos exactos.
- **Modelo de visión**: genérico pero no determinista y con costo por documento.
  Queda como asistente que **propone** una lectura en `needs_review` para que
  una persona la confirme, nunca escribiendo directo.

---

## 6. La vía del XML (pendiente de comprobar)

En Colombia **la factura electrónica es el XML UBL**; el PDF es su
representación gráfica. Con el XML, **un solo parser sirve para todos los
emisores**: sin perfiles, sin coordenadas, sin heurísticas.

El emisor está **obligado** a enviar el XML al correo que registra en el propio
documento. En estas facturas ese campo es `mermont2023@gmail.com`, así que los
XML probablemente ya estén en esa bandeja.

**Sin comprobar todavía.** Si aparecen, un parser reemplaza todo el trabajo de
extracción de PDF.

Lo que **no** es viable: automatizar la descarga desde el catálogo de la DIAN.
`catalogo-vpfe.dian.gov.co` responde 403 a clientes que no son navegador, y la
descarga masiva sin token está deshabilitada por políticas de CAPTCHA. Son
controles deliberados, no obstáculos técnicos.

Vías legítimas, en orden de conveniencia: **correo** (desatendido tras autorizar
una vez) → **portal DIAN del receptor** (login manual por tanda) → **servicio
pago** (Kontalid, QFe Collector, Dataico).

### Advertencia legal

**SOMA no es soporte contable ni tributario.** El documento válido ante la DIAN
es el XML con su CUFE, más el acuse de recibo que la Ley 2155 exige al
comprador. Extraer cifras del PDF sirve para **control de costos interno** —que
es lo que hace este producto: APU, costo unitario, simulación— pero no como
respaldo de una declaración.

El CUFE que guardamos mitiga esto: es el puntero al documento legal, así que
cualquier cifra interna es trazable al original aunque el original no esté acá.

---

## 7. Próximos pasos

En orden de rentabilidad.

1. **Corregir el mapeo de Docling** y volver a medir sobre las 60. Es el número
   que decide si se adopta.
2. **Comprobar si los XML están en el correo.** Diez minutos de búsqueda que
   pueden ahorrar semanas.
3. **Pantalla de `needs_review`.** Hoy lo que no valida existe solo en la base.
   Sin pantalla, un documento que el parser no entiende desaparece en silencio,
   que es peor que no procesarlo. Criterio de aceptación, no mejora posterior.
4. **`bootstrap_admin` en producción.** Sigue siendo un `python -m` que alguien
   debe ejecutar dentro del contenedor.
5. **Postgres gestionado** (`SOMA-ADR-004`): migrar a Neon y mover los binarios
   a R2, dejando en la base solo referencia y hash.
6. **Programar la ingesta** con el Programador de tareas de Windows.

---

## 8. Cómo retomar esto

```powershell
git checkout feat/ingesta-lote-historico
docker compose up -d db                       # Postgres local con pgvector
uv sync --directory api
uv run --directory api pytest                 # 88 tests, deben pasar todos

# Procesar facturas
uv run --directory api python -m soma_api.jobs.ingest "<carpeta>" --recursivo
```

Las facturas de prueba están en `C:\proyectos_ia\arquitectura\facturas_db_pdf`
(fuera del repo: son documentos comerciales reales).

Dónde está cada cosa:

| Qué | Dónde |
| --- | --- |
| Reglas puras (dinero, validación) | `api/src/soma_api/domain/facturas.py` |
| Extracción de PDF | `api/src/soma_api/invoice_parsing.py` |
| Persistencia | `DocumentRepository` en `api/src/soma_api/repositories.py` |
| Comando de ingesta | `api/src/soma_api/jobs/ingest.py` |
| Esquema | migración 7 en `api/src/soma_api/migrations.py` |

Lecturas previas, en el bundle externo `C:\proyectos_ia\docs`:

- `SOMA-ADR-006-ingesta-documental.md` — origen, disparo y parsers
- `SOMA-ADR-004-postgres-pgvector.md` — motor de datos y entornos por branch
- `SOMA-DATA-GOVERNANCE.md` — capas medallón y nomenclatura
- `SOMA-INFRA-AND-COSTS.md` — topología y costos
