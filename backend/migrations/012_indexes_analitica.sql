-- Indexes adicionales para performance de queries analíticas

CREATE INDEX IF NOT EXISTS idx_vi_local_cancelada
  ON ventas_items(local_id, cancelada);

CREATE INDEX IF NOT EXISTS idx_vi_local_empleado
  ON ventas_items(local_id, empleado);

CREATE INDEX IF NOT EXISTS idx_vi_fecha_creacion
  ON ventas_items(fecha_creacion);

CREATE INDEX IF NOT EXISTS idx_vi_local_fecha_cancelada
  ON ventas_items(local_id, fecha_creacion, cancelada);

CREATE INDEX IF NOT EXISTS idx_vd_local_fecha
  ON ventas_descuentos(local_id, fecha_descuento);

CREATE INDEX IF NOT EXISTS idx_vf_local_fecha
  ON ventas_fiscales(local_id, fecha_creacion);

CREATE INDEX IF NOT EXISTS idx_vf_local_tipo_letra
  ON ventas_fiscales(local_id, tipo_doc, letra_doc);
