"""Tests de la formula AIU.

Prueban la regla de negocio directamente, sin HTTP ni base de datos. Antes esto
era imposible: el costeo vivia dentro de un handler de FastAPI.
"""

from decimal import Decimal

import pytest

from soma_api.domain.costing import (
    ApuRates,
    ApuCosting,
    SupplyLine,
    cost_apu,
    money,
)


def test_costo_de_insumo_aplica_rendimiento_y_desperdicio():
    line = SupplyLine(
        rendimiento=Decimal("0.1"),
        precio_unitario=Decimal("269231"),
        desperdicio_pct=Decimal("0"),
    )
    assert line.costo == Decimal("26923.10")


def test_costo_de_insumo_sin_error_de_punto_flotante():
    """El caso que motivo migrar a Decimal.

    Con float, 0.1 * 269231 da 26923.100000000002. En una herramienta de
    presupuestos ese arrastre es un defecto, no un detalle.
    """
    line = SupplyLine(
        rendimiento=Decimal("0.1"), precio_unitario=Decimal("269231")
    )
    assert str(line.costo) == "26923.10"
    assert float(line.costo) == 26923.10


def test_desperdicio_incrementa_el_costo():
    sin = SupplyLine(rendimiento=Decimal("2"), precio_unitario=Decimal("1000"))
    con = SupplyLine(
        rendimiento=Decimal("2"),
        precio_unitario=Decimal("1000"),
        desperdicio_pct=Decimal("10"),
    )
    assert sin.costo == Decimal("2000.00")
    assert con.costo == Decimal("2200.00")


def test_apu_sin_porcentajes_es_solo_costo_directo():
    lines = [SupplyLine(rendimiento=Decimal("1"), precio_unitario=Decimal("100"))]
    costing = cost_apu(lines, ApuRates())
    assert costing.costo_directo == Decimal("100.00")
    assert costing.precio_venta == Decimal("100.00")
    assert costing.iva == Decimal("0.00")


def test_aiu_completo_con_iva_sobre_utilidad():
    lines = [SupplyLine(rendimiento=Decimal("1"), precio_unitario=Decimal("1000"))]
    rates = ApuRates(
        administracion_pct=Decimal("5"),
        imprevistos_pct=Decimal("5"),
        utilidad_pct=Decimal("10"),
        iva_pct=Decimal("19"),
        iva_base="utilidad",
    )
    costing = cost_apu(lines, rates)

    assert costing.costo_directo == Decimal("1000.00")
    assert costing.administracion == Decimal("50.00")
    assert costing.imprevistos == Decimal("50.00")
    assert costing.utilidad == Decimal("100.00")
    assert costing.subtotal == Decimal("1200.00")
    # El IVA grava solo la utilidad: 100 * 19%
    assert costing.base_iva == Decimal("100.00")
    assert costing.iva == Decimal("19.00")
    assert costing.precio_venta == Decimal("1219.00")


@pytest.mark.parametrize(
    "base,esperado_base_iva,esperado_iva",
    [
        ("utilidad", Decimal("100.00"), Decimal("19.00")),
        ("directo", Decimal("1000.00"), Decimal("190.00")),
        ("subtotal", Decimal("1200.00"), Decimal("228.00")),
    ],
)
def test_base_del_iva_cambia_el_resultado(base, esperado_base_iva, esperado_iva):
    lines = [SupplyLine(rendimiento=Decimal("1"), precio_unitario=Decimal("1000"))]
    rates = ApuRates(
        administracion_pct=Decimal("5"),
        imprevistos_pct=Decimal("5"),
        utilidad_pct=Decimal("10"),
        iva_pct=Decimal("19"),
        iva_base=base,
    )
    costing = cost_apu(lines, rates)
    assert costing.base_iva == esperado_base_iva
    assert costing.iva == esperado_iva


def test_base_de_iva_desconocida_cae_en_utilidad():
    """Comportamiento historico: una base invalida no debe reventar el calculo."""
    lines = [SupplyLine(rendimiento=Decimal("1"), precio_unitario=Decimal("1000"))]
    rates = ApuRates(utilidad_pct=Decimal("10"), iva_pct=Decimal("19"), iva_base="???")
    costing = cost_apu(lines, rates)
    assert costing.base_iva == costing.utilidad


def test_apu_sin_insumos_da_cero():
    costing = cost_apu([], ApuRates(utilidad_pct=Decimal("10")))
    assert costing.costo_directo == Decimal("0.00")
    assert costing.precio_venta == Decimal("0.00")


def test_varios_insumos_suman_el_costo_directo():
    lines = [
        SupplyLine(rendimiento=Decimal("2"), precio_unitario=Decimal("500")),
        SupplyLine(rendimiento=Decimal("1"), precio_unitario=Decimal("250")),
        SupplyLine(
            rendimiento=Decimal("3"),
            precio_unitario=Decimal("100"),
            desperdicio_pct=Decimal("10"),
        ),
    ]
    costing = cost_apu(lines, ApuRates())
    # 1000 + 250 + 330
    assert costing.costo_directo == Decimal("1580.00")


def test_as_dict_expone_floats_para_la_capa_http():
    costing = cost_apu(
        [SupplyLine(rendimiento=Decimal("1"), precio_unitario=Decimal("100"))],
        ApuRates(),
    )
    payload = costing.as_dict()
    assert isinstance(payload["precio_venta"], float)
    assert payload["precio_venta"] == 100.0
    assert set(payload) == {
        "costo_directo",
        "administracion",
        "imprevistos",
        "utilidad",
        "subtotal",
        "base_iva",
        "iva",
        "precio_venta",
    }


def test_money_redondea_a_dos_decimales_hacia_arriba():
    assert money("10.005") == Decimal("10.01")
    assert money("10.004") == Decimal("10.00")


def test_apu_costing_es_inmutable():
    costing = cost_apu([], ApuRates())
    with pytest.raises(Exception):
        costing.precio_venta = Decimal("1")  # type: ignore[misc]
    assert isinstance(costing, ApuCosting)
