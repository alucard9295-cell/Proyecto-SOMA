-- Respuestas del asesor publico por dia (UTC). Tope global: el asesor y el
-- copiloto comparten las 10k neuronas diarias gratis de Workers AI.
CREATE TABLE uso_asesor (
  dia TEXT PRIMARY KEY,
  respuestas INTEGER NOT NULL
);
