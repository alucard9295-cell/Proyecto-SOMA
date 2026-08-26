from contextlib import contextmanager
import json
import re
import sqlite3
from typing import Any, Iterator

from .database import connect


class _Repository:
    """Base de todos los repositorios.

    Puede abrir su propia conexion (uso suelto) o reutilizar la que le entrega
    una unidad de trabajo. Reutilizarla es lo que evita abrir una conexion por
    consulta: listar 50 APUs pasaba de 101 conexiones a 1.
    """

    def __init__(
        self, database_path: str, connection: sqlite3.Connection | None = None
    ):
        self.database_path = database_path
        self._connection = connection

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        if self._connection is not None:
            # La unidad de trabajo es duena del commit y del cierre.
            yield self._connection
        else:
            with connect(self.database_path) as connection:
                yield connection


class UserRepository(_Repository):
    """Small persistence boundary for authentication users."""


    def find_by_username(self, username: str) -> sqlite3.Row | None:
        with self._conn() as connection:
            return connection.execute(
                """
                SELECT id, username, password_hash, role, is_active
                FROM users
                WHERE username = ?
                """,
                (username.strip(),),
            ).fetchone()

    def upsert(self, username: str, password_hash: str) -> None:
        with self._conn() as connection:
            connection.execute(
                """
                INSERT INTO users (username, password_hash)
                VALUES (?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    password_hash = excluded.password_hash,
                    is_active = 1
                """,
                (username.strip(), password_hash),
            )


class AuditRepository(_Repository):

    def record(
        self,
        event_type: str,
        *,
        user_id: int | None = None,
        username: str | None = None,
        request_id: str | None = None,
        ip_address: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        safe_details = _redact_sensitive_details(details or {})
        with self._conn() as connection:
            connection.execute(
                """
                INSERT INTO audit_events
                    (event_type, user_id, username, request_id, ip_address, details)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event_type,
                    user_id,
                    username,
                    request_id,
                    ip_address,
                    json.dumps(safe_details, ensure_ascii=True, sort_keys=True),
                ),
            )


class SupplyRepository(_Repository):

    def search(self, search: str, category: str) -> list[sqlite3.Row]:
        with self._conn() as connection:
            filters = []
            params: list[str] = []
            if search.strip():
                filters.append("lower(i.nombre_normalizado) LIKE ?")
                params.append(f"%{search.strip().lower()}%")
            if category:
                filters.append("i.categoria=?")
                params.append(category)
            where = f"WHERE {' AND '.join(filters)}" if filters else ""
            return connection.execute(
                f"""SELECT i.insumo_id, i.nombre_normalizado, i.categoria, i.unidad_estandar,
                           COALESCE(AVG(fi.valor_unitario), 0) AS price_average,
                           MIN(fi.valor_unitario) AS price_min, MAX(fi.valor_unitario) AS price_max,
                           COUNT(fi.item_id) AS purchase_count, MAX(f.fecha_factura) AS last_purchase
                      FROM insumos_maestros i LEFT JOIN factura_items fi ON fi.insumo_id=i.insumo_id
                      LEFT JOIN facturas f ON f.factura_id=fi.factura_id {where}
                     GROUP BY i.insumo_id ORDER BY i.nombre_normalizado""",
                params,
            ).fetchall()

    def exists(self, supply_id: int) -> bool:
        with self._conn() as connection:
            return (
                connection.execute(
                    "SELECT 1 FROM insumos_maestros WHERE insumo_id=?", (supply_id,)
                ).fetchone()
                is not None
            )

    def update(
        self, supply_id: int, nombre_normalizado: str, categoria: str, unidad_estandar: str | None
    ) -> None:
        with self._conn() as connection:
            connection.execute(
                "UPDATE insumos_maestros SET nombre_normalizado=?, categoria=?, unidad_estandar=? WHERE insumo_id=?",
                (nombre_normalizado, categoria, unidad_estandar, supply_id),
            )


class ApuRepository(_Repository):

    def list_ids(self) -> list[int]:
        with self._conn() as connection:
            return [
                row["apu_id"]
                for row in connection.execute(
                    "SELECT apu_id FROM apus ORDER BY apu_id DESC"
                ).fetchall()
            ]

    def get(self, apu_id: int) -> sqlite3.Row | None:
        with self._conn() as connection:
            return connection.execute(
                "SELECT * FROM apus WHERE apu_id=?", (apu_id,)
            ).fetchone()

    def get_details(self, apu_id: int) -> list[sqlite3.Row]:
        with self._conn() as connection:
            return connection.execute(
                """SELECT ad.*, i.nombre_normalizado, i.unidad_estandar,
                          COALESCE(AVG(fi.valor_unitario), 0) AS precio_catalogo
                     FROM apu_detalle ad JOIN insumos_maestros i ON i.insumo_id=ad.insumo_id
                     LEFT JOIN factura_items fi ON fi.insumo_id=i.insumo_id
                    WHERE ad.apu_id=? GROUP BY ad.detalle_id ORDER BY ad.detalle_id""",
                (apu_id,),
            ).fetchall()

    def get_many(self, apu_ids: list[int]) -> dict[int, sqlite3.Row]:
        """Trae varios APUs en una sola consulta."""
        if not apu_ids:
            return {}
        placeholders = ",".join("?" * len(apu_ids))
        with self._conn() as connection:
            rows = connection.execute(
                f"SELECT * FROM apus WHERE apu_id IN ({placeholders})", apu_ids
            ).fetchall()
        return {row["apu_id"]: row for row in rows}

    def get_details_many(self, apu_ids: list[int]) -> dict[int, list[sqlite3.Row]]:
        """Trae los detalles de varios APUs en una sola consulta.

        Evita el N+1 de pedir los insumos APU por APU al construir un listado.
        """
        if not apu_ids:
            return {}
        placeholders = ",".join("?" * len(apu_ids))
        with self._conn() as connection:
            rows = connection.execute(
                f"""SELECT ad.*, i.nombre_normalizado, i.unidad_estandar,
                           COALESCE(AVG(fi.valor_unitario), 0) AS precio_catalogo
                      FROM apu_detalle ad JOIN insumos_maestros i ON i.insumo_id=ad.insumo_id
                      LEFT JOIN factura_items fi ON fi.insumo_id=i.insumo_id
                     WHERE ad.apu_id IN ({placeholders})
                     GROUP BY ad.detalle_id ORDER BY ad.apu_id, ad.detalle_id""",
                apu_ids,
            ).fetchall()
        grouped: dict[int, list[sqlite3.Row]] = {apu_id: [] for apu_id in apu_ids}
        for row in rows:
            grouped[row["apu_id"]].append(row)
        return grouped

    def save(
        self,
        *,
        apu_id: int | None,
        values: tuple,
        details: list[tuple],
    ) -> int | None:
        """Insert or update an APU and its details atomically. Returns None when
        apu_id was given but no matching row exists."""
        with self._conn() as connection:
            if apu_id is None:
                cursor = connection.execute(
                    """INSERT INTO apus
                        (nombre_partida, unidad, descripcion, categoria, administracion_pct,
                         imprevistos_pct, utilidad_pct, iva_pct, iva_base)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    values,
                )
                apu_id = cursor.lastrowid
            else:
                if not connection.execute(
                    "SELECT 1 FROM apus WHERE apu_id=?", (apu_id,)
                ).fetchone():
                    return None
                connection.execute(
                    """UPDATE apus SET nombre_partida=?, unidad=?, descripcion=?, categoria=?,
                        administracion_pct=?, imprevistos_pct=?, utilidad_pct=?, iva_pct=?, iva_base=?
                       WHERE apu_id=?""",
                    (*values, apu_id),
                )
                connection.execute("DELETE FROM apu_detalle WHERE apu_id=?", (apu_id,))
            connection.executemany(
                """INSERT INTO apu_detalle
                    (apu_id, insumo_id, categoria, rendimiento, desperdicio_pct, precio_unitario)
                   VALUES (?,?,?,?,?,?)""",
                [(apu_id, *detail) for detail in details],
            )
            return apu_id


class ProjectRepository(_Repository):

    def exists(self, project_id: int) -> bool:
        with self._conn() as connection:
            return (
                connection.execute(
                    "SELECT 1 FROM proyectos WHERE proyecto_id=?", (project_id,)
                ).fetchone()
                is not None
            )

    def get(self, project_id: int) -> sqlite3.Row | None:
        with self._conn() as connection:
            return connection.execute(
                "SELECT * FROM proyectos WHERE proyecto_id=?", (project_id,)
            ).fetchone()

    def get_partidas(self, project_id: int) -> list[sqlite3.Row]:
        with self._conn() as connection:
            return connection.execute(
                """SELECT pp.*, a.nombre_partida, a.unidad
                     FROM proyecto_partidas pp JOIN apus a ON a.apu_id=pp.apu_id
                    WHERE pp.proyecto_id=? ORDER BY pp.orden, pp.partida_id""",
                (project_id,),
            ).fetchall()

    def list_ids(self) -> list[int]:
        with self._conn() as connection:
            return [
                row["proyecto_id"]
                for row in connection.execute(
                    "SELECT proyecto_id FROM proyectos ORDER BY proyecto_id DESC"
                ).fetchall()
            ]

    def insert(
        self, nombre: str, cliente: str | None, ubicacion: str | None, fecha_inicio: str
    ) -> int:
        with self._conn() as connection:
            cursor = connection.execute(
                "INSERT INTO proyectos (nombre, cliente, ubicacion, fecha_inicio) VALUES (?,?,?,?)",
                (nombre, cliente, ubicacion, fecha_inicio),
            )
            return cursor.lastrowid

    def insert_partida(
        self,
        *,
        project_id: int,
        fase: str,
        apu_id: int,
        cantidad: float,
        rendimiento_diario: float,
        orden: int,
        costo_unitario: float,
        costo_total: float,
        duracion_dias: int,
    ) -> None:
        with self._conn() as connection:
            connection.execute(
                """INSERT INTO proyecto_partidas
                    (proyecto_id, fase, apu_id, cantidad, rendimiento_diario, orden,
                     costo_unitario, costo_total, duracion_dias)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    project_id,
                    fase,
                    apu_id,
                    cantidad,
                    rendimiento_diario,
                    orden,
                    costo_unitario,
                    costo_total,
                    duracion_dias,
                ),
            )


class DocumentRepository(_Repository):
    """Documentos crudos, su estado de procesamiento y la factura resultante.

    El `content_hash` es la clave de idempotencia del pipeline: registrar dos
    veces el mismo archivo devuelve el documento existente en vez de duplicarlo,
    asi que el ingestor puede correr de mas o reintentar sin ensuciar nada.
    """

    def registrar_documento(
        self,
        *,
        storage_key: str,
        content_hash: str,
        nombre_original: str,
        mime: str | None,
        bytes_totales: int,
    ) -> tuple[int, bool]:
        """Registra el documento. Devuelve (documento_id, era_nuevo)."""
        with self._conn() as connection:
            existente = connection.execute(
                "SELECT documento_id FROM documentos_raw WHERE content_hash=?",
                (content_hash,),
            ).fetchone()
            if existente is not None:
                return existente["documento_id"], False
            cursor = connection.execute(
                """INSERT INTO documentos_raw
                    (storage_key, content_hash, nombre_original, mime, bytes)
                   VALUES (?,?,?,?,?)""",
                (storage_key, content_hash, nombre_original, mime, bytes_totales),
            )
            return cursor.lastrowid, True

    def crear_job(self, documento_id: int, request_id: str | None = None) -> int:
        with self._conn() as connection:
            cursor = connection.execute(
                "INSERT INTO document_jobs (documento_id, estado, request_id) VALUES (?, 'received', ?)",
                (documento_id, request_id),
            )
            return cursor.lastrowid

    def cerrar_job(
        self,
        job_id: int,
        *,
        estado: str,
        motivo: str | None = None,
        parser: str | None = None,
        factura_id: int | None = None,
        extraccion: dict | None = None,
    ) -> None:
        with self._conn() as connection:
            connection.execute(
                """UPDATE document_jobs
                      SET estado=?, motivo=?, parser=?, factura_id=?, extraccion=?,
                          intentos=intentos+1, updated_at=CURRENT_TIMESTAMP
                    WHERE job_id=?""",
                (
                    estado,
                    motivo,
                    parser,
                    factura_id,
                    json.dumps(extraccion, ensure_ascii=False) if extraccion else None,
                    job_id,
                ),
            )

    def guardar_factura(
        self,
        *,
        documento_id: int,
        cabecera: tuple,
        items: list[tuple],
    ) -> int:
        """Inserta una factura y sus items en una sola transaccion.

        Repartirlo en varias llamadas dejaria facturas sin renglones si algo
        falla en medio. Ver `ApuRepository.save` como referencia del patron.
        """
        with self._conn() as connection:
            cursor = connection.execute(
                # `documento_id` va ultimo porque se agrega despues de la
                # cabecera. El orden de esta lista y el de la tupla tienen que
                # coincidir: no coincidian, y el resultado fue una factura con
                # el subtotal guardado en el CUFE. SQLite no avisa de eso.
                """INSERT INTO facturas
                    (proveedor_nombre, proveedor_nit, numero_factura, fecha_factura,
                     total_pagar, cufe, subtotal, iva, total, documento_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (*cabecera, documento_id),
            )
            factura_id = cursor.lastrowid
            connection.executemany(
                """INSERT INTO factura_items
                    (factura_id, descripcion_cruda, unidad_medida, cantidad,
                     valor_unitario, valor_total)
                   VALUES (?,?,?,?,?,?)""",
                [(factura_id, *item) for item in items],
            )
            return factura_id

    def factura_por_cufe(self, cufe: str) -> sqlite3.Row | None:
        with self._conn() as connection:
            return connection.execute(
                "SELECT * FROM facturas WHERE cufe=?", (cufe,)
            ).fetchone()

    def jobs_por_estado(self, estado: str) -> list[sqlite3.Row]:
        with self._conn() as connection:
            return connection.execute(
                """SELECT j.*, d.nombre_original
                     FROM document_jobs j
                     JOIN documentos_raw d ON d.documento_id = j.documento_id
                    WHERE j.estado = ?
                    ORDER BY j.updated_at DESC""",
                (estado,),
            ).fetchall()

    def job(self, job_id: int) -> sqlite3.Row | None:
        with self._conn() as connection:
            return connection.execute(
                """SELECT j.*, d.nombre_original, d.storage_key
                     FROM document_jobs j
                     JOIN documentos_raw d ON d.documento_id = j.documento_id
                    WHERE j.job_id = ?""",
                (job_id,),
            ).fetchone()


class UnitOfWork:
    """Agrupa los repositorios sobre una unica conexion y transaccion.

    Todo lo que ocurre dentro de un `unit_of_work(...)` comparte conexion, asi
    que una peticion HTTP abre una sola, no una por consulta.
    """

    def __init__(self, database_path: str, connection: sqlite3.Connection):
        self.connection = connection
        self.users = UserRepository(database_path, connection)
        self.audit = AuditRepository(database_path, connection)
        self.supplies = SupplyRepository(database_path, connection)
        self.apus = ApuRepository(database_path, connection)
        self.projects = ProjectRepository(database_path, connection)
        self.documents = DocumentRepository(database_path, connection)


@contextmanager
def unit_of_work(database_path: str) -> Iterator[UnitOfWork]:
    """Abre una conexion compartida y hace commit al salir sin excepcion."""
    with connect(database_path) as connection:
        yield UnitOfWork(database_path, connection)


SENSITIVE_DETAIL_KEY_PARTS = {
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "password",
    "passphrase",
    "private_key",
    "secret",
    "token",
}
REDACTED_DETAIL = "[REDACTED]"


def _is_sensitive_detail_key(key: object) -> bool:
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key))
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")
    parts = set(normalized.split("_"))
    sensitive_words = SENSITIVE_DETAIL_KEY_PARTS - {
        "api_key",
        "apikey",
        "private_key",
    }
    return normalized in SENSITIVE_DETAIL_KEY_PARTS or bool(
        parts.intersection(sensitive_words)
    )


def _redact_sensitive_details(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: REDACTED_DETAIL
            if _is_sensitive_detail_key(key)
            else _redact_sensitive_details(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_sensitive_details(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_sensitive_details(item) for item in value]
    return value
