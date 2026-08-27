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

El ejecutable **no está en el PATH**: hay que invocarlo por ruta completa
(`C:\Program Files\draw.io\draw.io.exe`).

### Exportación por CLI: cuándo funciona

Se creía que el export por CLI se colgaba siempre desde Claude Code. **Es falso.**
Verificado el 2026-08-26: con una sesión de escritorio activa exporta en segundos
(`exit=0`, PNG de ~400 KB). Se cuelga solo cuando no hay sesión interactiva —
entonces el renderer de Electron nunca arranca y el proceso queda al 0 % de CPU.

Invocar con espera acotada y matar si se pasa, para no bloquear la sesión:

```powershell
$p = Start-Process 'C:\Program Files\draw.io\draw.io.exe' -PassThru -ArgumentList `
     @('-x','-f','png','-e','-b','12','-s','2','-o',$out,$src)
if (-not $p.WaitForExit(90000)) { $p.Kill() } else { "exit=$($p.ExitCode)" }
```

El ejecutable **no está en el PATH**: ruta completa siempre.

## Geometría por script, nunca a mano

La regla «no coloques celdas a mano» se cumple generando las coordenadas, no
confiando en el criterio propio. `docs/diagrams/` se produce con un generador que
define **bandas horizontales** y centra filas de tarjetas dentro de cada una:

- Todas las tarjetas miden lo mismo (`232×78`). Un tamaño por tipo de nodo, gratis.
- El espaciado se deriva del número de tarjetas de la fila → **solapes imposibles**.
- Las aristas declaran puertos (`exitX/entryX`) y, cuando deben rodear una banda,
  puntos de paso calculados de la rejilla, no inventados.

Comprobación antes de dar nada por bueno:

```python
# tarjetas del mismo ancho y sin interseccion de rectangulos
assert len({(w,h) for ...}) == 1
assert solapes == 0
```

### Iconos: verificar que la forma existe

draw.io trae ~10.400 formas indexadas en
`~/.claude/plugins/marketplaces/drawio/shape-search/search-index.json`. Buscar ahí
el `style` exacto antes de usarlo; inventar un `shape=` produce una caja vacía.

**No existen** iconos de Vercel, Railway, Neon, Cloudflare, React ni FastAPI, y
el de PostgreSQL que sí trae es una versión genérica de Alibaba Cloud.

Para esos se usan los logos reales de **Simple Icons**, ya descargados en
`docs/diagrams/_generador/logos/` y convertidos a data URI en `logos.py`. Se
incrustan en el XML, no se enlazan: el `.drawio` queda autocontenido y no depende
de una URL que puede morir. Añadir una marca nueva:

```bash
curl -o logos/<slug>.svg https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<slug>.svg
# luego añadir el slug y su hex de marca al dict HEX y regenerar logos.py
```

Los archivos de Simple Icons son CC0; las marcas siguen siendo de sus dueños —
uso nominativo en un diagrama interno.

Regla que sigue en pie: para nodos que son **código puro** (`costing`,
`scheduling`, servicios de caso de uso), **ninguna insignia**. Un logo ahí miente
sobre la tecnología, y una letra suelta no significa nada. Comprobado por las
malas: se puso el logo de React sobre la capa `application/`, que es Python.

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
- Los diagramas maestros viven en `docs/diagrams/*.drawio`.
- Los diagramas incrustados viven dentro del `.md` que los explica.
- Nombra el archivo por lo que muestra y su momento:
  `soma-frontend-antes.drawio`, `soma-architecture.drawio`.

## Antes de dar por bueno un diagrama

Expórtalo a PNG y **míralo**. Un diagrama que no se ha visto renderizado no está
terminado: el XML puede ser válido y el resultado ilegible.
