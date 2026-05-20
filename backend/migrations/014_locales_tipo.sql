ALTER TABLE locales ADD COLUMN IF NOT EXISTS es_alfajorera BOOLEAN DEFAULT true;

UPDATE locales SET es_alfajorera = false
WHERE nombre ILIKE '%café%' OR nombre ILIKE '%cafe%';
