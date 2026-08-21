from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insumos_maestros (
    insumo_id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_normalizado TEXT NOT NULL UNIQUE,
    categoria TEXT NOT NULL,
    unidad_estandar TEXT,
    fecha_creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS facturas (
    factura_id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_nombre TEXT NOT NULL,
    proveedor_nit TEXT,
    numero_factura TEXT,
    fecha_factura TEXT,
    total_pagar REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS factura_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL REFERENCES facturas(factura_id),
    descripcion_cruda TEXT NOT NULL,
    unidad_medida TEXT,
    cantidad REAL,
    valor_unitario REAL,
    valor_total REAL,
    insumo_id INTEGER REFERENCES insumos_maestros(insumo_id)
);

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
);

CREATE TABLE IF NOT EXISTS apu_detalle (
    detalle_id INTEGER PRIMARY KEY AUTOINCREMENT,
    apu_id INTEGER NOT NULL REFERENCES apus(apu_id) ON DELETE CASCADE,
    insumo_id INTEGER NOT NULL REFERENCES insumos_maestros(insumo_id),
    categoria TEXT NOT NULL,
    rendimiento REAL NOT NULL,
    desperdicio_pct REAL NOT NULL DEFAULT 0,
    precio_unitario REAL
);

CREATE TABLE IF NOT EXISTS proyectos (
    proyecto_id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cliente TEXT,
    ubicacion TEXT,
    fecha_inicio TEXT NOT NULL,
    fecha_creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS proyecto_dependencias (
    dependencia_id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
    partida_id INTEGER NOT NULL REFERENCES proyecto_partidas(partida_id) ON DELETE CASCADE,
    depende_de_partida_id INTEGER NOT NULL REFERENCES proyecto_partidas(partida_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proyecto_resultados (
    resultado_id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
    costo_total REAL NOT NULL,
    duracion_dias INTEGER NOT NULL,
    fecha_fin TEXT
);
"""


def init_db(database_path: str) -> None:
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT OR IGNORE INTO insumos_maestros (nombre_normalizado, categoria, unidad_estandar) VALUES (?, ?, ?)",
            ("Mano de obra cuadrilla muro", "mano_obra", "jornada"),
        )


@contextmanager
def connect(database_path: str) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def find_user(database_path: str, username: str) -> sqlite3.Row | None:
    with connect(database_path) as connection:
        return connection.execute(
            "SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()


def upsert_user(database_path: str, username: str, password_hash: str) -> None:
    with connect(database_path) as connection:
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
