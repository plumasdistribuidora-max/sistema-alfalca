-- Cuando se da de baja un usuario, el empleado tiene que quedar libre para que se le
-- pueda crear otro (por ejemplo si el mail quedó mal cargado). El histórico de reportes
-- sigue apuntando al usuario viejo, que no se borra. Solo se exige un usuario ACTIVO
-- por empleado.

DROP INDEX IF EXISTS idx_usuarios_empleado;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_empleado_activo ON usuarios(empleado_id)
  WHERE empleado_id IS NOT NULL AND activo = true;
