---
type: Architecture Decision Record
title: Recorrido de la casa en video pre-renderizado con Blender
description: El recorrido por escenas se sirve como clips pre-renderizados en Blender Cycles y se reproducen atados al scroll. Se descarta el 3D en tiempo real con three.js y path tracing en el navegador, que se probó y va lento en hardware común.
tags: [soma, adr, recorrido, video, blender, portada]
status: accepted
generated: { by: claude-code/opus-5.5, at: 2026-09-30T00:00:00Z }
sources:
  - id: recorrido
    resource: /design/recorrido.md
    title: Recorrido por escenas (spec)
  - id: plan-blender
    resource: /design/recorrido-blender.md
    title: Plan de producción en Blender
  - id: adr-010
    resource: /SOMA-ADR-010-videos-en-r2.md
    title: ADR-010 Videos de obra en R2
---

# ADR-011: Recorrido en video pre-renderizado

## Estado

Aceptada el 2026-09-30. La producción de los clips queda en manos de quien
tenga Blender instalado; el plan paso a paso está en
[design/recorrido-blender.md](design/recorrido-blender.md).

## Contexto

La portada va a tener un recorrido por escenas: una casa existente que se
transforma para vivir. Se ve desde arriba, se entra y se pasa por la sala, la
cocina, las unidades, la alcoba y el patio. Ver [design/recorrido.md](design/recorrido.md).

Se construyó un prototipo en tiempo real en la ruta `/recorrido`, con estas
piezas:

- three.js r186 empaquetado;
- materiales PBR y modelos CC0 de Poly Haven;
- cielo HDRI con AgX, GTAO y sombras suaves;
- `three-gpu-pathtracer` para refinar la imagen cuando la cámara se detiene.

Esto es lo que se aprendió con él:

- **Rendimiento:** en una Intel Iris Xe corre a 10–13 fps. El trazado de luz
  tarda segundos en limpiar la imagen y se vuelve a ensuciar con cada scroll.
  La dueña del producto lo descartó: "esta muy lento… mejor los videos".
- **Realismo:** con la luz rasterizada, el interior se ve plano y frío. Sin
  trazado de luz real, se sigue viendo como una maqueta.
- **Peso:** el bundle `Recorrido-*.js` pesa 917 kB (242 kB gzip), y los
  assets, unos 57 MB.

## Decisión

1. **Los clips se producen en Blender con Cycles.** Se usan los mismos assets
   CC0 de Poly Haven y el mismo guion y cámaras del prototipo. Se renderiza una
   vez, offline, y la calidad no depende del equipo de quien visita la página.
2. **Hay un clip por tramo, en H.264 MP4 1080p, con una variante 720p para
   móvil.** Cada tramo va de una escena a la siguiente. El scroll adelanta o
   retrocede el tramo con `currentTime`, al estilo de las páginas de producto
   de Apple. Para que ese scrub sea fluido, se codifica con GOP corto
   (`-g 1`–`-g 6`).
3. **La página `/recorrido` conserva su forma:**
   - el riel de scroll, los textos de `site.yaml → ventas.recorrido`, los
     ticks, el teclado y el fallback de texto;
   - lo único que cambia es el fondo: un `<video>` en lugar del `<canvas>`
     de three.js.
4. **Los clips no van a git.**
   - Mientras no esté R2, se sirven desde `public/recorrido/video/`, que
     está ignorado. Cada archivo debe pesar menos de 25 MiB, el tope de los
     assets del Worker.
   - Cuando se active R2, pasan a servirse según el ADR-010.
   - En ambos casos siguen siendo del mismo origen, así que `media-src 'self'`
     sigue valiendo.
5. **Presupuesto:** hasta 30 MB en total en escritorio y hasta 8 MB en móvil.
6. **Cuando los clips reemplacen al prototipo,** salen del proyecto:
   - `three`, `three-mesh-bvh` y `three-gpu-pathtracer`;
   - `src/sales/recorrido/escena.js`;
   - `scripts/recorrido-assets.mjs`.

   Hasta entonces, `escena.js` es la referencia de la geometría, las medidas y
   las cámaras que se pasan a Blender.

## Alternativas descartadas

- **Tiempo real con three.js y path tracing en el navegador.** Se probó y es
  lento y se ve a maqueta en hardware común (ver Contexto).
- **Video generado con IA.** Es difícil mantener la misma casa entre escenas
  y lograr un plano continuo largo.
- **Secuencia de imágenes WebP en un canvas.** Pesa más que un MP4 con GOP
  corto para la misma duración. Queda como plan B si el scrub del `<video>`
  va a saltos en Safari.

## Consecuencias

- Hace falta alguien con Blender y ffmpeg. Renderizar ~600 cuadros en Cycles
  toma horas, pero se hace una sola vez por versión del guion.
- Cambiar el guion o el diseño obliga a volver a renderizar. Los textos, en
  cambio, se pueden cambiar sin render, porque viven en `site.yaml`.
- El bundle público pierde three.js (-917 kB) cuando se complete el paso 6.
