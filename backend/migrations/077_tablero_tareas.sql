-- Tablero de tareas en kanban (23/10/2026).
--
-- La lista de tareas pasa a ser un tablero de tres columnas: Sin empezar, En proceso y
-- Esperando cierre. Lo cerrado sale del tablero y queda en el registro. Para eso hacen
-- falta tres cosas que hoy no se guardan:
--   · qué vio cada uno, para remarcar en azul lo que comentaron o cambiaron otros;
--   · el área de cada tarea (Ventas, CMV, Personal…), para filtrar;
--   · la prioridad que le pone el dueño al cargarla.

-- La última vez que cada persona abrió cada tarea. Lo que hizo otro después, está sin leer.
CREATE TABLE IF NOT EXISTS tarea_vistas (
  usuario_id  INT          NOT NULL REFERENCES usuarios(id),
  tarea_id    INT          NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  visto_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, tarea_id)
);

-- Arranca con todo visto: si no, el primer día todas las tareas viejas saldrían en azul.
INSERT INTO tarea_vistas (usuario_id, tarea_id, visto_at)
SELECT u.id, t.id, NOW()
FROM usuarios u CROSS JOIN tareas t
WHERE u.activo AND u.rol IN ('admin', 'encargado_general')
ON CONFLICT DO NOTHING;

-- Vacía en las que levanta el sistema: el área sale del tipo (utils/tareas.js). El dueño
-- la elige cuando carga una tarea.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS area VARCHAR(20);
ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_area_check;
ALTER TABLE tareas ADD CONSTRAINT tareas_area_check
  CHECK (area IS NULL OR area IN ('ventas', 'cmv', 'personal', 'gastos_fijos', 'marketing', 'operacion', 'administracion'));

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS prioridad VARCHAR(10);
ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_prioridad_check;
ALTER TABLE tareas ADD CONSTRAINT tareas_prioridad_check
  CHECK (prioridad IS NULL OR prioridad IN ('alta', 'media', 'baja'));
