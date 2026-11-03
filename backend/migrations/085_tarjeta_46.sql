-- Costo de tarjetas: 4,6% de la venta bruta por defecto (3/11/2026). Getnet acredita cerca de un 6% menos
-- de lo cobrado con tarjeta (comisión, IVA y retenciones), y la tarjeta es ~76% de la venta: 6% × 76% = 4,6%.
ALTER TABLE eerr_local ALTER COLUMN tarjeta_pct SET DEFAULT 4.6;
