CREATE TABLE IF NOT EXISTS getnet_transacciones (
  id              SERIAL       PRIMARY KEY,
  cod_transaccion VARCHAR(200) NOT NULL UNIQUE,
  posnet          VARCHAR(100),
  fecha_operacion DATE,
  fecha_estimada_pago DATE,
  tipo            VARCHAR(100),
  monto_neto      NUMERIC(14,2),
  estado          VARCHAR(100),
  raw             JSONB,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_getnet_fecha_pago ON getnet_transacciones(fecha_estimada_pago);
CREATE INDEX IF NOT EXISTS idx_getnet_posnet     ON getnet_transacciones(posnet);
