-- Un problema por renglón, y cada renglón con su rubro.
--
-- El formulario ya guardaba un ítem por línea, pero nada obligaba: cuatro de los seis
-- pendientes abiertos traían varios problemas juntos ("piso, paredes, tapa del baño
-- urg, canasta black"). Así no se puede arreglar nada ni contar nada.
--
-- El rubro es "qué cosa se rompió", no "qué tipo de arreglo es": la silla es silla
-- para todos. Se elige una sola vez, cuando el problema nace; al día siguiente el
-- ítem ya aparece como pendiente y el turno solo dice si sigue igual.
--
-- La lista la maneja Martín desde pantalla: doce rubros para arrancar, salidos de lo
-- que la gente ya venía escribiendo. "Otra cosa" siempre está y lleva texto libre.

CREATE TABLE IF NOT EXISTS mantenimiento_rubros (
  id         SERIAL       PRIMARY KEY,
  nombre     VARCHAR(40)  NOT NULL,
  orden      INT          NOT NULL DEFAULT 0,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  -- El rubro comodín: pide un texto libre y no se puede desactivar ni borrar.
  es_otro    BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- "Luces" y "luces" son el mismo rubro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mantenimiento_rubros_nombre
  ON mantenimiento_rubros (lower(nombre));

INSERT INTO mantenimiento_rubros (nombre, orden, es_otro) VALUES
  ('Piso',      10, false),
  ('Paredes',   20, false),
  ('Luces',     30, false),
  ('Baño',      40, false),
  ('Muebles',   50, false),
  ('Sillas',    60, false),
  ('Vitrina',   70, false),
  ('Vidrios',   80, false),
  ('Aire',      90, false),
  ('Máquinas', 100, false),
  ('Limpieza', 110, false),
  ('Otra cosa', 999, true)
ON CONFLICT DO NOTHING;

-- Los ítems que ya existen quedan sin rubro: son de antes de la regla y se muestran
-- igual, sin etiqueta. No se parten solos — eso lo decide una persona.
ALTER TABLE mantenimiento_items ADD COLUMN IF NOT EXISTS rubro_id   INT REFERENCES mantenimiento_rubros(id);
ALTER TABLE mantenimiento_items ADD COLUMN IF NOT EXISTS rubro_otro TEXT;

CREATE INDEX IF NOT EXISTS idx_mantenimiento_items_rubro ON mantenimiento_items(rubro_id);
