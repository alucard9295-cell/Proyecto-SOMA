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

1. **Hero** — eyebrow, titular serif en tres líneas con énfasis terracota,
   descripción (≤ 2 frases), los tres pasos numerados, visual de la casa.
2. **Simulador** — copia a la izquierda, formulario en dos columnas, panel de
   resultado con 4 KPIs. Los montos grandes llevan la cifra formateada debajo
   (`.simulator-hint`).
3. **Film** — video del dron, sin controles, silenciado, con leyenda.
4. **Casa existente** — texto + infografía con pie de foto.
5. **Contacto** — canales y mapa (ver abajo).
6. **Footer** — marca, redes con icono, dirección y aviso legal corto.

El asesor flota encima (ver [chat.md](chat.md)); no ocupa una sección.

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
