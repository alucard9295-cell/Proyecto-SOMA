import { describe, expect, it } from "vitest";
import { calculateRemodeling } from "../../domain/simulation";
import { roundHalfEven } from "../../domain/money";

describe("simulacion de remodelacion", () => {
  it("calcula presupuesto, ROI y retorno", () => {
    const r = calculateRemodeling({
      area_m2: 100, units: 2, tier: "standard", acquisition_cost: 300_000_000,
      monthly_rent_per_unit: 2_000_000, monthly_operating_expenses: 500_000,
    });
    expect(r.construction.base).toBe(260_000_000);
    expect(r.investment.total).toBeGreaterThan(r.construction.total);
    expect(r.income.net_annual).toBeGreaterThan(0);
    expect(r.returns.annual_roi_pct).toBeGreaterThan(0);
    expect(r.returns.payback_years).toBeGreaterThan(0);
  });

  it("rechaza entradas negativas", () => {
    expect(() => calculateRemodeling({ area_m2: 100, units: 2, tier: "standard", acquisition_cost: -1, monthly_rent_per_unit: 0 }))
      .toThrow(/negativos/);
  });

  it("round de Python: mitad al par", () => {
    expect([roundHalfEven(0.5), roundHalfEven(1.5), roundHalfEven(2.5), roundHalfEven(2.6)]).toEqual([0, 2, 2, 3]);
  });
});
