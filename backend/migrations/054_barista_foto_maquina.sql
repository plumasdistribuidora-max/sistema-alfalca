-- Si el barista dice que no recibió la máquina en orden, tiene que mostrarla.
--
-- Hasta ahora ese "No" era una palabra sola: el turno siguiente decía que la recibió
-- sucia y no quedaba nada que mirar, así que era la palabra de uno contra la del otro
-- y no se podía corregir a nadie. Con la foto el reclamo deja de ser una opinión.
--
-- El campo cuelga del sí/no con "solo_si": aparece únicamente cuando la respuesta es
-- No, y mientras no se vea tampoco se pide, así el que la recibió bien no queda
-- trabado. La regla es genérica y vive en la plantilla: colgar cualquier pregunta de
-- otra no toca código.

UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(c ORDER BY ord)
    FROM (
      SELECT ord, c FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
      UNION ALL
      -- Va con la posición del sí/no más un medio: cae justo abajo y antes del pesaje.
      SELECT t.ord + 0.5,
             '{"codigo":"foto_maquina","tipo":"foto","label":"Foto de cómo la recibiste","max":3,
               "ayuda":"Sacale una foto a lo que está sucio o fuera de lugar. Es lo que le vamos a mostrar al turno anterior.",
               "requerido":true,
               "solo_si":{"codigo":"maquina_ok","vale":false}}'::jsonb
      FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
      WHERE t.c->>'codigo' = 'maquina_ok'
    ) AS z(ord, c)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE p.codigo = 'barista'
  AND p.campos @> '[{"codigo":"maquina_ok"}]'::jsonb
  AND NOT p.campos @> '[{"codigo":"foto_maquina"}]'::jsonb;
