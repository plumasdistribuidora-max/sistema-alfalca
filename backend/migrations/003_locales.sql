CREATE TABLE IF NOT EXISTS locales (
  id         SERIAL PRIMARY KEY,
  codigo     VARCHAR(50) UNIQUE NOT NULL,
  nombre     VARCHAR(255) NOT NULL,
  tipo       tipo_local NOT NULL,
  direccion  VARCHAR(255),
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
