# Generador de los diagramas

Las coordenadas **no se escriben a mano**. Cada diagrama declara bandas
horizontales y filas de tarjetas; el generador centra cada fila y deriva el
espaciado del número de tarjetas, así que solapes y tamaños dispares son
imposibles por construcción — que era exactamente el defecto de la lámina
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
