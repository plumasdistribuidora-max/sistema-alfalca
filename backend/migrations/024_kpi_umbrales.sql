CREATE TABLE IF NOT EXISTS kpi_umbrales (
  kpi_codigo   VARCHAR(50)   PRIMARY KEY,
  verde_min    NUMERIC(8,2)  NOT NULL,
  ambar_min    NUMERIC(8,2)  NOT NULL,
  invert       BOOLEAN       NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO kpi_umbrales (kpi_codigo, verde_min, ambar_min, invert) VALUES
  ('margen_bruto',   50, 40, false),
  ('margen_ebitda',  15,  5, false),
  ('breakeven',     100, 80, false),
  ('sueldos_venta',  30, 35, true),
  ('dias_caja',      14,  7, false)
ON CONFLICT (kpi_codigo) DO NOTHING;
