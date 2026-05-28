CREATE TABLE IF NOT EXISTS cuentas_saldos (
  id                  SERIAL PRIMARY KEY,
  cuenta              VARCHAR(50)    NOT NULL,  -- santander | mp | galicia | efectivo
  monto               NUMERIC(14,2)  NOT NULL,
  fecha_actualizacion TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cuentas_saldos_cuenta ON cuentas_saldos(cuenta, fecha_actualizacion DESC);
