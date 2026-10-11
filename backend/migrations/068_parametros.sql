-- Valores sueltos que cambian a mano cada tanto. El primero: la inflación interanual
-- del INDEC, que el tablero de Entre Dos usa para mostrar las variaciones "sin
-- inflación". El dueño la actualiza desde el tablero cuando el INDEC publica el dato.
CREATE TABLE IF NOT EXISTS parametros (
  clave      VARCHAR(100) PRIMARY KEY,
  valor      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Agosto 2026: 33,5 % interanual (último dato publicado al 11/10/2026).
INSERT INTO parametros (clave, valor) VALUES
  ('ipc_interanual', '33.5'),
  ('ipc_mes',        '2026-08')
ON CONFLICT (clave) DO NOTHING;
