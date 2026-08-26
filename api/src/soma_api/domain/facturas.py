"""Lectura y validacion de importes de factura.

Reglas puras: no sabe de PDF, de base de datos ni de HTTP. Recibe texto y
numeros, devuelve Decimal y veredictos. Extraer el texto del documento es
trabajo de infraestructura; decidir si las cifras son creibles es de aqui.

Todo el dinero pasa por `money()` de `costing`: usar float produce resultados
como 26923.100000000002, inaceptable en una herramienta de presupuestos.
"""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import re

from .costing import money


# Un peso. Las facturas reales redondean: una de las de prueba declara un total
# un peso mayor que subtotal + IVA. Rechazarla por eso seria ruido, no control.
TOLERANCIA = Decimal("1.00")

# Un importe de factura siempre trae separador de miles. Exigirlo descarta el
# ruido que rodea a las etiquetas del pie: el "19" de "IVA 19%" y el "2026" de
# una fecha, que si no se cuelan como si fueran montos.
IMPORTE = re.compile(r"\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?")


def parse_money(texto: str | None) -> Decimal | None:
    """Lee un importe escrito en cualquiera de los formatos que emiten los
    proveedores reales de SOMA.

        $150,000.00  -> 150000.00   (coma miles, punto decimal)
        73.361,34    -> 73361.34    (punto miles, coma decimal)
        330.000      -> 330000.00   (punto miles, sin decimales)

    El punto es decimal para el primero y separador de miles para el tercero:
    los mismos caracteres significan cosas opuestas segun quien emita. La regla
    que resuelve los tres sin conocer al emisor de antemano: **el ultimo
    separador es decimal solo si le siguen exactamente dos digitos**. La
    validacion aritmetica confirma despues si la lectura fue correcta.

    Devuelve None cuando el texto no contiene un numero legible; nunca lanza.
    """
    if texto is None:
        return None
    # Solo el primer numero del texto. Limpiar todo lo que no sea digito
    # concatenaria dos importes vecinos en uno gigante sin avisar: una celda mal
    # delimitada que trae "285,714.00 340,000.00" produciria 28571400340000.
    # Ese es el tipo de error que entra a la base pareciendo un numero valido.
    encontrado = re.search(r"-?\d[\d.,]*", str(texto))
    if encontrado is None:
        return None
    limpio = encontrado.group().rstrip(".,")
    if not limpio or not re.search(r"\d", limpio):
        return None

    ultimo = max(limpio.rfind("."), limpio.rfind(","))
    if ultimo == -1:
        entero, decimales = limpio, ""
    else:
        cola = limpio[ultimo + 1:]
        if len(cola) == 2 and cola.isdigit():
            entero, decimales = limpio[:ultimo], cola
        else:
            entero, decimales = limpio, ""

    entero = re.sub(r"[.,]", "", entero)
    if not entero.lstrip("-"):
        return None
    try:
        return money(f"{entero}.{decimales}" if decimales else entero)
    except InvalidOperation:
        return None


def primer_importe(texto: str) -> Decimal | None:
    """Primer monto con formato de dinero dentro de un texto."""
    encontrado = IMPORTE.search(texto or "")
    return parse_money(encontrado.group()) if encontrado else None


@dataclass(frozen=True)
class ItemFactura:
    """Un renglon de la factura, ya leido pero todavia no confiable."""

    descripcion: str
    cantidad: Decimal | None = None
    unidad: str | None = None
    valor_unitario: Decimal | None = None
    valor_total: Decimal | None = None

    def total_efectivo(self) -> Decimal | None:
        """Total del renglon: el declarado, o cantidad x unitario si falta."""
        if self.valor_total is not None:
            return money(self.valor_total)
        if self.cantidad is not None and self.valor_unitario is not None:
            return money(self.cantidad * self.valor_unitario)
        return None


@dataclass(frozen=True)
class Veredicto:
    """Resultado de validar una factura. `motivos` explica cada rechazo."""

    valida: bool
    motivos: tuple[str, ...] = ()

    @property
    def estado(self) -> str:
        return "validated" if self.valida else "needs_review"


def validar(
    *,
    items: list[ItemFactura],
    subtotal: Decimal | None,
    iva: Decimal | None,
    total: Decimal | None,
    tolerancia: Decimal = TOLERANCIA,
) -> Veredicto:
    """Comprueba que la factura cierra consigo misma.

    Dos comprobaciones, y hacen falta las dos:

    1. La suma de los items coincide con el subtotal.
    2. Subtotal mas impuestos coincide con el total.

    La segunda sola no alcanza: los tres importes del pie se leen
    independientemente de la tabla, asi que los renglones pueden estar
    destrozados y la factura igual "cuadrar". Verificado sobre facturas reales:
    seis de seis pasaban la segunda comprobacion mientras dos tenian los items
    ilegibles.

    Una factura que no cierra no entra a la fuente de verdad numerica; va a
    revision humana. Ver ADR-006 seccion 6.
    """
    motivos: list[str] = []

    if not items:
        motivos.append("La factura no tiene items legibles.")
    if subtotal is None:
        motivos.append("No se pudo leer el subtotal.")
    if total is None:
        motivos.append("No se pudo leer el total.")

    if items and subtotal is not None:
        totales = [item.total_efectivo() for item in items]
        if any(valor is None for valor in totales):
            motivos.append("Hay items sin importe legible.")
        else:
            suma = money(sum(totales, Decimal("0")))
            if abs(suma - money(subtotal)) > tolerancia:
                motivos.append(
                    f"La suma de los items ({suma}) no coincide con el subtotal ({money(subtotal)})."
                )

    if subtotal is not None and total is not None:
        impuestos = money(iva) if iva is not None else Decimal("0.00")
        esperado = money(money(subtotal) + impuestos)
        if abs(esperado - money(total)) > tolerancia:
            motivos.append(
                f"Subtotal mas IVA ({esperado}) no coincide con el total ({money(total)})."
            )

    return Veredicto(valida=not motivos, motivos=tuple(motivos))
