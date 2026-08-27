# -*- coding: utf-8 -*-
"""Genera los .drawio de SOMA con geometria calculada.

Las coordenadas NO se escriben a mano: se derivan de bandas y rejilla, asi que
cajas de tamano dispar y solapes son imposibles por construccion. Es la regla 1
y 2 de la skill soma-diagrams, aplicada como codigo en vez de como intencion.
"""
import io, html

# --- Iconos verificados contra el indice local de draw.io (10.446 formas) -----
ICON = {
 'browser':  'image;aspect=fixed;html=1;points=[];align=center;image=img/lib/azure2/general/Browser.svg;',
 'user':     'shape=actor;html=1;fillColor=#FFFFFF;strokeColor=#5A6270;',
 'docker':   'image;sketch=0;aspect=fixed;html=1;points=[];align=center;image=img/lib/mscae/Docker.svg;',
 'postgres': 'points=[];aspect=fixed;html=1;align=center;shadow=0;dashed=0;fillColor=#336791;strokeColor=none;shape=mxgraph.alibaba_cloud.postgresql;',
 'bucket':   'image;aspect=fixed;html=1;points=[];align=center;image=img/lib/azure2/storage/Storage_Accounts.svg;',
 'cron':     'aspect=fixed;sketch=0;html=1;dashed=0;fillColor=#2875E2;strokeColor=#ffffff;shape=mxgraph.kubernetes.icon2;prIcon=cronjob',
 'openai':   'image;aspect=fixed;html=1;points=[];align=center;image=img/lib/azure2/ai_machine_learning/Azure_OpenAI.svg;',
 'pdf':      'dashed=0;outlineConnect=0;html=1;align=center;shape=mxgraph.webicons.adobe_pdf;fillColor=#F40C0C;gradientColor=#610603',
}
# Marcas que draw.io NO trae: logo real incrustado (ver logos.py) + color de acento.
from logos import LOGO
ICON.update(LOGO)
BRAND = {'vercel':'#000000','railway':'#8A3FFC','neon':'#00E599',
         'cloudflare':'#F38020','render':'#46E3B7','fastapi':'#009688','react':'#61DAFB'}

W_NODE, H_NODE, GAP_X = 232, 78, 34
BAND_PAD_TOP, BAND_PAD_BOT, BAND_GAP, BAND_X, BAND_W = 42, 22, 26, 40, 1180

def esc(s): return html.escape(s, quote=True)

class Diagram:
    def __init__(self, name):
        self.name, self.cells, self.n, self.pos = name, [], 1, {}
    def _id(self):
        self.n += 1; return f"n{self.n}"
    def band(self, title, y, h, color):
        i = self._id()
        st = (f"rounded=1;arcSize=6;html=1;whiteSpace=wrap;fillColor={color}22;strokeColor={color}66;"
              f"dashed=0;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontSize=13;"
              f"fontStyle=1;fontColor={color};container=0;")
        self.cells.append(f'<mxCell id="{i}" value="{esc(title)}" style="{st}" vertex="1" parent="1">'
                          f'<mxGeometry x="{BAND_X}" y="{y}" width="{BAND_W}" height="{h}" as="geometry"/></mxCell>')
        return i
    def node(self, key, label, sub, x, y, icon=None, brand=None, w=W_NODE, h=H_NODE):
        accent = BRAND.get(brand, '#3A6EA5')
        pad = 64 if (icon or brand) else 22
        st = (f"rounded=1;arcSize=14;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor={accent};"
              f"strokeWidth=2;align=left;spacingLeft={pad};verticalAlign=middle;fontSize=13;fontStyle=1;"
              f"fontColor=#1F2733;shadow=1;")
        # mxGraph exige el HTML de la etiqueta ESCAPADO dentro del atributo:
        # se escribe crudo y se escapa una sola vez al final.
        val = esc(f"{label}<br><font style='font-size:10px' color='#6B7280'>{sub}</font>")
        self.cells.append(f'<mxCell id="{key}" value="{val}" style="{st}" vertex="1" parent="1">'
                          f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        self.pos[key] = (x, y, w, h)
        if icon:
            ic = self._id()
            self.cells.append(f'<mxCell id="{ic}" value="" style="{ICON[icon]}" vertex="1" parent="{key}">'
                              f'<mxGeometry x="12" y="19" width="40" height="40" as="geometry"/></mxCell>')
        elif brand:
            ic = self._id()
            st2 = (f"rounded=1;arcSize=30;html=1;fillColor={accent};strokeColor=none;fontColor=#FFFFFF;"
                   f"fontSize=15;fontStyle=1;")
            self.cells.append(f'<mxCell id="{ic}" value="{esc(brand[0].upper())}" style="{st2}" vertex="1" parent="{key}">'
                              f'<mxGeometry x="12" y="19" width="40" height="40" as="geometry"/></mxCell>')
        return key
    def row(self, keys_specs, y):
        """Centra una fila de nodos en la banda. Espaciado uniforme -> sin solapes."""
        n = len(keys_specs)
        total = n*W_NODE + (n-1)*GAP_X
        x0 = BAND_X + (BAND_W - total)//2
        for i, spec in enumerate(keys_specs):
            self.node(spec['key'], spec['label'], spec['sub'], x0 + i*(W_NODE+GAP_X), y,
                      icon=spec.get('icon'), brand=spec.get('brand'))
    def edge(self, a, b, label='', dashed=False, color='#5A6270', ports='v', waypoints=None):
        """ports: 'v' abajo->arriba, 'h' derecha->izquierda, 'hl' izquierda->derecha."""
        i = self._id()
        P = ports if isinstance(ports, tuple) else             {'v': (0.5,1,0.5,0), 'h': (1,0.5,0,0.5), 'hl': (0,0.5,1,0.5)}[ports]
        st = (f"edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;jumpStyle=arc;jumpSize=8;"
              f"strokeColor={color};strokeWidth=2;"
              f"endArrow=blockThin;endFill=1;fontSize=10;fontColor=#4B5563;labelBackgroundColor=#FFFFFF;"
              f"{'dashed=1;' if dashed else ''}"
              f"exitX={P[0]};exitY={P[1]};exitDx=0;exitDy=0;entryX={P[2]};entryY={P[3]};entryDx=0;entryDy=0;")
        pts = ''
        if waypoints:
            inner = "".join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in waypoints)
            pts = f'<Array as="points">{inner}</Array>'
        self.cells.append(f'<mxCell id="{i}" value="{esc(label)}" style="{st}" edge="1" parent="1" '
                          f'source="{a}" target="{b}"><mxGeometry relative="1" as="geometry">{pts}'
                          f'</mxGeometry></mxCell>')
    def legend(self, items, x, y, w=430):
        i = self._id()
        h = 26 + 20*len(items)
        rows = "".join(f"<br><font color='{c}'>&#9632;</font> <font style='font-size:10px'>{t}</font>" for t,c in items)
        st = ("rounded=1;arcSize=8;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=#D1D5DB;"
              "align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontSize=11;fontStyle=1;fontColor=#374151;")
        self.cells.append(f'<mxCell id="{i}" value="{esc("Leyenda" + rows)}" style="{st}" vertex="1" parent="1">'
                          f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    def write(self, path):
        body = "\n        ".join(self.cells)
        xml = f'''<mxfile host="app.diagrams.net">
  <diagram name="{esc(self.name)}">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1"
                  arrows="1" fold="1" page="1" pageScale="1" pageWidth="1300" pageHeight="1000"
                  math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        {body}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
'''
        io.open(path,'w',encoding='utf-8',newline='\n').write(xml)
        print("escrito:", path)
