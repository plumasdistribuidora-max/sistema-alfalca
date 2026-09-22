-- Borrón y cuenta nueva en mantenimiento.
--
-- Los seis pendientes que había venían de antes de la regla de "un problema por
-- renglón": cuatro de los seis traían varios problemas metidos en uno ("piso,
-- paredes, tapa del baño urg, canasta black"). Arrastrarlos con el formulario nuevo
-- no sirve: no tienen rubro, no se pueden separar solos y obligan a los turnos a
-- contestar todos los días por un texto que no se puede arreglar.
--
-- Se borran, y hoy se vuelve a reportar bien desde cero.
--
-- El corte es por id y no por fecha a propósito: los ítems viejos son del 7 al 12, y
-- lo que se cargue hoy con el formulario nuevo tiene id más alto. Así esta migración
-- no se puede comer nada bueno si corre más tarde, en un deploy posterior.

-- Paso 1: sacar de los reportes las referencias a esos ítems, y SOLO a esos. Un
-- reporte que ya tenga algo nuevo lo conserva.
UPDATE reportes r SET
  respuestas = jsonb_set(r.respuestas, '{mantenimiento}', jsonb_build_object(
    'seguimiento', COALESCE((
      SELECT jsonb_object_agg(k, v)
      FROM jsonb_each(COALESCE(r.respuestas->'mantenimiento'->'seguimiento', '{}'::jsonb)) AS e(k, v)
      WHERE k ~ '^[0-9]+$' AND k::int > 12
    ), '{}'::jsonb),
    'nuevos', COALESCE((
      SELECT jsonb_agg(n)
      FROM jsonb_array_elements(COALESCE(r.respuestas->'mantenimiento'->'nuevos', '[]'::jsonb)) AS n
      WHERE COALESCE(NULLIF(n->>'item_id', '')::int, 0) > 12
    ), '[]'::jsonb)
  )),
  updated_at = NOW()
WHERE jsonb_typeof(r.respuestas->'mantenimiento') = 'object'
  AND (
    EXISTS (
      SELECT 1 FROM jsonb_object_keys(COALESCE(r.respuestas->'mantenimiento'->'seguimiento', '{}'::jsonb)) AS k
      WHERE k ~ '^[0-9]+$' AND k::int <= 12
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.respuestas->'mantenimiento'->'nuevos', '[]'::jsonb)) AS n
      WHERE COALESCE(NULLIF(n->>'item_id', '')::int, 0) BETWEEN 1 AND 12
    )
  );

-- Paso 2: los ítems.
DELETE FROM mantenimiento_items WHERE id <= 12;
