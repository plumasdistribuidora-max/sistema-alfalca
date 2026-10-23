-- La tabla que arma Claudia con los números de una respuesta: de ahí salen el Excel y el PDF
-- que se bajan desde el chat. Las respuestas que son solo texto no tienen.

ALTER TABLE asistente_preguntas ADD COLUMN IF NOT EXISTS tabla JSONB;
