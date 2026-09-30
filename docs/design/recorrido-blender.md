---
okf_version: "0.2"
type: Plan
title: Recorrido en Blender — plan de producción y handoff
description: Pasos concretos para modelar la casa en Blender a partir del prototipo three.js, renderizar los tramos con Cycles, codificarlos con ffmpeg y cambiar /recorrido para que reproduzca video atado al scroll. Pensado para que otra persona (o su Claude) lo continúe sin contexto previo.
tags: [soma, design, recorrido, blender, video, handoff]
status: draft
generated: { by: claude-code/opus-5.5, at: 2026-09-30T00:00:00Z }
sources:
  - id: adr-011
    resource: /SOMA-ADR-011-recorrido-en-video.md
    title: ADR-011 Recorrido en video pre-renderizado
  - id: recorrido
    resource: /design/recorrido.md
    title: Recorrido por escenas (spec)
---

# Recorrido en Blender: plan de producción

La decisión está en [ADR-011](../SOMA-ADR-011-recorrido-en-video.md), y el
guion, en [recorrido.md](recorrido.md). Este documento es el cómo.

## Estado al entregar (rama `feat/recorrido-blender`)

- La ruta `/recorrido` ya existe: `src/App.jsx` la carga en lazy.
  - `src/sales/recorrido/Recorrido.jsx` tiene el overlay en React: el riel de
    scroll, los textos, los ticks, el teclado, el loader y el fallback de
    texto.
  - `src/sales/recorrido/escena.js` es el **prototipo three.js en tiempo
    real**, que se descartó por lento. Sirve como **fuente de verdad de la
    geometría y las cámaras** para pasar la casa a Blender.
  - Los textos de las 7 escenas están en
    `src/content/site.yaml → ventas.recorrido.escenas`.
- `npm run recorrido:assets` baja de Poly Haven (CC0) a `public/recorrido/`
  el HDRI, las texturas PBR y los modelos glTF. Esa carpeta está ignorada por
  git y pesa unos 57 MB.
- El path tracer del prototipo **no funciona**: falta
  `setBVHWorker(new GenerateMeshBVHWorker())`. No hay que arreglarlo, porque
  el prototipo se va a retirar.
- typecheck, los 127 tests y el build pasaban al hacer el commit.

## Requisitos de la máquina

- Blender 4.2 LTS o más nuevo (Cycles, AgX y el importador glTF vienen
  incluidos).
- ffmpeg.
- Node 20+ y `npm install` para correr el sitio.
- En Windows: `winget install BlenderFoundation.Blender Gyan.FFmpeg`.
- Una GPU NVIDIA (OptiX) o AMD (HIP) acelera Cycles de 5 a 20 veces frente a
  la CPU.

## Paso 1: la casa en Blender

Todo lo que se genere va en `tools/recorrido-blender/`:

| Archivo | Qué es |
| --- | --- |
| `construir.py` | Script `bpy` que construye la escena |
| `casa.blend` | Salida del script. Ignorado por git si pesa más de unos MB |
| `render.py` | Script de render |

Hay que **generar la escena por script**, no a mano. Así se puede repetir y
revisar en un diff. Se corre con:

```
blender -b -P tools/recorrido-blender/construir.py
```

1. **Coordenadas.** three.js usa Y hacia arriba y Blender, Z hacia arriba.
   Un punto `(x, y, z)` de `escena.js` pasa a `(x, -z, y)` en Blender. Las
   unidades son metros en los dos.
2. **Geometría.** Portar las funciones de `escena.js` una por una:
   - `casco()`: muros, piel de fachada, ventanas al sur y puerta de entrada;
   - `cubierta()`: techo a cuatro aguas, alero y canales;
   - `sala()`, `cocina()`, `alcoba()` y `patio()`;
   - `vecina()` y `terreno()`: calle, muro del lote y 8 casas vecinas.

   Las medidas están en las llamadas a `box`, `rbox`, `plano` y `hipRoof`. Es
   una **casa de un piso que se transforma para vivir**, no un edificio.
3. **Materiales.** Usar Principled BSDF con las texturas de
   `public/recorrido/tex/<nombre>/{diff,nor_gl,rough}.jpg`:
   - el tamaño de cada textura sale del parámetro `metros` de `pbr()` en
     `escena.js`;
   - las UV se hacen con `Box projection` en coordenadas de objeto o de
     mundo;
   - `cesped` se tiñe hacia el verde. En el prototipo salía gris cemento, y
     ese error no se debe repetir.
4. **Muebles.** Importar los glTF de `public/recorrido/modelos/` con
   `bpy.ops.import_scene.gltf` y colocarlos donde lo hace `amoblar()` en
   `escena.js`. Ahí están `colocar(obj, x, y, z, {ry, s})`, que convierte
   igual que en el punto 1, y la rotación en Y, que pasa a ser rotación en Z.
5. **Luz.**
   - El mundo usa el HDRI `public/recorrido/cielo/tarde.hdr`, rotado para que
     el sol entre por las ventanas del sur hacia la sala.
   - Hay que poner el sol a unos **35–45° de elevación**. Con un sol más bajo,
     el prototipo daba sombras demasiado largas.
   - Añadir un Sun light alineado con el sol del HDRI (ángulo de 0,5–1°) para
     tener sombras definidas y manchas de sol en el piso.
   - El interior tiene que sentirse cálido. Si se ve frío, se baja la
     intensidad del mundo o se sube un poco la temperatura del Sun, **no** se
     añaden luces de relleno planas.
6. **Cámara.**
   - Crear una curva o keyframes a partir de `KEYS` en `escena.js`, con la
     posición `p` y el objetivo `l`.
   - El prototipo interpola con Catmull-Rom centrípeta. En Blender, usar un
     Empty como objetivo, un constraint `Track To` y keyframes Bézier con
     manijas automáticas.
   - Distancia focal: el prototipo usa un FOV vertical de 40° para 16:9, que
     equivale a unos 33 mm en un sensor de 36 mm con ajuste horizontal.
     Revisar a ojo.

   Las KEYS en coordenadas de three.js. Las que no tienen escena son de
   tránsito:

   | # | p | l | escena |
   |---|---|---|---|
   | 0 | 11, 17, 21 | -0.8, 0.4, -1.8 | 0 Llegada (aérea) |
   | 1 | -2.6, 6.2, 5.0 | -3.4, 0.3, -1.8 | 1 Leer (bajada) |
   | 2 | -3.4, 1.4, 4.2 | -3.6, 1.2, -5 | 2 Sala |
   | 3 | 0.1, 1.5, 1.5 | 2.4, 1.05, -2.4 | 3 Cocina |
   | 4 | 2.6, 1.45, 1.15 | 7, 1.45, 1.1 | 4 Unidades |
   | 5 | 4.9, 1.45, 1.6 | 5.5, 0.9, -3.2 | 5 Alcoba |
   | 6 | 2.8, 1.5, 0.9 | -2, 1.45, -6 | tránsito |
   | 7 | -2.0, 1.5, -3.8 | -2.4, 1.5, -9 | tránsito |
   | 8 | -8.2, 1.6, -15 | -2.8, 1.7, -5 | 6 Patio |

7. **Techo.**
   - En la bajada (tramo 0→1), la cámara atraviesa el techo.
   - El prototipo ocultaba el techo cuando la cámara estaba por debajo de
     9,5 m y dentro de la huella de la casa. En Blender se anima la
     visibilidad de la colección `techo` (`hide_render`) en el cuadro en que
     la cámara cruza la cubierta.
   - Otra opción es un fundido corto con un plano de corte.

## Paso 2: render

`render.py` corre con `blender -b casa.blend -P tools/recorrido-blender/render.py`
y renderiza por tramos:

| Ajuste | Valor |
| --- | --- |
| Motor | Cycles, GPU si hay |
| Muestras | 128–256 con denoise OpenImageDenoise |
| Resolución | 1920×1080 |
| Tasa | 30 fps |
| Vista | AgX, look `Medium High Contrast` o `Base Contrast` |
| Salida | PNG de 16 bits o EXR por cuadro |

Los cuadros se guardan en `tools/recorrido-blender/out/tramo-NN/`, que está
ignorado por git.

- **Tramos:** 6, uno por par de escenas consecutivas:
  - 0→1: keys 0–1;
  - 1→2: keys 1–2;
  - 2→3: keys 2–3;
  - 3→4: keys 3–4;
  - 4→5: keys 4–5;
  - 5→6: keys 5–8, pasando por las de tránsito.
- **Duración:** unos 3–4 s por tramo (90–120 cuadros), y 6 s para el 5→6,
  que es más largo. En total son unos 650 cuadros.
- **Pósters:** 7 imágenes fijas, una en cada key con escena, que se muestran
  mientras carga el video.
- **Prueba antes del render final:** renderizar primero a 640×360 y 32
  muestras para revisar las cámaras. Mostrarle a la dueña 2 o 3 cuadros
  finales (aérea, sala, patio) antes de lanzar los 650.

## Paso 3: codificar

El scrub por scroll necesita **muchos keyframes**. Con un GOP largo, el
`<video>` salta cuando el scroll retrocede.

```
ffmpeg -framerate 30 -i out/tramo-01/%04d.png -c:v libx264 -pix_fmt yuv420p \
  -crf 20 -preset slow -g 4 -movflags +faststart public/recorrido/video/tramo-01.mp4
ffmpeg -framerate 30 -i out/tramo-01/%04d.png -vf scale=1280:-2 -c:v libx264 -pix_fmt yuv420p \
  -crf 24 -preset slow -g 4 -movflags +faststart public/recorrido/video/tramo-01-sm.mp4
ffmpeg -i out/poster-0.png -q:v 4 public/recorrido/video/poster-0.jpg
```

- **Presupuesto:** hasta 30 MB en total en escritorio y hasta 8 MB en móvil.
  Ningún archivo puede pasar de 25 MiB, el tope de los assets del Worker. Si
  no cabe, se sube el `crf` antes de bajar la resolución.
- **Carpeta de salida:** `public/recorrido/video/`, ignorada por git. Hasta
  que haya R2 (ADR-010), los clips se copian a mano o con un script al
  desplegar.

## Paso 4: la página

Hay que cambiar `Recorrido.jsx` para que use video en lugar de
`crearRecorrido()`:

- **Qué se conserva:**
  - el riel (`.rc-riel`);
  - `irA()`, el teclado y los ticks;
  - el texto por escena;
  - el loader y el fallback de texto.
- **Fondo:** un `<video muted playsInline preload="auto">` por tramo, apilados
  y visibles uno a la vez, con el póster de la escena de llegada.
- **Scroll:** el progreso `p ∈ [0,1]` se reparte en 6 tramos. Dentro de cada
  tramo, `video.currentTime = t * duration`, suavizado con
  `requestAnimationFrame` y un lerp exponencial, como hace hoy el riel. La
  escena activa sale del tramo en el que está `p`.
- **Carga:** primero los pósters, después el tramo actual y los vecinos. En
  móvil (`pointer: coarse` o menos de 760 px) van los archivos `-sm`.
- **Movimiento y datos reducidos:** con `prefers-reduced-motion` o
  `navigator.connection.saveData` no se carga ningún video. Se muestran los
  pósters con un fundido.
- **Plan B:** si el scrub va a saltos en Safari, se usan secuencias WebP en un
  `<canvas>`. Ver el ADR-011.
- **Limpieza** (paso 6 del ADR-011), cuando los clips estén listos:
  - borrar `escena.js`, `scripts/recorrido-assets.mjs` y el script
    `recorrido:assets`;
  - `npm uninstall three three-mesh-bvh three-gpu-pathtracer`;
  - quitar el chip de "Trazado de luz / fps".

## Paso 5: verificar

- `npm run typecheck`, `npm test` y `npm run build` tienen que pasar. El chunk
  `Recorrido-*.js` debe quedar en pocos kB, sin three.
- `npm run dev` y abrir `http://127.0.0.1:5173/recorrido`. Hay que comprobar:
  - que el scroll va adelante y atrás sin saltos;
  - que los ticks, el teclado y las 7 escenas funcionan;
  - que se ve bien en ancho de móvil;
  - que funciona con reduced-motion;
  - que la consola no muestra errores de CSP (`media-src 'self'`).
- Mientras nada de esto se haya visto funcionando, se reporta como "pendiente
  de verificar".
- `npm run deploy` toca producción y necesita la confirmación de la dueña.

## Abierto

- ¿Hay planos o fotos reales de la casa de Villa Luz? Si existen, conviene
  que el modelo de Blender los siga y no la casa inventada del prototipo.
- ¿El recorrido reemplaza el hero de la portada o va en su propia ruta?
  Hoy vive en `/recorrido`.
- Falta elegir los materiales entre las pruebas A–D. Por ahora se sigue la
  paleta cálida del prototipo, y la referencia de estética es Stripe.
