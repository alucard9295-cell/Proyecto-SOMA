# -*- coding: utf-8 -*-
"""Ingesta de facturas: como es HOY, no como la dibujo el ADR-006.

Verificado en api/src/soma_api/jobs/ingest.py: procesa una carpeta local con
pdfplumber y se invoca a mano. No hay bucket (no existe boto3 en pyproject) ni
servicio cron en render.yaml. Lo del ADR-006 queda punteado, como destino.
"""
from gen_lr import LR

NARANJA, TEAL, ROJO, AZUL = '#E8590C', '#009688', '#DC2626', '#3A6EA5'

d = LR("SOMA · ingesta de facturas (estado real)", [
    ("EN TU MÁQUINA", NARANJA, [
        dict(key='pdfs', label='Carpeta de PDFs', sub='facturas_db_pdf/', icon='folder'),
    ]),
    ("PROCESO  ·  local, a mano", TEAL, [
        dict(key='job', label='ingest.py', sub='pdfplumber  ·  20 por corrida', icon='pdf'),
    ]),
    ("VALIDACIÓN  ·  Python, no el LLM", ROJO, [
        dict(key='chk', label='¿Los totales cuadran?', sub='idempotente por content_hash'),
    ]),
    ("SALIDA", AZUL, [
        dict(key='csv', label='CSV / JSONL',   sub='filas listas para cargar', icon='doc'),
        dict(key='rev', label='needs_review',  sub='con el motivo escrito', accent=ROJO),
    ]),
    ("BASE", AZUL, [
        dict(key='db', label='facturas', sub='una sola fila por factura', icon='db'),
    ]),
])

d.edge('pdfs',  'job', 'ruta como argumento')
d.edge('job', 'chk', 'factura extraída')
d.edge('chk', 'csv', 'sí', ports=(1, 0.5, 0, 0.3), color='#059669')
d.edge('chk', 'rev', 'no', ports=(1, 0.5, 0, 0.7), color=ROJO)
d.edge('csv', 'db', 'carga', ports=(1, 0.5, 0, 0.5))

d.strip("LO QUE NO EXISTE TODAVÍA  ·  hoy nada de esto corre solo", [
    dict(key='inbox', label='inbox/ en R2',      sub='origen canónico del ADR-006', icon='bucket', planned=True),
    dict(key='cron',  label='Disparo automático', sub='ningún cron en render.yaml',   planned=True),
    dict(key='mail',  label='Correo y Drive',     sub='adaptadores del ADR-006',      planned=True),
], color='#9CA3AF')

d.legend([
    ("Sólido = verificado en el código de hoy", '#1F2733'),
    ("Punteado = decidido en el ADR-006, todavía sin construir", '#9CA3AF'),
    ("El mismo archivo dos veces no duplica: content_hash", TEAL),
    ("Una factura que no cierra NUNCA entra callada a la base", ROJO),
])
d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-ingesta-factura.drawio')
