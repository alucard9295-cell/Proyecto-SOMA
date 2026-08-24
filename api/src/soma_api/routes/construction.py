import math
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import Settings
from ..dependencies import current_user, get_settings
from ..repositories import ApuRepository, ProjectRepository, SupplyRepository

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


def _apu_view(apus: ApuRepository, apu_id: int) -> dict:
    row = apus.get(apu_id)
    if not row:
        raise HTTPException(status_code=404, detail="APU no encontrado.")
    details = []
    for detail in apus.get_details(apu_id):
        item = dict(detail)
        item["precio_aplicado"] = item["precio_unitario"] if item["precio_unitario"] is not None else item["precio_catalogo"]
        item["costo"] = item["rendimiento"] * item["precio_aplicado"] * (1 + item["desperdicio_pct"] / 100)
        details.append(item)
    direct = sum(item["costo"] for item in details)
    administration = direct * row["administracion_pct"] / 100
    contingencies = direct * row["imprevistos_pct"] / 100
    utility = direct * row["utilidad_pct"] / 100
    subtotal = direct + administration + contingencies + utility
    iva_base = {"directo": direct, "subtotal": subtotal, "utilidad": utility}.get(row["iva_base"], utility)
    iva = iva_base * row["iva_pct"] / 100
    result = dict(row)
    result.update({"detalles": details, "costo_directo": direct, "administracion": administration, "imprevistos": contingencies, "utilidad": utility, "subtotal": subtotal, "base_iva": iva_base, "iva": iva, "precio_venta": subtotal + iva})
    return result


@router.get("/supplies")
def supplies(search: str = Query(default=""), category: str = Query(default=""), _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    if category:
        _validate_supply_category(category)
    rows = SupplyRepository(settings.database_path).search(search, category)
    return {"items": [dict(row) for row in rows], "count": len(rows)}


@router.put("/supplies/{supply_id}")
def update_supply(supply_id: int, payload: SupplyUpdate, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    _validate_supply_category(payload.categoria)
    supplies_repo = SupplyRepository(settings.database_path)
    if not supplies_repo.exists(supply_id):
        raise HTTPException(status_code=404, detail="Insumo no encontrado.")
    supplies_repo.update(supply_id, payload.nombre_normalizado.strip(), payload.categoria, payload.unidad_estandar)
    return {"ok": True, "insumo_id": supply_id}


@router.get("/apus")
def list_apus(_: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    apus = ApuRepository(settings.database_path)
    items = [_apu_view(apus, apu_id) for apu_id in apus.list_ids()]
    return {"items": items, "count": len(items)}


def _save_apu(apus: ApuRepository, payload: ApuPayload, apu_id: int | None = None) -> int:
    if payload.categoria not in APU_CATEGORIES or payload.iva_base not in {"directo", "subtotal", "utilidad"}:
        raise HTTPException(status_code=422, detail="Categoria o base de IVA invalida.")
    supplies_repo = SupplyRepository(apus.database_path)
    for detail in payload.detalles:
        _validate_supply_category(detail.categoria)
        if not supplies_repo.exists(detail.insumo_id):
            raise HTTPException(status_code=400, detail=f"Insumo no encontrado: {detail.insumo_id}")
    values = (payload.nombre_partida.strip(), payload.unidad.strip(), payload.descripcion, payload.categoria, payload.administracion_pct, payload.imprevistos_pct, payload.utilidad_pct, payload.iva_pct, payload.iva_base)
    detail_rows = [(detail.insumo_id, detail.categoria, detail.rendimiento, detail.desperdicio_pct, detail.precio_unitario) for detail in payload.detalles]
    saved_id = apus.save(apu_id=apu_id, values=values, details=detail_rows)
    if saved_id is None:
        raise HTTPException(status_code=404, detail="APU no encontrado.")
    return saved_id


@router.post("/apus")
def create_apu(payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    apus = ApuRepository(settings.database_path)
    apu_id = _save_apu(apus, payload)
    return {"ok": True, "apu": _apu_view(apus, apu_id)}


@router.put("/apus/{apu_id}")
def update_apu(apu_id: int, payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    apus = ApuRepository(settings.database_path)
    _save_apu(apus, payload, apu_id)
    return {"ok": True, "apu": _apu_view(apus, apu_id)}


def _project_view(projects: ProjectRepository, apus: ApuRepository, project_id: int) -> dict:
    project = projects.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    current = date.fromisoformat(project["fecha_inicio"])
    items = []
    phases: dict[str, dict] = {}
    for row in projects.get_partidas(project_id):
        end = current + timedelta(days=row["duracion_dias"] - 1)
        item = dict(row); item.update({"fecha_inicio": current.isoformat(), "fecha_fin": end.isoformat(), "apu": _apu_view(apus, row["apu_id"])})
        items.append(item); phase = phases.setdefault(row["fase"], {"fase": row["fase"], "costo_total": 0, "duracion_dias": 0, "partidas": 0}); phase["costo_total"] += row["costo_total"]; phase["duracion_dias"] += row["duracion_dias"]; phase["partidas"] += 1; current = end + timedelta(days=1)
    result = dict(project); result.update({"partidas": items, "fases": list(phases.values()), "costo_total": sum(item["costo_total"] for item in items), "duracion_dias": sum(item["duracion_dias"] for item in items), "fecha_fin": (current - timedelta(days=1)).isoformat() if items else project["fecha_inicio"]}); return result


@router.post("/proyectos")
def create_project(payload: ProjectPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    projects = ProjectRepository(settings.database_path)
    apus = ApuRepository(settings.database_path)
    project_id = projects.insert(payload.nombre.strip(), payload.cliente, payload.ubicacion, payload.fecha_inicio.isoformat())
    return {"ok": True, "proyecto": _project_view(projects, apus, project_id)}


@router.get("/proyectos")
def list_projects(_: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    projects = ProjectRepository(settings.database_path)
    apus = ApuRepository(settings.database_path)
    items = [_project_view(projects, apus, project_id) for project_id in projects.list_ids()]
    return {"items": items, "count": len(items)}


@router.post("/proyectos/{project_id}/partidas")
def add_project_partida(project_id: int, payload: ProjectPartidaPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    projects = ProjectRepository(settings.database_path)
    apus = ApuRepository(settings.database_path)
    if not projects.exists(project_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    apu = _apu_view(apus, payload.apu_id)
    duration = max(1, math.ceil(payload.cantidad / payload.rendimiento_diario))
    projects.insert_partida(
        project_id=project_id,
        fase=payload.fase,
        apu_id=payload.apu_id,
        cantidad=payload.cantidad,
        rendimiento_diario=payload.rendimiento_diario,
        orden=payload.orden,
        costo_unitario=apu["precio_venta"],
        costo_total=payload.cantidad * apu["precio_venta"],
        duracion_dias=duration,
    )
    return {"ok": True, "proyecto": _project_view(projects, apus, project_id)}
