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
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ventas_items_local_fecha ON ventas_items(local_id, fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_ventas_items_producto    ON ventas_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_items_empleado    ON ventas_items(empleado);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_items_unique
  ON ventas_items(local_id, pos_ticket_id, producto_nombre_raw, fecha_creacion);
