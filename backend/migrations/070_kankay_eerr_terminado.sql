-- El estado de resultados de un mes se da por terminado a mano: recién ahí se avisa a los
-- dueños. Cada cambio suelto ya no manda aviso.
ALTER TABLE kankay_eerr ADD COLUMN IF NOT EXISTS terminado_en  TIMESTAMPTZ;
ALTER TABLE kankay_eerr ADD COLUMN IF NOT EXISTS terminado_por INTEGER REFERENCES usuarios(id);
