"""Lectura de importes y validacion de facturas.

Los casos usan cifras tomadas de las seis facturas reales de proveedor que
sirvieron para disenar el parseo, no numeros inventados: es la unica forma de
que el test siga protegiendo cuando alguien toque la heuristica.
"""

from decimal import Decimal

import pytest

from soma_api.domain.facturas import (
    ItemFactura,
    parse_money,
    primer_importe,
    validar,
)


@pytest.mark.parametrize(
    "texto, esperado",
    [
        # Ferreteria Constructiva escribe en formato US: coma miles, punto decimal.
        ("$150,000.00", "150000.00"),
        ("$28,571.00", "28571.00"),
        # Sodimac escribe en formato colombiano: punto miles, coma decimal.
        ("73.361,34", "73361.34"),
        ("13.938,66", "13938.66"),
        # Eleequipos escribe sin decimales. El punto es separador de miles: si
        # se leyera como decimal, 330.000 pesos se convertirian en 330.
        ("330.000", "330000.00"),
        ("346.500", "346500.00"),
        # Sin separadores.
        ("1092", "1092.00"),
        # Con simbolo y espacio.
        ("$ 87.300,00", "87300.00"),
    ],
)
def test_parse_money_lee_los_tres_formatos_de_los_proveedores(texto, esperado):
    assert parse_money(texto) == Decimal(esperado)


@pytest.mark.parametrize("texto", [None, "", "   ", "IVA", "$", "-"])
def test_parse_money_devuelve_none_en_vez_de_lanzar(texto):
    assert parse_money(texto) is None


def test_parse_money_no_concatena_dos_importes_vecinos():
    """Regresion: una celda mal delimitada trae dos montos pegados.

    Limpiando todo lo que no fuera digito, "$285,714.00 $340,000.00" producia
    28571400340000 — un numero absurdo que entraba a la base con cara de
    valido. Se toma solo el primer importe.
    """
    assert parse_money("$285,714.00 $340,000.00") == Decimal("285714.00")


def test_primer_importe_ignora_el_porcentaje_y_el_ano():
    """El "19" de "IVA 19%" y el "2026" de una fecha no son montos.

    Sin esta regla, el impuesto de la factura terminaba siendo el ano de
    expedicion: el texto del pie de Ferreteria mezcla ambas cosas en la misma
    linea.
    """
    assert primer_importe("IVA 19% $69,725.00") == Decimal("69725.00")
    assert primer_importe("Fecha de Generacion 06/02/2026 11:52") is None


def test_factura_que_cierra_queda_validada():
    """Eleequipos FESE 1348: 330.000 + 16.500 = 346.500."""
    veredicto = validar(
        items=[ItemFactura(descripcion="VENTA DE MADERA", cantidad=Decimal("1"),
                           valor_unitario=Decimal("330000"), valor_total=Decimal("330000"))],
        subtotal=Decimal("330000"),
        iva=Decimal("16500"),
        total=Decimal("346500"),
    )
    assert veredicto.valida
    assert veredicto.estado == "validated"
    assert veredicto.motivos == ()


def test_se_tolera_un_peso_de_redondeo():
    """Una de las facturas de Ferreteria declara un total un peso mayor que
    subtotal + IVA. Es redondeo del emisor, no un error de lectura."""
    veredicto = validar(
        items=[ItemFactura(descripcion="varios", valor_total=Decimal("1366218"))],
        subtotal=Decimal("1366218"),
        iva=Decimal("183581"),
        total=Decimal("1549800"),
    )
    assert veredicto.valida


def test_items_ilegibles_no_pasan_aunque_el_pie_cuadre():
    """La comprobacion que de verdad importa.

    Sodimac y Eleequipos pasaban `subtotal + IVA = total` con los renglones
    destrozados, porque los tres importes del pie se leen aparte de la tabla.
    Sin la suma de items, una factura ilegible entraba como si estuviera bien.
    """
    veredicto = validar(
        items=[ItemFactura(descripcion="basura", valor_total=Decimal("5"))],
        subtotal=Decimal("73361.34"),
        iva=Decimal("13938.66"),
        total=Decimal("87300.00"),
    )
    assert not veredicto.valida
    assert veredicto.estado == "needs_review"
    assert any("suma de los items" in motivo for motivo in veredicto.motivos)


def test_pie_que_no_cuadra_no_pasa():
    veredicto = validar(
        items=[ItemFactura(descripcion="x", valor_total=Decimal("100000"))],
        subtotal=Decimal("100000"),
        iva=Decimal("19000"),
        total=Decimal("500000"),
    )
    assert not veredicto.valida
    assert any("no coincide con el total" in motivo for motivo in veredicto.motivos)


def test_factura_sin_items_va_a_revision():
    veredicto = validar(items=[], subtotal=Decimal("1000"), iva=Decimal("0"), total=Decimal("1000"))
    assert not veredicto.valida
    assert any("no tiene items" in motivo for motivo in veredicto.motivos)


def test_item_sin_total_declarado_usa_cantidad_por_unitario():
    """Ferreteria no repite el total en cada renglon; se deriva del unitario."""
    item = ItemFactura(descripcion="Cemento", cantidad=Decimal("10"),
                       valor_unitario=Decimal("28571.00"))
    assert item.total_efectivo() == Decimal("285710.00")


def test_item_sin_importes_no_es_calculable():
    assert ItemFactura(descripcion="sin datos").total_efectivo() is None
