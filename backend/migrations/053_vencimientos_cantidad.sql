-- El check de vencimientos pide también cuántos son.
--
-- Saber que el alfajor de café vence en quince días no alcanza para decidir nada: dos
-- unidades se venden solas, treinta necesitan una promo. La cantidad es lo que
-- convierte el aviso en una decisión.
--
-- Solo cambia el texto que ve el empleado; el dato viaja en el JSONB del reporte, que
-- no tiene forma fija. Idempotente: corre sobre la plantilla que ya es del tipo nuevo.
UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(
      CASE WHEN c->>'codigo' = 'vencimientos' AND c->>'tipo' = 'vencimientos'
           THEN c || jsonb_build_object(
                  'label_lista', 'Qué producto, cuántos hay y qué fecha dice el paquete',
                  'ayuda',       'Elegí el producto de la lista, contá cuántos quedan y cargá la fecha impresa. Los días los saca el sistema.'
                )
           ELSE c END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE campos @> '[{"codigo":"vencimientos","tipo":"vencimientos"}]'::jsonb
  AND NOT campos @> '[{"codigo":"vencimientos","label_lista":"Qué producto, cuántos hay y qué fecha dice el paquete"}]'::jsonb;
