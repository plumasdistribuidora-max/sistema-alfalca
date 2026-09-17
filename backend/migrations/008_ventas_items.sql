CREATE TABLE IF NOT EXISTS ventas_items (
  id                       SERIAL PRIMARY KEY,
  local_id                 INT REFERENCES locales(id),
  ticket_id                INT REFERENCES ventas_tickets(id),
  pos_ticket_id            INT NOT NULL,
  producto_id              INT REFERENCES productos_catalogo(id),
  producto_nombre_raw      TEXT NOT NULL,
  categoria_raw            TEXT,
  cantidad                 NUMERIC(8,2) NOT NULL,
  precio_unit              NUMERIC(12,2),
  precio_total             NUMERIC(14,2),
  costo_base               NUMERIC(12,2) DEFAULT 0,
  costo_modificadores      NUMERIC(12,2) DEFAULT 0,
  costo_total              NUMERIC(12,2) DEFAULT 0,
  empleado                 TEXT,
  fecha_creacion           TIMESTAMPTZ,
  cocina                   TEXT,
  cancelada                BOOLEAN DEFAULT false,
  cancelada_por            TEXT,
  comentario               TEXT,
  comentario_cancelacion   TEXT,
  docenas_equivalentes     NUMERIC(10,4) DEFAULT 0,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  -- Renglón N-ésimo entre los idénticos de una venta (mismo producto y misma hora).
  -- Fudo trae "3 cafés" como 3 renglones iguales; sin esto se perdían dos. Ver 047.
  linea                    SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ventas_items_local_fecha ON ventas_items(local_id, fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_ventas_items_producto    ON ventas_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_items_empleado    ON ventas_items(empleado);
-- La clave única incluye "linea" desde 047. El índice viejo (sin linea) se borra allá.
ALTER TABLE ventas_items ADD COLUMN IF NOT EXISTS linea SMALLINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_items_unique_linea
  ON ventas_items(local_id, pos_ticket_id, producto_nombre_raw, fecha_creacion, linea);
