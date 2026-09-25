/**
 * Simulacion de remodelacion para el sitio de ventas.
 *
 * Es una estimacion preliminar en `number`, no un presupuesto: redondea a pesos
 * enteros para mostrar y no se guarda en ningun lado. Los presupuestos que si se
 * guardan (APU, proyectos) usan `money()`.
 */
import { roundHalfEven } from "./money";

export const REMODEL_RULES = {
  currency: "COP",
  cost_per_m2: { basic: 1_800_000, standard: 2_600_000, premium: 3_800_000 },
  percentages: {
    design: 0.12,
    permits: 0.03,
    contingency: 0.1,
    closing_costs: 0.03,
    management: 0.08,
    maintenance: 0.05,
    property_tax_annual: 0.01,
    insurance_annual: 0.005,
  },
  defaults: { occupancy_rate: 0.92, annual_rent_growth: 0.04, annual_appreciation: 0.05 },
} as const;

export type Tier = keyof typeof REMODEL_RULES.cost_per_m2;

export interface RemodelInput {
  area_m2: number;
  units: number;
  tier: string;
  acquisition_cost: number;
  monthly_rent_per_unit: number;
  occupancy_rate?: number | null;
  monthly_operating_expenses?: number;
  annual_appreciation?: number | null;
}

export class SimulationError extends Error {}

export function calculateRemodeling(input: RemodelInput, rules = REMODEL_RULES) {
  if (input.area_m2 <= 0) throw new SimulationError("area_m2 debe ser mayor que cero");
  if (input.units < 1) throw new SimulationError("units debe ser al menos uno");
  if (!(input.tier in rules.cost_per_m2)) throw new SimulationError(`tier no soportado: ${input.tier}`);
  if (input.acquisition_cost < 0 || input.monthly_rent_per_unit < 0) {
    throw new SimulationError("Los costos y arriendos no pueden ser negativos");
  }

  const p = rules.percentages;
  const costPerM2 = rules.cost_per_m2[input.tier as Tier];
  const constructionBase = input.area_m2 * costPerM2;
  const design = constructionBase * p.design;
  const permits = constructionBase * p.permits;
  const contingency = (constructionBase + design + permits) * p.contingency;
  const renovationTotal = constructionBase + design + permits + contingency;
  const closingCosts = input.acquisition_cost * p.closing_costs;
  const totalInvestment = input.acquisition_cost + closingCosts + renovationTotal;

  const occupancy = input.occupancy_rate ?? rules.defaults.occupancy_rate;
  if (!(occupancy > 0 && occupancy <= 1)) throw new SimulationError("occupancy_rate debe estar entre 0 y 1");
  const grossAnnual = input.monthly_rent_per_unit * input.units * 12 * occupancy;
  const annualExpenses =
    (input.monthly_operating_expenses ?? 0) * 12 +
    input.acquisition_cost * p.property_tax_annual +
    input.acquisition_cost * p.insurance_annual +
    grossAnnual * p.management +
    grossAnnual * p.maintenance;
  const netAnnual = grossAnnual - annualExpenses;
  const roiPct = totalInvestment ? (netAnnual / totalInvestment) * 100 : null;
  const paybackYears = netAnnual > 0 ? totalInvestment / netAnnual : null;
  const appreciation = input.annual_appreciation ?? rules.defaults.annual_appreciation;
  const r = roundHalfEven;

  return {
    currency: rules.currency,
    construction: {
      cost_per_m2: costPerM2,
      base: r(constructionBase),
      design: r(design),
      permits: r(permits),
      contingency: r(contingency),
      total: r(renovationTotal),
    },
    investment: {
      acquisition_cost: r(input.acquisition_cost),
      closing_costs: r(closingCosts),
      total: r(totalInvestment),
    },
    income: {
      gross_annual: r(grossAnnual),
      annual_expenses: r(annualExpenses),
      net_annual: r(netAnnual),
      occupancy_rate: occupancy,
    },
    returns: {
      annual_roi_pct: roiPct === null ? null : r(roiPct, 2),
      payback_years: paybackYears === null ? null : r(paybackYears, 2),
      payback_months: paybackYears === null ? null : r(paybackYears * 12),
      assumed_annual_appreciation_pct: r(appreciation * 100, 2),
    },
    assumptions: {
      tier: input.tier,
      area_m2: input.area_m2,
      units: input.units,
      note: "Estimación preliminar; no reemplaza presupuesto, avalúo, permisos ni estudio de mercado.",
    },
  };
}

export type RemodelResult = ReturnType<typeof calculateRemodeling>;
