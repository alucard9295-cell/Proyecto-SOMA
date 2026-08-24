from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import Settings
from ..dependencies import current_user, get_settings
from ..domain.costing import ApuRates, SupplyLine, cost_apu
from ..domain.scheduling import build_schedule, partida_duration
from ..repositories import UnitOfWork, unit_of_work

router = APIRouter(prefix="/api/admin", tags=["construction"])
SUPPLY_CATEGORIES = {"material", "mano_obra", "equipo", "transporte", "servicio_terceros"}
APU_CATEGORIES = {"excavaciones", "obra_gris", "acabados", "instalaciones"}


class SupplyUpdate(BaseModel):
    nombre_normalizado: str = Field(min_length=1, max_length=240)
    categoria: str
    unidad_estandar: str | None = Field(default=None, max_length=40)


class ApuDetail(BaseModel):
    insumo_id: int = Field(gt=0)
    categoria: str
    rendimiento: float = Field(gt=0)
    desperdicio_pct: float = Field(default=0, ge=0, le=100)
    precio_unitario: float | None = Field(default=None, ge=0)


class ApuPayload(BaseModel):
    nombre_partida: str = Field(min_length=1, max_length=240)
    unidad: str = Field(min_length=1, max_length=40)
    categoria: str = "obra_gris"
    descripcion: str | None = Field(default=None, max_length=1000)
    administracion_pct: float = Field(default=0, ge=0, le=100)
    imprevistos_pct: float = Field(default=0, ge=0, le=100)
    utilidad_pct: float = Field(default=0, ge=0, le=100)
    iva_pct: float = Field(default=0, ge=0, le=100)
    iva_base: str = "utilidad"
    detalles: list[ApuDetail] = Field(min_length=1)


class ProjectPayload(BaseModel):
    nombre: str = Field(min_length=1, max_length=240)
    cliente: str | None = Field(default=None, max_length=240)
    ubicacion: str | None = Field(default=None, max_length=240)
    fecha_inicio: date


class ProjectPartidaPayload(BaseModel):
    fase: str = Field(min_length=1, max_length=120)
    apu_id: int = Field(gt=0)
    cantidad: float = Field(gt=0)
    rendimiento_diario: float = Field(gt=0)
    orden: int = Field(default=1, ge=1)


def _validate_supply_category(category: str) -> None:
    if category not in SUPPLY_CATEGORIES:
        raise HTTPException(status_code=422, detail="Categoria de insumo invalida.")


def _apu_view(row, detail_rows) -> dict:
    """Arma la vista de un APU a partir de filas ya cargadas.

    No consulta la base: recibe los datos y delega el calculo al dominio, para
    que un listado pueda cargar todo por lotes y calcular en memoria.
    """
    detalles = []
    lines = []
    for detail in detail_rows:
        item = dict(detail)
        precio = (
            item["precio_unitario"]
            if item["precio_unitario"] is not None
            else item["precio_catalogo"]
        )
        line = SupplyLine(
            rendimiento=Decimal(str(item["rendimiento"])),
            precio_unitario=Decimal(str(precio)),
            desperdicio_pct=Decimal(str(item["desperdicio_pct"])),
        )
        lines.append(line)
        item["precio_aplicado"] = float(precio)
        item["costo"] = float(line.costo)
        detalles.append(item)

    costing = cost_apu(
        lines,
        ApuRates(
            administracion_pct=Decimal(str(row["administracion_pct"])),
            imprevistos_pct=Decimal(str(row["imprevistos_pct"])),
            utilidad_pct=Decimal(str(row["utilidad_pct"])),
            iva_pct=Decimal(str(row["iva_pct"])),
            iva_base=row["iva_base"],
        ),
    )

    result = dict(row)
    result["detalles"] = detalles
    result.update(costing.as_dict())
    return result


def _load_apu(uow: UnitOfWork, apu_id: int) -> dict:
    row = uow.apus.get(apu_id)
    if not row:
        raise HTTPException(status_code=404, detail="APU no encontrado.")
    return _apu_view(row, uow.apus.get_details(apu_id))


@router.get("/supplies")
def supplies(search: str = Query(default=""), category: str = Query(default=""), _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    if category:
        _validate_supply_category(category)
    with unit_of_work(settings.database_path) as uow:
        rows = uow.supplies.search(search, category)
        return {"items": [dict(row) for row in rows], "count": len(rows)}


@router.put("/supplies/{supply_id}")
def update_supply(supply_id: int, payload: SupplyUpdate, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    _validate_supply_category(payload.categoria)
    with unit_of_work(settings.database_path) as uow:
        if not uow.supplies.exists(supply_id):
            raise HTTPException(status_code=404, detail="Insumo no encontrado.")
        uow.supplies.update(
            supply_id,
            payload.nombre_normalizado.strip(),
            payload.categoria,
            payload.unidad_estandar,
        )
        return {"ok": True, "insumo_id": supply_id}


@router.get("/apus")
def list_apus(_: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with unit_of_work(settings.database_path) as uow:
        apu_ids = uow.apus.list_ids()
        # Tres consultas en total, no dos por APU.
        rows = uow.apus.get_many(apu_ids)
        details = uow.apus.get_details_many(apu_ids)
        items = [
            _apu_view(rows[apu_id], details.get(apu_id, []))
            for apu_id in apu_ids
            if apu_id in rows
        ]
        return {"items": items, "count": len(items)}


def _save_apu(uow: UnitOfWork, payload: ApuPayload, apu_id: int | None = None) -> int:
    if payload.categoria not in APU_CATEGORIES or payload.iva_base not in {"directo", "subtotal", "utilidad"}:
        raise HTTPException(status_code=422, detail="Categoria o base de IVA invalida.")
    for detail in payload.detalles:
        _validate_supply_category(detail.categoria)
        if not uow.supplies.exists(detail.insumo_id):
            raise HTTPException(status_code=400, detail=f"Insumo no encontrado: {detail.insumo_id}")
    values = (payload.nombre_partida.strip(), payload.unidad.strip(), payload.descripcion, payload.categoria, payload.administracion_pct, payload.imprevistos_pct, payload.utilidad_pct, payload.iva_pct, payload.iva_base)
    detail_rows = [(detail.insumo_id, detail.categoria, detail.rendimiento, detail.desperdicio_pct, detail.precio_unitario) for detail in payload.detalles]
    saved_id = uow.apus.save(apu_id=apu_id, values=values, details=detail_rows)
    if saved_id is None:
        raise HTTPException(status_code=404, detail="APU no encontrado.")
    return saved_id


@router.post("/apus")
def create_apu(payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with unit_of_work(settings.database_path) as uow:
        apu_id = _save_apu(uow, payload)
        return {"ok": True, "apu": _load_apu(uow, apu_id)}


@router.put("/apus/{apu_id}")
def update_apu(apu_id: int, payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with unit_of_work(settings.database_path) as uow:
        _save_apu(uow, payload, apu_id)
        return {"ok": True, "apu": _load_apu(uow, apu_id)}


@router.post("/apus/preview")
def preview_apu(payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    """Calcula el precio de una partida sin guardarla.

    Existe para que el frontend no reimplemente la formula AIU: pide el calculo
    y muestra el resultado. Una sola fuente de verdad para el costeo.
    """
    if payload.iva_base not in {"directo", "subtotal", "utilidad"}:
        raise HTTPException(status_code=422, detail="Base de IVA invalida.")
    with unit_of_work(settings.database_path) as uow:
        supply_ids = [detail.insumo_id for detail in payload.detalles]
        catalog = {
            row["insumo_id"]: row["price_average"]
            for row in uow.supplies.search("", "")
            if row["insumo_id"] in supply_ids
        }

    lines = []
    detalles = []
    for detail in payload.detalles:
        precio = (
            detail.precio_unitario
            if detail.precio_unitario is not None
            else catalog.get(detail.insumo_id, 0)
        )
        line = SupplyLine(
            rendimiento=Decimal(str(detail.rendimiento)),
            precio_unitario=Decimal(str(precio)),
            desperdicio_pct=Decimal(str(detail.desperdicio_pct)),
        )
        lines.append(line)
        detalles.append(
            {
                "insumo_id": detail.insumo_id,
                "precio_aplicado": float(precio),
                "costo": float(line.costo),
            }
        )

    costing = cost_apu(
        lines,
        ApuRates(
            administracion_pct=Decimal(str(payload.administracion_pct)),
            imprevistos_pct=Decimal(str(payload.imprevistos_pct)),
            utilidad_pct=Decimal(str(payload.utilidad_pct)),
            iva_pct=Decimal(str(payload.iva_pct)),
            iva_base=payload.iva_base,
        ),
    )
    return {"detalles": detalles, **costing.as_dict()}


def _project_view(uow: UnitOfWork, project_id: int) -> dict:
    project = uow.projects.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    partida_rows = uow.projects.get_partidas(project_id)
    schedule = build_schedule(
        [dict(row) for row in partida_rows], date.fromisoformat(project["fecha_inicio"])
    )

    # Carga por lotes de los APUs referenciados, en vez de uno por partida.
    apu_ids = list({row["apu_id"] for row in partida_rows})
    apu_rows = uow.apus.get_many(apu_ids)
    apu_details = uow.apus.get_details_many(apu_ids)
    apu_views = {
        apu_id: _apu_view(apu_rows[apu_id], apu_details.get(apu_id, []))
        for apu_id in apu_ids
        if apu_id in apu_rows
    }

    by_id = {item.partida_id: item for item in schedule.partidas}
    partidas = []
    for row in partida_rows:
        item = dict(row)
        scheduled = by_id[row["partida_id"]]
        item["fecha_inicio"] = scheduled.fecha_inicio.isoformat()
        item["fecha_fin"] = scheduled.fecha_fin.isoformat()
        item["apu"] = apu_views.get(row["apu_id"])
        partidas.append(item)

    result = dict(project)
    result.update(
        {
            "partidas": partidas,
            "fases": [
                {
                    "fase": phase.fase,
                    "costo_total": float(phase.costo_total),
                    "duracion_dias": phase.duracion_dias,
                    "partidas": phase.partidas,
                }
                for phase in schedule.fases
            ],
            "costo_total": float(schedule.costo_total),
            "duracion_dias": schedule.duracion_dias,
            "fecha_fin": schedule.fecha_fin.isoformat(),
        }
    )
    return result


@router.post("/proyectos")
def create_project(payload: ProjectPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with unit_of_work(settings.database_path) as uow:
        project_id = uow.projects.insert(
            payload.nombre.strip(),
            payload.cliente,
            payload.ubicacion,
            payload.fecha_inicio.isoformat(),
        )
        return {"ok": True, "proyecto": _project_view(uow, project_id)}


@router.get("/proyectos")
def list_projects(_: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with unit_of_work(settings.database_path) as uow:
        items = [_project_view(uow, project_id) for project_id in uow.projects.list_ids()]
        return {"items": items, "count": len(items)}


@router.post("/proyectos/{project_id}/partidas")
def add_project_partida(project_id: int, payload: ProjectPartidaPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with unit_of_work(settings.database_path) as uow:
        if not uow.projects.exists(project_id):
            raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
        apu = _load_apu(uow, payload.apu_id)
        duration = partida_duration(payload.cantidad, payload.rendimiento_diario)
        precio_venta = Decimal(str(apu["precio_venta"]))
        uow.projects.insert_partida(
            project_id=project_id,
            fase=payload.fase,
            apu_id=payload.apu_id,
            cantidad=payload.cantidad,
            rendimiento_diario=payload.rendimiento_diario,
            orden=payload.orden,
            costo_unitario=float(precio_venta),
            costo_total=float(Decimal(str(payload.cantidad)) * precio_venta),
            duracion_dias=duration,
        )
        return {"ok": True, "proyecto": _project_view(uow, project_id)}
