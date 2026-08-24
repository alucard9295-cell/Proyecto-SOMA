from collections.abc import Callable
import sqlite3


Migration = tuple[int, str, Callable[[sqlite3.Connection], None]]


def _create_users(connection: sqlite3.Connection) -> None:
    # CREATE IF NOT EXISTS preserves databases created before migrations existed.
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _create_audit_events(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            request_id TEXT,
            ip_address TEXT,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_created_at "
        "ON audit_events(created_at)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_event_type "
        "ON audit_events(event_type)"
    )


def _create_construction_catalog(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS insumos_maestros (
            insumo_id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_normalizado TEXT NOT NULL UNIQUE,
            categoria TEXT NOT NULL,
            unidad_estandar TEXT,
            fecha_creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        "INSERT OR IGNORE INTO insumos_maestros (nombre_normalizado, categoria, unidad_estandar) VALUES (?, ?, ?)",
        ("Mano de obra cuadrilla muro", "mano_obra", "jornada"),
    )


def _create_invoices(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS facturas (
            factura_id INTEGER PRIMARY KEY AUTOINCREMENT,
            proveedor_nombre TEXT NOT NULL,
            proveedor_nit TEXT,
            numero_factura TEXT,
            fecha_factura TEXT,
            total_pagar REAL DEFAULT 0
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS factura_items (
            item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            factura_id INTEGER NOT NULL REFERENCES facturas(factura_id),
            descripcion_cruda TEXT NOT NULL,
            unidad_medida TEXT,
            cantidad REAL,
            valor_unitario REAL,
            valor_total REAL,
            insumo_id INTEGER REFERENCES insumos_maestros(insumo_id)
        )
        """
    )


def _create_apus(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS apus (
            apu_id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_partida TEXT NOT NULL,
            unidad TEXT NOT NULL,
            descripcion TEXT,
            categoria TEXT NOT NULL DEFAULT 'obra_gris',
            administracion_pct REAL NOT NULL DEFAULT 0,
            imprevistos_pct REAL NOT NULL DEFAULT 0,
            utilidad_pct REAL NOT NULL DEFAULT 0,
            iva_pct REAL NOT NULL DEFAULT 0,
            iva_base TEXT NOT NULL DEFAULT 'utilidad'
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS apu_detalle (
            detalle_id INTEGER PRIMARY KEY AUTOINCREMENT,
            apu_id INTEGER NOT NULL REFERENCES apus(apu_id) ON DELETE CASCADE,
            insumo_id INTEGER NOT NULL REFERENCES insumos_maestros(insumo_id),
            categoria TEXT NOT NULL,
            rendimiento REAL NOT NULL,
            desperdicio_pct REAL NOT NULL DEFAULT 0,
            precio_unitario REAL
        )
        """
    )


def _create_projects(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS proyectos (
            proyecto_id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            cliente TEXT,
            ubicacion TEXT,
            fecha_inicio TEXT NOT NULL,
            fecha_creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS proyecto_partidas (
            partida_id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
            fase TEXT NOT NULL,
            apu_id INTEGER NOT NULL REFERENCES apus(apu_id),
            cantidad REAL NOT NULL,
            rendimiento_diario REAL NOT NULL,
            orden INTEGER NOT NULL DEFAULT 1,
            costo_unitario REAL NOT NULL,
            costo_total REAL NOT NULL,
            duracion_dias INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS proyecto_dependencias (
            dependencia_id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
            partida_id INTEGER NOT NULL REFERENCES proyecto_partidas(partida_id) ON DELETE CASCADE,
            depende_de_partida_id INTEGER NOT NULL REFERENCES proyecto_partidas(partida_id) ON DELETE CASCADE
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS proyecto_resultados (
            resultado_id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
            costo_total REAL NOT NULL,
            duracion_dias INTEGER NOT NULL,
            fecha_fin TEXT
        )
        """
    )


MIGRATIONS: tuple[Migration, ...] = (
    (1, "create_users", _create_users),
    (2, "create_audit_events", _create_audit_events),
    (3, "create_construction_catalog", _create_construction_catalog),
    (4, "create_invoices", _create_invoices),
    (5, "create_apus", _create_apus),
    (6, "create_projects", _create_projects),
)
