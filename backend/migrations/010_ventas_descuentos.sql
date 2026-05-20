CREATE TABLE IF NOT EXISTS ventas_descuentos (
  id                SERIAL PRIMARY KEY,
  local_id          INT,
  ticket_id         INT REFERENCES ventas_tickets(id),
  pos_ticket_id     INT NOT NULL,
  valor             NUMERIC(12,2),
  porcentaje        NUMERIC(5,2),
  fecha_descuento   TIMESTAMPTZ,
  cancelado         BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
