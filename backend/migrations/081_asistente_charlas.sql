-- Las charlas con Claudia quedan guardadas: cada pregunta dice de qué charla es, así el dueño
-- puede volver a abrirla después de salir de la página. Las preguntas viejas, sin charla,
-- se muestran cada una como su propia charla.

ALTER TABLE asistente_preguntas ADD COLUMN IF NOT EXISTS charla TEXT;
CREATE INDEX IF NOT EXISTS asistente_preguntas_charla_idx ON asistente_preguntas (usuario_id, charla, id);
