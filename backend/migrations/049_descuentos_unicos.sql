-- ventas_descuentos no tenía clave única, así que el ON CONFLICT DO NOTHING del import
-- no hacía nada y cada reimport volvía a insertar todos los descuentos del Excel. En
-- septiembre de 2026 el café llevaba trece imports y 2.166 filas para 439 descuentos
-- reales; en toda la tabla, 33.700 filas para 13.133 distintas. El reporte de descuentos
-- sumaba todas.
--
-- Se deja una sola fila por descuento (la que tiene ticket, si hay) y se crea la clave
-- única con NULLS NOT DISTINCT, porque valor o porcentaje pueden venir vacíos y sin eso
-- dos NULL no chocan. El import usa esta misma clave en su ON CONFLICT.

DELETE FROM ventas_descuentos d
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY local_id, pos_ticket_id, valor, porcentaje, fecha_descuento, cancelado
           ORDER BY (ticket_id IS NULL), id
         ) AS n
  FROM ventas_descuentos
) r
WHERE d.id = r.id AND r.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_descuentos_fila
  ON ventas_descuentos (local_id, pos_ticket_id, valor, porcentaje, fecha_descuento, cancelado)
  NULLS NOT DISTINCT;
