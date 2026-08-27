---
type: Architecture Decision Record
title: Stack de despliegue — un solo proveedor de ejecución
description: Decide Render para web y API y Neon para datos, y explica por qué se descartan Vercel y Railway pese a estar ya escritos en la documentación anterior.
tags: [soma, adr, despliegue, costos, render, neon, vercel, railway]
status: draft
generated: { by: claude-code/opus-5, at: 2026-08-27T00:00:00Z }
sources:
  - id: infra-costs
    resource: /SOMA-INFRA-AND-COSTS.md
    title: Topología y costos
  - id: adr-004
    resource: /SOMA-ADR-004-postgres-pgvector.md
    title: ADR-004 Postgres con pgvector
  - id: adr-001
    resource: /SOMA-ADR-001-api-boundary.md
    title: ADR-001 Frontera del API
---

# ADR-008: Stack de despliegue

**Estado:** aceptada

**Fecha:** 2026-08-27

**Sustituye:** la elección de proveedores de [ADR-001](/SOMA-ADR-001-api-boundary.md)
(«desplegado en Vercel») y la tabla de costos de
[SOMA-INFRA-AND-COSTS](/SOMA-INFRA-AND-COSTS.md) anterior a esta fecha. No toca
ADR-004: Postgres con pgvector sigue siendo la decisión de motor de datos.

# Contexto

La documentación fijaba **Vercel** para el sitio y **Railway** para el API, con
un total estimado de ~$6–16/mes. Ese mismo documento incluía un aviso que nunca
se resolvió:

> El plan Hobby de Vercel es **solo para uso no comercial**.

SOMA no es un proyecto personal: es la herramienta con la que un despacho de
arquitectura lee facturas y cotiza obra. Es trabajo facturable. Bajo el plan
Hobby eso no está permitido, y el plan que sí lo permite cuesta **$20/mes** —
más que todo el resto del stack junto. El aviso convertía la opción «gratis» en
la más cara del conjunto, y llevaba semanas escrito sin que nadie decidiera.

Mientras tanto, `render.yaml` ya existía en el repositorio y desplegaba **web y
API en Render**, con un comentario que daba exactamente esa razón. Es decir: el
código ya había tomado una decisión que la documentación seguía contradiciendo.
Este ADR cierra esa brecha en la dirección del código.

# Decisión

Un solo proveedor de ejecución y un proveedor de datos:

| Capa | Proveedor | Plan | Coste |
| --- | --- | --- | --- |
| Sitio web estático | **Render** static | Free | $0 |
| API FastAPI | **Render** web (docker) | Free | $0 |
| Postgres + pgvector | **Neon** | Free | $0 |
| Dominio | registrador | anual | ~$1/mes |

**~$1/mes**, y es el dominio. Todo lo demás es plan gratuito con uso comercial
permitido.

# Por qué

1. **Licencia, no precio.** Es la razón principal y no es técnica. Render static
   permite uso comercial en su plan gratuito; Vercel Hobby no. Elegir por la
   etiqueta «$0» sin leer para qué usos vale es cómo se llega a una factura
   sorpresa o a un incumplimiento.

2. **Un proveedor en vez de dos.** A escala de **un solo usuario**, repartir web
   y API entre Vercel y Railway compra cero y cuesta coordinación: dos
   dashboards, dos facturas, dos sitios donde buscar un log a las once de la
   noche. La regla de escala de este proyecto dice que una capa hay que
   justificarla antes de añadirla.

3. **Railway no es gratis.** Su crédito de $5 cubre un contenedor pequeño, pero
   es un gasto recurrente por algo que Render hace por $0 mientras el uso sea
   esporádico.

4. **Neon sigue siendo la respuesta para datos.** Render ofrece Postgres, pero
   Neon escala a cero, incluye `pgvector` sin extensión aparte y da branches por
   entorno — los tres motivos del ADR-004. Que los datos vivan fuera del
   proveedor de ejecución es además una propiedad deseable: el contenedor puede
   morir sin llevarse nada.

# Consecuencias

- **CORS pasa a hacer falta en producción.** Render da un dominio por servicio,
  así que web y API son orígenes distintos. En local no ocurre porque Caddy los
  sirve tras el mismo origen. `CORS_ORIGINS` deja de ser opcional.
- **El API gratuito duerme.** Tras un rato sin tráfico, la primera petición tarda
  decenas de segundos. Aceptable para demos y uso esporádico; **deja de serlo el
  día que alguien lo use a diario**. La salida está identificada y es barata:
  plan Starter, $7/mes. Será el primer gasto real, y llegará por uso, no por
  crecimiento.
- **`vercel.json` queda muerto** en el repositorio. Sus cabeceras de seguridad ya
  están portadas a `render.yaml`; el archivo solo puede confundir o provocar un
  despliegue accidental.
- **Hoy el API sigue en SQLite** sobre disco efímero: la base se reinicia en cada
  despliegue. Migrar a Neon es trabajo pendiente del ADR-004, no de este ADR.

# Rechazado

- **Vercel Hobby.** Gratis pero prohibido para uso comercial. Es la opción que
  parecía obvia y que este ADR existe para descartar.
- **Vercel Pro ($20/mes).** Legítimo, pero paga por un CDN y una experiencia de
  despliegue que a un solo usuario no le compran nada que Render no dé gratis.
- **Railway ($5/mes).** Buen producto y el API no duerme. Se reconsidera si el
  arranque en frío molesta antes de que haga falta el Starter de Render — a ese
  precio la comparación ya no es obvia.
- **Postgres del propio Render.** Ataría los datos al proveedor de ejecución y
  perdería branches por entorno y scale-to-zero.
- **Seguir sin decidir.** Era el estado real hasta hoy, y el más caro de los
  cuatro: dejaba un incumplimiento de licencia latente y dos documentos
  contradiciéndose.

# Verificación

1. `render.yaml` es el único descriptor de despliegue del repositorio.
2. Ningún documento vigente (no histórico) nombra a Vercel o Railway como
   destino actual.
3. El sitio y el API responden desde dominios de Render, y `CORS_ORIGINS`
   contiene el dominio exacto del sitio.
4. La factura mensual real es solo el dominio.
