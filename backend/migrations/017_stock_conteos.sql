CREATE TABLE IF NOT EXISTS stock_conteos (
  id           SERIAL PRIMARY KEY,
  local_id     INT REFERENCES locales(id),
  fecha        TIMESTAMPTZ DEFAULT NOW(),
  dias_cubrir  INT NOT NULL,
  multiplicador NUMERIC(3,2) NOT NULL,
  unidad       TEXT NOT NULL,
  usuario      TEXT,
  detalle      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_conteos_local ON stock_conteos(local_id, created_at DESC);
