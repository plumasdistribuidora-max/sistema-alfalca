-- Mantenimiento con seguimiento.
--
-- Hasta acá "mantenimiento" era un texto libre en cada reporte de turno, y la gente
-- tipeaba lo mismo todos los días ("piso roto, tapa del baño rota…"). El encargado
-- tenía otro texto libre que repetía lo que ya habían dicho los turnos.
--
-- Ahora cada cosa reportada es un ítem por local. Al día siguiente el empleado lo ve
-- ya cargado y solo dice si se solucionó o sigue igual; el encargado escribe, por
-- ítem, cómo lo va a resolver, y eso es lo que les llega a los dueños.

CREATE TABLE IF NOT EXISTS mantenimiento_items (
  id                   SERIAL PRIMARY KEY,
  local_id             INT         NOT NULL REFERENCES locales(id),
  texto                TEXT        NOT NULL,
  -- El reporte de turno donde se informó por primera vez.
  reporte_id           INT         REFERENCES reportes(id) ON DELETE SET NULL,
  reportado_por        INT         REFERENCES usuarios(id),
  fecha                DATE        NOT NULL,
  estado               VARCHAR(12) NOT NULL DEFAULT 'abierto',
  -- Cuándo y desde qué reporte se marcó como solucionado.
  resuelto_fecha       DATE,
  resuelto_reporte_id  INT         REFERENCES reportes(id) ON DELETE SET NULL,
  -- Lo que el encargado dice que va a hacer. Persiste día a día hasta que se resuelva.
  plan                 TEXT,
  plan_por             INT         REFERENCES usuarios(id),
  plan_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mantenimiento_items DROP CONSTRAINT IF EXISTS mantenimiento_items_estado_check;
ALTER TABLE mantenimiento_items ADD CONSTRAINT mantenimiento_items_estado_check
  CHECK (estado IN ('abierto', 'resuelto'));

CREATE INDEX IF NOT EXISTS idx_mantenimiento_local_estado ON mantenimiento_items(local_id, estado);
CREATE INDEX IF NOT EXISTS idx_mantenimiento_reporte      ON mantenimiento_items(reporte_id);

-- El campo "mantenimiento" de las plantillas pasa de texto libre al tipo nuevo. Se
-- busca por código, no por posición: la plantilla se edita desde pantalla y el orden
-- puede haber cambiado. Idempotente: solo toca las que siguen en texto_largo.
UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(
      CASE WHEN c->>'codigo' = 'mantenimiento' AND c->>'tipo' = 'texto_largo'
           THEN c || jsonb_build_object(
                  'tipo',  'mantenimiento',
                  'ayuda', 'Lo que ya está reportado aparece solo: decí si se solucionó o sigue igual. Abajo podés agregar algo nuevo.'
                )
           ELSE c END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE campos @> '[{"codigo":"mantenimiento","tipo":"texto_largo"}]'::jsonb;
