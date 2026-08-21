import math
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import database as db
from ..config import Settings
from ..dependencies import current_user, get_settings

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


def _supply_price(connection, supply_id: int) -> dict:
    row = connection.execute(
        """SELECT i.insumo_id, i.nombre_normalizado, i.categoria, i.unidad_estandar,
                  COALESCE(AVG(fi.valor_unitario), 0) AS price_average,
                  MIN(fi.valor_unitario) AS price_min, MAX(fi.valor_unitario) AS price_max,
                  COUNT(fi.item_id) AS purchase_count, MAX(f.fecha_factura) AS last_purchase
             FROM insumos_maestros i
             LEFT JOIN factura_items fi ON fi.insumo_id=i.insumo_id
             LEFT JOIN facturas f ON f.factura_id=fi.factura_id
            WHERE i.insumo_id=? GROUP BY i.insumo_id""",
        (supply_id,),
    ).fetchone()
    return dict(row) if row else {}


def _apu(connection, apu_id: int) -> dict:
    row = connection.execute("SELECT * FROM apus WHERE apu_id=?", (apu_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="APU no encontrado.")
    details = []
    for detail in connection.execute(
        """SELECT ad.*, i.nombre_normalizado, i.unidad_estandar,
                  COALESCE(AVG(fi.valor_unitario), 0) AS precio_catalogo
             FROM apu_detalle ad JOIN insumos_maestros i ON i.insumo_id=ad.insumo_id
             LEFT JOIN factura_items fi ON fi.insumo_id=i.insumo_id
            WHERE ad.apu_id=? GROUP BY ad.detalle_id ORDER BY ad.detalle_id""",
        (apu_id,),
    ).fetchall():
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
    with db.connect(settings.database_path) as connection:
        filters = []
        params: list[str] = []
        if search.strip():
            filters.append("lower(i.nombre_normalizado) LIKE ?")
            params.append(f"%{search.strip().lower()}%")
        if category:
            _validate_supply_category(category)
            filters.append("i.categoria=?")
            params.append(category)
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        rows = connection.execute(
            f"""SELECT i.insumo_id, i.nombre_normalizado, i.categoria, i.unidad_estandar,
                       COALESCE(AVG(fi.valor_unitario), 0) AS price_average,
                       MIN(fi.valor_unitario) AS price_min, MAX(fi.valor_unitario) AS price_max,
                       COUNT(fi.item_id) AS purchase_count, MAX(f.fecha_factura) AS last_purchase
                  FROM insumos_maestros i LEFT JOIN factura_items fi ON fi.insumo_id=i.insumo_id
                  LEFT JOIN facturas f ON f.factura_id=fi.factura_id {where}
                 GROUP BY i.insumo_id ORDER BY i.nombre_normalizado""",
            params,
        ).fetchall()
        return {"items": [dict(row) for row in rows], "count": len(rows)}


@router.put("/supplies/{supply_id}")
def update_supply(supply_id: int, payload: SupplyUpdate, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    _validate_supply_category(payload.categoria)
    with db.connect(settings.database_path) as connection:
        if not connection.execute("SELECT 1 FROM insumos_maestros WHERE insumo_id=?", (supply_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Insumo no encontrado.")
        connection.execute("UPDATE insumos_maestros SET nombre_normalizado=?, categoria=?, unidad_estandar=? WHERE insumo_id=?", (payload.nombre_normalizado.strip(), payload.categoria, payload.unidad_estandar, supply_id))
        return {"ok": True, "insumo_id": supply_id}


@router.get("/apus")
def list_apus(_: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with db.connect(settings.database_path) as connection:
        items = [_apu(connection, row["apu_id"]) for row in connection.execute("SELECT apu_id FROM apus ORDER BY apu_id DESC").fetchall()]
        return {"items": items, "count": len(items)}


def _save_apu(connection, payload: ApuPayload, apu_id: int | None = None) -> int:
    if payload.categoria not in APU_CATEGORIES or payload.iva_base not in {"directo", "subtotal", "utilidad"}:
        raise HTTPException(status_code=422, detail="Categoria o base de IVA invalida.")
    for detail in payload.detalles:
        _validate_supply_category(detail.categoria)
        if not connection.execute("SELECT 1 FROM insumos_maestros WHERE insumo_id=?", (detail.insumo_id,)).fetchone():
            raise HTTPException(status_code=400, detail=f"Insumo no encontrado: {detail.insumo_id}")
    values = (payload.nombre_partida.strip(), payload.unidad.strip(), payload.descripcion, payload.categoria, payload.administracion_pct, payload.imprevistos_pct, payload.utilidad_pct, payload.iva_pct, payload.iva_base)
    if apu_id is None:
        cursor = connection.execute("INSERT INTO apus (nombre_partida, unidad, descripcion, categoria, administracion_pct, imprevistos_pct, utilidad_pct, iva_pct, iva_base) VALUES (?,?,?,?,?,?,?,?,?)", values)
        apu_id = cursor.lastrowid
    else:
        if not connection.execute("SELECT 1 FROM apus WHERE apu_id=?", (apu_id,)).fetchone():
            raise HTTPException(status_code=404, detail="APU no encontrado.")
        connection.execute("UPDATE apus SET nombre_partida=?, unidad=?, descripcion=?, categoria=?, administracion_pct=?, imprevistos_pct=?, utilidad_pct=?, iva_pct=?, iva_base=? WHERE apu_id=?", (*values, apu_id))
        connection.execute("DELETE FROM apu_detalle WHERE apu_id=?", (apu_id,))
    connection.executemany("INSERT INTO apu_detalle (apu_id, insumo_id, categoria, rendimiento, desperdicio_pct, precio_unitario) VALUES (?,?,?,?,?,?)", [(apu_id, detail.insumo_id, detail.categoria, detail.rendimiento, detail.desperdicio_pct, detail.precio_unitario) for detail in payload.detalles])
    return apu_id


@router.post("/apus")
def create_apu(payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with db.connect(settings.database_path) as connection:
        apu_id = _save_apu(connection, payload)
        return {"ok": True, "apu": _apu(connection, apu_id)}


@router.put("/apus/{apu_id}")
def update_apu(apu_id: int, payload: ApuPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with db.connect(settings.database_path) as connection:
        _save_apu(connection, payload, apu_id)
        return {"ok": True, "apu": _apu(connection, apu_id)}


def _project(connection, project_id: int) -> dict:
    project = connection.execute("SELECT * FROM proyectos WHERE proyecto_id=?", (project_id,)).fetchone()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    current = date.fromisoformat(project["fecha_inicio"])
    items = []
    phases: dict[str, dict] = {}
    for row in connection.execute("SELECT pp.*, a.nombre_partida, a.unidad FROM proyecto_partidas pp JOIN apus a ON a.apu_id=pp.apu_id WHERE pp.proyecto_id=? ORDER BY pp.orden, pp.partida_id", (project_id,)).fetchall():
        end = current + timedelta(days=row["duracion_dias"] - 1)
        item = dict(row); item.update({"fecha_inicio": current.isoformat(), "fecha_fin": end.isoformat(), "apu": _apu(connection, row["apu_id"])})
        items.append(item); phase = phases.setdefault(row["fase"], {"fase": row["fase"], "costo_total": 0, "duracion_dias": 0, "partidas": 0}); phase["costo_total"] += row["costo_total"]; phase["duracion_dias"] += row["duracion_dias"]; phase["partidas"] += 1; current = end + timedelta(days=1)
    result = dict(project); result.update({"partidas": items, "fases": list(phases.values()), "costo_total": sum(item["costo_total"] for item in items), "duracion_dias": sum(item["duracion_dias"] for item in items), "fecha_fin": (current - timedelta(days=1)).isoformat() if items else project["fecha_inicio"]}); return result


@router.post("/proyectos")
def create_project(payload: ProjectPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with db.connect(settings.database_path) as connection:
        cursor = connection.execute("INSERT INTO proyectos (nombre, cliente, ubicacion, fecha_inicio) VALUES (?,?,?,?)", (payload.nombre.strip(), payload.cliente, payload.ubicacion, payload.fecha_inicio.isoformat()))
        return {"ok": True, "proyecto": _project(connection, cursor.lastrowid)}


@router.get("/proyectos")
def list_projects(_: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with db.connect(settings.database_path) as connection:
        items = [_project(connection, row["proyecto_id"]) for row in connection.execute("SELECT proyecto_id FROM proyectos ORDER BY proyecto_id DESC").fetchall()]
        return {"items": items, "count": len(items)}


@router.post("/proyectos/{project_id}/partidas")
def add_project_partida(project_id: int, payload: ProjectPartidaPayload, _: dict = Depends(current_user), settings: Settings = Depends(get_settings)):
    with db.connect(settings.database_path) as connection:
        if not connection.execute("SELECT 1 FROM proyectos WHERE proyecto_id=?", (project_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
        apu = _apu(connection, payload.apu_id)
        duration = max(1, math.ceil(payload.cantidad / payload.rendimiento_diario))
        connection.execute("INSERT INTO proyecto_partidas (proyecto_id, fase, apu_id, cantidad, rendimiento_diario, orden, costo_unitario, costo_total, duracion_dias) VALUES (?,?,?,?,?,?,?,?,?)", (project_id, payload.fase, payload.apu_id, payload.cantidad, payload.rendimiento_diario, payload.orden, apu["precio_venta"], payload.cantidad * apu["precio_venta"], duration))
        return {"ok": True, "proyecto": _project(connection, project_id)}
