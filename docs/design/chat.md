---
okf_version: "0.2"
type: Design Spec
title: Ventana de chat (asesor y copiloto)
description: Anatomía, estados, medidas y textos del popup de CopilotKit que usan el asesor público y el copiloto del admin.
tags: [soma, design, chat, copilotkit]
---

# Ventana de chat

Una sola ventana para los dos asistentes: el **asesor** en la portada y el
**copiloto** en el admin. Cambian los textos (`site.yaml` → `asesor` /
`copiloto`) y las tools, no el diseño. Base visual en [sistema.md](sistema.md).

## Implementación

`src/asistente/Asistente.jsx` sobre `CopilotPopup` (CopilotKit v2). Se
personaliza con los slots del componente, nunca editando `node_modules`:

| Parte | Cómo |
| --- | --- |
| Cabecera | slot `header` con render `children` → `CabeceraChat` propia |
| Indicador de carga | slot `messageView.cursor` → `CursorChat` (spinner + texto) |
| Markdown del agente | slot `messageView.assistantMessage` (rehype-harden) |
| Marco, burbujas, sugerencias | CSS en `styles.css` bajo `.chat-soma`, con selectores `[data-testid="copilot-*"]` |

Los `data-testid` de CopilotKit son el contrato estable para el CSS; las clases
`cpk:*` de Tailwind cambian entre versiones y no se usan como selector.

## Anatomía

```
┌──────────────────────────────────────┐  marco: 1px #DEDBD1 + sombra suave,
│ ● Asesor SOMA              ✕         │  radio 18px
│   en línea · orientación preliminar  │  cabecera: fondo #1D1D1A, texto #F7F5EF
├──────────────────────────────────────┤
│  bienvenida (serif, 17px)            │
│                                      │
│              ┌───────────────────┐   │  usuario: burbuja #1D1D1A, texto claro,
│              │ mensaje usuario   │   │  alineada a la derecha, máx. 85%
│              └───────────────────┘   │
│  texto del agente en markdown,       │  agente: sin burbuja, alineado a la
│  alineado a la izquierda             │  izquierda, 15px / 1.55
│  ◌ Pensando…                         │  spinner mientras corre
│                                      │
│  [sugerencia] [sugerencia]           │  gris, opacas, se activan al hover
├──────────────────────────────────────┤
│  Escribe tu pregunta…            ↗   │  input con borde, foco terracota
│  aviso de error posible (11px)       │
└──────────────────────────────────────┘
```

## Medidas

- Ancho 400px, alto `min(640px, 100vh - 120px)`; en móvil (<768px) CopilotKit
  lo pasa a pantalla completa y se respeta.
- Separación del lanzador: 24px del borde, igual que `.asistente-lanzador`.
- Padding interno de la lista de mensajes: 20px horizontal.

## Cabecera

- Punto de estado 9px, verde oliva `#68775D`, con halo que pulsa
  (`box-shadow` animado, 2.4s). Con `prefers-reduced-motion` el halo no se anima.
- Título en serif (Georgia) 17px; debajo, en monospace 11px mayúsculas:
  `en línea · <subtítulo>`.
- Cerrar: botón de CopilotKit (conserva `aria-label` y foco).

## Estados

| Estado | Qué se ve |
| --- | --- |
| Inactivo | punto verde pulsando, sugerencias visibles si no hay mensajes |
| Corriendo | `CursorChat`: spinner terracota 14px + "Pensando…" en gris |
| Tool ejecutada | nota `.asistente-nota` en gris (resumen del backend) |
| Error de red | banner de CopilotKit (`copilot-error-banner`) |
| Cupo agotado | texto fijo del Worker con enlace a WhatsApp |

## Sugerencias

Chips con borde `#DEDBD1`, texto `#77756B`, opacidad .72. Al pasar el ratón o
con foco: opacidad 1 y borde terracota. Máximo tres, cortas (≤ 55 caracteres).

## Tono del agente

- Responde en markdown: párrafos cortos, **negritas** para cifras y listas
  cuando enumera. Nada de títulos `#` en respuestas de menos de 4 párrafos.
- El asesor **comenta** el escenario tras llenar el simulador: las cifras las
  da el backend y el modelo las explica (qué pesa más, qué supuesto cambiar),
  sin prometer rentabilidad.

## Guardrails

- Enlaces solo al propio origen y `wa.me` (rehype-harden); imágenes solo del
  propio origen.
- Todo texto visible sale de `site.yaml`.
