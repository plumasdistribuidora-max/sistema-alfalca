-- "¿Hiciste el check de vencimientos?" → Sí significaba "hay productos por vencer" y
-- exigía la lista. Quien hacía el control y no encontraba nada quedaba trabado sin poder
-- enviar. Ahora el Sí abre una segunda pregunta y la lista se pide solo si esa también es sí.
UPDATE reporte_plantillas
SET campos = (
  SELECT jsonb_agg(
    CASE WHEN c->>'codigo' = 'vencimientos'
         THEN c || '{"pregunta_lista": "¿Hay productos que venzan en menos de 25 días?"}'::jsonb
         ELSE c END
    ORDER BY ord
  )
  FROM jsonb_array_elements(campos) WITH ORDINALITY AS t(c, ord)
),
version = version + 1, updated_at = NOW()
WHERE codigo = 'tienda'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(campos) c
    WHERE c->>'codigo' = 'vencimientos' AND c ? 'pregunta_lista'
  );
