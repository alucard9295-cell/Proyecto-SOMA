"""Revision de facturas que no cerraron.

Una factura cuyas cifras no cuadran no entra a la fuente de verdad numerica
(ADR-006 seccion 6). Pero rechazarla y perderla de vista es peor que no
procesarla: sin esta pantalla el documento existe solo en la base y nadie se
entera. Es criterio de aceptacion, no una mejora posterior.

El trabajo que ahorra la ingesta no es aprobar sola: es llegar con los renglones
ya leidos para que una persona confirme en vez de teclear.
"""

import json

from fastapi import APIRouter, Depends, HTTPException

from ..config import Settings
from ..dependencies import current_user, get_settings
from ..repositories import unit_of_work


router = APIRouter(prefix="/api/admin", tags=["documents"])


def _resumen(fila) -> dict:
    """Fila de la lista. Sin la extraccion completa: puede ser larga."""
    extraccion = json.loads(fila["extraccion"]) if fila["extraccion"] else {}
    return {
        "job_id": fila["job_id"],
        "archivo": fila["nombre_original"],
        "estado": fila["estado"],
        "motivo": fila["motivo"],
        "parser": fila["parser"],
        "intentos": fila["intentos"],
        "actualizado": fila["updated_at"],
        "emisor": extraccion.get("emisor_nombre"),
        "items": len(extraccion.get("items", [])),
        "total": extraccion.get("total"),
    }


@router.get("/documentos/revision")
def list_documents_in_review(
    _: dict = Depends(current_user), settings: Settings = Depends(get_settings)
):
    with unit_of_work(settings.database_path) as uow:
        filas = uow.documents.jobs_por_estado("needs_review")
        items = [_resumen(fila) for fila in filas]
        return {"items": items, "count": len(items)}


@router.get("/documentos/revision/{job_id}")
def get_document_in_review(
    job_id: int,
    _: dict = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    with unit_of_work(settings.database_path) as uow:
        fila = uow.documents.job(job_id)
        if fila is None:
            raise HTTPException(status_code=404, detail="Documento no encontrado.")
        detalle = _resumen(fila)
        # La extraccion completa solo en el detalle: es lo que la persona
        # confirma renglon por renglon.
        detalle["extraccion"] = (
            json.loads(fila["extraccion"]) if fila["extraccion"] else None
        )
        return detalle
