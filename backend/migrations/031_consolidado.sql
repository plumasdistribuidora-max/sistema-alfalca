-- Etapa 3: consolidado diario del Encargado General.
--
-- Se adelanta valor_hora, que era de la etapa de empleados, porque sin eso no se
-- puede calcular el punto 3 del reporte: el KPI de gasto de personal sobre ventas.

-- El precio por hora va por local y puesto, con historia: un aumento no puede
-- cambiar retroactivamente lo que costó un día ya cerrado.
CREATE TABLE IF NOT EXISTS valor_hora (
  id            SERIAL PRIMARY KEY,
  local_id      INT           NOT NULL REFERENCES locales(id),
  puesto        VARCHAR(50)   NOT NULL,
  valor_hora    NUMERIC(12,2) NOT NULL,
  vigente_desde DATE          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (local_id, puesto, vigente_desde)
);
CREATE INDEX IF NOT EXISTS idx_valor_hora_busqueda
  ON valor_hora(local_id, puesto, vigente_desde DESC);

-- Un consolidado por día para toda la red. No usa la tabla reportes porque esa es
-- por local y turno, y este es uno solo para los cinco locales.
CREATE TABLE IF NOT EXISTS consolidados (
  id                     SERIAL PRIMARY KEY,
  fecha                  DATE        NOT NULL UNIQUE,
  usuario_id             INT         NOT NULL REFERENCES usuarios(id),
  estado                 VARCHAR(20) NOT NULL DEFAULT 'borrador',
  -- Lo que el encargado verifica en Fudo, por local: {"3": 2510700, ...}
  ventas_fudo            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Por qué no cierra contra el sistema, por local: {"3": "ticket anulado"}
  explicaciones          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  vencimientos_ok        BOOLEAN     NOT NULL DEFAULT false,
  acciones_vencimientos  TEXT,
  mantenimiento          TEXT,
  control_tienda_ok      BOOLEAN     NOT NULL DEFAULT false,
  cerrado_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE consolidados DROP CONSTRAINT IF EXISTS consolidados_estado_check;
ALTER TABLE consolidados ADD CONSTRAINT consolidados_estado_check
  CHECK (estado IN ('borrador', 'cerrado'));

CREATE INDEX IF NOT EXISTS idx_consolidados_fecha ON consolidados(fecha DESC);
