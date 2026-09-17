-- Maestro de café: cuántos gramos de café lleva cada producto de la cafetería.
--
-- Con eso, lo que vendió el café en un día tiene un consumo teórico de café, y se
-- compara contra lo que pesaron los baristas al recibir y entregar cada turno.
--
-- Mismos tres estados que las docenas:
--   NULL → pendiente: nunca se definió (suma 0 al teórico y se avisa)
--   0    → definido: no lleva café (una medialuna, un jugo)
--   > 0  → gramos de café por unidad vendida
-- Vive en productos_catalogo porque el producto es el mismo que ya usa el resto; solo
-- se muestra para los que se venden en la cafetería.

ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS cafe_gramos       NUMERIC(8,2);
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS cafe_definido_por TEXT;
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS cafe_definido_at  TIMESTAMPTZ;
