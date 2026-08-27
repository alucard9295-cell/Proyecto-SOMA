# -*- coding: utf-8 -*-
"""Diagrama 2: cómo está organizado el código por dentro (hexagonal)."""
from gen_diagrams import Diagram, BAND_X, BAND_W, BAND_GAP

d = Diagram("SOMA · capas de código")
BH, y = 132, 40
ys = {}
for key, title, color in [
    ('IN',   'ENTRADA  ·  interface/',                       '#6B7280'),
    ('APP',  'CASOS DE USO  ·  application/',                '#009688'),
    ('DOM',  'NÚCLEO  ·  domain/', '#B45309'),
    ('INFRA','ADAPTADORES  ·  el SQL vive aquí',             '#336791'),
]:
    d.band(title, y, BH, color); ys[key] = y + 42; y += BH + BAND_GAP

d.row([dict(key='routes', label='routes  ·  main', sub='FastAPI, validación de entrada'),
       dict(key='deps',   label='dependencies',   sub='sesión por cookie, rol')], ys['IN'])
d.row([dict(key='svc', label='Servicios de caso de uso', sub='orquestan, no calculan')], ys['APP'])
d.row([dict(key='cost',  label='costing', sub='AIU, IVA  ·  Decimal, nunca float'),
       dict(key='sched', label='scheduling', sub='duración y cronograma de obra')], ys['DOM'])
d.row([dict(key='repo', label='repositories.py', sub='todo el SQL  ·  puertos',       icon='postgres'),
       dict(key='migr', label='migrations.py',   sub='única vía de cambio de esquema', icon='postgres')], ys['INFRA'])

d.edge('routes', 'svc', 'petición validada', ports=(0.5,1,0.25,0))
d.edge('deps',   'svc', 'identidad',         ports=(0.5,1,0.75,0))
d.edge('svc', 'cost',  'calcula',  ports=(0.25,1,0.5,0))
d.edge('svc', 'sched', 'planifica', ports=(0.75,1,0.5,0))
d.edge('svc', 'repo', 'puerto: lee y escribe', ports=(0,0.5,0,0.5), color='#336791',
       waypoints=[(340, 279), (340, 595)])   # rodea el nucleo por la izquierda
d.edge('repo', 'migr', 'esquema declarado', ports='h', color='#336791')

d.legend([("Regla verificada por AST: domain/ no importa FastAPI ni sqlite3", "#B45309"),
          ("test_architecture_layering.py falla si alguien la rompe",         "#B45309"),
          ("Un cálculo tiene UNA implementación: la del backend",             "#009688")],
         BAND_X, y + 6, w=560)
d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-capas.drawio')
