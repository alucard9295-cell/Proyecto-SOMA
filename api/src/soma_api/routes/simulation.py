from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..simulation import RemodelInput, calculate_remodeling


router = APIRouter(prefix="/api/sales", tags=["sales"])


class SimulationRequest(BaseModel):
    area_m2: float = Field(gt=0, le=100000)
    units: int = Field(ge=1, le=1000)
    tier: str = Field(pattern="^(basic|standard|premium)$")
    acquisition_cost: float = Field(default=0, ge=0)
    monthly_rent_per_unit: float = Field(default=0, ge=0)
    occupancy_rate: float | None = Field(default=None, gt=0, le=1)
    monthly_operating_expenses: float = Field(default=0, ge=0)
    annual_appreciation: float | None = Field(default=None, ge=0, le=1)


@router.post("/simulation")
def simulate(payload: SimulationRequest):
    try:
        return calculate_remodeling(RemodelInput(**payload.model_dump()))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
