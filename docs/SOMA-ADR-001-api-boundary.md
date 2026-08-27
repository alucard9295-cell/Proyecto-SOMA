---
type: Architecture Decision Record
title: Frontera entre web, autenticacion y agente
description: Decide la separacion entre React/Vite y el control plane FastAPI.
tags: [soma, adr, api, security]
status: stable
generated: { by: human:product-soma, at: 2026-08-08T00:00:00Z }
---

# ADR-001: frontera entre web, autenticacion y agente

**Estado:** aceptada

**Fecha:** 2026-08-08

## Contexto

El frontend tenia un contrato para un FastAPI que no existia en el repositorio.
El login, el chat comercial y el control room no deben compartir secretos ni
responsabilidades. El agente necesita acceso a un proveedor de modelos y puede
emitir eventos largos por SSE.

## Decision

Mantener un monorepo con dos unidades:

- React/Vite en la raiz, publico y desplegado en Vercel.
- FastAPI en `api/src/soma_api`, desplegado como contenedor detras de un reverse
  proxy con HTTPS.

Separar modulos dentro del API:

- `routes/auth.py`: login y sesion administrativa.
- `routes/agent.py`: asesor publico o protegido segun configuracion.
- `routes/simulation.py`: reglas de negocio deterministas.
- `routes/summary.py`: lectura del control room.
- `database.py`: persistencia SQLite.
- `agent.py`: grafo LangGraph y herramientas.
- `mcp.py`: carga opcional de herramientas MCP.

El LLM no autentica usuarios ni escribe directamente en SQLite. Las rutas
validan autorizacion antes de invocar operaciones administrativas. El agente
puede leer herramientas explicitamente permitidas, pero el resultado numerico
del simulador lo calcula Python.

## Seguridad perimetral

Caddy termina TLS, filtra el host, reenvia solo al API interno y desactiva el
buffering de SSE. El API agrega una segunda capa con CORS por allowlist, headers
defensivos, limite de body, rate limit de login/agente y JWT con `iss`, `aud`,
`iat`, `nbf`, `exp` y `jti`.

La proteccion de produccion debe complementarse con WAF/rate limit distribuido,
logs de auditoria, rotacion de secretos, backups y un proveedor de identidad
cuando existan mas administradores. El rate limiter en memoria incluido sirve
para desarrollo y una sola replica, no sustituye Redis o el edge en escala.

## Consecuencias

Se puede desplegar web y API de manera independiente sin duplicar repositorios.
El API requiere un host con volumen persistente para SQLite. Si se agregan
replicas o escrituras altas, la migracion natural es Postgres manteniendo la
capa de repositorios.

## Rechazado

- Guardar `AGENT_API_KEY` en React o `VITE_*`.
- Ejecutar el agente en el navegador.
- Poner SQLite en Vercel.
- Tratar MCP como sustituto de autenticacion o autorizacion.
