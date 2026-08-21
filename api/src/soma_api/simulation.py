from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


DATA_PATH = Path(__file__).parent / "data" / "remodeling.yml"


@dataclass(frozen=True)
class RemodelInput:
    area_m2: float
    units: int
    tier: str
    acquisition_cost: float
    monthly_rent_per_unit: float
    occupancy_rate: float | None = None
    monthly_operating_expenses: float = 0
    annual_appreciation: float | None = None


def load_rules(path: Path = DATA_PATH) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def calculate_remodeling(payload: RemodelInput, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    rules = rules or load_rules()
    if payload.area_m2 <= 0:
        raise ValueError("area_m2 debe ser mayor que cero")
    if payload.units < 1:
        raise ValueError("units debe ser al menos uno")
    if payload.tier not in rules["cost_per_m2"]:
        raise ValueError(f"tier no soportado: {payload.tier}")
    if payload.acquisition_cost < 0 or payload.monthly_rent_per_unit < 0:
        raise ValueError("Los costos y arriendos no pueden ser negativos")

    percentages = rules["percentages"]
    defaults = rules["defaults"]
    cost_per_m2 = float(rules["cost_per_m2"][payload.tier])
    construction_base = payload.area_m2 * cost_per_m2
    design = construction_base * percentages["design"]
    permits = construction_base * percentages["permits"]
    contingency = (construction_base + design + permits) * percentages["contingency"]
    renovation_total = construction_base + design + permits + contingency
    closing_costs = payload.acquisition_cost * percentages["closing_costs"]
    total_investment = payload.acquisition_cost + closing_costs + renovation_total

    occupancy = (
        defaults["occupancy_rate"]
        if payload.occupancy_rate is None
        else payload.occupancy_rate
    )
    if not 0 < occupancy <= 1:
        raise ValueError("occupancy_rate debe estar entre 0 y 1")
    gross_annual_income = payload.monthly_rent_per_unit * payload.units * 12 * occupancy
    property_tax = payload.acquisition_cost * percentages["property_tax_annual"]
    insurance = payload.acquisition_cost * percentages["insurance_annual"]
    management = gross_annual_income * percentages["management"]
    maintenance = gross_annual_income * percentages["maintenance"]
    annual_expenses = (
        payload.monthly_operating_expenses * 12
        + property_tax
        + insurance
        + management
        + maintenance
    )
    annual_net_cashflow = gross_annual_income - annual_expenses
    roi_pct = (
        annual_net_cashflow / total_investment * 100 if total_investment else None
    )
    payback_years = (
        total_investment / annual_net_cashflow if annual_net_cashflow > 0 else None
    )
    appreciation = (
        defaults["annual_appreciation"]
        if payload.annual_appreciation is None
        else payload.annual_appreciation
    )

    return {
        "currency": rules["currency"],
        "construction": {
            "cost_per_m2": cost_per_m2,
            "base": round(construction_base),
            "design": round(design),
            "permits": round(permits),
            "contingency": round(contingency),
            "total": round(renovation_total),
        },
        "investment": {
            "acquisition_cost": round(payload.acquisition_cost),
            "closing_costs": round(closing_costs),
            "total": round(total_investment),
        },
        "income": {
            "gross_annual": round(gross_annual_income),
            "annual_expenses": round(annual_expenses),
            "net_annual": round(annual_net_cashflow),
            "occupancy_rate": occupancy,
        },
        "returns": {
            "annual_roi_pct": round(roi_pct, 2) if roi_pct is not None else None,
            "payback_years": round(payback_years, 2) if payback_years is not None else None,
            "payback_months": round(payback_years * 12) if payback_years is not None else None,
            "assumed_annual_appreciation_pct": round(appreciation * 100, 2),
        },
        "assumptions": {
            "tier": payload.tier,
            "area_m2": payload.area_m2,
            "units": payload.units,
            "note": "Estimacion preliminar; no reemplaza presupuesto, avalúo, permisos ni estudio de mercado.",
        },
    }
