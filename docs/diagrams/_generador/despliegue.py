# -*- coding: utf-8 -*-
"""Diagrama 1: dónde corre SOMA y por dónde viaja el dato.

Una sola dirección de lectura: arriba -> abajo. El cron vive en su propia banda
para que sus dos flechas salgan de un punto y no crucen el camino del API.
"""
from gen_diagrams import Diagram, BAND_X, BAND_W, BAND_GAP

d = Diagram("SOMA · despliegue")
BH, y = 132, 40
ys = {}
for key, title, color in [
    ('PERSONAS',  'PERSONAS',                              '#6B7280'),
    ('BORDE',     'BORDE  ·  Vercel',                      '#111827'),
    ('APP',       'APLICACIÓN  ·  Railway',                '#009688'),
    ('INGESTA',   'INGESTA  ·  Render (cron, $1/mes)',     '#E8590C'),
    ('DATOS',     'DATOS  ·  Neon + Cloudflare',           '#336791'),
]:
    d.band(title, y, BH, color); ys[key] = y + 42; y += BH + BAND_GAP

d.row([dict(key='cliente', label='Cliente / visitante', sub='sitio público de ventas', icon='browser'),
       dict(key='duenio',  label='Dueño del producto',  sub='control room admin',      icon='user')], ys['PERSONAS'])
d.row([dict(key='web', label='Web SOMA', sub='React 19 + Vite  ·  estático', brand='vercel')], ys['BORDE'])
d.row([dict(key='api', label='API SOMA',   sub='FastAPI + uv  ·  Python 3.12', icon='docker'),
       dict(key='llm', label='Asesor LLM', sub='SSE  ·  no calcula cifras',    icon='openai')], ys['APP'])
d.row([dict(key='cron', label='Cron de ingesta', sub='una sola corrida activa', icon='cron')], ys['INGESTA'])
d.row([dict(key='pg', label='Postgres + pgvector', sub='Neon  ·  entorno por branch',   icon='postgres'),
       dict(key='r2', label='Bucket privado',      sub='Cloudflare R2  ·  inbox/',      icon='bucket')], ys['DATOS'])

d.edge('cliente', 'web', 'HTTPS')
d.edge('duenio',  'web', 'cookie de sesión')
d.edge('web', 'api', '/api/*  REST + SSE')
d.edge('api', 'llm', '', dashed=True, ports='h', color='#8A3FFC')
# El API baja por la izquierda del cron; entra a Postgres descentrado para no
# chocar con la flecha del cron.
d.edge('api',  'pg', 'SQL', ports=(0.25, 1, 0.25, 0))
d.edge('cron', 'r2', 'lee inbox/', ports=(0.75, 1, 0.5, 0))
d.edge('cron', 'pg', 'escribe bronze / silver', ports=(0.25, 1, 0.75, 0), color='#E8590C')

d.legend([("Ejecución gestionada — Vercel, Railway, Render", "#009688"),
          ("Datos persistentes — Neon, Cloudflare R2",       "#336791"),
          ("Ingesta programada",                             "#E8590C"),
          ("Dependencia externa, solo lectura (invariante 7)", "#8A3FFC")], BAND_X, y + 6)

d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-despliegue.drawio')
