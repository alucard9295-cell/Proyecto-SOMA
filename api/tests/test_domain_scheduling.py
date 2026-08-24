"""Tests del cronograma de obra, sin HTTP ni base de datos."""

from datetime import date
from decimal import Decimal

import pytest

from soma_api.domain.scheduling import build_schedule, partida_duration


def test_duracion_redondea_hacia_arriba():
    # 120 unidades a 10 por dia son 12 dias exactos.
    assert partida_duration(120, 10) == 12
    # 121 no cabe en 12 dias: media jornada ocupa un dia completo.
    assert partida_duration(121, 10) == 13


def test_duracion_minima_es_un_dia():
    assert partida_duration(0.5, 10) == 1


def test_rendimiento_cero_es_error_de_dominio():
    with pytest.raises(ValueError, match="mayor que cero"):
        partida_duration(10, 0)


def _partida(partida_id: int, fase: str, dias: int, costo: str = "1000"):
    return {
        "partida_id": partida_id,
        "fase": fase,
        "duracion_dias": dias,
        "costo_total": Decimal(costo),
    }


def test_proyecto_sin_partidas_termina_el_dia_que_empieza():
    schedule = build_schedule([], date(2026, 1, 5))
    assert schedule.partidas == []
    assert schedule.duracion_dias == 0
    assert schedule.fecha_fin == date(2026, 1, 5)


def test_una_partida_ocupa_desde_el_inicio():
    schedule = build_schedule([_partida(1, "Mamposteria", 12)], date(2026, 1, 5))
    item = schedule.partidas[0]
    assert item.fecha_inicio == date(2026, 1, 5)
    # 12 dias contando el primero: del 5 al 16.
    assert item.fecha_fin == date(2026, 1, 16)
    assert schedule.fecha_fin == date(2026, 1, 16)
    assert schedule.duracion_dias == 12


def test_las_partidas_se_encadenan_sin_solaparse():
    schedule = build_schedule(
        [_partida(1, "Excavacion", 3), _partida(2, "Cimentacion", 2)],
        date(2026, 3, 1),
    )
    primera, segunda = schedule.partidas
    assert (primera.fecha_inicio, primera.fecha_fin) == (date(2026, 3, 1), date(2026, 3, 3))
    # La siguiente arranca al dia siguiente del fin de la anterior.
    assert segunda.fecha_inicio == date(2026, 3, 4)
    assert segunda.fecha_fin == date(2026, 3, 5)
    assert schedule.duracion_dias == 5
    assert schedule.fecha_fin == date(2026, 3, 5)


def test_las_fases_agrupan_costo_duracion_y_conteo():
    schedule = build_schedule(
        [
            _partida(1, "Obra gris", 2, "1000"),
            _partida(2, "Obra gris", 3, "2000"),
            _partida(3, "Acabados", 1, "500"),
        ],
        date(2026, 1, 1),
    )
    fases = {phase.fase: phase for phase in schedule.fases}

    assert fases["Obra gris"].partidas == 2
    assert fases["Obra gris"].duracion_dias == 5
    assert fases["Obra gris"].costo_total == Decimal("3000.00")
    assert fases["Acabados"].partidas == 1
    assert schedule.costo_total == Decimal("3500.00")


def test_el_cronograma_cruza_fin_de_mes():
    schedule = build_schedule([_partida(1, "Obra", 5)], date(2026, 1, 29))
    assert schedule.partidas[0].fecha_fin == date(2026, 2, 2)


def test_el_cronograma_respeta_ano_bisiesto():
    # 2028 es bisiesto: el 29 de febrero existe.
    schedule = build_schedule([_partida(1, "Obra", 3)], date(2028, 2, 28))
    assert schedule.partidas[0].fecha_fin == date(2028, 3, 1)
