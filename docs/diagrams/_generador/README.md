# Generador de los diagramas

Las coordenadas **no se escriben a mano**. Cada diagrama declara columnas de
izquierda a derecha —una por etapa— y el generador (`gen_lr.py`) apila y centra
las tarjetas dentro de cada una, derivando el espaciado del número de tarjetas.
Solapes y tamaños dispares son imposibles por construcción — que era exactamente el defecto de la lámina
anterior (12 tamaños distintos en 17 nodos y 6 pares solapados).

```powershell
cd docs\diagrams\_generador
python despliegue.py ; python capas.py ; python ingesta_factura.py

# render (requiere sesión de escritorio activa; ver skill soma-diagrams)
& "C:\Program Files\draw.io\draw.io.exe" -x -f svg -b 12 `
  -o ..\soma-despliegue.svg ..\soma-despliegue.drawio
```

Los `style` de los iconos salen del índice local de draw.io
(`~/.claude/plugins/marketplaces/drawio/shape-search/search-index.json`, ~10.400
formas). Inventar un `shape=` pinta una caja vacía: buscarlo ahí primero.

## Logos

`logos/` guarda los SVG de marca que draw.io no trae (Simple Icons, CC0).
`logos.py` los recolorea con el hex oficial de cada marca y los deja como data
URI, que es lo que consume el generador. Se incrustan en el XML a propósito: un
`.drawio` que enlaza a una URL externa deja de renderizar el día que esa URL
cambia.

No poner logo a un nodo que es código puro: miente sobre la tecnología.

## Dos convenciones que no son decorativas

**Izquierda a derecha.** El dato entra por la izquierda y sale por la derecha.
Una sola dirección de lectura; nunca mezclar con vertical.

**La franja transversal no es una etapa.** Seguridad, observabilidad y
adaptadores no ocurren *en un punto* del recorrido: cortan todo el ancho. Por
eso van en una banda que abarca todas las columnas, no como una columna más.

**Sólido = existe. Punteado = decidido, sin construir.** Un diagrama que pinta
el destino como presente miente, y se descubre tarde. Antes de marcar algo como
sólido, verificarlo en el código, no en un ADR.
