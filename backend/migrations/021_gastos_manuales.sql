CREATE TABLE IF NOT EXISTS gastos_manuales (
  id         SERIAL PRIMARY KEY,
  concepto   VARCHAR(255)  NOT NULL,
  monto      NUMERIC(14,2) NOT NULL,
  fecha      DATE          NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gastos_manuales_fecha ON gastos_manuales(fecha);
