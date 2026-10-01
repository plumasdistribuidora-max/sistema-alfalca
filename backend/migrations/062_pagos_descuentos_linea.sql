-- Pagos y descuentos idénticos de una misma venta.
--
-- Una mesa del café que paga dos débitos de $7.000 en el mismo segundo trae dos
-- renglones iguales en la hoja Pagos. La clave única (local, venta, medio, monto, hora)
-- los tomaba como uno solo y descartaba el segundo: en septiembre de 2026 faltaban 6
-- pagos en el café y 3 en Peatonal. Con los descuentos pasa lo mismo.
--
-- Igual que ventas_items en 047: "linea" es el orden del renglón entre sus idénticos
-- (0, 1, 2…), según el orden del Excel.

ALTER TABLE ventas_pagos      ADD COLUMN IF NOT EXISTS linea SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE ventas_descuentos ADD COLUMN IF NOT EXISTS linea SMALLINT NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS idx_pagos_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_unique_linea
  ON ventas_pagos(local_id, pos_ticket_id, medio_pago, monto, fecha_pago, linea);

DROP INDEX IF EXISTS ux_ventas_descuentos_fila;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_descuentos_fila_linea
  ON ventas_descuentos (local_id, pos_ticket_id, valor, porcentaje, fecha_descuento, cancelado, linea)
  NULLS NOT DISTINCT;
