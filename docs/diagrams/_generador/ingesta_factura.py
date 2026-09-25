# -*- coding: utf-8 -*-
"""Ingesta de facturas: como es HOY, no como la dibujo el ADR-006.

Verificado en src/lib/leer-factura.ts y worker/services/documents.ts: el PDF se
lee en el navegador con pdf.js y el Worker revalida con el mismo dominio. R2
(FILES) sigue comentado, y no hay cron. Lo del ADR-006 queda punteado.
"""
from gen_lr import LR

NARANJA, TEAL, ROJO, AZUL = '#E8590C', '#009688', '#DC2626', '#3A6EA5'

d = LR("SOMA · ingesta de facturas (estado real)", [
    ("EN /admin", NARANJA, [
        dict(key='pdfs', label='PDF de la factura', sub='se elige a mano', icon='folder'),
    ]),
    ("NAVEGADOR  ·  pdf.js", TEAL, [
        dict(key='job', label='domain/extraction', sub='posicional, sin OCR', icon='pdf'),
    ]),
    ("WORKER  ·  revalida, no el LLM", ROJO, [
        dict(key='chk', label='¿Los totales cuadran?', sub='mismas reglas de domain/'),
    ]),
    ("ESTADO", AZUL, [
        dict(key='csv', label='aprobada',      sub='entra al catálogo', icon='doc'),
        dict(key='rev', label='needs_review',  sub='se aprueba o descarta', accent=ROJO),
    ]),
    ("D1", AZUL, [
        dict(key='db', label='facturas', sub='una sola fila por factura', icon='db'),
    ]),
])

d.edge('pdfs',  'job', 'palabras con x, y')
d.edge('job', 'chk', 'POST extracción')
d.edge('chk', 'csv', 'sí', ports=(1, 0.5, 0, 0.3), color='#059669')
d.edge('chk', 'rev', 'no', ports=(1, 0.5, 0, 0.7), color=ROJO)
d.edge('csv', 'db', 'db.batch', ports=(1, 0.5, 0, 0.5))

d.strip("LO QUE NO EXISTE TODAVÍA  ·  hoy nada de esto corre solo", [
    dict(key='inbox', label='PDF en R2',         sub='binding FILES, sin activar', icon='bucket', planned=True),
    dict(key='cron',  label='Disparo automático', sub='sin cron: todo es manual',   planned=True),
    dict(key='mail',  label='Correo y Drive',     sub='adaptadores del ADR-006',      planned=True),
], color='#9CA3AF')

d.legend([
    ("Sólido = verificado en el código de hoy", '#1F2733'),
    ("Punteado = decidido en el ADR-006, todavía sin construir", '#9CA3AF'),
    ("El mismo archivo dos veces no duplica: content_hash", TEAL),
    ("Una factura que no cierra NUNCA entra callada a la base", ROJO),
])
d.write(r'C:\proyectos_ia\arquitectura\Proyecto-SOMA\docs\diagrams\soma-ingesta-factura.drawio')
