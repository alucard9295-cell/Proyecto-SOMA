---
name: soma-diagrams
description: Usar al crear o actualizar cualquier diagrama de SOMA (.drawio o Mermaid) para arquitectura, flujos de datos, secuencias o modelo de datos. Define cuándo usar cada formato y las reglas de layout que evitan diagramas ilegibles.
---

# Diagramas de SOMA

Regla que se aprendió por las malas: **un diagrama con las cajas colocadas a mano
sale torcido**. Las coordenadas fijas producen cajas de tamaños dispares, flechas
que se cruzan y bloques de texto que desbordan. No coloques celdas a mano.

## Qué formato usar

| Necesidad | Formato | Por qué |
| --- | --- | --- |
| Diagrama dentro de un `.md` del bundle OKF | **Mermaid** en el fence | Se versiona como texto y renderiza solo en GitHub |
| Diagrama maestro que se va a editar a mano | **`.drawio`** | Se abre en el escritorio y se reacomoda visualmente |
| Secuencia, ER, estados, gantt | **Mermaid** siempre | Estos tipos tienen layout propio; hacerlos en XML es trabajo perdido |

Para `.drawio`, la vía preferida es **escribir Mermaid y dejar que el CLI lo
convierta**, no escribir XML a mano. Solo se escribe XML cuando hace falta un
estilo concreto, una biblioteca de formas específica o anotaciones que Mermaid no
soporta.

## Auto-layout: obligatorio en XML

Si escribes XML, **nunca** confíes en tus coordenadas. Pasa siempre una pasada de
layout con el CLI del escritorio:

```powershell
& "C:\Program Files\draw.io\draw.io.exe" -x -f png --embed-diagram `
  --layout '[{"layout":"elkLayered","config":{"elk.direction":"RIGHT"}}]' `
  -o salida.png entrada.drawio
```

Presets disponibles: `verticalFlow`, `horizontalFlow`, `verticalTree`,
`horizontalTree`, `radialTree`, `organic`. Para arquitectura por capas,
`elkLayered` con `elk.direction: RIGHT` o `DOWN`.

`--embed-diagram` deja el XML dentro del PNG, así que la imagen exportada sigue
siendo editable en draw.io.

El ejecutable **no está en el PATH**: hay que invocarlo por ruta completa. La
exportación lanza el Electron del escritorio y puede tardar más de un minuto:
conviene correrla en segundo plano.

## Reglas de legibilidad

Lo que hacía feos los diagramas anteriores, y cómo evitarlo:

1. **Etiquetas cortas dentro de las cajas.** Máximo dos líneas. El detalle va en
   una nota al margen (`shape=note`) o en el texto del documento, no dentro del
   nodo. Una caja con cinco líneas rompe cualquier layout.
2. **Un tamaño de caja por tipo de nodo.** Si todos los servicios miden
   `160×60`, el resultado se ve ordenado solo. Tamaños arbitrarios se ven
   descuidados aunque el contenido sea correcto.
3. **Color con significado, y declarado.** Si usas color, incluye una leyenda que
   diga qué significa cada uno. Color decorativo es ruido.
4. **Máximo ~15 nodos por diagrama.** Si necesitas más, son dos diagramas: uno de
   contexto y uno de detalle.
5. **Una sola dirección de lectura.** Izquierda→derecha o arriba→abajo, no las
   dos mezcladas.
6. **Sin colores fijos en Mermaid.** El tema del lector decide; un `fill` fijo se
   vuelve ilegible en modo oscuro.

## Convenciones de SOMA

- Etiquetas en español.
- `flowchart LR` para arquitectura y despliegue.
- `sequenceDiagram` para protocolos (login, SSE del asesor, cola de jobs).
- `erDiagram` para el modelo de datos.
- Los diagramas maestros viven en `C:\proyectos_ia\docs\diagrams\*.drawio`.
- Los diagramas incrustados viven dentro del `.md` que los explica.
- Nombra el archivo por lo que muestra y su momento:
  `soma-frontend-antes.drawio`, `soma-architecture.drawio`.

## Antes de dar por bueno un diagrama

Expórtalo a PNG y **míralo**. Un diagrama que no se ha visto renderizado no está
terminado: el XML puede ser válido y el resultado ilegible.
