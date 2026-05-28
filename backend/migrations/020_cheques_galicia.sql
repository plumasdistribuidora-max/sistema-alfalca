CREATE TABLE IF NOT EXISTS cheques_galicia (
  id             SERIAL PRIMARY KEY,
  nro_cheque     VARCHAR(100)   NOT NULL UNIQUE,
  emitido_a      VARCHAR(255),
  fecha_pago     DATE,
  fecha_emision  DATE,
  importe        NUMERIC(14,2),
  estado         VARCHAR(100),
  raw            JSONB,
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cheques_galicia_fecha_pago ON cheques_galicia(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_cheques_galicia_estado     ON cheques_galicia(estado);
