# -*- coding: utf-8 -*-
"""Generador de diagramas con lectura IZQUIERDA -> DERECHA.

El dato entra por la izquierda y sale por la derecha. Cada columna es una etapa;
dentro de una columna las tarjetas se apilan y se centran solas.

Lo que corta a TODAS las etapas (seguridad, observabilidad, adaptadores) va en
una franja transversal debajo que abarca el ancho completo. Eso es exactamente
lo que significa transversal, y por eso no se dibuja como una etapa mas.

Igual que el generador vertical: las coordenadas se DERIVAN de la rejilla, nunca
se escriben a mano. Solapes y tamanos dispares son imposibles por construccion.
"""
import io
import html
from logos import LOGO

ICON = {
    'browser': 'image;aspect=fixed;html=1;points=[];align=center;image=img/lib/azure2/general/Browser.svg;',
    'user':    'shape=actor;html=1;fillColor=#FFFFFF;strokeColor=#5A6270;',
    'docker':  'image;sketch=0;aspect=fixed;html=1;points=[];align=center;image=img/lib/mscae/Docker.svg;',
    'openai':  'image;aspect=fixed;html=1;points=[];align=center;image=img/lib/azure2/ai_machine_learning/Azure_OpenAI.svg;',
    'pdf':     'dashed=0;outlineConnect=0;html=1;align=center;shape=mxgraph.webicons.adobe_pdf;fillColor=#F40C0C;gradientColor=#610603',
    'bucket':  'image;aspect=fixed;html=1;points=[];align=center;image=img/lib/azure2/storage/Storage_Accounts.svg;',
    'db':      'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=8;fillColor=#FFFFFF;strokeColor=#3A6EA5;',
    'folder':  'shape=folder;html=1;tabWidth=20;tabHeight=9;tabPosition=left;fillColor=#FFFFFF;strokeColor=#5A6270;',
    'doc':     'shape=note;whiteSpace=wrap;html=1;size=12;fillColor=#FFFFFF;strokeColor=#5A6270;',
    'check':   'shape=rhombus;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#5A6270;',
}
ICON.update(LOGO)

CARD_W, CARD_H, CARD_GAP = 236, 80, 26
COL_PAD, COL_GAP, COL_TOP, HEADER = 22, 44, 40, 56
COL_W = CARD_W + 2 * COL_PAD
X0 = 40


def esc(s):
    return html.escape(s, quote=True)


class LR:
    def __init__(self, name, columns):
        """columns: lista de (titulo, color, [tarjetas])."""
        self.name, self.cells, self.n, self.pos = name, [], 1, {}
        rows_max = max(len(c[2]) for c in columns)
        self.col_h = HEADER + rows_max * CARD_H + (rows_max - 1) * CARD_GAP + COL_PAD
        self.width = len(columns) * COL_W + (len(columns) - 1) * COL_GAP
        for i, (title, color, cards) in enumerate(columns):
            cx = X0 + i * (COL_W + COL_GAP)
            self._band(title, cx, COL_TOP, COL_W, self.col_h, color)
            n = len(cards)
            block = n * CARD_H + (n - 1) * CARD_GAP
            top = COL_TOP + HEADER + (self.col_h - HEADER - COL_PAD - block) // 2
            for j, c in enumerate(cards):
                self._card(c, cx + COL_PAD, top + j * (CARD_H + CARD_GAP), color)
        self.bottom = COL_TOP + self.col_h

    def _id(self):
        self.n += 1
        return "n%d" % self.n

    def _band(self, title, x, y, w, h, color):
        st = ("rounded=1;arcSize=6;html=1;whiteSpace=wrap;fillColor=%s1A;strokeColor=%s55;"
              "dashed=0;verticalAlign=top;align=center;spacingTop=14;fontSize=12;fontStyle=1;"
              "fontColor=%s;" % (color, color, color))
        self.cells.append(
            '<mxCell id="%s" value="%s" style="%s" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (self._id(), esc(title), st, x, y, w, h))

    def _card(self, c, x, y, colcolor):
        key = c['key']
        accent = c.get('accent', colcolor)
        icon = c.get('icon')
        pad = 64 if icon else 22
        # Punteado = decidido pero todavia no construido. Solido = existe hoy.
        planned = 'dashed=1;dashPattern=8 5;' if c.get('planned') else ''
        st = ("rounded=1;arcSize=14;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=%s;"
              "strokeWidth=2;align=left;spacingLeft=%d;verticalAlign=middle;fontSize=13;"
              "fontStyle=1;fontColor=#1F2733;shadow=1;%s" % (accent, pad, planned))
        val = esc("%s<br><font style='font-size:10px' color='#6B7280'>%s</font>"
                  % (c['label'], c.get('sub', '')))
        self.cells.append(
            '<mxCell id="%s" value="%s" style="%s" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (key, val, st, x, y, CARD_W, CARD_H))
        self.pos[key] = (x, y)
        if icon:
            self.cells.append(
                '<mxCell id="%s" value="" style="%s" vertex="1" parent="%s">'
                '<mxGeometry x="12" y="20" width="40" height="40" as="geometry"/></mxCell>'
                % (self._id(), ICON[icon], key))

    def strip(self, title, cards, color='#7C3AED'):
        """Franja transversal: abarca el ancho completo, debajo de las columnas."""
        y = self.bottom + 36
        h = HEADER + CARD_H + COL_PAD
        self._band(title, X0, y, self.width, h, color)
        n = len(cards)
        block = n * CARD_W + (n - 1) * CARD_GAP
        x0 = X0 + (self.width - block) // 2
        for j, c in enumerate(cards):
            self._card(c, x0 + j * (CARD_W + CARD_GAP), y + HEADER, color)
        self.bottom = y + h

    def edge(self, a, b, label='', dashed=False, color='#5A6270', ports='h', waypoints=None):
        P = ports if isinstance(ports, tuple) else \
            {'h': (1, 0.5, 0, 0.5), 'v': (0.5, 1, 0.5, 0), 'up': (0.5, 0, 0.5, 1)}[ports]
        st = ("edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;jumpStyle=arc;jumpSize=8;"
              "strokeColor=%s;strokeWidth=2;endArrow=blockThin;endFill=1;fontSize=10;"
              "fontColor=#4B5563;labelBackgroundColor=#FFFFFF;%s"
              "exitX=%s;exitY=%s;exitDx=0;exitDy=0;entryX=%s;entryY=%s;entryDx=0;entryDy=0;"
              % (color, 'dashed=1;' if dashed else '', P[0], P[1], P[2], P[3]))
        pts = ''
        if waypoints:
            pts = '<Array as="points">%s</Array>' % "".join(
                '<mxPoint x="%d" y="%d"/>' % (px, py) for px, py in waypoints)
        self.cells.append(
            '<mxCell id="%s" value="%s" style="%s" edge="1" parent="1" source="%s" target="%s">'
            '<mxGeometry relative="1" as="geometry">%s</mxGeometry></mxCell>'
            % (self._id(), esc(label), st, a, b, pts))

    def legend(self, items, w=None):
        y = self.bottom + 32
        w = w or min(self.width, 820)
        rows = "".join("<br><font color='%s'>&#9632;</font> <font style='font-size:10px'>%s</font>"
                       % (c, t) for t, c in items)
        st = ("rounded=1;arcSize=8;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=#D1D5DB;"
              "align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontSize=11;fontStyle=1;"
              "fontColor=#374151;")
        self.cells.append(
            '<mxCell id="%s" value="%s" style="%s" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (self._id(), esc("Leyenda" + rows), st, X0, y, w, 26 + 20 * len(items)))

    def write(self, path):
        body = "\n        ".join(self.cells)
        xml = ('<mxfile host="app.diagrams.net">\n'
               '  <diagram name="%s">\n'
               '    <mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1"\n'
               '                  connect="1" arrows="1" fold="1" page="1" pageScale="1"\n'
               '                  pageWidth="1700" pageHeight="1100" math="0" shadow="0">\n'
               '      <root>\n'
               '        <mxCell id="0"/>\n'
               '        <mxCell id="1" parent="0"/>\n'
               '        %s\n'
               '      </root>\n'
               '    </mxGraphModel>\n'
               '  </diagram>\n'
               '</mxfile>\n' % (esc(self.name), body))
        io.open(path, 'w', encoding='utf-8', newline='\n').write(xml)
        print("escrito:", path)
