---
okf_version: "0.2"
type: Knowledge Bundle
title: SOMA knowledge bundle
description: Documentación de producto, arquitectura, datos, infraestructura y harness de SOMA.
tags: [soma, index]
---

# SOMA knowledge bundle

Bundle OKF v0.2. Un archivo = un concepto. Convenciones de escritura en la skill
`soma-docs-okf` del repositorio.

## Producto y arquitectura

* [SOMA architecture and deployment](SOMA.md) - Current system boundaries and operational state.
* [SOMA PRD](SOMA-PRD.md) - Product scope, requirements and non-goals.
* [Architecture plan 2026-08-11](SOMA-ARCHITECTURE-PLAN-2026-08-11.md) - Target architecture and phased backlog.
* [Deployment guide](SOMA-DEPLOYMENT-GUIDE.md) - Vercel frontend and separately deployed API.

## Datos e infraestructura

* [Gobierno de datos](SOMA-DATA-GOVERNANCE.md) - Capas medallón, clasificación de tablas, nomenclatura, entornos y retención.
* [Topología y costos](SOMA-INFRA-AND-COSTS.md) - Servicios, puertos, comunicación y coste mensual estimado.

## Calidad y operación

* [Diagnóstico 2026-08-24](SOMA-DIAGNOSTIC-2026-08-24.md) - Estado real tras integrar el control plane de construcción.
* [Evaluación multi-arista 2026-08-24](SOMA-EVALUATION-2026-08-24.md) - Puntuación por arista y veredicto sobre reescribir fuera de Python.
* [Plan de pruebas E2E](SOMA-E2E-TEST-PLAN.md) - Casos de uso Playwright y verificación de seguridad.
* [Harness de ingeniería](SOMA-HARNESS.md) - MCPs, skills, orquestación de subagentes y brechas.
* [Clean Code review](SOMA-CLEAN-CODE-REVIEW-2026-08-11.md) - Clean Code, SOLID, KISS and testing assessment.
* [MCP and document pipeline plan](SOMA-MCP-PDF-PLAN.md) - Knowledge MCPs and asynchronous PDF processing.
* [External audit](SOMA-AUDIT-2026-08-08.md) - Existing performance and security audit.

## Doctrina transversal

No vive en este repositorio. `HARNESS-DOCTRINE.md` (presupuesto de contexto,
routing por capas y protocolos de agentes) aplica a todos los proyectos, no solo
a SOMA, y aterriza en `~/.claude/CLAUDE.md` y en las skills globales de la
máquina. Se mantiene en `C:\proyectos_ia\docs` a la espera de su propio
repositorio.

## Decisiones

* [ADR-001 API boundary](SOMA-ADR-001-api-boundary.md) - Web, authentication and agent separation.
* [ADR-002 streaming and MCP](SOMA-ADR-002-agent-streaming-and-mcp.md) - LangGraph, SSE and optional MCP.
* [ADR-003 capas y protocolos](SOMA-ADR-003-layering-and-boundaries.md) - Arquitectura hexagonal, monorepo y cuándo usar REST, SSE o cola.
* [ADR-004 Postgres con pgvector](SOMA-ADR-004-postgres-pgvector.md) - Motor único de datos y embeddings; entornos por branch.
* [ADR-005 endurecimiento de seguridad](SOMA-ADR-005-security-hardening.md) - Sesión por cookie, rol, y plan de pruebas ofensivas (planificado, sin implementar).
* [ADR-006 ingesta documental](SOMA-ADR-006-ingesta-documental.md) - Origen `inbox/` en bucket, disparo por cron en Render, XML DIAN antes que PDF y parsers tras un puerto único.
* [ADR-007 frontera de la documentación](SOMA-ADR-007-frontera-de-la-documentacion.md) - Por qué el bundle OKF vive en el repositorio y por qué la doctrina transversal y la infraestructura de memoria se quedan fuera.

## Planes de trabajo

* [Plan de ingesta de facturas](PLAN-INGESTA-FACTURAS.md) - Pasos de implementación de la ingesta documental descrita en el ADR-006.

## Diagramas

Tres historias separadas, no una sola lámina que las mezcle. Cada `.drawio` es el
maestro editable; el `.svg` de al lado es su render, y se ve directo en GitHub.

| Diagrama | Responde a |
| --- | --- |
| [Despliegue](diagrams/soma-despliegue.svg) · [editable](diagrams/soma-despliegue.drawio) | Dónde corre cada cosa y por dónde viaja el dato |
| [Capas de código](diagrams/soma-capas.svg) · [editable](diagrams/soma-capas.drawio) | Cómo está organizado por dentro y qué regla lo protege |
| [Ingesta de una factura](diagrams/soma-ingesta-factura.svg) · [editable](diagrams/soma-ingesta-factura.drawio) | El viaje de un PDF desde `inbox/` hasta la pantalla |
| [Frontend antes del refactor](diagrams/soma-frontend-antes.drawio) | Registro histórico del punto de partida |

La geometría de los tres se genera por script, no a mano: las bandas y la rejilla
hacen imposibles los solapes y los tamaños dispares que afeaban el diagrama
anterior. Ver la skill `soma-diagrams`.

Los diagramas incrustados en los documentos son Mermaid: se versionan como texto
y renderizan directo en GitHub.
