-- No todo lo que entra por factura viene por unidad: el café que llega por kilo, la leche
-- por litro, la levadura por gramo. Sin la unidad, "2 a $ 8.000" no dice si son dos
-- paquetes o dos kilos, y el precio por producto no se puede comparar entre facturas.
-- El precio sigue siendo por una de esas unidades (el kilo, el litro, la pieza).
ALTER TABLE facturas_items ADD COLUMN IF NOT EXISTS unidad VARCHAR(5) NOT NULL DEFAULT 'u';

DO $$ BEGIN
  ALTER TABLE facturas_items ADD CONSTRAINT facturas_items_unidad_check
    CHECK (unidad IN ('u','kg','g','l','ml'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
