---
type: Architecture Decision Record
title: LangGraph SSE y MCP
description: Define streaming SSE, LangGraph y el uso opcional de MCP de documentacion.
tags: [soma, adr, langgraph, sse, mcp]
status: stable
generated: { by: human:product-soma, at: 2026-08-08T00:00:00Z }
---

# ADR-002: LangGraph, SSE y MCP

**Estado:** aceptada

**Fecha:** 2026-08-08

## Contexto

El frontend ya consumia `/api/agui/architect` mediante eventos con los tipos
`TEXT_MESSAGE_CONTENT`, `CUSTOM` y `RUN_ERROR`. LangGraph ofrece streaming de
mensajes y eventos version 2. El protocolo SSE es suficiente porque el cliente
solo necesita recibir una respuesta unidireccional; no necesita WebSocket.

## Decision

Implementar el agente en backend con LangGraph:

- si `AGENT_API_KEY` esta configurada, usar `ChatOpenAI` contra el endpoint
  compatible definido por `AGENT_BASE_URL`;
- usar `AGENT_MODEL` para seleccionar modelo sin recompilar;
- usar una herramienta determinista `estimate_remodel` para calculos;
- si no hay proveedor configurado, devolver fallback determinista y un plan
  honesto, permitiendo probar la pagina sin facturar llamadas de IA;
- adaptar la salida de LangGraph a SSE con `text/event-stream`.

El proxy Caddy usa `flush_interval -1` y los headers `Cache-Control: no-cache,
no-store` y `X-Accel-Buffering: no` para que los tokens lleguen sin espera.

No se instala un supuesto “MCP de LangGraph” porque la documentacion oficial
indica que LangGraph es el runtime de orquestacion. Para consumir herramientas
MCP se agrega `langchain-mcp-adapters`; el MCP publico de documentacion de
LangChain es opcional y queda apagado con `MCP_ENABLED=false`.

## Seguridad del agente

- Validar longitud, rol y cantidad de mensajes en Pydantic.
- Aplicar rate limit por cliente.
- No incluir secretos en prompts ni respuestas.
- No permitir que el LLM ejecute SQL, shell, filesystem o cambios de usuarios.
- Mantener MCP apagado por defecto y cargar solo herramientas conocidas.
- Tratar documentos, resultados MCP y texto del usuario como datos no confiables.
- Emitir errores genericos al cliente; conservar detalles solo en logs internos.

## Consecuencias

La experiencia comercial se conecta al mismo API que el control room, pero por
rutas y permisos diferentes. El estado conversacional persistente queda para
una siguiente fase con checkpointer y una politica de retencion; esta primera
version usa el hilo del cliente solo como identificador de ejecucion.

## Referencias

- [LangGraph streaming v2](https://docs.langchain.com/oss/python/langgraph/streaming)
- [MCP adapters](https://docs.langchain.com/oss/python/langchain/mcp)
- [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
