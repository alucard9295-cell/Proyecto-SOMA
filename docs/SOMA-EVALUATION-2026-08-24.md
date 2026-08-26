---
type: Diagnostic
title: Evaluación multi-arista de SOMA 2026-08-24
description: Puntuación por arista con evidencia, y veredicto sobre reescribir partes fuera de Python.
tags: [soma, evaluation, scorecard, performance, security]
status: stable
generated: { by: claude-code/opus-5, at: 2026-08-24T00:00:00Z }
sources:
  - id: diagnostic
    resource: /SOMA-DIAGNOSTIC-2026-08-24.md
    title: Diagnóstico 2026-08-24
---

# Cómo leer esto

Puntuación de 1 a 10 por arista, con la evidencia que la sostiene. La referencia
no es "una startup con equipo", es **lo que este producto necesita para que una
persona lo use a diario y algún visitante lo vea en internet**.

Snapshot — no se edita.

| Arista | Antes | Después | Qué cambió |
| --- | --- | --- | --- |
| Documentación y gobierno | 8 | **8** | Se suman ADR-005, evaluación y plan E2E |
| Seguridad | 7 | **7** | Plan en [ADR-005](/SOMA-ADR-005-security-hardening.md), aún sin implementar |
| Persistencia y migraciones | 6 | **8** | Dinero con `Decimal` cuantizado a dos decimales |
| Testing | 5 | **8** | 21 → 58 tests; el dominio se prueba sin HTTP |
| Observabilidad | 5 | **8** | Una línea JSON por petición con `request_id` y duración |
| Frontend / UX | 5 | **7** | Sin lógica de negocio ni fórmula duplicada; textos corregidos |
| Arquitectura y capas | 4 | **8** | `domain/` puro + test que impide la regresión |
| Rendimiento | 4 | **8** | 101 → 2 conexiones para listar 50 APUs, medido |
| Despliegue y operación | 3 | **7** | Stack Docker verificado extremo a extremo |

**Global ponderado: ~5,3 → ~7,7 / 10.**

Las dos aristas que siguen bajo 8 lo están por decisión explícita:
**seguridad** espera a ADR-005 (el usuario pidió dejarlo planificado), y
**despliegue** no llega a 8 hasta que exista un despliegue real con backup
probado — hoy está verificado en local, no en producción.

## Evidencia de los cambios

```
Listar 50 APUs:  101 conexiones sqlite  →  2
0.1 * 269231:    26923.100000000002     →  26923.10
Suite:           21 tests               →  58
Docker:          nunca ejecutado        →  /, /ventas, /health, /ready en verde
```

El texto que sigue describe el estado **anterior** al refactor y se conserva
como registro de lo que se corrigió.

# Seguridad — 7

**A favor (verificado en código):**
- `scrypt` para contraseñas; nunca se comparan en claro.
- JWT completo: `iss`, `aud`, `iat`, `nbf`, `exp`, `jti`.
- CORS por allowlist con métodos y headers restringidos, no `*`.
- Rate limit en login y agente; límite de tamaño de body (2 MB).
- Headers defensivos: `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
  HSTS en producción.
- Auditoría que **redacta** claves sensibles antes de persistir.
- MCP deshabilitado por defecto y con allowlist de solo lectura.
- Login con error genérico: no revela si el usuario existe.

**Huecos reales:**
1. **El token vive en `sessionStorage`.** Cualquier XSS lo lee. Mitigación
   correcta: cookie `httpOnly` + `SameSite=Strict` y CSRF por token. Es el hueco
   más serio para una app expuesta a internet.
2. **Rate limit en memoria.** No sobrevive a reinicios ni a dos réplicas. Para un
   usuario alcanza; conviene saber que no escala.
3. **Sin CSP de contenido** más allá de `frame-ancestors`. Una CSP con
   `script-src 'self'` cerraría buena parte de la superficie XSS.
4. **Sin 2FA** y con una sola cuenta administrativa.

# Arquitectura y capas — 4

Es la nota más baja con más consecuencia. Detalle completo en el
[diagnóstico](/SOMA-DIAGNOSTIC-2026-08-24.md), resumen:

- El costeo AIU y el cronograma viven en `routes/construction.py`.
- `agent.py` concentra diez responsabilidades.
- Ciclo `database ↔ repositories` roto con un import diferido.

**Y el hallazgo nuevo de esta revisión: la fórmula AIU está implementada dos
veces.**

| Cálculo | Frontend | Backend |
| --- | --- | --- |
| Costo por insumo | `App.jsx:136` | `construction.py:70` |
| Costo directo, AIU, base IVA, precio de venta | `App.jsx:138` | `construction.py:73-81` |

Son idénticas hoy. Nada garantiza que sigan siéndolo: quien ajuste el redondeo o
la base del IVA en un lado no tiene forma de saber que existe el otro. El usuario
vería un precio antes de guardar y otro después.

Además, **el precio de la jornada de mano de obra vive en `localStorage`**
(`App.jsx:136,164`), junto con la categoría activa del APU. Eso es dato de
negocio guardado en el navegador: se pierde al limpiar el sitio, no se comparte
entre dispositivos y no es auditable.

El destino correcto es el de [ADR-003](/SOMA-ADR-003-layering-and-boundaries.md):
`domain/costing.py` como única implementación, y el frontend pidiendo el cálculo
en vez de repetirlo.

# Rendimiento — 4

**Medido, no estimado.** Listar 50 APUs abre **101 conexiones SQLite** (2 por APU
más 1 del listado):

```
APUs listados: 50
Conexiones sqlite abiertas para listar: 101
```

**Origen honesto: lo introdujo el refactor de repositorios de esta misma
integración.** Antes, la ruta abría una conexión y la reutilizaba para todo el
listado. Al mover cada consulta a un método de repositorio que hace
`with connect(...)`, cada llamada abre y cierra la suya.

Con SQLite local el coste es tolerable. **Con Postgres sobre TLS deja de serlo**:
101 conexiones de red por pantalla convierten un listado en segundos. Es una
bomba de tiempo justo debajo de la migración de
[ADR-004](/SOMA-ADR-004-postgres-pgvector.md).

Solución: unidad de trabajo (una conexión por petición, inyectada al repositorio)
y consultas que traigan los detalles de todos los APUs en un `IN`, no uno a uno.
`list_projects` es peor: multiplica proyectos × partidas.

# Persistencia y migraciones — 6

Migraciones versionadas, idempotentes, con test que deriva la lista esperada de
`MIGRATIONS` en vez de fijarla. Repositorios con transacción correcta en las
escrituras compuestas.

**El defecto:** el dinero es `REAL` (punto flotante). Ya produce valores como
`26923.100000000002`. En una herramienta de presupuestos eso es un error, no una
curiosidad. Debe ser `NUMERIC(14,2)` y `Decimal` en Python.

# Testing — 5

21 tests que cubren auth, hardening, MCP, migraciones, simulación, el flujo
APU→proyecto y el contrato frontend↔API recién añadido.

**Lo que falta es lo que más importa:** no hay un solo test que verifique la
fórmula AIU de forma aislada, porque no existe un módulo de dominio donde
probarla. El test de construcción la ejercita **a través de HTTP**, así que
comprueba la ruta, no la regla. Tampoco hay tests de frontend ni E2E — ver el
[plan E2E](/SOMA-E2E-TEST-PLAN.md).

# Frontend / UX — 5

El diseño es el activo más fuerte del producto: lenguaje editorial coherente,
tipografía con carácter, jerarquía clara, estados vacíos redactados con cuidado.
Se sostiene bien entre pantallas.

El código no acompaña: `App.jsx` concentra ~20 componentes en un archivo de
líneas muy largas, con lógica de negocio, `localStorage` como estado de negocio y
el helper `request()` duplicado en `ApuEditor.jsx` y `ProjectSimulator.jsx`. No
hay tests ni verificación de accesibilidad automatizada.

# Observabilidad — 5

`X-Request-ID` en toda respuesta, `/health` y `/ready` diferenciados,
`audit_events` con redacción. Falta logging estructurado en JSON, propagación del
`request_id` al usuario y cualquier alerta.

# Despliegue y operación — 3

`Dockerfile` reproducible con `uv` y CI que construye la imagen. Pero **nunca se
ha desplegado ni ejecutado el compose**, no hay backups y no se ha probado
ninguna restauración. Un despliegue que nunca corrió es una hipótesis.

# Documentación y gobierno — 8

Bundle OKF con ADRs, plan por fases, diagnóstico y gobierno de datos. Muy por
encima de lo típico a esta escala. El riesgo es la deriva: `SOMA.md` todavía
describe un alcance anterior al control plane de construcción.

# ¿Reescribir algo fuera de Python?

**Veredicto: no. Todavía no hay nada que lo justifique.**

El razonamiento:

1. **El cuello de botella medido no es el lenguaje.** Son 101 conexiones donde
   debería haber 1. Reescribir eso en Go daría 101 conexiones muy rápidas — el
   mismo error, con más trabajo. Un mal patrón de acceso a datos no se arregla
   cambiando de runtime.
2. **La carga real es de un usuario.** FastAPI sobre uvicorn maneja esto con
   holgura. No hay medición que muestre a Python como límite.
3. **Donde Python sí es genuinamente flojo** es en trabajo CPU-bound sostenido:
   OCR y parsing masivo de PDFs. Pero incluso ahí la respuesta correcta no es
   reescribir el API, sino **sacar ese trabajo de la petición** (worker + cola,
   ya decidido en ADR-003) y usar librerías con núcleo nativo (`pypdfium2`,
   `tesseract` por subproceso). El intérprete deja de estar en el camino crítico.
4. **El coste oculto de una segunda tecnología** es alto para una persona: otro
   toolchain, otro despliegue, otro conjunto de dependencias que auditar, y una
   frontera de serialización nueva donde antes había una llamada de función.

Cuándo reabrir la discusión: si tras corregir el N+1 y mover el OCR al worker,
una medición muestra una operación concreta que no cumple su objetivo de latencia.
Entonces se extrae **esa** operación, no el sistema.

# Orden recomendado

1. Extraer `domain/costing.py` y borrar la copia del frontend. *(cierra la
   duplicación y habilita tests reales)*
2. Unidad de trabajo: una conexión por petición. *(antes de Postgres, no después)*
3. Dinero a `NUMERIC`/`Decimal`.
4. Token a cookie `httpOnly` + CSRF.
5. Levantar el compose una vez y dejar constancia.
