/**
 * Simulador de remodelacion del sitio publico: el esquema de entrada que valida
 * la ruta y el resumen que lee el asesor para comentar un escenario.
 */
import { z } from "zod";
import { calculateRemodeling } from "../../domain/simulation";

export const simulationInput = z.object({
  area_m2: z.number().positive().max(100_000),
  units: z.number().int().min(1).max(1000),
  tier: z.enum(["basic", "standard", "premium"]),
  acquisition_cost: z.number().min(0).default(0),
  monthly_rent_per_unit: z.number().min(0).default(0),
  occupancy_rate: z.number().positive().max(1).nullish(),
  monthly_operating_expenses: z.number().min(0).default(0),
  annual_appreciation: z.number().min(0).max(1).nullish(),
});

const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const SIN_ESCENARIO = "El simulador no pudo calcular con esos datos: pide al visitante que revise el area y las unidades.";
const CALIDAD = { basic: "sencilla", standard: "estándar", premium: "alta" } as const;

/**
 * El navegador devuelve las entradas con que calculo el simulador; el texto que
 * lee el modelo lo arma el Worker recalculando, asi un cliente no puede meterle
 * instrucciones ni cifras propias. Sin entradas validas, un aviso fijo.
 */
export function escenarioParaModelo(contenidoCliente: string): string {
  let crudo: unknown;
  try { crudo = JSON.parse(contenidoCliente); } catch { return SIN_ESCENARIO; }
  const entradas = simulationInput.safeParse((crudo as { entradas?: unknown } | null)?.entradas);
  if (!entradas.success) return SIN_ESCENARIO;
  const e = entradas.data;
  const r = calculateRemodeling(e);
  const roi = r.returns.annual_roi_pct === null ? "sin retorno positivo" : `${numero.format(r.returns.annual_roi_pct)} %`;
  const payback = r.returns.payback_years === null ? "no se recupera con esa renta" : `${numero.format(r.returns.payback_years)} años`;
  return [
    "Escenario calculado por el simulador (cifras exactas: cópialas tal cual):",
    `- Entradas: ${numero.format(e.area_m2)} m², ${e.units} unidades, calidad ${CALIDAD[e.tier]}, compra ${pesos.format(e.acquisition_cost)}, renta por unidad ${pesos.format(e.monthly_rent_per_unit)}/mes, gastos ${pesos.format(e.monthly_operating_expenses)}/mes.`,
    `- Obra (construcción, diseño, permisos e imprevistos): ${pesos.format(r.construction.total)}.`,
    `- Inversión total (compra + gastos de cierre + obra): ${pesos.format(r.investment.total)}.`,
    `- Ingreso bruto anual: ${pesos.format(r.income.gross_annual)}; gastos anuales: ${pesos.format(r.income.annual_expenses)}; flujo neto anual: ${pesos.format(r.income.net_annual)}.`,
    `- ROI anual: ${roi}. Payback: ${payback}.`,
  ].join("\n");
}
