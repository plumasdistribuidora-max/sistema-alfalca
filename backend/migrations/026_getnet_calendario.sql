CREATE TABLE IF NOT EXISTS getnet_calendario (
  fecha      DATE        PRIMARY KEY,
  monto      NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado     VARCHAR(20)   NOT NULL DEFAULT 'estimado'
             CHECK (estado IN ('pago', 'estimado', 'feriado')),
  updated_at TIMESTAMPTZ   DEFAULT NOW()
);
