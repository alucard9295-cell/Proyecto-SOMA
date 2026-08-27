---
type: Product Requirements Document
title: SOMA lectura arquitectonica y decision de inversion
description: Requisitos funcionales y no funcionales para la plataforma SOMA.
tags: [soma, prd, product, finance]
status: draft
generated: { by: human:product-soma, at: 2026-08-08T00:00:00Z }
---

# PRD: SOMA, lectura arquitectonica y decision de inversion

**Estado:** en construccion

**Owner funcional:** producto SOMA

**Version:** 0.2

## Problema

La pagina publica vende una promesa de transformacion, pero el control room,
la asesoria y los datos financieros todavia no comparten un contrato claro. El
usuario necesita pasar de una pregunta sobre su inmueble a una primera lectura
de alcance, costo y retorno sin confundir una estimacion con una cotizacion,
avalúo o permiso.

## Objetivo

Construir una experiencia SOMA donde:

- `/ventas` sea publica, util y conectada al agente arquitectonico del API.
- `/login` proteja el control room administrativo sin compartir credenciales con
  el canal comercial.
- el agente se ejecute en backend, con secretos fuera de React y streaming SSE.
- un simulador transparente permita comparar area, unidades, calidad de obra,
  compra, renta y gastos.
- la informacion numerica tenga una fuente determinista en SQLite/YAML y el
  modelo solo ayude a explicar, preguntar y proponer escenarios.

## No objetivos de esta fase

- No prometer rentabilidad, valorizacion, permisos o disponibilidad normativa.
- No construir un avaluo profesional ni un presupuesto de obra ejecutivo.
- No permitir que el LLM cambie cifras, usuarios o datos financieros.
- No poner SQLite en el filesystem efimero de Vercel.

## Usuarios y flujos

### Visitante comercial

1. Entra a `/ventas`.
2. Prueba el simulador de remodelacion.
3. Conversa con el asesor por `/api/agui/architect`.
4. Recibe supuestos, plan preliminar, riesgos y siguiente paso.

### Administrador

1. Entra al login.
2. Se autentica contra SQLite con un hash de contrasena.
3. Consulta resumen y, en fases posteriores, facturas, RAG y reportes.
4. El API aplica autorizacion por endpoint; React no es la frontera de seguridad.

## Requisitos funcionales

| ID | Requisito | Criterio de aceptacion |
| --- | --- | --- |
| F-01 | Login administrativo | Credencial valida devuelve token; invalida devuelve 401; exceso devuelve 429. |
| F-02 | API segura | HTTPS en produccion, host allowlist, CORS exacto, headers defensivos y body limit. |
| F-03 | Agente backend | LangGraph produce respuesta y plan; sin API key existe fallback determinista seguro. |
| F-04 | Streaming | El navegador recibe `text/event-stream` sin buffering del proxy. |
| F-05 | MCP opcional | `langchain-mcp-adapters` solo carga el MCP de docs si `MCP_ENABLED=true`. |
| F-06 | Simulador | YAML define costos y reglas; API devuelve presupuesto, ROI anual y payback. |
| F-07 | Trazabilidad | La respuesta declara supuestos y advierte que es estimacion preliminar. |

## Reglas del simulador

El simulador usa reglas explicitas, no una llamada al LLM:

```text
base_obra = area_m2 * costo_m2
obra_total = base_obra + diseno + permisos + contingencia
inversion_total = compra + gastos_cierre + obra_total
ingreso_bruto_anual = renta_mensual * unidades * 12 * ocupacion
flujo_neto_anual = ingreso_bruto_anual - gastos_operativos
ROI_anual = flujo_neto_anual / inversion_total
payback = inversion_total / flujo_neto_anual
```

La base inicial usa tres niveles de costo por m², porcentajes para diseño,
permisos, contingencia, gastos de cierre, administracion, mantenimiento,
impuesto predial y seguro. Estos valores son hipotesis editables en
`api/src/soma_api/data/remodeling.yml`; deben sustituirse por datos locales o
cotizaciones antes de una decision.

La estructura sigue una estimacion paramétrica y debe actualizarse con el
ICOCED del DANE, cotizaciones, rentas comparables y validacion profesional. El
ICOCED mide variaciones de costos de edificaciones y no constituye por si solo
un precio de obra para un inmueble especifico.

## Requisitos no funcionales

- API separable del frontend y reproducible con `uv.lock`.
- API detras de reverse proxy Caddy/Nginx o edge equivalente.
- El proxy debe conservar conexiones SSE y no comprimir/bufferizar eventos de
  forma que bloquee la experiencia.
- SQLite solo con volumen persistente y backup probado.
- Pruebas TDD de reglas de negocio, auth, SSE y contratos de API.
- CI ejecuta `npm run build` y `uv run --directory api pytest`.
- Lighthouse, ZAP, Nuclei y sitespeed.io se ejecutan fuera del repo y sus
  reportes se archivan fuera de `Proyecto-SOMA`.

## Metricas de exito

- 100% de rutas protegidas rechazan solicitudes sin autorizacion.
- 0 secretos en el bundle, `VITE_*` o archivos de ejemplo.
- Login, simulador y agente funcionan desde la pagina publicada.
- Lighthouse sin regresiones de accesibilidad y SEO en las rutas principales.
- No hay findings criticos/altos sin decision documentada en ZAP/Nuclei.
- SSE entrega el primer evento de ejecucion antes de la respuesta final.

## Dependencias y riesgos

- El agente real requiere `AGENT_API_KEY`, `AGENT_BASE_URL` y `AGENT_MODEL` en
  el entorno del API.
- Un proveedor de LLM puede fallar o devolver contenido no confiable; el API
  debe responder con fallback y no ejecutar herramientas peligrosas.
- MCP externo amplía la superficie de ataque; por defecto queda desactivado y
  debe ser de solo lectura.
- La cuenta `admon/1234` es solo bootstrap local y debe rotarse.

## Referencias

- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview)
- [LangGraph streaming](https://docs.langchain.com/oss/python/langgraph/streaming)
- [LangChain MCP adapters](https://docs.langchain.com/oss/python/langchain/mcp)
- [DANE ICOCED](https://www.dane.gov.co/index.php/estadisticas-por-tema/precios-y-costos/indice-de-costos-de-la-construccion-de-edificaciones-icoced)
- [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
