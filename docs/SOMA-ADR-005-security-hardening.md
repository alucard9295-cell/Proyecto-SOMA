---
type: Architecture Decision Record
title: Endurecimiento de seguridad y plan de pruebas ofensivas
description: Decide el modelo de sesión, autorización por rol y el procedimiento de hacking ético sobre la propia instancia.
tags: [soma, adr, security, pentesting, planning]
status: draft
generated: { by: claude-code/opus-5, at: 2026-08-24T00:00:00Z }
sources:
  - id: evaluation
    resource: /SOMA-EVALUATION-2026-08-24.md
    title: Evaluación multi-arista 2026-08-24
---

# ADR-005: endurecimiento de seguridad

**Estado:** propuesta — **no implementado todavía, por decisión explícita**

**Fecha:** 2026-08-24

Este documento planifica. Nada de lo que aquí se describe está aplicado al
código; se ejecuta en un ciclo posterior.

# Contexto

La evaluación puntuó seguridad en 7/10: la base es correcta (scrypt, JWT
completo, CORS por allowlist, rate limit, cabeceras defensivas, auditoría con
redacción, MCP con allowlist de solo lectura). Los huecos son concretos y
conocidos.

El producto pasará de local a internet con un solo usuario administrador y algún
visitante en la página pública.

# Decisión 1: la sesión deja `sessionStorage` y pasa a cookie

**Hueco:** el JWT vive en `sessionStorage` (`App.jsx`). Cualquier XSS lo lee y lo
exfiltra. Es el riesgo más serio de la aplicación expuesta.

**Destino:** cookie `httpOnly`, `Secure`, `SameSite=Strict`, más token CSRF de
doble envío para las mutaciones. Una cookie `httpOnly` es invisible a JavaScript,
así que un XSS deja de poder robar la sesión.

**Coste:** el frontend deja de manejar el token; hay que añadir el token CSRF a
`POST`/`PUT` y ajustar CORS a `allow_credentials` con origen exacto. Los tests
de auth cambian de forma.

# Decisión 2: la autorización verifica rol, no solo identidad

**Hueco:** `users.role` existe en el esquema desde la primera migración, pero
nada lo lee. `current_user` valida firma, expiración y estado activo — no rol.
Hoy solo hay una cuenta administradora, así que no hay escalada posible; **el día
que exista una segunda cuenta, todo token sirve para todo.**

**Destino:** una dependencia `require_role("admin")` que las rutas
administrativas declaran explícitamente, y un test por ruta protegida que
verifique el rechazo con rol insuficiente.

# Decisión 3: los recursos se filtran por dueño

Las rutas de `proyectos` y `apus` no filtran por propietario porque no existe el
concepto. Antes de admitir un segundo usuario hay que añadir `owner_id` y
filtrar en el repositorio, no en la ruta. De lo contrario aparece IDOR/BOLA:
cambiar el identificador de la URL devuelve datos ajenos.

# Decisión 4: CSP estricta

Hoy sólo se envía `frame-ancestors 'none'`. Se añadirá
`default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'`,
que cierra la mayor parte de la superficie de XSS reflejado.

# Decisión 5: el rate limit sale del proceso

`SlidingWindowLimiter` vive en memoria: no sobrevive a un reinicio ni se comparte
entre réplicas. Para un usuario es suficiente y **se mantiene**. Se sustituye por
un contador en Postgres o en el borde sólo cuando haya más de una instancia.

# Plan de pruebas ofensivas

Sobre la **propia instancia local o de staging**. Nunca contra Vercel, Railway o
Neon sin autorización escrita: sus términos lo prohíben y pueden suspender la
cuenta.

## Herramientas

| Herramienta | Rol | Nota para este stack |
| --- | --- | --- |
| [OWASP ZAP](https://www.zaproxy.org/) | DAST sobre la API | Importa `/openapi.json` que FastAPI ya publica y fuzzea cada endpoint sin configuración manual |
| [Nuclei](https://github.com/projectdiscovery/nuclei) | Plantillas de comunidad | Cubre BOLA, bypass de autenticación y debilidades JWT |
| [Semgrep](https://semgrep.dev/) | SAST de Python y JSX | `semgrep --config=auto` en CI |
| `pip-audit`, `npm audit` | Dependencias vulnerables | En CI, bloqueante en severidad alta |

## Casos manuales, en orden

1. **Mapear la superficie.** Navegar con DevTools en Network. Cada petición
   visible es un endpoint que un atacante también ve.
2. **Quitar la autenticación.** Copiar una petición autenticada como cURL,
   eliminar el header `Authorization` y reenviarla. Debe responder 401. Repetir
   endpoint por endpoint.
3. **Manipular identificadores.** Cambiar `{project_id}` y `{apu_id}` por valores
   ajenos. Documentar el resultado: hoy no hay aislamiento porque no hay
   multiusuario, y ese hecho debe quedar registrado.
4. **Abusar del payload.** Cantidades negativas, `rendimiento_diario: 0`
   (división por cero — el dominio ya lanza `ValueError`, verificar que se
   traduce a 4xx y no a 500), cadenas de 10 000 caracteres, `<script>` en nombres
   de insumo, `../../` en cualquier campo de texto.
5. **Atacar el JWT.** Firmar con `alg: none`, firmar con otro secreto, reenviar
   un token expirado. Los tres deben dar 401.
6. **Forzar los límites.** Repetir login fallido hasta el bloqueo; enviar un body
   mayor a 2 MB y esperar 413.
7. **Revisar el almacenamiento del navegador.** Todo lo que aparezca en
   `localStorage` y `sessionStorage` es legible por un XSS.

## Criterio de aceptación

Cada hallazgo se convierte en un test automatizado antes de arreglarlo. Un
arreglo sin test que lo cubra vuelve a romperse.

# Consecuencias

- La cookie `httpOnly` cierra el vector más grave, a cambio de complejidad CSRF.
- El chequeo de rol y el filtro por dueño son **prerrequisitos de admitir un
  segundo usuario**, no mejoras opcionales.
- El plan ofensivo no requiere infraestructura nueva: ZAP consume el esquema
  OpenAPI que ya existe.

# Rechazado

- **WAF gestionado ahora.** Coste sin amenaza medida a esta escala.
- **Migrar a un proveedor de identidad externo.** Con un usuario, añade
  dependencia y coste sin reducir riesgo real.
- **Escanear el despliegue en producción de terceros.** Prohibido por términos de
  servicio.
