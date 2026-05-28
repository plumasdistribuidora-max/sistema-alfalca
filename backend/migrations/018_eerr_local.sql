CREATE TABLE IF NOT EXISTS eerr_local (
  id           SERIAL PRIMARY KEY,
  local_id     INTEGER NOT NULL REFERENCES locales(id),
  mes          CHAR(7)  NOT NULL,          -- YYYY-MM
  cmv_e2_pct   NUMERIC(5,2) NOT NULL DEFAULT 45,
  cmv_alim_pct NUMERIC(5,2) NOT NULL DEFAULT 70,
  gastos       JSONB NOT NULL DEFAULT '{"bloques":[]}'::jsonb,
  impuestos    JSONB NOT NULL DEFAULT '{"iibb":0,"novecientos31":0,"ganancias":0}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (local_id, mes)
);
