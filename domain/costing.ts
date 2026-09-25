/**
 * Costeo de un Analisis de Precio Unitario (APU).
 *
 * Unica implementacion de la formula AIU del producto. El frontend no la
 * reimplementa: pide `/api/admin/apus/preview` y muestra lo que vuelve, asi el
 * precio que se ve y el que se guarda no pueden divergir.
 */
import { dec, money, sum, toNumber, type Decimal, type DecimalInput } from "./money";

export const IVA_BASES = ["directo", "subtotal", "utilidad"] as const;
export type IvaBase = (typeof IVA_BASES)[number];
export const SUPPLY_CATEGORIES = ["material", "mano_obra", "equipo", "transporte", "servicio_terceros"] as const;
export const APU_CATEGORIES = ["excavaciones", "obra_gris", "acabados", "instalaciones"] as const;
const DEFAULT_IVA_BASE: IvaBase = "utilidad";

export interface SupplyLine {
  rendimiento: DecimalInput;
  precio_unitario: DecimalInput;
  desperdicio_pct?: DecimalInput;
}

export interface ApuRates {
  administracion_pct?: DecimalInput;
  imprevistos_pct?: DecimalInput;
  utilidad_pct?: DecimalInput;
  iva_pct?: DecimalInput;
  iva_base?: string;
}

export interface ApuCosting {
  costo_directo: Decimal;
  administracion: Decimal;
  imprevistos: Decimal;
  utilidad: Decimal;
  subtotal: Decimal;
  base_iva: Decimal;
  iva: Decimal;
  precio_venta: Decimal;
}

const pct = (value: DecimalInput = 0) => dec(value).div(100);

export function lineCost(line: SupplyLine): Decimal {
  const bruto = dec(line.rendimiento)
    .times(dec(line.precio_unitario))
    .times(dec(1).plus(pct(line.desperdicio_pct ?? 0)));
  return money(bruto);
}

/** Desglose AIU. Una base de IVA desconocida cae en 'utilidad' (historico). */
export function costApu(lines: SupplyLine[], rates: ApuRates): ApuCosting {
  const directo = money(sum(lines.map(lineCost)));
  const administracion = money(directo.times(pct(rates.administracion_pct)));
  const imprevistos = money(directo.times(pct(rates.imprevistos_pct)));
  const utilidad = money(directo.times(pct(rates.utilidad_pct)));
  const subtotal = money(directo.plus(administracion).plus(imprevistos).plus(utilidad));

  const bases: Record<string, Decimal> = { directo, subtotal, utilidad };
  const base_iva = bases[rates.iva_base ?? DEFAULT_IVA_BASE] ?? utilidad;
  const iva = money(base_iva.times(pct(rates.iva_pct)));

  return {
    costo_directo: directo,
    administracion,
    imprevistos,
    utilidad,
    subtotal,
    base_iva,
    iva,
    precio_venta: money(subtotal.plus(iva)),
  };
}

/** Serializacion para HTTP: a `number` solo en la frontera de salida. */
export function costingToJson(costing: ApuCosting): Record<keyof ApuCosting, number> {
  return Object.fromEntries(
    Object.entries(costing).map(([key, value]) => [key, toNumber(value)]),
  ) as Record<keyof ApuCosting, number>;
}
