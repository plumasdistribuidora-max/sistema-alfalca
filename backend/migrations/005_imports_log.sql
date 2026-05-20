CREATE TABLE IF NOT EXISTS imports_log (
  id                SERIAL PRIMARY KEY,
  local_id          INT NOT NULL REFERENCES locales(id),
  tipo              tipo_import NOT NULL,
  archivo_nombre    VARCHAR(255) NOT NULL,
  archivo_r2_key    VARCHAR(500),
  filas_total       INT NOT NULL DEFAULT 0,
  filas_insertadas  INT NOT NULL DEFAULT 0,
  filas_actualizadas INT NOT NULL DEFAULT 0,
  filas_duplicadas  INT NOT NULL DEFAULT 0,
  filas_error       INT NOT NULL DEFAULT 0,
  status            status_import NOT NULL DEFAULT 'procesando',
  error_detail      JSONB,
  fecha_desde       DATE,
  fecha_hasta       DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        INT REFERENCES usuarios(id)
);
