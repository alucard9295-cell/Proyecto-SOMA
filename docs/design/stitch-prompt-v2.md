---
type: Design Prompt
title: Prompt de Stitch v2 — portada con renders propios
description: Segunda versión del prompt para Google Stitch. Parte del sistema "Tectonic Editorial" (stitch/DESIGN.md) y describe la portada tal como quedó en código el 2026-10-04 — galería de renders, propuestas en mosaico, simulador como hoja técnica y asesor con cara de robot.
tags: [soma, diseño, stitch, portada, prompt]
status: stable
generated: { by: claude-code/opus-5, at: 2026-10-04T00:00:00Z }
sources:
  - id: design-md
    resource: /design/stitch/DESIGN.md
    title: Sistema Tectonic Editorial
  - id: renders
    resource: /../assets/renders/
    title: Renders propios exportados de Blender (recortados del PDF arquitectura1)
---

# Prompt de Stitch v2

Adjuntar a Stitch las seis imágenes de `assets/renders/` (son renders propios;
las imágenes de la izquierda del PDF `arquitectura1.pdf` son fotogramas de
YouTube de terceros y **no** se suben). Pegar el texto de abajo.

```text
Landing page for SOMA Arquitectura, a small architecture studio in Bogotá that
transforms existing houses into multi-family housing. Spanish copy. Desktop
1440px, plus a 390px mobile version.

Design system "Tectonic Editorial": navy #0D1B26, bone #F4F4F2, paper #F9F9F7,
slate #3D4D5C, muted #8A9EAD, accent cyan #29B2E5 used sparingly. 0px radius
everywhere, no shadows, 1px hairlines (#E2E2DF on light, white 12% on dark).
Headings in Jost: a bold line followed by a light italic line on its own row.
Labels in DM Sans 11px bold uppercase, letter-spacing .18em. Generous margins.

Use the attached renders as the ONLY imagery. They are interior proposals, not
built projects.

1. HERO — full-viewport crossfading gallery of the renders, dark gradient at
   the bottom. Transparent header: SOMA logo left; nav PROPUESTAS, MÉTODO,
   SIMULADOR, CONTACTO; outlined button ACCESO ADMIN.
   Bottom-left: cyan label "PROPUESTA SOMA · ZONA SOCIAL", then the space name
   huge — "Sala" in bold, "luz filtrada" in light italic below.
   Bottom-right, separated by a thin vertical rule: small label
   "SOMA / VIVIENDA MULTIFAMILIAR", heading "Una casa." / italic "Varias formas
   de vivirla.", one short paragraph, a cyan button "SIMULAR MI CASA ↗" and an
   outlined "VER PROPUESTAS".
   A hairline strip at the very bottom: "01 / 04" left, centered ← dash dots →
   and a square pause button; the active dot is a longer cyan dash.
2. PROPUESTAS — on bone. "Espacios" / italic "que ya imaginamos", a sentence
   on the right. Underlined text tabs SELECCIÓN, ZONA SOCIAL, COCINA,
   DESCANSO (active = cyan with cyan underline). Mosaic in a 12-column grid,
   zig-zag 7/5, 5/7, 7/5. Each tile has a bottom caption: cyan "REF. 01",
   bold name + italic place, cyan category label.
3. MÉTODO — three numbered steps on paper with hairline dividers.
4. SIMULADOR — navy section with a faint 64px blueprint grid. Heading
   "¿Qué podría sostener" / italic "la transformación?". A bordered two-column
   sheet: left form with two numbered groups ("01 El inmueble": area, units,
   a 3-way square radio BASE / ESTÁNDAR / ALTA; "02 La renta", marked
   "opcional": purchase, rent per unit, monthly costs), underline-only inputs,
   cyan button "VER ESCENARIO ↗". Right: a title-block like an architectural
   drawing, "ESCENARIO PRELIMINAR" with "HOJA SIM-01" in cyan; a large
   "INVERSIÓN TOTAL $ 394.680.000", three small KPIs (flujo neto anual, ROI
   anual, payback — show "—" when there is no rent), a stacked horizontal bar
   "COMPOSICIÓN DE LA INVERSIÓN" in cyan shades with a legend (Obra, Diseño,
   Permisos, Imprevistos with amount and %), and a footer row "COSTO DE OBRA
   POR M²". Empty state: a thin line floor-plan drawing with cyan door arcs.
5. CONTACTO — "Visítanos" / italic "o escríbenos.", address row, a map.
6. FOOTER — navy, logo, tagline, legal line.

Floating bottom-right: a navy square button with a 1px cyan border holding a
small line-drawn ROBOT FACE (square head, cyan eyes inside a dark visor,
antenna with a cyan tip) and the label "ASESOR SOMA". Show also its opened
state: a navy panel with the robot, label "ASESOR SOMA", heading "Antes de
empezar," / italic "¿cómo te llamas?", underline inputs NOMBRE and CORREO
ELECTRÓNICO, a consent checkbox, and a full-width cyan button
"EMPEZAR A CHATEAR ↗".
```

## Variante de paleta: negro, verde y dorado

Para probarla en Stitch, en el mismo proyecto escribir este mensaje (Stitch
re-tematiza las pantallas sin rehacer la composición):

```text
Recolor the whole design, keep layout and type. New palette, sober and
elegant: black #121412 for hero, header and footer; deep green #1E3329 for the
simulator section and the advisor panel (panel inside it #172820); warm white
#F5F3EE for light sections; gold #C2A267 as the only accent (buttons, active
tab, labels on dark), lighter gold #E3CF9F as a second chart shade; on light
backgrounds use darker gold #7E6233 for accent text so it stays readable;
secondary text #3A3F38, muted #A3A497, hairlines #DEDBD2. Replace the robot
with a line-drawn Vitruvian Man (circle and square faint, right hand in gold,
raised toward a small gold chat-bubble badge on the launcher's corner).
```

En el lienzo de Claude Design la misma paleta ya está como ajuste `paleta`
(sobria / original) en cada tablero: botón Tweaks del tablero.
