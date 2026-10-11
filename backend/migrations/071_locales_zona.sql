-- Zona de un local: un local abierto al lado de otro se analiza junto con él (Sheraton está
-- a 100 metros de Amigorena y se abrió para que nadie más entre al hotel). En la solapa
-- Crecimiento del dashboard, los locales de una misma zona se comparan como uno solo.
-- NULL = el local es su propia zona.
ALTER TABLE locales ADD COLUMN IF NOT EXISTS zona_de INTEGER REFERENCES locales(id);

UPDATE locales SET zona_de = (SELECT id FROM locales WHERE nombre = 'Amigorena Tienda de Alfajores')
WHERE nombre = 'Sheraton Tienda de Alfajores' AND zona_de IS NULL;
