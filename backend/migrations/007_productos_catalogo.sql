CREATE TABLE IF NOT EXISTS productos_catalogo (
  id                    SERIAL PRIMARY KEY,
  nombre_normalizado    TEXT UNIQUE NOT NULL,
  nombre_display        TEXT NOT NULL,
  categoria             TEXT,
  subcategoria          TEXT,
  codigo_pos            TEXT,
  docenas_por_unidad    NUMERIC(8,4) NOT NULL DEFAULT 0,
  es_adicional          BOOLEAN DEFAULT false,
  regla_descripcion     TEXT,
  precio_promedio       NUMERIC(12,2),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
