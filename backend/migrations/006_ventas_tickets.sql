CREATE TABLE IF NOT EXISTS ventas_tickets (
  id                SERIAL PRIMARY KEY,
  local_id          INT NOT NULL REFERENCES locales(id),
  pos_id            INT NOT NULL,
  fecha             DATE NOT NULL,
  creacion          TIMESTAMPTZ,
  cerrada           TIMESTAMPTZ,
  caja              VARCHAR(100),
  estado            estado_ticket NOT NULL,
  cliente           VARCHAR(255),
  mesa              VARCHAR(50),
  sala              VARCHAR(50),
  personas          INT,
  camarero_pos      VARCHAR(255),
  empleado_id       INT REFERENCES empleados(id),
  medio_pago        VARCHAR(100),
  total             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fiscal            BOOLEAN NOT NULL DEFAULT false,
  tipo_venta        VARCHAR(100),
  comentario        TEXT,
  origen            VARCHAR(100),
  id_origen         VARCHAR(100),
  archivo_import_id INT REFERENCES imports_log(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(local_id, pos_id)
);

CREATE INDEX IF NOT EXISTS idx_vt_local_fecha    ON ventas_tickets(local_id, fecha);
CREATE INDEX IF NOT EXISTS idx_vt_estado         ON ventas_tickets(estado);
CREATE INDEX IF NOT EXISTS idx_vt_empleado       ON ventas_tickets(empleado_id);
CREATE INDEX IF NOT EXISTS idx_vt_fecha          ON ventas_tickets(fecha);
