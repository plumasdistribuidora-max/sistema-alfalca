-- Estados de resultados anteriores a 2026, tal cual estaban en los Excel de Martín.
--
-- Hasta 2025 cada local llevaba su EERR en una planilla ("Info Financiera …"). Esos números
-- se guardan acá sin recalcular nada: para un mes que tiene histórico, el EERR muestra este
-- y no el que arma el sistema con las ventas. Desde 2026 se arma todo con el cálculo nuevo.
--
-- datos: {
--   ventas:    [{ nombre, monto }],
--   cmv:       [{ nombre, monto, pct }],
--   margen_bruto,
--   gastos:    [{ nombre, monto }],  gastos_total,
--   ebitda,
--   otros:     [{ nombre, monto }],   amortizaciones, extraordinarios y financieros; los egresos en negativo
--   ebt,
--   impuestos: [{ nombre, monto, pct }],
--   resultado
-- }
CREATE TABLE IF NOT EXISTS eerr_historico (
  local_id    INTEGER     NOT NULL REFERENCES locales(id),
  mes         CHAR(7)     NOT NULL,              -- 'YYYY-MM'
  datos       JSONB       NOT NULL,
  fuente      TEXT,                              -- archivo y hoja de donde salió
  cargado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (local_id, mes)
);
