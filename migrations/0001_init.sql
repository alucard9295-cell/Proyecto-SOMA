-- Esquema inicial de SOMA sobre D1 (SQLite).
--
-- Consolida las migraciones del API Python (SOMA-ADR-009). No hay datos de
-- produccion que preservar, asi que se parte limpio en vez de arrastrar los
-- ALTER historicos. Desde aqui el esquema solo cambia con un archivo nuevo en
-- migrations/ (wrangler d1 migrations create); los aplicados no se editan.
--
-- Convencion de tipos: todo importe de dinero es INTEGER en centavos, con
-- sufijo _centavos ($26.923,10 -> 2692310). REAL es coma flotante binaria y
-- reintroduce 26923.100000000002; TEXT obliga a castear a REAL para sumar en
-- SQL. Un entero suma exacto. La conversion vive en los repositorios.
-- Cantidades, rendimientos y porcentajes son REAL: no son dinero y el dominio
-- los convierte a Decimal antes de multiplicar.
--
-- Sin tabla de usuarios: la identidad la pone Cloudflare Access (ADR-010).

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor TEXT,
  request_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_events_created_at ON audit_events (created_at);

CREATE TABLE insumos_maestros (
  insumo_id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_normalizado TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  unidad_estandar TEXT,
  fecha_creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO insumos_maestros (nombre_normalizado, categoria, unidad_estandar)
VALUES ('Mano de obra cuadrilla muro', 'mano_obra', 'jornada');

-- El documento tal como llego (el PDF vive en R2 bajo storage_key). Nunca se
-- corrige aqui: cuando el extractor mejora se reprocesa desde este registro.
-- content_hash UNIQUE hace idempotente la ingesta: subir dos veces el mismo
-- archivo no duplica una factura.
CREATE TABLE documentos_raw (
  documento_id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_key TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  mime TEXT,
  bytes INTEGER,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE facturas (
  factura_id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER REFERENCES documentos_raw (documento_id),
  proveedor_nombre TEXT NOT NULL,
  proveedor_nit TEXT,
  numero_factura TEXT,
  fecha_factura TEXT,
  cufe TEXT,
  subtotal_centavos INTEGER,
  iva_centavos INTEGER,
  total_centavos INTEGER
);
CREATE UNIQUE INDEX uq_facturas_cufe ON facturas (cufe) WHERE cufe IS NOT NULL;

CREATE TABLE factura_items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  factura_id INTEGER NOT NULL REFERENCES facturas (factura_id) ON DELETE CASCADE,
  descripcion_cruda TEXT NOT NULL,
  unidad_medida TEXT,
  cantidad REAL,
  valor_unitario_centavos INTEGER,
  valor_total_centavos INTEGER,
  insumo_id INTEGER REFERENCES insumos_maestros (insumo_id)
);
CREATE INDEX idx_factura_items_insumo ON factura_items (insumo_id);

-- Estado del procesamiento, separado del documento para poder reintentar y
-- saber por que algo quedo en revision. `extraccion` guarda lo que se leyo
-- aunque la factura no cierre: la pantalla de revision parte de ahi.
CREATE TABLE document_jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos_raw (documento_id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'received',
  intentos INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  parser TEXT,
  extraccion TEXT,
  factura_id INTEGER REFERENCES facturas (factura_id),
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_document_jobs_estado ON document_jobs (estado);

CREATE TABLE apus (
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

CREATE TABLE apu_detalle (
  detalle_id INTEGER PRIMARY KEY AUTOINCREMENT,
  apu_id INTEGER NOT NULL REFERENCES apus (apu_id) ON DELETE CASCADE,
  insumo_id INTEGER NOT NULL REFERENCES insumos_maestros (insumo_id),
  categoria TEXT NOT NULL,
  rendimiento REAL NOT NULL,
  desperdicio_pct REAL NOT NULL DEFAULT 0,
  precio_unitario_centavos INTEGER
);

CREATE TABLE proyectos (
  proyecto_id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cliente TEXT,
  ubicacion TEXT,
  fecha_inicio TEXT NOT NULL,
  fecha_creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proyecto_partidas (
  partida_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos (proyecto_id) ON DELETE CASCADE,
  fase TEXT NOT NULL,
  apu_id INTEGER NOT NULL REFERENCES apus (apu_id),
  cantidad REAL NOT NULL,
  rendimiento_diario REAL NOT NULL,
  orden INTEGER NOT NULL DEFAULT 1,
  costo_unitario_centavos INTEGER NOT NULL,
  costo_total_centavos INTEGER NOT NULL,
  duracion_dias INTEGER NOT NULL
);
