-- Costo de tarjetas en el EERR (tiendas y Café): un % de la venta bruta, 2% por defecto.
-- Se guarda por local y mes en eerr_local, que el Café ya usa para sus gastos.
ALTER TABLE eerr_local ADD COLUMN IF NOT EXISTS tarjeta_pct NUMERIC(5,2) NOT NULL DEFAULT 2;
