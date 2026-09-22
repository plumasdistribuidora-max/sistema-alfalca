-- El control de stock de cocina deja de ser una foto.
--
-- Estaban la pregunta "¿Hiciste el control de stock?" y una foto obligatoria. Las dos
-- decían lo mismo: que alguien miró. Ninguna decía QUÉ hay, así que no se podía pedir
-- ni bajar nada. Se reemplazan por el conteo de verdad, que además es la prueba de
-- que se hizo.
--
-- La foto de la entrega del turno se queda: eso es otra cosa.
UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(c ORDER BY ord)
    FROM (
      SELECT ord,
             CASE WHEN c->>'codigo' = 'control_stock'
                  THEN '{"codigo":"stock_cocina","tipo":"stock_cocina","label":"Control de stock",
                         "ayuda":"Contá por fecha de vencimiento. Las fechas ya están; vos ponés cuántos hay de cada una, en el freezer y en la heladera.",
                         "requerido":true}'::jsonb
                  ELSE c END AS c
      FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
      WHERE c->>'codigo' <> 'foto_stock'
    ) AS z(ord, c)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE p.codigo = 'cocina'
  AND p.campos @> '[{"codigo":"control_stock"}]'::jsonb;

-- Los borradores abiertos pierden las respuestas de los campos que ya no existen.
UPDATE reportes SET
  respuestas = respuestas - 'control_stock' - 'foto_stock',
  updated_at = NOW()
WHERE plantilla_codigo = 'cocina' AND estado = 'borrador'
  AND respuestas ?| ARRAY['control_stock', 'foto_stock'];
