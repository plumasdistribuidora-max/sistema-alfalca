-- Las facturas que vienen de una planilla (el histórico del café en KPI E2.xlsx) quedan
-- marcadas con de dónde salieron: hoja y fila. Sirve para revisar una contra el Excel y
-- para deshacer una importación entera si hizo falta.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS importado_de VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_facturas_importado ON facturas(importado_de);
