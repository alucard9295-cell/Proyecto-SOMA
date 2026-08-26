"""Extraccion de facturas de proveedor desde PDF.

Infraestructura: sabe de PDF y de coordenadas. Las reglas de que hace creible a
una cifra viven en `domain/facturas.py`; aqui solo se lee.

**No se usa OCR.** Las facturas de proveedor traen capa de texto: los digitos
exactos ya estan dentro del archivo. Rasterizar la pagina para que un motor
adivine caracteres degrada un dato correcto, y en una factura un 8 leido como 3
corrompe el APU en silencio. OCR queda para documentos escaneados, que no es el
caso de ningun proveedor actual.

La tecnica, verificada sobre seis facturas reales de tres emisores:

1. Agrupar las palabras de la pagina por coordenada Y -> filas visuales. El
   orden de lectura del PDF **no** coincide con el visual (las columnas salen
   entremezcladas), asi que leer el texto plano no sirve para la tabla.
2. Localizar la fila de encabezado y tomar la coordenada X de cada titulo.
3. Asignar cada palabra de cada fila a la columna cuyo borde este mas cerca.

`extract_tables()` de pdfplumber no encuentra nada: estas facturas no dibujan
lineas, alinean columnas visualmente.

Un solo algoritmo. Lo unico que cambia por emisor es `PerfilEmisor`.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
import hashlib
import re

import pdfplumber

from .domain.facturas import ItemFactura, Veredicto, parse_money, primer_importe, validar


# NIT del comprador. Si no aparece, la factura no es nuestra.
NIT_COMPRADOR = "901687820"

# El CUFE (Codigo Unico de Facturacion Electronica) son 96 hexadecimales. Da
# una clave determinista para deduplicar sin depender de leer una sola cifra.
CUFE = re.compile(r"[0-9a-f]{96}")

FECHA = re.compile(r"\b(\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b")

# Tolerancia horizontal al asignar una palabra a su columna: los titulos rara
# vez estan exactamente sobre el dato que encabezan.
MARGEN_COLUMNA = 12.0

# Dos palabras pertenecen a la misma fila si sus centros verticales caen dentro
# de esta distancia.
TOLERANCIA_FILA = 2.5


@dataclass(frozen=True)
class DocumentoCrudo:
    """Un archivo tal como llego, antes de interpretarlo."""

    ruta: Path
    nombre_original: str
    content_hash: str
    bytes: int
    mime: str = "application/pdf"

    @classmethod
    def desde_archivo(cls, ruta: Path) -> "DocumentoCrudo":
        contenido = ruta.read_bytes()
        return cls(
            ruta=ruta,
            nombre_original=ruta.name,
            content_hash=hashlib.sha256(contenido).hexdigest(),
            bytes=len(contenido),
        )


@dataclass(frozen=True)
class PerfilEmisor:
    """Lo unico que cambia entre un proveedor y otro."""

    nit: str
    nombre: str
    titulos: dict[str, set[str]]
    fila_item: re.Pattern
    campos_totales: dict[str, str]


@dataclass
class FacturaExtraida:
    """Resultado de leer un documento. Todavia no es verdad: hay que validarlo."""

    nombre_archivo: str
    content_hash: str
    emisor_nit: str | None = None
    emisor_nombre: str | None = None
    cliente_nit: str | None = None
    cufe: str | None = None
    fecha: str | None = None
    parser: str | None = None
    items: list[ItemFactura] = field(default_factory=list)
    subtotal: Decimal | None = None
    iva: Decimal | None = None
    total: Decimal | None = None
    veredicto: Veredicto = field(default_factory=lambda: Veredicto(False, ("Sin procesar.",)))

    @property
    def estado(self) -> str:
        return self.veredicto.estado


PERFILES: tuple[PerfilEmisor, ...] = (
    PerfilEmisor(
        nit="901649012",
        nombre="FERRETERIA CONSTRUCTIVA Y DEPOSITO DE MATERIALES SAS",
        titulos={
            "linea": {"NO"},
            "referencia": {"REF"},
            "descripcion": {"DESCRIPCIÓN", "DESCRIPCION"},
            "cantidad": {"CANT"},
            "unidad": {"U/M"},
            "valor_unitario": {"PRECIO"},
            "impuesto": {"IMP"},
            # La columna SUBTOTAL del renglon, no TOTAL ITEM: es la que suma
            # el subtotal de la factura. Derivar cantidad x unitario da 25
            # pesos de menos en una factura real, porque el emisor redondea el
            # unitario. La cifra que el emisor declara manda sobre la calculada.
            "valor_total": {"SUBTOTAL"},
            # "TOTAL" y no "ITEM": el titulo es "TOTAL ITEM" y la columna
            # empieza en la primera palabra. Anclarla en "ITEM" corre el borde
            # a la derecha de sus propias cifras, que caen en la columna previa.
            "total_con_impuesto": {"TOTAL"},
        },
        fila_item=re.compile(r"^\d+\s"),
        campos_totales={"Subtotal": "subtotal", "IVA": "iva", "Total": "total"},
    ),
    PerfilEmisor(
        nit="901464983",
        nombre="ELEEQUIPOS SAS",
        titulos={
            "linea": {"ITEM"},
            "referencia": {"CÓDIGO", "CODIGO"},
            "descripcion": {"DESCRIPCIÓN", "DESCRIPCION"},
            "cantidad": {"CANTIDAD"},
            "unidad": {"U"},
            "valor_unitario": {"VALOR"},
            "valor_total": {"TOTAL"},
        },
        fila_item=re.compile(r"^\d+\s"),
        campos_totales={"SUBTOTAL": "subtotal", "IVA": "iva", "TOTAL A PAGAR": "total"},
    ),
    PerfilEmisor(
        nit="800242106",
        nombre="SODIMAC COLOMBIA S.A.",
        titulos={
            "cantidad": {"CANT"},
            "referencia": {"SKU"},
            "descripcion": {"DESCRIPCIÓN", "DESCRIPCION"},
        },
        fila_item=re.compile(r"^\d+\s+\d+\s"),
        campos_totales={"SUB.TOTAL": "subtotal", "IVA": "iva", "TOTAL A PAGAR": "total"},
    ),
)


def _filas(page, tolerancia: float = TOLERANCIA_FILA) -> list[tuple[float, list]]:
    """Agrupa las palabras de la pagina en filas visuales por coordenada Y."""
    agrupadas: dict[float, list] = {}
    for palabra in page.extract_words(use_text_flow=False, keep_blank_chars=False):
        centro = (palabra["top"] + palabra["bottom"]) / 2
        clave = next((k for k in agrupadas if abs(k - centro) <= tolerancia), centro)
        agrupadas.setdefault(clave, []).append(palabra)
    return [(k, sorted(agrupadas[k], key=lambda w: w["x0"])) for k in sorted(agrupadas)]


def _columnas(palabras: list, titulos: dict[str, set[str]]) -> dict[str, float]:
    """Coordenada X de inicio de cada columna, segun los titulos hallados."""
    columnas: dict[str, float] = {}
    for campo, claves in titulos.items():
        for palabra in palabras:
            if palabra["text"].upper().strip(".:") in claves:
                columnas.setdefault(campo, palabra["x0"])
    return columnas


def _repartir(palabras: list, columnas: dict[str, float]) -> dict[str, str]:
    """Asigna cada palabra a la columna cuyo inicio sea el mayor que la precede."""
    orden = sorted(columnas.items(), key=lambda par: par[1])
    celdas: dict[str, list[str]] = {campo: [] for campo, _ in orden}
    for palabra in palabras:
        elegida = orden[0][0]
        for campo, x in orden:
            if palabra["x0"] >= x - MARGEN_COLUMNA:
                elegida = campo
        celdas[elegida].append(palabra["text"])
    return {campo: " ".join(partes).strip() for campo, partes in celdas.items()}


def _perfil_de(texto: str) -> PerfilEmisor | None:
    """Primer perfil cuyo NIT aparezca en el documento. Sin match, revision."""
    plano = texto.replace(".", "").replace(" ", "").replace("-", "")
    return next((perfil for perfil in PERFILES if perfil.nit in plano), None)


def _totales(paginas_filas: list[tuple[float, list]], perfil: PerfilEmisor,
             ultima_y_item: float) -> dict[str, Decimal]:
    """Lee subtotal, IVA y total del pie de la factura.

    Tres reglas que costaron iteraciones sobre facturas reales y volveran a
    hacer falta al agregar un proveedor:

    1. Solo se mira **debajo** de la ultima fila de item. Sin esa frontera,
       "IVA" hace match dentro de un renglon ("IVA 19% $285,714.00") y el
       impuesto de la factura termina siendo el de una linea.
    2. La etiqueta debe coincidir como palabra completa: sin `\\b`, "Total"
       hace match dentro de "Subtotal".
    3. El monto debe traer separador de miles (lo exige `primer_importe`), o
       el "19" de "IVA 19%" y el "2026" de una fecha se cuelan como importes.
    """
    # Etiquetas mas largas primero: "TOTAL A PAGAR" debe ganarle a "TOTAL".
    etiquetas = sorted(perfil.campos_totales.items(), key=lambda par: -len(par[0]))
    encontrados: dict[str, Decimal] = {}
    for y, palabras in paginas_filas:
        if y <= ultima_y_item:
            continue
        linea = " ".join(palabra["text"] for palabra in palabras)
        for etiqueta, campo in etiquetas:
            if campo in encontrados:
                continue
            hallazgo = re.search(
                rf"(?<![A-Za-zÁÉÍÓÚÑ]){re.escape(etiqueta)}\b", linea, re.IGNORECASE
            )
            if hallazgo is None:
                continue
            monto = primer_importe(linea[hallazgo.end():])
            if monto is not None:
                encontrados[campo] = monto
    return encontrados


def extraer(documento: DocumentoCrudo) -> FacturaExtraida:
    """Lee un PDF de factura. Nunca lanza: un fallo devuelve `needs_review`."""
    factura = FacturaExtraida(
        nombre_archivo=documento.nombre_original, content_hash=documento.content_hash
    )
    try:
        with pdfplumber.open(documento.ruta) as pdf:
            texto = "\n".join(page.extract_text() or "" for page in pdf.pages)
            sin_espacios = re.sub(r"\s+", "", texto)

            hallado = CUFE.search(sin_espacios)
            factura.cufe = hallado.group() if hallado else None
            if NIT_COMPRADOR in sin_espacios.replace(".", "").replace("-", ""):
                factura.cliente_nit = NIT_COMPRADOR

            perfil = _perfil_de(texto)
            if perfil is None:
                factura.veredicto = Veredicto(
                    False, ("Ningun perfil de emisor reconoce este documento.",)
                )
                return factura
            factura.emisor_nit = perfil.nit
            factura.emisor_nombre = perfil.nombre
            factura.parser = perfil.nombre

            fecha = FECHA.search(texto)
            factura.fecha = fecha.group() if fecha else None

            todas: list[tuple[float, list]] = []
            ultima_y_item = 0.0
            for page in pdf.pages:
                filas_pagina = _filas(page)
                todas.extend(filas_pagina)

                columnas, y_encabezado = None, None
                minimo = max(3, len(perfil.titulos) - 3)
                for y, palabras in filas_pagina:
                    candidatas = _columnas(palabras, perfil.titulos)
                    if len(candidatas) >= minimo:
                        columnas, y_encabezado = candidatas, y
                        break
                if not columnas:
                    continue

                for y, palabras in filas_pagina:
                    if y <= y_encabezado:
                        continue
                    linea = " ".join(palabra["text"] for palabra in palabras)
                    if not perfil.fila_item.match(linea):
                        continue
                    celdas = _repartir(palabras, columnas)
                    # Una fila de item trae al menos un importe. No se puede
                    # exigir que sea la columna "precio": Sodimac no titula
                    # ninguna columna asi, sus montos van a la derecha de la
                    # descripcion sin encabezado propio.
                    if not any(parse_money(valor) for valor in celdas.values()):
                        continue
                    factura.items.append(
                        ItemFactura(
                            descripcion=celdas.get("descripcion", "").strip(),
                            cantidad=parse_money(celdas.get("cantidad")),
                            unidad=celdas.get("unidad") or None,
                            valor_unitario=parse_money(celdas.get("valor_unitario")),
                            valor_total=parse_money(celdas.get("valor_total")),
                        )
                    )
                    ultima_y_item = max(ultima_y_item, y)

            totales = _totales(todas, perfil, ultima_y_item)
            factura.subtotal = totales.get("subtotal")
            factura.iva = totales.get("iva")
            factura.total = totales.get("total")
    except Exception as error:  # noqa: BLE001 - un PDF ilegible es revision, no caida
        factura.veredicto = Veredicto(False, (f"No se pudo leer el documento: {error}",))
        return factura

    factura.veredicto = validar(
        items=factura.items,
        subtotal=factura.subtotal,
        iva=factura.iva,
        total=factura.total,
    )
    return factura
