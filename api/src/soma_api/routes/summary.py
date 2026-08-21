from fastapi import APIRouter, Depends

from ..dependencies import current_user


router = APIRouter(prefix="/api/admin", tags=["dashboard"])


@router.get("/summary")
def summary(_: dict[str, object] = Depends(current_user)):
    return {
        "facturas": 0,
        "items": 0,
        "total_pagado": 0,
        "proveedores": 0,
        "chroma_count": 0,
        "alertas_calidad": 0,
        "monthly": [],
        "providers_chart": [],
        "quality": {"total": 0, "con_total": 0, "con_fecha": 0},
    }
