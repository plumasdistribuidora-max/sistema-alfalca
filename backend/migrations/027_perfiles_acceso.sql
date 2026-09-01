-- Etapa 1 del módulo de reportes: perfiles de acceso.
--
-- Pasa usuarios.rol de enum a VARCHAR con CHECK. El enum obliga a ALTER TYPE ADD VALUE,
-- que no se puede usar en la misma transacción en que se agrega — y migrate.js corre cada
-- archivo como una sola query, o sea una transacción implícita. Con VARCHAR + CHECK,
-- sumar un rol más adelante es una línea.
--
-- 'admin' se mantiene como código del rol de dueño a propósito: hay chequeos de
-- rol = 'admin' repartidos por todo el backend y el sidebar. En la UI se muestra "Dueño".

ALTER TABLE usuarios ALTER COLUMN rol DROP DEFAULT;
ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(30) USING rol::text;

UPDATE usuarios SET rol = 'encargado_general' WHERE rol = 'encargado';

ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'empleado_tienda';

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN (
  'admin',              -- Dueño
  'encargado_general',
  'empleado_tienda',
  'encargado_cafe',
  'encargado_cocina'
));

-- Ata el usuario a su legajo de empleado. Los dueños no tienen empleado asociado.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empleado_id INT REFERENCES empleados(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_empleado ON usuarios(empleado_id)
  WHERE empleado_id IS NOT NULL;

-- Área de trabajo del empleado: define qué formulario le toca cargar.
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS area VARCHAR(20) NOT NULL DEFAULT 'tienda';
ALTER TABLE empleados DROP CONSTRAINT IF EXISTS empleados_area_check;
ALTER TABLE empleados ADD CONSTRAINT empleados_area_check CHECK (area IN (
  'tienda', 'cafe', 'cocina', 'general'
));

-- Los empleados de la cafetería arrancan con area = 'cafe' en vez del default.
UPDATE empleados e
SET area = 'cafe'
FROM locales l
WHERE l.id = e.local_id_principal
  AND l.tipo = 'cafeteria'
  AND e.area = 'tienda';

CREATE INDEX IF NOT EXISTS idx_empleados_area ON empleados(area, activo);
