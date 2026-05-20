CREATE TABLE IF NOT EXISTS ventas_fiscales (
  id                   SERIAL PRIMARY KEY,
  local_id             INT,
  ticket_id            INT REFERENCES ventas_tickets(id),
  pos_ticket_id        INT NOT NULL,
  tipo_doc             TEXT,
  letra_doc            TEXT,
  numero_doc           TEXT,
  condicion_iva        TEXT,
  nombre_cliente       TEXT,
  cuit_cliente         TEXT,
  total_sin_impuestos  NUMERIC(14,2),
  total_iva            NUMERIC(14,2),
  total                NUMERIC(14,2),
  iva_105              NUMERIC(14,2),
  iva_21               NUMERIC(14,2),
  fecha_creacion       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscales_unique
  ON ventas_fiscales(local_id, pos_ticket_id, numero_doc);
