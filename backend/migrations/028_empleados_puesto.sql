-- No todo el que trabaja carga un reporte.
--
-- En el café, de un turno de siete personas solo dos reportan: la encargada de turno
-- y la de cocina. El mozo, el barista, la bacha y el refuerzo trabajan, sus horas cuentan
-- para el legajo y para el KPI de personal, pero no entran al sistema.
--
-- Por eso "carga_reporte" es un campo propio y no algo que se deduzca del área: el área
-- dice QUÉ formulario le tocaría, este campo dice SI le toca alguno.

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS puesto VARCHAR(50);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS carga_reporte BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN empleados.puesto IS
  'Puesto de la grilla de turnos: encargado, barista, cocina, ref cocina, mozo, bacha, refuerzo, vendedor';
COMMENT ON COLUMN empleados.carga_reporte IS
  'Si false, el empleado no necesita usuario: se le cargan horas y turnos pero no entra al sistema';

CREATE INDEX IF NOT EXISTS idx_empleados_carga_reporte
  ON empleados(carga_reporte, activo);
