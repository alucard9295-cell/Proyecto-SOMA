---
okf_version: "0.2"
type: Design Spec
title: Control room (admin)
description: Acceso, navegación, secciones y panel de consumo del plan gratis del control room de SOMA.
tags: [soma, design, admin, control-room]
---

# Control room

Herramienta operativa del dueño y sus compañeros: `/admin/*`. Base visual en
[sistema.md](sistema.md): denso pero claro, fondo claro, sin modo oscuro por
defecto. El copiloto flota en todas las secciones ([chat.md](chat.md)).

## Acceso

- Protegido por **Cloudflare Access** delante de `/admin` y `/api/admin/*`.
  Métodos: Google y código de un solo uso por correo. Solo entran los correos
  de la política de Access; el Worker además exige que estén en `ADMIN_EMAILS`.
- La app no tiene pantalla de login propia: Access la muestra. Si la sesión
  vence, la vista `vencida` ofrece "Entrar de nuevo".
- Arriba a la derecha: correo de la sesión y "Cerrar sesión"
  (`/cdn-cgi/access/logout`).

## Navegación

Barra lateral contraíble con las secciones en este orden: Resumen, Insumos,
APU, Simulador, Revisión, Consumo, Orientación. La sección activa lleva borde
terracota a la izquierda. Cada sección tiene URL propia y responde a
atrás/adelante.

## Secciones

| Sección | Contenido | Regla |
| --- | --- | --- |
| Resumen | KPIs (facturas, ítems, total pagado, proveedores), gasto por mes | cifras del backend, "—" si no hay datos |
| Insumos | buscador + tabla precio prom./mín./máx., compras | tabla densa, números alineados a la derecha, monospace |
| APU | análisis de precios unitarios por partida | total destacado; nunca calculado en el front |
| Simulador | proyecto de obra | mismo contrato que el de ventas |
| Revisión | facturas que no cerraron, con motivo | acción por fila, sin borrado masivo |
| Consumo | uso del plan gratis de Cloudflare | ver abajo |
| Orientación | guía de uso | solo describe funciones que existen |

## Consumo del plan gratis

Una tarjeta por servicio con barra de progreso uso/límite del periodo:

| Servicio | Métrica | Límite gratis | Periodo |
| --- | --- | --- | --- |
| Workers | peticiones | 100.000 | día |
| Workers AI | neuronas | 10.000 | día |
| D1 | filas leídas | 5.000.000 | día |
| D1 | filas escritas | 100.000 | día |
| D1 | almacenamiento | 5 GB | total |
| Asesor | consultas | tope propio (60) | día |

- Barra oliva hasta 70 %, terracota de 70 a 90 %, tinta con aviso por encima.
- Fuente: GraphQL Analytics API de Cloudflare, con un token de solo lectura
  guardado como secreto del Worker; el navegador nunca ve el token.
- Sin token configurado, la sección muestra cómo crearlo en vez de fallar.
- Pie con la hora de la consulta; los datos de Cloudflare llegan con minutos de
  retraso y así se dice.

## Guardrails

- Nada de datos reales de facturas en capturas ni en el repositorio.
- Una pantalla que llama una ruta inexistente se oculta.
