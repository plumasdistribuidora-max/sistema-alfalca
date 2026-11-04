-- Cuánto café entró en el día.
--
-- El consumo es el pesaje de la mañana menos el de la tarde. Si entre los dos llega el
-- pedido (12 kg, los miércoles), la tarde pesa más que la mañana, el consumo da negativo
-- y salta "El café no cierra". Pasó el 14, el 21 y el 28/10.
--
-- Lo carga a mano el barista de la tarde, no se suma solo: el pedido a veces no llega,
-- y sumar kilos que no entraron taparía un faltante real. Es obligatorio para que el 0
-- sea una respuesta y no un olvido. La mañana no lo ve: lo que llegó antes de su pesaje
-- ya está adentro.

UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(c ORDER BY ord)
    FROM (
      SELECT ord, c FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
      UNION ALL
      -- Va justo abajo del pesaje.
      SELECT t.ord + 0.5,
             '{"codigo":"cafe_llego_kg","tipo":"decimal","min":0,
               "label":"¿Cuántos kilos de café llegaron hoy?",
               "ayuda":"Lo que entró después del pesaje de la mañana. Si hoy no llegó pedido, poné 0.",
               "requerido":true,
               "solo_si":{"codigo":"turno","vale":"Tarde"}}'::jsonb
      FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
      WHERE t.c->>'tipo' = 'pesaje_cafe'
    ) AS z(ord, c)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE p.codigo = 'barista'
  AND p.campos @> '[{"tipo":"pesaje_cafe"}]'::jsonb
  AND NOT p.campos @> '[{"codigo":"cafe_llego_kg"}]'::jsonb;
