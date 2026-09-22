-- El conteo de cocina no es igual en los dos turnos.
--
-- Del freezer saca cosas una sola persona: la encargada general, que está a la mañana.
-- Y lo que baja no sirve ese día, sirve al siguiente. Así que el conteo completo va a
-- la mañana, pegado a la bajada: contás, el sistema te dice qué mover, lo movés. Es
-- una sola acción y la hace quien se hace cargo.
--
-- A la tarde no tiene sentido repetir los 25: sale peor y lleva veinte minutos. Va un
-- repaso de los pocos que hay que mirar, y ése es el que después dice en qué turno se
-- perdió algo.
UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(
      CASE WHEN c->>'codigo' = 'stock_cocina'
           THEN c || '{"por_turno":{
                  "Mañana":{"label":"Control de stock",
                            "ayuda":"Contá todo, lote por lote. Cuando termines te digo qué bajar del freezer para mañana."},
                  "Tarde":{"label":"Repaso de stock",
                           "ayuda":"Solo estos, que son los que hay que mirar hoy: los que están por vencer y los que quedaron bajos."}}}'::jsonb
           ELSE c END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE p.codigo = 'cocina'
  AND p.campos @> '[{"codigo":"stock_cocina"}]'::jsonb
  AND NOT p.campos @> '[{"codigo":"stock_cocina","por_turno":{}}]'::jsonb;
