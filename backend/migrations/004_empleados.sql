CREATE TABLE IF NOT EXISTS empleados (
  id                  SERIAL PRIMARY KEY,
  nombre              VARCHAR(255) NOT NULL,
  nombre_pos          VARCHAR(255) NOT NULL,
  local_id_principal  INT NOT NULL REFERENCES locales(id),
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
