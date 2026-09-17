-- Renglones repetidos de una venta.
--
-- Cuando una mesa pide tres cafés grandes, el Excel de Fudo trae tres renglones
-- iguales: misma venta, mismo producto, misma hora al segundo. La clave única del
-- import (local, venta, producto, hora) los tomaba como el mismo renglón y descartaba
-- dos. En el café se perdía el 19% de los renglones; en las tiendas casi nada, porque
-- Fudo agrupa "6 alfajores" en un renglón con cantidad 6.
--
-- Se agrega "linea": el orden del renglón entre sus idénticos (0, 1, 2…), que sale
-- del orden del Excel y es estable entre exportaciones. Los renglones perdidos se
-- recuperan con backend/scripts/recuperar_renglones_repetidos.js.

ALTER TABLE ventas_items ADD COLUMN IF NOT EXISTS linea SMALLINT NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS idx_ventas_items_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_items_unique_linea
  ON ventas_items(local_id, pos_ticket_id, producto_nombre_raw, fecha_creacion, linea);
