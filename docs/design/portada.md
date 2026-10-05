---
okf_version: "0.2"
type: Design Spec
title: Portada pública (clientes)
description: Orden de secciones, contenido y reglas visuales del sitio de ventas de SOMA.
tags: [soma, design, portada, ventas]
---

# Portada pública

Superficie para clientes: `src/sales/SalesSite.jsx`, textos en
`site.yaml → ventas`. Base visual en [sistema.md](sistema.md). Debe leerse
como un dossier de arquitectura, no como una landing SaaS.

## Orden de secciones

Cada sección tiene un nombre corto (`S1 inicio`, `S2 propuestas`…) que es a la
vez su `id` (el ancla de la URL), la etiqueta del bloque en `site.yaml` y el
comentario del mapa en `SalesSite.jsx`. Para pedir o hacer un cambio basta con
el nombre: "en S2 cambia el título" lleva a un solo componente y un solo bloque.

| Nombre | Componente | Textos en `site.yaml` | Qué es |
| --- | --- | --- | --- |
| S0 cabecera | `Cabecera()` | `ventas.portada` (`marca_sub`, `nav`) | Marca, anclas y menú móvil |
| S1 inicio | `Hero()` | `ventas.portada.diapositivas` | Galería de renders propios a pantalla completa |
| S2 propuestas | `Propuestas()` | `ventas.portada.propuestas` | Mosaico de renders con filtro por espacio |
| S3 enfoque | `Enfoque()` | `ventas.portada.enfoque` | El método en tres pasos |
| S4 simulador | `RemodelSimulator()` | `ventas.simulador` | Formulario y escenario preliminar |
| S5 contacto | `Contacto()` | `ventas.contacto` y `contacto` | Canales y mapa (ver abajo) |
| S6 pie | `Footer()` | `ventas.footer` | Marca, redes, dirección y aviso legal |
| asesor | `<Lanzador />` | `asesor` (`firma`, `menu`, `previo`, `correo`) | Agente SOMA: Vitruvio con arco de contacto |

El trabajo de diseño se concentra en S1 y S2. El video del dron (la sección
Film) salió de la portada por ahora; su texto sigue en `ventas.film`.

### Agente SOMA

El lanzador es un hombre de Vitruvio en silueta dentro de un círculo de vidrio
(fondo translúcido con `backdrop-filter`, borde dorado). A su izquierda va la
firma "AGENTE / SOMA" en una caja de vidrio, unida a la figura por una cota
dorada. En móvil solo queda la figura.

Al tocar la figura, las formas de contacto **se despliegan en arco** desde ella,
como en la referencia 57uno.com: cada una es un círculo con su etiqueta a la
izquierda. Los ángulos los pone `Lanzador.jsx`; en móvil el arco se estira
hacia arriba para que las etiquetas no se salgan de la pantalla.

* **Hablar con el agente** (círculo dorado): abre el chat y pide nombre y
  correo la primera vez (ADR-012). La ventana del chat usa el mismo vidrio
  oscuro.
* **WhatsApp** (círculo verde con el logo): abre `wa.me` con
  `contacto.whatsapp`. Si el número está vacío, la opción no aparece.
* **Correo**: pide nombre y correo, sin chat. Los datos quedan en D1 y se ven
  en el panel.

Esc o un clic fuera cierran el arco.

## Contacto

- Título serif: "Visítanos o escríbenos."; eyebrow `SOMA / CONTACTO`.
- Columna izquierda: dirección (Villa Luz, Engativá, Bogotá), horario y los
  canales como filas con icono SVG de 20px + texto:
  WhatsApp, Instagram, Facebook.
- Columna derecha: mapa de Google Maps embebido (`iframe`, `loading="lazy"`,
  `referrerpolicy="no-referrer-when-downgrade"`), 360px de alto, radio 18px,
  borde `#DEDBD1`, filtro gris suave que se quita al pasar el ratón.
- En móvil las columnas se apilan: canales primero, mapa después.

### Reglas de los canales

- URLs y número en `site.yaml → contacto`. **Un canal vacío no se pinta**
  (invariante: nada en la UI que no exista).
- Iconos como SVG en línea (sin fuentes de iconos ni CDNs): monocromos en
  `#1D1D1A`, terracota al hover. Cada enlace lleva `aria-label` y
  `rel="noopener"`; abren en pestaña nueva.
- WhatsApp: `https://wa.me/<número>` con mensaje prellenado opcional.

## Reglas visuales

- Fondo papel `#F7F5EF`; secciones separadas por espacio, no por líneas.
- Un solo acento terracota por pantalla visible.
- Titulares en Georgia; eyebrows en monospace mayúsculas 11px.
- Animación: aparición vertical al entrar en pantalla; nada con
  `prefers-reduced-motion`.

## Guardrails

- No prometer ROI, renta ni permisos: "escenario preliminar".
- La CSP de las páginas (`public/_headers`) permite `frame-src` solo para
  `https://www.google.com` (mapa). Cualquier otro embed exige cambiarla a
  propósito.
