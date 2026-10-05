---
type: Architecture Decision Record
title: Nombre y correo antes del asesor, guardados en D1
description: El asesor público pide nombre, correo y consentimiento antes de abrir el chat. Se guardan en una tabla `contactos` de D1 y se leen en el panel admin; no hay proveedor de correo. Registra también que el recorrido sale de la portada por ahora sin derogar el ADR-011.
tags: [soma, adr, asesor, contactos, d1, privacidad, portada]
status: stable
generated: { by: claude-code/opus-5, at: 2026-10-04T00:00:00Z }
sources:
  - id: adr-009
    resource: /SOMA-ADR-009-cloudflare.md
    title: ADR-009 Todo en Cloudflare (stack vigente)
  - id: adr-011
    resource: /SOMA-ADR-011-recorrido-en-video.md
    title: ADR-011 Recorrido en video
---

# ADR-012: Nombre y correo antes del asesor

## Estado

Aceptada el 2026-10-04. Implementada en local (migración `0003_contactos.sql`
aplicada con `db:migrate:local`); en producción falta `db:migrate:remote`, que
se corre solo con confirmación.

## Contexto

La dueña quiere saber quién usa el asesor público para poder retomar la
conversación. Hasta ahora el chat era anónimo: el único rastro era el contador
diario de `uso_asesor`, que no identifica a nadie.

Había tres caminos: enviar un correo por cada conversación (proveedor externo,
secreto nuevo, plantilla), guardar el contacto y leerlo en el admin, o no pedir
nada. Con un solo usuario que ya entra al panel a diario, un proveedor de correo
añade una dependencia y un secreto sin ganar nada que el panel no dé.

## Decisión

1. Antes del primer mensaje, el asesor muestra un paso previo
   (`src/asistente/PasoPrevio.jsx`) con nombre, correo y una casilla de
   autorización (Ley 1581 de 2012). Sin la casilla no se guarda nada: el
   servidor exige `autoriza: true` (`z.literal(true)`), no solo el formulario.
2. `POST /api/sales/contacto` valida con zod y guarda en la tabla `contactos`
   (`worker/repositories/contactos.ts`). El correo se normaliza a minúsculas y
   es único: si la persona vuelve, se actualiza el nombre, se suma una visita y
   se mueve `ultima_visita`.
3. La ruta comparte el limitador por IP del asesor (`ASESOR_LIMITE`). No llama
   a Workers AI, así que no consume el tope diario de `uso_asesor`.
4. `GET /api/admin/contactos` devuelve los 50 más recientes y el resumen del
   admin los muestra en la tarjeta «Quién quiso conversar». Va detrás de
   Access, como todo `/api/admin`.
5. El navegador recuerda que ya se registró (`localStorage`
   `soma:asesor-contacto`) para no volver a pedirlo. Si se borra, el paso vuelve
   a salir y el registro solo suma otra visita.
6. **No hay proveedor de correo.** Si algún día se quiere aviso inmediato, se
   evalúa entonces; hoy el panel basta.

## Consecuencias

- D1 guarda datos personales por primera vez fuera de las facturas. Se guarda
  lo mínimo (nombre y correo) y nada de la conversación.
- No hay borrado desde el panel. Si alguien pide que lo borren, hoy se hace con
  SQL a mano en D1; si llega a pasar, se añade la acción.
- Los tests de `tests/api/contactos.test.ts` cubren el guardado, la repetición,
  la validación (422) y el límite por IP (429).

## Nota: el recorrido sale de la portada

En la misma sesión la portada pasó a una galería de renders propios (los de
Blender) y el recorrido dejó de enlazarse desde ella. **El ADR-011 sigue
vigente**: la ruta `/recorrido` existe y la decisión de clips pre-renderizados
no cambia. Solo se retira de la portada hasta que haya clips que mostrar.
