# -*- coding: utf-8 -*-
"""Diagrama 3: el viaje de una factura, desde el bucket hasta la pantalla."""
from gen_diagrams import Diagram, BAND_X, BAND_W, BAND_GAP

d = Diagram("SOMA · ingesta de una factura")
BH, y = 132, 40
ys = {}
for key, title, color in [
    ('ORIG', 'ORIGEN  ·  único canónico',                 '#E8590C'),
    ('DESC', 'DESCUBRIMIENTO  ·  cron de Render',         '#6B7280'),
    ('RAW',  'BRONZE  ·  inmutable, se reprocesa sin volver a subir', '#B45309'),
    ('PARSE','PARSEO  ·  XML DIAN antes que PDF',         '#009688'),
    ('VAL',  'VALIDACIÓN  ·  regla de negocio, no el LLM', '#DC2626'),
    ('OUT',  'SILVER  ·  lo que ve el usuario',           '#336791'),
]:
    d.band(title, y, BH, color); ys[key] = y + 42; y += BH + BAND_GAP

d.row([dict(key='inbox', label='inbox/  en R2', sub='correo y Drive solo depositan', icon='bucket')], ys['ORIG'])
d.row([dict(key='cron', label='Cron de ingesta', sub='una sola corrida activa', icon='cron')], ys['DESC'])
d.row([dict(key='raw', label='bronze.documentos_raw', sub='binario + hash  ·  received', icon='pdf')], ys['RAW'])
d.row([dict(key='xml', label='Parser XML DIAN', sub='el UBL es la factura'),
       dict(key='pdf', label='Parser PDF',      sub='solo si no hay XML')], ys['PARSE'])
d.row([dict(key='chk', label='¿Los totales cuadran?', sub='cualquiera de los dos parsers llega aquí')], ys['VAL'])
d.row([dict(key='ok',  label='silver.facturas', sub='validated  ·  visible en la UI', icon='postgres'),
       dict(key='rev', label='needs_review',    sub='totales que no cuadran')], ys['OUT'])

d.edge('inbox', 'cron', 'lista el prefijo')
d.edge('cron', 'raw', 'mismo archivo dos veces = una factura')
d.edge('raw', 'xml', 'precedencia', ports=(0.25,1,0.5,0))
d.edge('raw', 'pdf', 'respaldo', ports=(0.75,1,0.5,0), dashed=True)
d.edge('xml', 'chk', 'factura estructurada', ports=(0.5,1,0.25,0))
d.edge('pdf', 'chk', 'campos extraídos',     ports=(0.5,1,0.75,0))
d.edge('chk', 'ok',  'sí',  ports=(0.25,1,0.5,0), color='#059669')
d.edge('chk', 'rev', 'no',  ports=(0.75,1,0.5,0), color='#DC2626')

d.legend([("El XML UBL es la factura; el PDF es su representación gráfica", "#009688"),
          ("bronze es inmutable: mejorar un parser reprocesa sin resubir",  "#B45309"),
          ("Un documento dudoso nunca entra callado a silver",              "#DC2626")],
         BAND_X, y + 6, w=560)
d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-ingesta-factura.drawio')
