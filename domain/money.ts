/**
 * Dinero exacto. Unico punto de entrada para convertir cualquier importe.
 *
 * `number` es coma flotante binaria: 0.1 + 0.2 da 0.30000000000000004, y en una
 * herramienta de presupuestos eso es un defecto, no un detalle. Todo importe
 * pasa por `money()` en cada paso del calculo; `number` solo aparece en la
 * frontera de salida (JSON).
 */
import Big from "big.js";

export type Decimal = Big;
export type DecimalInput = Big | number | string;

export function dec(value: DecimalInput): Big {
  return new Big(value);
}

/** Dos decimales, redondeo comercial (mitad hacia arriba). */
export function money(value: DecimalInput): Big {
  return new Big(value).round(2, Big.roundHalfUp);
}

export function sum(values: Big[]): Big {
  return values.reduce((acc, value) => acc.plus(value), new Big(0));
}

/** Conversion a `number` solo para serializar. Nunca para seguir calculando. */
export function toNumber(value: Big): number {
  return Number(value.toString());
}

/** Centavos enteros para persistir: 26923.10 -> 2692310. */
export function toCents(value: DecimalInput): number {
  return Number(money(value).times(100).toFixed(0));
}

export function fromCents(cents: number): Big {
  return new Big(cents).div(100);
}

/**
 * Redondeo de `round()` de Python: mitad al par. La simulacion de ventas lo
 * heredo asi; cambiarlo moveria cifras que el usuario ya vio.
 */
export function roundHalfEven(value: number, digits = 0): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}
