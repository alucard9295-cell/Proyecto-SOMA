"""Costeo de un Analisis de Precio Unitario (APU).

Unica implementacion de la formula AIU del producto. Antes vivia duplicada en
`routes/construction.py` y en `src/App.jsx`; cualquier ajuste debe hacerse aqui.

Todo el dinero se maneja con Decimal. Usar float produce resultados como
26923.100000000002, inaceptable en una herramienta de presupuestos.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


CENTS = Decimal("0.01")

# Sobre que base se aplica el IVA. El contrato lo define; por defecto, utilidad.
IVA_BASES = ("directo", "subtotal", "utilidad")
DEFAULT_IVA_BASE = "utilidad"


def money(value: Decimal | float | int | str) -> Decimal:
    """Normaliza a dos decimales con redondeo bancario comercial."""
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _pct(value: Decimal | float | int | str) -> Decimal:
    return Decimal(str(value)) / Decimal("100")


@dataclass(frozen=True)
class SupplyLine:
    """Un insumo dentro de un APU, con su rendimiento y desperdicio."""

    rendimiento: Decimal
    precio_unitario: Decimal
    desperdicio_pct: Decimal = Decimal("0")

    @property
    def costo(self) -> Decimal:
        bruto = (
            Decimal(str(self.rendimiento))
            * Decimal(str(self.precio_unitario))
            * (Decimal("1") + _pct(self.desperdicio_pct))
        )
        return money(bruto)


@dataclass(frozen=True)
class ApuRates:
    """Porcentajes de AIU e IVA que aplican al costo directo."""

    administracion_pct: Decimal = Decimal("0")
    imprevistos_pct: Decimal = Decimal("0")
    utilidad_pct: Decimal = Decimal("0")
    iva_pct: Decimal = Decimal("0")
    iva_base: str = DEFAULT_IVA_BASE


@dataclass(frozen=True)
class ApuCosting:
    """Desglose completo del precio de una partida."""

    costo_directo: Decimal
    administracion: Decimal
    imprevistos: Decimal
    utilidad: Decimal
    subtotal: Decimal
    base_iva: Decimal
    iva: Decimal
    precio_venta: Decimal

    def as_dict(self) -> dict[str, float]:
        """Serializacion para la capa HTTP.

        Se convierte a float solo en la frontera de salida; los calculos
        intermedios nunca dejan de ser Decimal.
        """
        return {
            "costo_directo": float(self.costo_directo),
            "administracion": float(self.administracion),
            "imprevistos": float(self.imprevistos),
            "utilidad": float(self.utilidad),
            "subtotal": float(self.subtotal),
            "base_iva": float(self.base_iva),
            "iva": float(self.iva),
            "precio_venta": float(self.precio_venta),
        }


def cost_apu(lines: list[SupplyLine], rates: ApuRates) -> ApuCosting:
    """Calcula el desglose AIU de una partida.

    El IVA se aplica sobre la base declarada en `rates.iva_base`. Una base
    desconocida cae en 'utilidad', que es el comportamiento historico.
    """
    directo = money(sum((line.costo for line in lines), Decimal("0")))
    administracion = money(directo * _pct(rates.administracion_pct))
    imprevistos = money(directo * _pct(rates.imprevistos_pct))
    utilidad = money(directo * _pct(rates.utilidad_pct))
    subtotal = money(directo + administracion + imprevistos + utilidad)

    bases = {"directo": directo, "subtotal": subtotal, "utilidad": utilidad}
    base_iva = bases.get(rates.iva_base, utilidad)
    iva = money(base_iva * _pct(rates.iva_pct))

    return ApuCosting(
        costo_directo=directo,
        administracion=administracion,
        imprevistos=imprevistos,
        utilidad=utilidad,
        subtotal=subtotal,
        base_iva=base_iva,
        iva=iva,
        precio_venta=money(subtotal + iva),
    )
