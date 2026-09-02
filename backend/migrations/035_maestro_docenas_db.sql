-- Maestro de docenas en base de datos (reemplaza el Excel en R2).
--
-- El cambio de fondo: docenas_por_unidad pasa a admitir NULL, para distinguir
-- tres estados que antes se confundían en un solo 0:
--   NULL  → nunca se definió; el producto está pendiente y hay que cargarlo
--   0     → definido: no suma docenas (Alimendos, insumos, packaging, promos)
--   > 0   → definido: suma esa cantidad de docenas por unidad vendida

-- ── PASO 1: unificar la normalización de nombres ────────────────────────────
-- Hasta ahora convivían dos normalizaciones distintas: la del maestro colapsaba
-- espacios dobles y el espacio duro, la que armaba la clave del catálogo no.
-- Eso generó filas separadas para el mismo producto ("alfajor  black" vs
-- "alfajor black"). Acá se aplica la normalización definitiva y se fusionan las
-- filas que colisionan, quedándose con la que ya tenía docenas cargadas.

DROP TABLE IF EXISTS _clave_nueva;
DROP TABLE IF EXISTS _fusion;

CREATE TEMP TABLE _clave_nueva AS
SELECT
  id,
  btrim(regexp_replace(replace(nombre_normalizado, U&'\00A0', ' '), '\s+', ' ', 'g')) AS clave,
  docenas_por_unidad
FROM productos_catalogo;

CREATE TEMP TABLE _fusion AS
WITH ganador AS (
  SELECT DISTINCT ON (clave)
         clave, id AS keep_id
  FROM _clave_nueva
  -- gana la fila que ya tiene un valor cargado; a igualdad, la más vieja
  ORDER BY clave, (COALESCE(docenas_por_unidad, 0) > 0) DESC, id
)
SELECT c.id AS dup_id, g.keep_id
FROM _clave_nueva c
JOIN ganador g USING (clave)
WHERE c.id <> g.keep_id;

UPDATE ventas_items vi
SET producto_id = f.keep_id
FROM _fusion f
WHERE vi.producto_id = f.dup_id;

DELETE FROM productos_catalogo pc
USING _fusion f
WHERE pc.id = f.dup_id;

UPDATE productos_catalogo
SET nombre_normalizado = btrim(regexp_replace(replace(nombre_normalizado, U&'\00A0', ' '), '\s+', ' ', 'g'))
WHERE nombre_normalizado <> btrim(regexp_replace(replace(nombre_normalizado, U&'\00A0', ' '), '\s+', ' ', 'g'));

DROP TABLE IF EXISTS _clave_nueva;
DROP TABLE IF EXISTS _fusion;

-- ── PASO 2: tres estados para docenas_por_unidad ────────────────────────────

ALTER TABLE productos_catalogo ALTER COLUMN docenas_por_unidad DROP DEFAULT;
ALTER TABLE productos_catalogo ALTER COLUMN docenas_por_unidad DROP NOT NULL;

ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS docenas_origen       TEXT;
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS docenas_definido_por TEXT;
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS docenas_definido_at  TIMESTAMPTZ;
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS docenas_nota         TEXT;

-- Los que ya tenían un valor cargado se conservan tal cual y quedan definidos.
UPDATE productos_catalogo
SET docenas_origen       = 'excel',
    docenas_definido_at  = COALESCE(updated_at, NOW()),
    docenas_definido_por = 'Maestro Excel (migrado)'
WHERE docenas_por_unidad > 0
  AND docenas_origen IS NULL;

-- Los que están en 0 son ambiguos ("no suma" vs "nunca lo cargué"):
-- pasan a pendientes para definirlos una sola vez.
UPDATE productos_catalogo
SET docenas_por_unidad = NULL,
    regla_descripcion  = 'Pendiente de definir'
WHERE COALESCE(docenas_por_unidad, 0) = 0
  AND docenas_origen IS NULL;

CREATE INDEX IF NOT EXISTS idx_productos_catalogo_pendientes
  ON productos_catalogo (id) WHERE docenas_por_unidad IS NULL;
