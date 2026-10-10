-- Los reportes pasan a ser tareas.
--
-- Hasta acá el encargado aprobaba reporte por reporte, devolvía con "dif" y cerraba el
-- día escribiendo explicaciones para los dueños. Era un informe, no gestión: viernes y
-- sábado no se cerraban nunca y lo que no cerraba quedaba en un texto que nadie seguía.
--
-- Ahora el día termina cuando entra el Fudo. En ese momento el sistema cruza lo que
-- mandó cada turno y todo lo que no está bien nace como tarea: el encargado la toma,
-- dice qué va a hacer y para cuándo, anota avances y gastos, y pide el cierre. La
-- tarea termina cuando un dueño la aprueba.

CREATE TABLE IF NOT EXISTS causas_conocidas (
  id           SERIAL       PRIMARY KEY,
  local_id     INT          NOT NULL REFERENCES locales(id),
  tipo         VARCHAR(30)  NOT NULL,
  -- El resultado que se aprueba solo: "Venta ficticia para nota de crédito".
  resultado    TEXT         NOT NULL,
  activa       BOOLEAN      NOT NULL DEFAULT true,
  aprobada_por INT          REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  baja_por     INT          REFERENCES usuarios(id),
  baja_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_causas_local ON causas_conocidas(local_id, tipo) WHERE activa;

CREATE TABLE IF NOT EXISTS tareas (
  id                  SERIAL       PRIMARY KEY,
  tipo                VARCHAR(30)  NOT NULL,
  local_id            INT          REFERENCES locales(id),
  -- El día del problema (el del Fudo que lo levantó), no el día en que se generó.
  fecha               DATE         NOT NULL,
  -- Identifica el problema: la misma diferencia no nace dos veces aunque el Fudo se
  -- reimporte. "ventas:3:2026-10-09", "mant:36", "venc:1:Whisky:2026-10-22".
  clave               VARCHAR(200) NOT NULL UNIQUE,
  titulo              TEXT         NOT NULL,
  detalle             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  reporte_id          INT          REFERENCES reportes(id) ON DELETE SET NULL,
  -- nueva → en_curso → por_aprobar → terminada. Si un dueño pide más o rechaza,
  -- vuelve a en_curso.
  estado              VARCHAR(20)  NOT NULL DEFAULT 'nueva',
  accion              TEXT,
  plazo               DATE,
  tomada_por          INT          REFERENCES usuarios(id),
  tomada_at           TIMESTAMPTZ,
  -- Lo que se pidió cerrar: el resultado de la lista, o el motivo si se descartó.
  cierre_tipo         VARCHAR(20),          -- resultado | descarte
  resultado           TEXT,
  resultado_monto     NUMERIC(14,2),
  -- De quién fue el error o quién no cargó: va al historial de esa persona.
  afectado_usuario_id INT          REFERENCES usuarios(id),
  pedido_cierre_at    TIMESTAMPTZ,
  terminada_por       INT          REFERENCES usuarios(id),
  terminada_at        TIMESTAMPTZ,
  causa_id            INT          REFERENCES causas_conocidas(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_estado_check;
ALTER TABLE tareas ADD CONSTRAINT tareas_estado_check
  CHECK (estado IN ('nueva', 'en_curso', 'por_aprobar', 'terminada'));

CREATE INDEX IF NOT EXISTS idx_tareas_estado   ON tareas(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_tareas_local    ON tareas(local_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_tareas_afectado ON tareas(afectado_usuario_id) WHERE afectado_usuario_id IS NOT NULL;

-- El seguimiento. No se edita ni se borra: es lo que permite ver cuánto tardó cada
-- cosa y quién hizo qué.
CREATE TABLE IF NOT EXISTS tarea_eventos (
  id          SERIAL       PRIMARY KEY,
  tarea_id    INT          NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  usuario_id  INT          REFERENCES usuarios(id),     -- null: lo hizo el sistema
  -- creada | tomada | avance | plazo | gasto | comprobante | gasto_aprobado |
  -- gasto_rechazado | pidio_cierre | aprobada | pidio_mas | rechazada | sistema
  tipo        VARCHAR(30)  NOT NULL,
  texto       TEXT,
  datos       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tarea_eventos ON tarea_eventos(tarea_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tarea_eventos_fecha ON tarea_eventos(created_at);

-- Lo que se gasta para resolver una tarea, de la caja chica. No va a Cash Flow:
-- Martín lo lleva aparte. Lo que importa es que quede el comprobante.
CREATE TABLE IF NOT EXISTS tarea_gastos (
  id            SERIAL        PRIMARY KEY,
  tarea_id      INT           NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  concepto      VARCHAR(200)  NOT NULL,
  monto         NUMERIC(14,2) NOT NULL,
  -- aprobado_solo (menos de $100.000) | pendiente | aprobado | rechazado
  estado        VARCHAR(20)   NOT NULL,
  creado_por    INT           REFERENCES usuarios(id),
  respondido_por INT          REFERENCES usuarios(id),
  respondido_at TIMESTAMPTZ,
  respuesta     TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE tarea_gastos DROP CONSTRAINT IF EXISTS tarea_gastos_estado_check;
ALTER TABLE tarea_gastos ADD CONSTRAINT tarea_gastos_estado_check
  CHECK (estado IN ('aprobado_solo', 'pendiente', 'aprobado', 'rechazado'));
CREATE INDEX IF NOT EXISTS idx_tarea_gastos ON tarea_gastos(tarea_id);

CREATE TABLE IF NOT EXISTS tarea_adjuntos (
  id          SERIAL        PRIMARY KEY,
  tarea_id    INT           NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  evento_id   INT           REFERENCES tarea_eventos(id) ON DELETE SET NULL,
  gasto_id    INT           REFERENCES tarea_gastos(id) ON DELETE SET NULL,
  -- foto | presupuesto | comprobante
  rol         VARCHAR(20)   NOT NULL DEFAULT 'foto',
  r2_key      VARCHAR(500)  NOT NULL,
  mime        VARCHAR(100),
  tamano      INT,
  subido_por  INT           REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tarea_adjuntos ON tarea_adjuntos(tarea_id);

-- Avisos en el celular. La suscripción es del aparato, no de la sesión: si la sesión
-- se vence, los avisos siguen llegando. Se borra cuando la persona cierra sesión.
CREATE TABLE IF NOT EXISTS avisos_suscripciones (
  id          SERIAL        PRIMARY KEY,
  usuario_id  INT           NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    TEXT          NOT NULL UNIQUE,
  p256dh      TEXT          NOT NULL,
  auth        TEXT          NOT NULL,
  aparato     VARCHAR(200),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_avisos_usuario ON avisos_suscripciones(usuario_id);

-- Qué días ya se avisaron a los dueños: el reporte del día sale una sola vez, cuando
-- están cargados los Fudo de todos los locales.
CREATE TABLE IF NOT EXISTS dias_avisados (
  fecha       DATE          PRIMARY KEY,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Valores de configuración que genera el propio sistema (las claves de los avisos).
CREATE TABLE IF NOT EXISTS app_config (
  clave       VARCHAR(60)   PRIMARY KEY,
  valor       TEXT          NOT NULL,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
