"""Planificacion de obra: duracion de partidas y cronograma del proyecto.

Regla del producto: las partidas se ejecutan en secuencia, ordenadas por `orden`
y luego por identificador. Cada una empieza el dia siguiente al fin de la
anterior. No hay solape ni paralelismo todavia; cuando exista, la tabla
`proyecto_dependencias` es el lugar para modelarlo.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
import math

from .costing import money


def partida_duration(cantidad: float | Decimal, rendimiento_diario: float | Decimal) -> int:
    """Dias habiles necesarios para ejecutar una cantidad.

    Se redondea hacia arriba: media jornada de trabajo ocupa un dia de obra.
    Nunca es menor que 1, aunque la cantidad sea minima.
    """
    if rendimiento_diario <= 0:
        raise ValueError("El rendimiento diario debe ser mayor que cero")
    return max(1, math.ceil(float(cantidad) / float(rendimiento_diario)))


@dataclass(frozen=True)
class ScheduledPartida:
    """Una partida ya ubicada en el calendario."""

    partida_id: int
    fase: str
    costo_total: Decimal
    duracion_dias: int
    fecha_inicio: date
    fecha_fin: date


@dataclass
class PhaseTotals:
    fase: str
    costo_total: Decimal = Decimal("0")
    duracion_dias: int = 0
    partidas: int = 0


@dataclass(frozen=True)
class Schedule:
    partidas: list[ScheduledPartida] = field(default_factory=list)
    fases: list[PhaseTotals] = field(default_factory=list)
    costo_total: Decimal = Decimal("0")
    duracion_dias: int = 0
    fecha_fin: date | None = None


def build_schedule(partidas: list[dict], fecha_inicio: date) -> Schedule:
    """Encadena las partidas en el tiempo desde la fecha de inicio del proyecto.

    `partidas` debe venir ya ordenada. Cada elemento necesita `partida_id`,
    `fase`, `costo_total` y `duracion_dias`.
    """
    cursor = fecha_inicio
    scheduled: list[ScheduledPartida] = []
    phases: dict[str, PhaseTotals] = {}

    for row in partidas:
        duracion = int(row["duracion_dias"])
        fin = cursor + timedelta(days=duracion - 1)
        costo = money(row["costo_total"])

        scheduled.append(
            ScheduledPartida(
                partida_id=int(row["partida_id"]),
                fase=row["fase"],
                costo_total=costo,
                duracion_dias=duracion,
                fecha_inicio=cursor,
                fecha_fin=fin,
            )
        )

        phase = phases.setdefault(row["fase"], PhaseTotals(fase=row["fase"]))
        phase.costo_total = money(phase.costo_total + costo)
        phase.duracion_dias += duracion
        phase.partidas += 1

        cursor = fin + timedelta(days=1)

    if not scheduled:
        return Schedule(fecha_fin=fecha_inicio)

    return Schedule(
        partidas=scheduled,
        fases=list(phases.values()),
        costo_total=money(sum((item.costo_total for item in scheduled), Decimal("0"))),
        duracion_dias=sum(item.duracion_dias for item in scheduled),
        fecha_fin=cursor - timedelta(days=1),
    )
