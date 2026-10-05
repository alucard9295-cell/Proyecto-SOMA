---
type: Architecture Decision Record
title: El simulador pinta la propuesta sobre una foto o plano que sube el visitante
description: Propuesta para que el visitante suba una foto del espacio o un plano y el simulador devuelva esa misma imagen con la remodelación pintada, usando FLUX.2 [klein] 4B de Workers AI con la imagen como referencia. Sin R2 en la primera fase, con los dos topes del invariante 8.
tags: [soma, adr, simulador, workers-ai, imagen, flux, portada]
status: draft
generated: { by: claude-code/opus-5, at: 2026-10-04T00:00:00Z }
sources:
  - id: adr-009
    resource: /SOMA-ADR-009-cloudflare.md
    title: ADR-009 Todo en Cloudflare (stack vigente)
  - id: adr-012
    resource: /SOMA-ADR-012-contacto-antes-del-asesor.md
    title: ADR-012 Contacto antes del asesor
  - id: cf-pricing
    resource: https://developers.cloudflare.com/workers-ai/platform/pricing/
    title: Workers AI pricing (consultado 2026-10-04)
  - id: cf-flux2-klein
    resource: https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/
    title: FLUX.2 [klein] 4B en Workers AI
---

# ADR-013: Pintar la propuesta sobre la imagen guía

## Estado

**Propuesta** (2026-10-04). Nada implementado. Falta que la dueña la apruebe y
una prueba de calidad con fotos reales antes de tocar código.

## Contexto

El simulador (S4) da un escenario numérico preliminar: costo, duración y
programa de espacios, calculados en `domain/`. La dueña quiere que el visitante
**vea** su propio espacio transformado. Pidió dos variantes:

1. **Subir una foto o un plano** y que el simulador pinte encima la propuesta.
   Es la que prefiere.
2. Generar un plano guía a partir de los datos del formulario (área, número de
   unidades).

La pregunta era si alcanza con Workers AI, que ya está en el Worker (binding
`AI`) para el asesor.

## Qué ofrece Workers AI hoy

| Modelo | Acepta imagen de entrada | Costo aprox. por imagen 1024² con 1 referencia |
| --- | --- | --- |
| `@cf/black-forest-labs/flux-2-klein-4b` | Sí, hasta 4 (`input_image_0..3`), cada una ≤ 512×512 | 5,37 + 4 × 26,05 ≈ **110 neuronas** |
| `@cf/black-forest-labs/flux-2-klein-9b` | Sí, hasta 4 | ≈ 1.545 neuronas |
| `@cf/black-forest-labs/flux-2-dev` | Sí, hasta 4; 25 pasos | ≈ 4.000 neuronas o más |
| `@cf/runwayml/stable-diffusion-v1-5-img2img` / `-inpainting` | Sí | Beta, calidad inferior |

El plan gratis trae **10.000 neuronas al día** para toda la cuenta, y el asesor
también las consume. Con klein-4b caben unas 90 imágenes al día si nadie más
gasta. Los modelos FLUX.2 reciben `multipart/form-data` incluso desde el
binding (`env.AI.run(modelo, { multipart: { body, contentType } })`).

## Decisión propuesta

**Variante 1 con FLUX.2 [klein] 4B**, como edición guiada por referencia:

* El visitante elige una foto del espacio o un plano (JPG/PNG, máximo 5 MB) en
  S4. **El navegador la reduce a 512 px** de lado mayor antes de subirla. Así
  cumple el límite del modelo y el Worker no procesa imágenes.
* `POST /api/simulador/imagen` (multipart) recibe la imagen y los datos del
  formulario que ya existen (tipo de espacio, estilo). El servicio arma el
  prompt **desde plantillas en `site.yaml`**, no desde texto libre del
  visitante. Por ejemplo: *"remodela el espacio de la imagen 0 como {estilo}
  manteniendo muros, ventanas y perspectiva"*. Para un plano: *"colorea este
  plano arquitectónico como plano de presentación, mismo trazo"*.
* La respuesta es la imagen generada, en base64 o como blob. **No se guarda**:
  ni la foto del visitante ni el resultado. Sin R2 en esta fase. Solo queda el
  contador de uso.
* La UI muestra antes y después con un deslizador, y la leyenda "imagen
  ilustrativa, no es un diseño ni un presupuesto".

### Topes (invariante 8)

* Límite por IP con el binding de rate limit (como `ASESOR_LIMITE`), más
  estricto: **3 imágenes por IP al día**.
* Tope diario global en D1 (una fila nueva en `uso_asesor` o tabla
  `uso_imagen`, por migración): **40 imágenes al día**. Eso son unas 4.400
  neuronas, y quedan más de la mitad para el asesor.
* Exigir el registro del ADR-012 (nombre y correo) antes de generar. Además
  convierte cada imagen en un contacto.

### Por qué paga a escala de un usuario

No añade servicios: usa el mismo Worker, el binding `AI` que ya existe y D1.
No hay cola porque la generación tarda pocos segundos con 4 pasos fijos. No hay
almacenamiento porque no se guarda nada. Es la pieza que más vende de la
portada, por un costo de cero mientras quepa en las 10.000 neuronas.

## Alternativas descartadas por ahora

* **Variante 2, plano guía por datos.** Un modelo de imagen no respeta medidas.
  Si se quiere, el plano debe dibujarlo `domain/` como SVG a partir del programa
  de espacios (invariante 7: el LLM no es fuente de verdad numérica). Queda
  como una fase posterior, sin IA.
* **Leer el plano con un modelo de visión** (`llama-3.2-11b-vision-instruct`)
  para sacar áreas. No es fiable para cotas y metería números del LLM en el
  escenario. Descartado.
* **flux-2-dev o klein-9b.** Cuestan de 14 a 40 veces más por imagen. Solo si
  la prueba de calidad con klein-4b sale mal.
* **Guardar resultados en R2** para una galería. Espera a que se active R2
  (ADR-010) y a que haya consentimiento explícito para conservar fotos de
  terceros.

## Plan de implementación

1. **Prueba de calidad**, sin código de producto: un script con
   `wrangler dev` y 5 fotos y planos propios de SOMA. Si las paredes y las
   ventanas no se conservan, se para aquí.
2. Migración del contador y del servicio `worker/services/imagenes.ts`, con la
   ruta en `routes/` y los topes. Tests en `tests/api` con el binding `AI`
   simulado.
3. UI en S4: entrada de archivo, reducción en canvas, estado de carga, antes y
   después. Textos en `site.yaml`.
4. Actualizar `docs/design/portada.md` y `SOMA-INFRA-AND-COSTS.md`.

## Consecuencias

* Las neuronas del día se reparten entre el asesor y las imágenes. Si se
  agotan, el simulador muestra el aviso de cupo, como ya hace el asesor, con el
  enlace a WhatsApp.
* La foto del visitante pasa por Workers AI y no se guarda. Hay que decirlo
  junto al botón de subir.
