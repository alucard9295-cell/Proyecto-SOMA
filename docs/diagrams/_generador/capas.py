# -*- coding: utf-8 -*-
"""Capas de codigo: hacia donde puede mirar cada capa.

Los adaptadores van en la franja transversal porque no son una etapa del
recorrido: son el borde por el que el nucleo habla con el mundo, y cualquier
capa de arriba puede necesitarlos. Es la forma hexagonal, dibujada como tal.
"""
from gen_lr import LR

GRIS, TEAL, NARANJA, AZUL = '#6B7280', '#009688', '#B45309', '#3A6EA5'

d = LR("SOMA · capas de código", [
    ("ENTRADA  ·  interface/", GRIS, [
        dict(key='routes', label='routes  ·  main', sub='FastAPI, valida la entrada', icon='fastapi'),
        dict(key='deps',   label='dependencies',   sub='resuelve quién pide',        icon='fastapi'),
    ]),
    ("CASOS DE USO  ·  application/", TEAL, [
        dict(key='svc', label='Servicios de caso de uso', sub='orquestan; no calculan'),
    ]),
    ("NÚCLEO  ·  domain/", NARANJA, [
        dict(key='cost',  label='costing',    sub='AIU, IVA  ·  Decimal, nunca float'),
        dict(key='sched', label='scheduling', sub='duración y cronograma de obra'),
    ]),
])

d.edge('routes', 'svc', 'petición validada', ports=(1, 0.5, 0, 0.35))
d.edge('deps',   'svc', 'identidad',         ports=(1, 0.5, 0, 0.65))
d.edge('svc', 'cost',  'calcula',   ports=(1, 0.35, 0, 0.5))
d.edge('svc', 'sched', 'planifica', ports=(1, 0.65, 0, 0.5))

d.strip("ADAPTADORES  ·  el borde con el mundo — aquí vive TODO el SQL", [
    dict(key='repo', label='repositories.py', sub='única puerta a la base', icon='db'),
    dict(key='migr', label='migrations.py',   sub='única vía de cambio de esquema', icon='db'),
    dict(key='dbm',  label='database.py',     sub='conexión y unidad de trabajo',   icon='db'),
], color='#3A6EA5')

d.edge('svc', 'repo', 'puerto: lee y escribe', ports=(0.5, 1, 0.5, 0), color=AZUL)

d.legend([
    ("La flecha nunca apunta hacia la izquierda: domain/ no conoce a nadie", NARANJA),
    ("Verificado por AST en test_architecture_layering.py, no por disciplina", NARANJA),
    ("Un cálculo tiene UNA implementación, y es la del backend", TEAL),
    ("Los adaptadores no son una etapa: son el borde, por eso van aparte", AZUL),
])
d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-capas.drawio')
