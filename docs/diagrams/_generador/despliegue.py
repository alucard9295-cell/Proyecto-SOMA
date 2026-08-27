# -*- coding: utf-8 -*-
"""Despliegue: por donde entra una peticion y donde termina.

Solido = existe hoy (verificado en render.yaml y config.py).
Punteado = decidido en un ADR pero todavia no construido.
"""
from gen_lr import LR

GRIS, VERDE, TEAL, AZUL = '#6B7280', '#46E3B7', '#009688', '#3A6EA5'

d = LR("SOMA · despliegue", [
    ("PERSONAS", GRIS, [
        dict(key='cliente', label='Cliente / visitante', sub='sitio público de ventas', icon='browser'),
        dict(key='duenio',  label='Dueño del producto',  sub='control room admin',      icon='user'),
    ]),
    ("WEB  ·  Render static  ·  $0", VERDE, [
        dict(key='web', label='Web SOMA', sub='React 19 + Vite  ·  SPA compilada', icon='react'),
    ]),
    ("API  ·  Render docker  ·  $0", TEAL, [
        dict(key='api', label='API SOMA',   sub='FastAPI + uv  ·  Python 3.12', icon='docker'),
        dict(key='llm', label='Asesor LLM', sub='SSE  ·  lee, no calcula',      icon='openai', accent='#7C3AED'),
    ]),
    ("DATOS", AZUL, [
        dict(key='sqlite', label='SQLite', sub='disco efímero  ·  se borra al desplegar', icon='db', accent='#B45309'),
        dict(key='pg',     label='Postgres + pgvector', sub='Neon free  ·  ADR-004', icon='postgresql', planned=True),
    ]),
])

d.edge('cliente', 'web', 'HTTPS')
d.edge('duenio',  'web', 'cookie de sesión')
d.edge('web', 'api', '/api/*   REST + SSE')
d.edge('api', 'sqlite', 'hoy')
d.edge('api', 'pg', 'destino', dashed=True)
d.edge('api', 'llm', '', ports='v', color='#7C3AED', dashed=True)

# Transversal de verdad: no es una etapa del recorrido, toca todas.
d.strip("TRANSVERSAL  ·  se aplica a toda petición, en cualquier etapa", [
    dict(key='sec', label='Seguridad',      sub='cookie de sesión, rol, allowlist de MCP'),
    dict(key='obs', label='Observabilidad', sub='X-Request-ID, audit_events, run_id'),
    dict(key='lim', label='Límite de tasa', sub='rate_limit.py'),
])

d.legend([
    ("Existe hoy — verificado en render.yaml y config.py", '#1F2733'),
    ("Decidido en un ADR, todavía sin construir", '#9CA3AF'),
    ("SQLite en disco efímero: la base se reinicia en cada despliegue", '#B45309'),
    ("El LLM lee; ninguna cifra final sale de él (invariante 7)", '#7C3AED'),
])
d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-despliegue.drawio')
