-- Dueños: una sola pantalla "Objetivos del mes" (24/10/2026).
--
-- · Las tareas de los dueños pasan a ser una conversación con fotos y PDF, como las del
--   encargado.
-- · El objetivo de una unidad puede ser de rentabilidad (% del EERR), de ventas del mes en
--   pesos (se sigue en vivo) o algo que se cumple o no (General, por ejemplo).
-- · Cada microobjetivo dice cuánto aporta (puntos o pesos) y, si quiere, cómo va
--   ("2 de 5 clientes").

CREATE TABLE IF NOT EXISTS tarea_duenos_adjuntos (
  id          SERIAL       PRIMARY KEY,
  tarea_id    INT          NOT NULL REFERENCES tareas_duenos(id) ON DELETE CASCADE,
  evento_id   INT          REFERENCES tarea_duenos_eventos(id) ON DELETE CASCADE,
  r2_key      TEXT         NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  nombre      TEXT,
  tamano      INT,
  subido_por  INT          REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tdu_adj ON tarea_duenos_adjuntos(tarea_id);

-- rent: pct · ventas: monto (pesos con IVA, lo que se cobra) · meta: texto y cumplido.
ALTER TABLE objetivos_mes ADD COLUMN IF NOT EXISTS tipo     VARCHAR(10) NOT NULL DEFAULT 'rent' CHECK (tipo IN ('rent', 'ventas', 'meta'));
ALTER TABLE objetivos_mes ADD COLUMN IF NOT EXISTS monto    NUMERIC(16,2);
ALTER TABLE objetivos_mes ADD COLUMN IF NOT EXISTS texto    TEXT;
ALTER TABLE objetivos_mes ADD COLUMN IF NOT EXISTS cumplido BOOLEAN;
ALTER TABLE objetivos_mes ALTER COLUMN pct DROP NOT NULL;

ALTER TABLE microobjetivos ADD COLUMN IF NOT EXISTS aporte_monto NUMERIC(16,2);
ALTER TABLE microobjetivos ADD COLUMN IF NOT EXISTS avance TEXT;
