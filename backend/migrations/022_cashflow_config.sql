CREATE TABLE IF NOT EXISTS cashflow_config (
  clave      VARCHAR(100) PRIMARY KEY,
  valor      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO cashflow_config (clave, valor) VALUES ('piso_seguridad', '3000000')
ON CONFLICT (clave) DO NOTHING;
