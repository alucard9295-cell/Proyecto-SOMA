---
type: Runbook
title: Plan de pruebas end-to-end con Playwright
description: Casos de uso E2E priorizados, estrategia de ubicación del código de pruebas y verificación de consistencia visual y de seguridad.
tags: [soma, testing, e2e, playwright, security]
status: draft
generated: { by: claude-code/opus-5, at: 2026-08-24T00:00:00Z }
sources:
  - id: evaluation
    resource: /SOMA-EVALUATION-2026-08-24.md
    title: Evaluación multi-arista 2026-08-24
---

# ¿Repo aparte? No — carpeta aparte en el mismo repo

La pregunta era si montar las pruebas E2E en un repositorio separado. **La
recomendación es `e2e/` dentro de `Proyecto-SOMA`, con su propio `package.json`.**

El motivo es el mismo que ya costó caro una vez: una prueba E2E describe la UI que
prueba. Si viven en repos distintos, un cambio de UI y su prueba dejan de poder
viajar en el mismo commit — y la prueba queda verde describiendo una pantalla que
ya no existe, o roja por un cambio legítimo. Es exactamente la deriva que produjo
la regresión de la Fase 0.

Separar tiene sentido cuando las pruebas atacan un entorno desplegado que no
controlas, o cuando otro equipo las mantiene. Ninguno aplica.

```
Proyecto-SOMA/
  src/                 # frontend
  api/                 # backend + pytest
  e2e/
    package.json       # @playwright/test, aislado de la app
    playwright.config.ts
    fixtures/          # arranque de API+web, sesión autenticada
    specs/             # un archivo por caso de uso
    snapshots/         # referencias visuales
```

Aislado por `package.json` propio: Playwright no entra en el bundle de la app ni
en las dependencias que Vercel instala.

# Estrategia

**Qué prueba cada nivel.** No duplicar: si `pytest` ya cubre una regla, E2E no la
repite.

| Nivel | Responde | Dónde |
| --- | --- | --- |
| Unitario | ¿La fórmula AIU es correcta? | `api/tests/` sobre `domain/` |
| Contrato | ¿El front llama rutas que existen? | `test_frontend_route_contract.py` |
| **E2E** | **¿La persona logra su objetivo en la pantalla?** | `e2e/specs/` |

**Datos.** Cada spec arranca contra una base efímera (`DATABASE_PATH` a un
archivo temporal) y siembra lo que necesita por API, no por UI. Sembrar por UI
hace las pruebas lentas y frágiles.

**Selectores.** `getByRole` y `getByLabel` antes que CSS. Un selector accesible
prueba de paso que el elemento es alcanzable con teclado y lector de pantalla.
Cuando no haya rol natural, `data-testid` — nunca clases de estilo.

# Casos de uso

Priorizados: los primeros protegen lo que ya funciona; los últimos exploran.

## CU-01 · La landing pública carga y el simulador calcula

**Objetivo:** un visitante entiende la propuesta y obtiene una cifra preliminar.

- Ir a `/ventas`. Verificar título, hero y que el video tiene `muted` y `playsInline`.
- Rellenar área `120`, unidades `2`, calidad `estándar`, y enviar.
- Esperar los KPIs (inversión total, costo de obra, retorno, recuperación) con
  valores no vacíos y formateados en pesos colombianos.

**Atrapa:** que `/api/sales/simulation` cambie de contrato, o que el formato de
moneda se rompa.

## CU-02 · Login administrativo exitoso

- Ir a `/`, rellenar usuario y contraseña válidos, enviar.
- Verificar que aparece la navegación del control room y el botón "Cerrar sesión".
- Verificar que la navegación contiene **exactamente**: Resumen, Insumos, APUs,
  Simulador, Orientación.

**Atrapa:** la regresión de la Fase 0. Si alguien reintroduce "Facturas" o
"Inteligencia" sin backend, esta aserción falla.

## CU-03 · Login fallido no filtra información

- Enviar un usuario inexistente y luego un usuario válido con contraseña errónea.
- Verificar que **el mensaje es idéntico** en ambos casos.
- Verificar que no se guardó token en `sessionStorage`.

**Atrapa:** enumeración de usuarios.

## CU-04 · Sesión inválida devuelve al login

- Autenticar, luego corromper el token en `sessionStorage`.
- Recargar y navegar al Resumen.
- Verificar redirección al login sin pantalla de error cruda.

**Atrapa:** que se pierda el manejo de 401 (el `error.status === 401 → logout`).

## CU-05 · Normalizar un insumo

- Autenticado, ir a Insumos. Buscar por nombre y filtrar por categoría.
- Editar nombre y unidad de una fila, guardar.
- Verificar mensaje de confirmación y que el valor persiste tras recargar.

**Atrapa:** que `PUT /api/admin/supplies/{id}` deje de persistir.

## CU-06 · Crear un APU y que el precio no cambie al guardar ⭐

**El caso más valioso.** Es el que detecta la duplicación de la fórmula AIU.

- Ir a APUs. Crear una partida con un insumo, rendimiento y desperdicio conocidos.
- Fijar administración 5 %, imprevistos 5 %, utilidad 10 %, IVA 19 % sobre utilidad.
- **Capturar el "PRECIO DE VENTA ESTIMADO" que muestra el formulario.**
- Guardar.
- **Capturar el precio que devuelve el backend en la tarjeta de la biblioteca.**
- Afirmar que ambos son iguales.

**Atrapa:** la divergencia entre `App.jsx:138` y `construction.py:73-81`. Hoy
pasa; el día que alguien toque una de las dos fórmulas, falla. Cuando la lógica
se unifique en `domain/costing.py`, este caso se vuelve trivial — y eso es
justamente la señal de que el refactor funcionó.

## CU-07 · Proyecto con cronograma

- Crear proyecto con fecha de inicio conocida.
- Agregar una partida con cantidad 120 y rendimiento diario 10.
- Verificar duración 12 días y fecha fin correcta.
- Verificar que la fase agrupa costo y duración.

**Atrapa:** cambios en el redondeo de duración (`math.ceil`) o en el
encadenamiento de fechas.

## CU-08 · El asesor responde por streaming

- En `/ventas`, enviar una pregunta al chat.
- Verificar que la respuesta **crece progresivamente** (comparar longitud del
  texto en dos instantes), no que aparece de golpe.
- Verificar que el indicador pasa de "analizando" a "en línea".

**Atrapa:** que un proxy bufferice SSE — el fallo más difícil de ver a ojo y el
que rompería el chat en producción.

## CU-09 · Consistencia visual entre pantallas

- Recorrer Resumen, Insumos, APUs, Simulador, Orientación y `/ventas`.
- Captura por pantalla comparada contra referencia (`toHaveScreenshot`) con
  tolerancia baja, enmascarando zonas con datos variables.
- En cada pantalla, verificar que la familia tipográfica del `h1` y el color de
  fondo del `body` son los mismos.

**Atrapa:** deriva de diseño al agregar módulos — tu preocupación de "que la
página tenga un diseño igual en toda la experiencia".

## CU-10 · Congruencia de textos y accesibilidad

- En cada pantalla: exactamente un `h1`; ningún `button` sin nombre accesible;
  ninguna imagen sin `alt`.
- Verificar que no aparece texto de plantilla sin resolver: `undefined`, `NaN`,
  `[object Object]`, `${`.
- Verificar coherencia de idioma: la UI administrativa en español, con tildes
  correctas (varios textos actuales las perdieron: "informacion", "simulacion").
- Integrar `@axe-core/playwright` para contraste y roles.

**Atrapa:** los `NaN` y `undefined` que aparecen cuando un endpoint cambia de
forma, y la mezcla de textos con y sin tildes que ya existe en el código.

# Seguridad — pruebas y herramientas

No mezclar con Playwright: son escaneos, no pruebas funcionales.

**La ventaja que ya tienes:** FastAPI publica el esquema en `/openapi.json`.
[OWASP ZAP](https://www.zaproxy.org/) lo importa y fuzzea cada endpoint sin
configuración manual — es el mejor punto de partida para este stack.

| Herramienta | Para qué | Cómo |
| --- | --- | --- |
| **OWASP ZAP** | DAST sobre la API completa | Importar `/openapi.json`, escaneo activo autenticado |
| **Nuclei** | Plantillas de comunidad: BOLA, bypass de auth, debilidades JWT | `nuclei -u <host> -t http/` |
| **Semgrep** | Análisis estático de Python y JSX | `semgrep --config=auto` |
| **pip-audit** / `npm audit` | Dependencias vulnerables | En CI |

**Pruebas de autorización específicas de este producto** — lo que ningún escáner
genérico encuentra, porque requiere conocer el dominio:

1. **BOLA/IDOR:** autenticar y pedir `GET /api/admin/proyectos/{id}` de un id que
   no te pertenece. Hoy hay **una sola cuenta**, así que no hay aislamiento
   multiusuario que probar — pero en el momento en que exista una segunda cuenta,
   esta prueba es obligatoria, porque las rutas actuales **no filtran por dueño**.
2. **Escalada por rol:** `users.role` existe pero nada lo verifica: `current_user`
   valida firma y estado activo, no rol. Un token válido puede todo.
3. **JWT:** intentar `alg: none`, firma con otro secreto y token expirado. Los
   tres deben dar 401.
4. **Rate limit:** repetir login fallido y verificar bloqueo.
5. **Límite de tamaño:** enviar un body > 2 MB y esperar 413.

**Cómo hacer hacking ético a tu propia app**, en orden:

1. Levanta la app localmente y navega con las **DevTools abiertas en Network**.
   Cada petición que ves es un endpoint que un atacante también ve.
2. Copia una petición autenticada como cURL (clic derecho → Copy as cURL), quita
   el header `Authorization` y reenvíala. Debe dar 401. Repite endpoint por
   endpoint.
3. Modifica los identificadores de la URL a valores que no te pertenecen.
4. Manipula el payload: valores negativos en `cantidad`, `rendimiento_diario: 0`
   (¿división por cero?), cadenas larguísimas, `<script>` en nombres de insumo.
5. Revisa qué guarda el navegador: `sessionStorage`, `localStorage`. Todo lo que
   veas ahí, un XSS lo ve.

Ese último paso ya tiene hallazgo: el token está en `sessionStorage` y el precio
de mano de obra en `localStorage`.

**Regla:** escanea solo tu propia instancia local o de staging. Nunca contra
Vercel, Railway o Neon sin su autorización — sus términos lo prohíben y pueden
suspender la cuenta.

# Puesta en marcha

```powershell
mkdir e2e; cd e2e
npm init -y
npm i -D @playwright/test @axe-core/playwright
npx playwright install chromium
npx playwright test
```

`playwright.config.ts` levanta API y web con `webServer`, apuntando el API a una
base temporal para no tocar datos reales.

**Orden de implementación:** CU-02 y CU-06 primero. CU-02 blinda la regresión que
ya ocurrió; CU-06 documenta en forma ejecutable la duplicación que hay que
eliminar.
