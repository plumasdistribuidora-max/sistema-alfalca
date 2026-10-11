-- El "precio" de la hoja Adiciones de Fudo ya es el total del renglón, pero el import
-- guardaba precio_total = cantidad × precio. Ej.: 300 cajas x 2 del 27/02/2026 en la
-- Peatonal figuraban $477.000.000 en un ticket de $1.380.000. Inflaba el EERR del Café
-- por rubro, la facturación por producto y los montos del catálogo y de cancelaciones.
-- precio_unit siempre guardó el valor del Excel tal cual, así que es el total correcto.
-- Se puede correr más de una vez: solo toca las filas que todavía están mal.
UPDATE ventas_items
SET precio_total = precio_unit
WHERE precio_total IS DISTINCT FROM precio_unit;
