---
name: soma-facturas
description: Usar al tocar la extracción de facturas de proveedor en PDF — parsers, mapeo de columnas, lectura de importes, validación aritmética, o al agregar un emisor nuevo. Cubre las reglas que ya se aprendieron por las malas y que reaparecen con cada proveedor.
---

# Extracción de facturas de proveedor

Convertir un PDF de factura en filas de `facturas` y `factura_items`. Medido
sobre 60 documentos reales de seis meses y varios emisores.

## Antes de escribir un parser nuevo: lee esto entero

**La lección más cara de este módulo no fue técnica.** Al reimplementar la
extracción con otra librería, se volvieron a cometer las mismas tres
equivocaciones que ya se habían diagnosticado y resuelto horas antes con la
librería anterior. El resultado fue una medición de 4/60 que parecía un límite
de la herramienta y era un error propio ya conocido.

**Si vas a cambiar de librería, de enfoque o de emisor, las reglas de la
siguiente sección viajan contigo.** No son detalles de implementación: son
propiedades de cómo están escritas las facturas colombianas.

## Las cuatro reglas de lectura del pie

Cada una tiene un síntoma concreto que ya ocurrió:

| Regla | Sin ella |
| --- | --- |
| Un importe **debe traer separador de miles** | El `19` de `IVA 19%` entra como monto del impuesto, y el `2026` de una fecha como monto |
| Las etiquetas **largas se prueban primero** | `TOTAL` le gana a `TOTAL A PAGAR`, y `TOTAL Base Imponible` a ambas |
| La etiqueta debe coincidir como **palabra completa** (`\b`) | `Total` hace match dentro de `Subtotal` y toma el número equivocado |
| Los totales solo se buscan **debajo de la última fila de ítem** | `IVA` hace match dentro de un renglón (`IVA 19% $285,714.00`) y el impuesto de la factura resulta ser el de una línea |

## Dinero: un solo lector para todos los emisores

Los proveedores escriben el mismo número de tres formas incompatibles:

| Escriben | Vale |
| --- | --- |
| `$150,000.00` | 150000.00 (coma miles, punto decimal) |
| `73.361,34` | 73361.34 (punto miles, coma decimal) |
| `330.000` | 330000.00 (punto miles, sin decimales) |

El punto es decimal para el primero y separador de miles para el tercero: los
mismos caracteres significan cosas opuestas.

**La regla que resuelve los tres sin conocer al emisor: el último separador es
decimal solo si le siguen exactamente dos dígitos.** No hace falta configurar el
formato por proveedor — se intentó y resultó innecesario.

**Tomar solo el primer número del texto.** Limpiar todo lo que no sea dígito
concatena dos importes vecinos: una celda con `$285,714.00 $340,000.00` producía
`28571400340000`, un número absurdo que entraba a la base con cara de válido.

`domain/facturas.py` es el único lugar donde vive esto. Es capa de dominio: sin
pdfplumber, sin sqlite3, sin FastAPI. `test_architecture_layering.py` lo verifica
por AST.

## Validación: dos comprobaciones, y hacen falta las dos

1. La suma de los ítems coincide con el subtotal.
2. Subtotal más impuestos coincide con el total.

**La segunda sola no alcanza.** Los tres importes del pie se leen aparte de la
tabla, así que los renglones pueden estar destrozados y la factura igual
"cuadrar". Verificado: seis de seis pasaban la segunda mientras dos tenían los
ítems ilegibles.

Tolerancia de un peso: las facturas reales redondean, y una declara un total un
peso mayor que subtotal más IVA.

**Una factura que no cierra no entra.** Queda en `needs_review` con el motivo
escrito. `silver` es la fuente de verdad numérica y no admite cifras sin
verificar (ADR-006 §6).

## Nunca uses OCR acá

Las facturas de proveedor traen **capa de texto**: los dígitos exactos ya están
en el archivo. Se extrae el 100% del texto y 60 de 60 CUFE.

Rasterizar la página para que un motor adivine caracteres **degrada un dato que
ya es correcto**, y en una factura un `8` leído como `3` corrompe el APU en
silencio. OCR es el recurso para documentos escaneados, y ninguno de los
proveedores actuales emite escaneados.

Las que fallan, fallan por **estructura de tabla**, no por texto. OCR devolvería
el mismo texto y el mismo problema, a cambio de cientos de MB.

## El CUFE es la clave, no las cifras

96 caracteres hexadecimales, presentes en las 60 facturas. Sirve para:

- **Deduplicar** sin leer una sola cifra.
- **Trazar** al documento legal: el XML validado por la DIAN.

`\b[0-9a-f]{96}\b` sobre el texto sin espacios. Nunca falló.

## Dos enfoques, medidos

| | Parser propio (pdfplumber) | Docling |
| --- | --- | --- |
| Técnica | Agrupar por coordenada Y, repartir por X de los títulos | TableFormer, encabezados semánticos |
| Cobertura | 25% (15/60) | 88% de ítems extraídos (53/60) |
| Configuración | Un `PerfilEmisor` por proveedor | Mapeo de sinónimos, sirve para emisores nunca vistos |
| Peso | Decenas de MB | 1,2 GB + 593 MB de modelos, ~1,1 GB de RAM |
| Velocidad | décimas de segundo | 14,6 s de mediana |

`extract_tables()` de pdfplumber **no sirve**: estas facturas alinean columnas
visualmente sin dibujar líneas. Ya se probó.

**Docling genera encabezados semánticos** (`Descripción`, `Valor unitario`) en
vez de coordenadas, así que un mapeo de sinónimos generaliza y elimina la
necesidad de un perfil por emisor. Su licencia es MIT; la de Marker es GPL-3 más
una licencia de pesos que restringe el uso comercial.

## Iterar sin pagar la conversión

La conversión con Docling cuesta 17 minutos para 60 documentos; el mapeo se
ajusta en segundos. **Cachear la salida a JSON** (tablas + markdown) separa lo
caro de lo barato y permite medir un cambio de mapeo al instante en vez de
volver a convertir todo.

## Agregar un emisor

Con Docling, normalmente no hace falta: el mapeo de sinónimos lo cubre. Si un
encabezado nuevo no engancha, se agrega el sinónimo — no un perfil.

Con el parser propio, se agrega un `PerfilEmisor` en `invoice_parsing.py`. No
toca el comando de ingesta, ni el repositorio, ni las rutas.

En ambos casos: **la factura real es la evidencia**. No se da por bueno un
parser sin correrlo contra el documento que motivó el cambio, y sin mirar los
ítems extraídos — no solo el veredicto. Las cifras del pie pueden cuadrar con
los renglones rotos.

## Dónde vive cada cosa

| Qué | Dónde |
| --- | --- |
| Reglas puras: dinero y validación | `api/src/soma_api/domain/facturas.py` |
| Extracción de PDF y perfiles | `api/src/soma_api/invoice_parsing.py` |
| Persistencia | `DocumentRepository` en `api/src/soma_api/repositories.py` |
| Comando de ingesta | `api/src/soma_api/jobs/ingest.py` |
| Esquema | migración 7 en `api/src/soma_api/migrations.py` |
| Decisiones | `docs/PLAN-INGESTA-FACTURAS.md` y `SOMA-ADR-006` |

## Advertencia legal

**SOMA no es soporte contable ni tributario.** El documento válido ante la DIAN
es el XML con su CUFE, más el acuse de recibo que exige la Ley 2155. Extraer
cifras del PDF sirve para **control de costos interno** —APU, costo unitario,
simulación—, no como respaldo de una declaración.

## Verificar

```powershell
uv run --directory api pytest
uv run --directory api python -m soma_api.jobs.ingest "<carpeta>" --recursivo
```

El comando es idempotente por `content_hash`: repetirlo no duplica nada.
