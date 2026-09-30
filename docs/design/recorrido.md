---
okf_version: "0.2"
type: Design Spec
title: Recorrido por escenas (propuesta)
description: Guion y técnica para convertir la portada en un recorrido de apartamento que empieza desde arriba y avanza escena por escena con el scroll. Decidido en ADR-011: clips renderizados en Blender; el plan de producción está en recorrido-blender.md.
tags: [soma, design, portada, ventas, recorrido, video]
status: draft
generated: { by: claude-code/opus-5.5, at: 2026-09-30T00:00:00Z }
sources:
  - id: silenthill
    resource: https://silenthill.redpixel.club/
    title: Silent Hill — Private Residence for Rent (referencia)
  - id: adr-010
    resource: /SOMA-ADR-010-videos-en-r2.md
    title: ADR-010 Videos de obra en R2
---

# Recorrido por escenas

> **Decisión (2026-09-30):** los clips salen de Blender con Cycles
> ([ADR-011](../SOMA-ADR-011-recorrido-en-video.md)). Se descartó el 3D en tiempo
> real (opción C) tras probarlo: iba lento en una Iris Xe y se veía a maqueta. El
> plan paso a paso está en [recorrido-blender.md](recorrido-blender.md). Es una
> casa de un piso que se transforma para vivir, no un apartamento.

Idea: la portada deja de ser una landing con secciones y se vuelve un paseo.
La cámara entra desde arriba, atraviesa el techo y baja a la sala. Cada giro
de rueda, o cada swipe, lleva a la escena siguiente, y cada escena cuenta
una parte de la historia de SOMA.

## Cómo está hecha la referencia

Esto se vio al desarmar `silenthill.redpixel.club` el 2026-09-30:

- **No es 3D en tiempo real.** Son 7 clips MP4 pre-renderizados, uno por
  escena (`media/scene-NN.mp4`). Cada uno pesa unos 3,7 MB en escritorio y
  unos 0,5 MB en la versión `-sm` para móvil. Se reproducen en bucle
  ping-pong: adelante y atrás, así el corte no se nota.
- **Scroll por pasos.** La rueda no desliza la página, cambia de escena. El
  cambio es un fundido cruzado.
- **Carga en capas.** Primero van los pósters JPG (decenas de KB), después el
  clip de entrada y luego el resto. En móvil solo se cargan los vecinos, y
  nada si el navegador pide ahorrar datos.
- **Pila:** HTML, un `app.js` de 30 KB escrito a mano y GSAP. No usa
  framework ni three.js.

## Opciones técnicas

| | Técnica | Peso | Dificultad | Veredicto |
|---|---|---|---|---|
| A | Clips por escena + fundido (como la referencia) | ~4 MB/escena escritorio, ~0,5 MB móvil | Baja en código; lo difícil es conseguir los clips | **Base** |
| B | Secuencia de imágenes en `<canvas>` atada al scroll (estilo Apple) | 150–250 fotogramas WebP, 8–20 MB | Media | **Solo para la entrada desde arriba** |
| C | 3D en tiempo real con three.js: modelo `.glb` con luz horneada y cámara sobre un riel atado al scroll | 5–15 MB comprimido (Draco/Meshopt + texturas KTX2) + ~150 KB de three.js | Media en código; lo difícil es el modelo | **Viable** si hay modelo; ver nota |
| C' | Gaussian splats (captura fotorreal) | 20–200 MB crudo, 5–10× menos comprimido | Alta: captura o render a splat | Descartada a esta escala |

Recomendación: **A + B**.

- La bajada desde el techo hasta la sala es un plano continuo. Va atada al
  scroll (B), para que la persona sienta que ella mueve la cámara.
- Al llegar a la sala, el resto son escenas por pasos con clips en bucle (A).
- **Nota sobre C:** es viable y puede pesar menos que los videos. Hay tres
  condiciones:
  - La luz se hornea en Blender. Con luz calculada en vivo se ve a
    videojuego barato.
  - La cámara va sobre un riel atado al scroll, no en paseo libre.
  - Tiene que existir el modelo 3D: un proyecto propio exportado a `.glb` o
    una escena comprada con licencia web.

  El código cabe en la CSP actual: three.js va empaquetado y el decoder
  WASM de Draco ya está permitido por `'wasm-unsafe-eval'`.
- Los Gaussian splats (C') no pagan a esta escala: los estudios cotizan
  15.000–60.000 USD.

## Guion (borrador)

Encaja con lo que SOMA ya vende: una casa existente que puede tener otra
vida. La historia va de arriba hacia adentro y de lo que hay a lo que puede
ser.

| # | Escena (cámara) | Qué se cuenta | Texto en pantalla |
|---|---|---|---|
| 0 | Aérea: la manzana y el techo (continúa el dron actual) | Dónde estamos | "Una casa. Varias formas de vivirla." |
| 1 | Bajada a través del techo hacia la sala (secuencia B) | Entrar a leer la casa | Paso 01 · Leer la casa |
| 2 | Sala, luz de ventana | Lo que ya tienes también funciona | Estructura, luz, distribución |
| 3 | Cocina / mesa con planos | Los números de verdad: APU, insumos | Paso 02 · Proyectar escenarios |
| 4 | Pasillo que se abre en varias puertas | Una casa, varias unidades | Unidades posibles |
| 5 | Habitación terminada | Calidad de obra: base, estándar o alta | Tres niveles de acabado |
| 6 | Terraza al atardecer | Decidir con criterio | Paso 03 · Decidir → simulador |
| 7 | Plano del piso dibujándose | Cierre y contacto | Visítanos o escríbenos |

El simulador y el contacto siguen siendo secciones normales después del
recorrido. El recorrido abre la puerta; no reemplaza la cuenta.

## De dónde salen los clips

Esto es lo que manda en tiempo y costo, más que el código:

1. **Blender (gratis):** un modelo del apartamento y una cámara animada. Da
   la bajada continua (B) sin trucos. Hay que aprenderlo o contratar a
   alguien.
2. **Video con IA (Veo en Gemini / Flow):** sirve para clips cortos por
   escena (A). Es difícil mantener el mismo apartamento entre escenas y
   lograr un plano continuo largo. Está pendiente de verificar qué incluye
   el plan Gemini de la persona.
3. **Renders fijos + movimiento en CSS** (zoom lento, paralaje): es el
   camino más barato para una primera versión. Se pierde la sensación de
   cámara.

## Qué cambia en el código

No hace falta un refactor grande:

- **Componente nuevo.** `src/sales/Recorrido.jsx` más sus estilos. Escenas
  y textos en `site.yaml → ventas.recorrido`. `SalesSite.jsx` (89 líneas) lo
  monta antes del simulador.
- **Sin GSAP ni three.js.** El fundido y el scrubbing se hacen con
  `requestAnimationFrame` y Web Animations. La CSP (`script-src 'self'`) ya
  impide cargar librerías desde CDN.
- **Media.** Los clips salen por el Worker desde R2, según
  [ADR-010](../SOMA-ADR-010-videos-en-r2.md), así que `media-src 'self'`
  sigue valiendo. Hasta que se active R2 caben en `public/`, porque cada
  archivo pesa menos de 25 MiB, pero no conviene meterlos en git.
- **Accesibilidad.**
  - Con `prefers-reduced-motion` o con `Save-Data` se muestran los pósters
    fijos y se hace scroll normal.
  - El texto de cada escena existe en el HTML aunque no cargue ningún video.
  - Hay navegación con teclado entre escenas.
- **Decisión a registrar:** cuando se apruebe, va como ADR-011 (recorrido
  por escenas y presupuesto de peso), junto con este spec.

## Abierto

- ¿Apartamento de lujo genérico o la casa real de Villa Luz transformada?
  Lo segundo es más honesto con los guardrails de [portada.md](portada.md).
- ~~¿Quién produce los clips?~~ Blender (ADR-011).
- ¿El recorrido reemplaza el hero actual o va después de él?
