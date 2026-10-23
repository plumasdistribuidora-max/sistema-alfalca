-- La semana de Pepa como calendario de tareas (23/10/2026).
--
-- Martín: "más que un reporte es un calendario con tareas, y los reportes son sobre la tarea
-- que tiene que hacer para ir demostrando que la hizo". Dos clases de tarea:
--   · visitar comercios nuevos: los dueños dicen cuántos por semana, y cada visita lleva los
--     datos del comercio, cómo le fue y la foto de la puerta del local;
--   · contactar a clientes que ya compraron: el calendario le dice a quién y cuándo.
-- Cada reporte lo aprueba un dueño, o se lo devuelve pidiéndole algo más.

ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS tipo VARCHAR(12) NOT NULL DEFAULT 'seguimiento';
ALTER TABLE senzen_contactos DROP CONSTRAINT IF EXISTS senzen_contactos_tipo_check;
ALTER TABLE senzen_contactos ADD CONSTRAINT senzen_contactos_tipo_check CHECK (tipo IN ('nuevo', 'seguimiento'));
ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS comentario TEXT;
ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS tarea_id INT REFERENCES senzen_tareas(id);
-- pendiente: espera a un dueño · aprobado · devuelto: el dueño le pidió algo más y ella lo corrige.
ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS aprobacion VARCHAR(12) NOT NULL DEFAULT 'pendiente';
ALTER TABLE senzen_contactos DROP CONSTRAINT IF EXISTS senzen_contactos_aprobacion_check;
ALTER TABLE senzen_contactos ADD CONSTRAINT senzen_contactos_aprobacion_check CHECK (aprobacion IN ('pendiente', 'aprobado', 'devuelto'));
ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS aprobado_por INT REFERENCES usuarios(id);
ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ;
ALTER TABLE senzen_contactos ADD COLUMN IF NOT EXISTS respuesta TEXT;     -- lo que le pidió el dueño al devolverlo
CREATE INDEX IF NOT EXISTS senzen_contactos_aprobacion ON senzen_contactos (aprobacion) WHERE aprobacion <> 'aprobado';

-- Los resultados nuevos: los de la visita a un comercio nuevo y los del seguimiento.
ALTER TABLE senzen_contactos DROP CONSTRAINT IF EXISTS senzen_contactos_resultado_check;
ALTER TABLE senzen_contactos ADD CONSTRAINT senzen_contactos_resultado_check CHECK (resultado IN (
  'pedido', 'va_a_comprar', 'volver', 'no_compro',            -- los de antes
  'le_intereso', 'no_le_interesa',                            -- visita a un comercio nuevo
  'sin_respuesta', 'no_quiere'                                -- seguimiento
));

-- Lo que el dueño quiere que averigüe en un encargo.
ALTER TABLE senzen_tareas ADD COLUMN IF NOT EXISTS nota TEXT;

-- Cuántos comercios nuevos tiene que visitar cada semana. Si una semana no tiene, vale la
-- meta general (parametros senzen_meta_nuevos).
CREATE TABLE IF NOT EXISTS senzen_semanas (
  desde         DATE         PRIMARY KEY,          -- el lunes
  meta_nuevos   INT          NOT NULL CHECK (meta_nuevos >= 0),
  cambiada_por  INT          REFERENCES usuarios(id),
  cambiada_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
