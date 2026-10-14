-- Proveedores, entrega 1 (14/10/2026): la factura llega con foto y se avisa si parece
-- repetida.
--
-- La foto va en facturas.r2_key, que existía desde la 029 y nunca se usó. Acá se suma
-- el tipo de archivo, que hace falta para devolverla.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS foto_mime VARCHAR(50);

-- "Es otra": el encargado miró las dos y no son la misma. Alcanza con marcar una para
-- que el par deje de avisar.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS repetida_ok BOOLEAN NOT NULL DEFAULT false;

-- El número de factura escrito de cualquier forma, llevado a "punto de venta-número"
-- sin ceros adelante, para comparar: "0027-0001368", "00027-00001368" y "A 0027-1368"
-- dan "27-1368". Los doce o trece dígitos pegados ("002700013674") se parten con los
-- últimos ocho como número. Lo que no tiene punto de venta queda sin guion, y ese no
-- sirve para comparar: Club de Campo numera 10, 19, 89 y repite los números entre años.
CREATE OR REPLACE FUNCTION factura_numero_clave(n text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN n IS NULL OR btrim(n) = '' THEN NULL
    WHEN n ~ '^\D*\d+\D+\d+\D*$' THEN
      COALESCE(NULLIF(ltrim(substring(n FROM '(\d+)\D+\d+'), '0'), ''), '0') || '-' ||
      COALESCE(NULLIF(ltrim(substring(n FROM '\d+\D+(\d+)'), '0'), ''), '0')
    WHEN n ~ '^\d{12,13}$' THEN
      COALESCE(NULLIF(ltrim(left(n, length(n) - 8), '0'), ''), '0') || '-' ||
      COALESCE(NULLIF(ltrim(right(n, 8), '0'), ''), '0')
    WHEN n ~ '\d' THEN COALESCE(NULLIF(ltrim(regexp_replace(n, '\D', '', 'g'), '0'), ''), '0')
    ELSE NULL
  END
$$;
