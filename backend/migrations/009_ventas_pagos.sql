CREATE TABLE IF NOT EXISTS ventas_pagos (
  id             SERIAL PRIMARY KEY,
  local_id       INT,
  ticket_id      INT REFERENCES ventas_tickets(id),
  pos_ticket_id  INT NOT NULL,
  medio_pago     TEXT NOT NULL,
  monto          NUMERIC(14,2) NOT NULL,
  fecha_pago     TIMESTAMPTZ,
  cancelado      BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_local_fecha ON ventas_pagos(local_id, fecha_pago);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_unique
  ON ventas_pagos(local_id, pos_ticket_id, medio_pago, monto, fecha_pago);
