-- Los 22 productos que la semilla recreó sola.
--
-- La siembra de 055 se protegía con ON CONFLICT contra el nombre. Mientras los nombres
-- fueran los sembrados alcanzaba, pero el maestro está hecho para editarse: apenas se
-- renombró "SANG. POLLO" a "Sandwich Pollo" dejó de haber conflicto y el siguiente
-- deploy los insertó de nuevo, al lado de los de verdad. El maestro pasó de 25 a 47.
--
-- 055 ya no siembra si la tabla tiene algo, así que esto no vuelve a pasar. Acá se
-- limpia lo que quedó.
--
-- El corte es por id y solo lo que nunca se contó: los recreados son del 51 al 75, y
-- lo que se agregue de ahora en más tiene id más alto. Así esta migración no se puede
-- comer un producto bueno si corre más tarde.
DELETE FROM cocina_productos p
WHERE p.id BETWEEN 51 AND 75
  AND NOT EXISTS (SELECT 1 FROM cocina_lotes l WHERE l.producto_id = p.id);
