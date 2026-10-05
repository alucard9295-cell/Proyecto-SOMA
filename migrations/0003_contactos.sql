-- Quien abre el asesor publico deja nombre y correo antes de chatear (ADR-010).
-- Un correo es una fila: si vuelve, se actualiza el nombre y se cuenta la visita.
CREATE TABLE contactos (
  contacto_id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  visitas INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  ultima_visita TEXT NOT NULL DEFAULT (datetime('now'))
);
