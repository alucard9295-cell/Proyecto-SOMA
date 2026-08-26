---
type: Architecture Decision Record
title: Postgres con pgvector como único motor de datos
description: Decide migrar de SQLite a Postgres gestionado e integrar los embeddings en el mismo motor en lugar de desplegar Chroma.
tags: [soma, adr, database, postgres, pgvector, rag]
status: draft
generated: { by: claude-code/opus-5, at: 2026-08-24T00:00:00Z }
sources:
  - id: adr-003
    resource: /SOMA-ADR-003-layering-and-boundaries.md
    title: ADR-003 capas y protocolos
---

# ADR-004: Postgres con pgvector

**Estado:** propuesta

**Fecha:** 2026-08-24

# Contexto

SQLite sostiene hoy usuarios, auditoría y el control plane de construcción. Es
adecuado para una instancia con volumen persistente, pero bloquea tres cosas que
el producto ya necesita: backups gestionados, búsqueda vectorial para el RAG de
facturas, y separación de entornos sin copiar archivos a mano.

La alternativa evaluada era Postgres para tablas + Chroma como base vectorial
separada.

# Decisión

Un solo motor: **Postgres gestionado con la extensión `pgvector`**.

Los embeddings viven en una columna `vector` de una tabla Postgres, no en un
servicio aparte.

## Por qué pgvector y no Chroma

1. **Joins reales.** Una respuesta del RAG debe citar la factura exacta. Con
   pgvector, recuperar el chunk y su factura, proveedor y valor es un `JOIN`.
   Con Chroma hay que recuperar IDs y hacer una segunda consulta a Postgres,
   reimplementando a mano lo que el motor ya sabe hacer.
2. **Consistencia transaccional.** Indexar un documento y marcar su job como
   `indexed` ocurre en la misma transacción. Con dos motores, un fallo entre
   ambas escrituras deja el sistema inconsistente y hay que reconciliar.
3. **Un solo respaldo.** Un `pg_dump` contiene todo el estado del producto. Con
   Chroma hay que respaldar y **probar la restauración** de dos sistemas con
   modelos de datos distintos.
4. **Un servicio menos que operar** para un equipo de una persona.

El precio de la decisión: pgvector es más lento que un motor vectorial dedicado a
gran escala (millones de vectores, filtros complejos). A la escala de las
facturas de un despacho de arquitectura —miles, no millones— la diferencia es
irrelevante frente al coste operativo de un segundo servicio.

## Proveedor

**Neon** como opción principal: Postgres serverless, `pgvector` incluido sin
coste extra, escala a cero cuando no hay tráfico, y **branching de base de
datos**.

Se descarta Supabase no por calidad sino por solapamiento: su valor está en auth,
storage y realtime, y SOMA ya tiene su propia autenticación (scrypt + JWT
propios). Pagar por un BaaS para usar solo el Postgres es comprar superficie que
no se usa.

## Entornos: branches, no prefijos

La pregunta original era usar prefijos de tabla por entorno (`dev_`, `stg_`).
Se rechaza: prefijos en una misma base comparten conexión, permisos y espacio, y
un `WHERE` mal escrito o una migración distraída cruza entornos sin ninguna
barrera.

En su lugar, **una branch de Neon por entorno**. Cada branch es una base aislada
que comparte almacenamiento con la principal, se crea en segundos y no duplica
coste:

| Entorno | Branch | Uso |
| --- | --- | --- |
| `production` | `main` | Datos reales |
| `staging` | `stg` | Verificación previa a release |
| `development` | `dev` | Trabajo local y pruebas destructivas |

La separación queda en la cadena de conexión (`DATABASE_URL`), no en el nombre de
las tablas. El mismo esquema y las mismas migraciones corren idénticos en los
tres — que es justo lo que valida que una migración es correcta.

# Plan de migración

El cambio queda contenido en `infrastructure/persistence/` gracias a los puertos
de [ADR-003](/SOMA-ADR-003-layering-and-boundaries.md). Pasos:

1. Introducir los puertos de repositorio y hacer que las rutas dependan del
   protocolo, no de la clase concreta.
2. Reescribir `migrations.py` con SQL compatible: `SERIAL`/`IDENTITY` en vez de
   `INTEGER PRIMARY KEY AUTOINCREMENT`, `TIMESTAMPTZ` en vez de `TEXT` para
   fechas, `NUMERIC` en vez de `REAL` para dinero.
3. Migrar los datos existentes con un script que lea por repositorio y escriba
   por repositorio (no SQL crudo, ver H6 del diagnóstico).
4. Mantener SQLite como motor de test: los tests siguen usando `tmp_path`. Se
   añade un job de CI que corre la suite contra Postgres real.

**`NUMERIC` y no `REAL` para dinero** es obligatorio: el diagnóstico ya muestra
valores como `26923.100000000002` producto de aritmética binaria de punto
flotante. En una herramienta de presupuestos eso es un defecto, no un detalle.

# Consecuencias

- Habilita RAG con citaciones trazables, backups gestionados y entornos aislados.
- Introduce dependencia de red hacia la base: hay que manejar pooling y reintentos.
  Con Neon serverless, la primera consulta tras inactividad paga arranque en frío.
- `database_ready()` y `/ready` deben reescribirse contra Postgres.
- Los tipos `NUMERIC` obligan a usar `Decimal` en Python para no reintroducir
  errores de flotante en la frontera.

# Rechazado

- **Chroma como servicio aparte.** Sin joins, dos respaldos, dos fallos posibles.
- **Prefijos de tabla por entorno.** Sin aislamiento real.
- **Quedarse en SQLite.** Bloquea embeddings, backups gestionados y branches.
- **Postgres autogestionado en el contenedor de la app.** Convierte el volumen
  en estado crítico sin backups probados; es el escenario que más datos pierde.
