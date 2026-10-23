-- Tablero de dueños (23/10/2026).
--
-- Los dueños se organizan con el mismo método que el encargado: cada mes, cada unidad de
-- negocio se pone un objetivo de rentabilidad y lo baja a microobjetivos (las palancas:
-- bajar CMV, una acción de marketing, ajustar horas…), cada uno con un solo dueño
-- responsable. Cada dueño arma sus tareas para cumplirlo y, si necesita ayuda, le carga
-- tareas al encargado. Este tablero es solo de los dueños: el encargado no lo ve.
--
-- Las tareas de los dueños van aparte de `tareas`: esas nacen de los reportes, tienen
-- relojes, gastos y causas conocidas, y alimentan los números del encargado.

-- Negocio: entre_dos (con la unidad en local_id o local_ids), kankay, senzen o general.
CREATE TABLE IF NOT EXISTS microobjetivos (
  id          SERIAL       PRIMARY KEY,
  nombre      TEXT         NOT NULL,
  dueno_id    INT          NOT NULL REFERENCES usuarios(id),
  negocio     VARCHAR(20)  NOT NULL CHECK (negocio IN ('entre_dos', 'kankay', 'senzen', 'general')),
  -- Un microobjetivo puede atacar una unidad de Entre Dos o varias a la vez.
  local_ids   INT[]        NOT NULL DEFAULT '{}',
  area        VARCHAR(20)  NOT NULL,
  meta        TEXT,                                   -- "CMV de 38 % a 37 %"
  mes         DATE         NOT NULL,                  -- primer día del mes del objetivo
  semaforo    VARCHAR(10)  CHECK (semaforo IN ('verde', 'amarillo', 'rojo')),
  nota        TEXT,                                   -- la nota de la semana
  nota_at     TIMESTAMPTZ,
  activo      BOOLEAN      NOT NULL DEFAULT true,
  creado_por  INT          REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_micro_mes ON microobjetivos(mes) WHERE activo;

CREATE TABLE IF NOT EXISTS tareas_duenos (
  id               SERIAL       PRIMARY KEY,
  titulo           TEXT         NOT NULL,
  detalle          TEXT,
  responsable_id   INT          NOT NULL REFERENCES usuarios(id),
  negocio          VARCHAR(20)  NOT NULL CHECK (negocio IN ('entre_dos', 'kankay', 'senzen', 'general')),
  local_id         INT          REFERENCES locales(id),
  area             VARCHAR(20)  NOT NULL,
  microobjetivo_id INT          REFERENCES microobjetivos(id),
  plazo            DATE,
  prioridad        VARCHAR(10)  CHECK (prioridad IN ('alta', 'media', 'baja')),
  -- Las mismas columnas que el encargado: nueva → en_curso → por_aprobar → terminada.
  estado           VARCHAR(20)  NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'en_curso', 'por_aprobar', 'terminada')),
  creada_por       INT          REFERENCES usuarios(id),
  pedido_cierre_at TIMESTAMPTZ,
  terminada_por    INT          REFERENCES usuarios(id),
  terminada_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tdu_estado ON tareas_duenos(estado);
CREATE INDEX IF NOT EXISTS idx_tdu_micro  ON tareas_duenos(microobjetivo_id);

-- El seguimiento: comentarios y cada cambio. No se edita ni se borra.
CREATE TABLE IF NOT EXISTS tarea_duenos_eventos (
  id          SERIAL       PRIMARY KEY,
  tarea_id    INT          NOT NULL REFERENCES tareas_duenos(id) ON DELETE CASCADE,
  usuario_id  INT          REFERENCES usuarios(id),
  -- creada | comentario | mov | fecha | cambio | pidio_cierre | cerrada | devuelta
  tipo        VARCHAR(30)  NOT NULL,
  texto       TEXT,
  datos       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tdu_eventos ON tarea_duenos_eventos(tarea_id, created_at);

CREATE TABLE IF NOT EXISTS tarea_duenos_vistas (
  usuario_id  INT          NOT NULL REFERENCES usuarios(id),
  tarea_id    INT          NOT NULL REFERENCES tareas_duenos(id) ON DELETE CASCADE,
  visto_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, tarea_id)
);

-- Una tarea que un dueño le carga al encargado puede colgar de un microobjetivo suyo.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS microobjetivo_id INT REFERENCES microobjetivos(id);
