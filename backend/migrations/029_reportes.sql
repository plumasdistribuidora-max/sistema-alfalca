-- Etapa 2: motor de reportes diarios.
--
-- Los formularios no son columnas: son plantillas en JSONB. Agregar una pregunta el mes
-- que viene se hace desde una pantalla, no con un deploy. Cada reporte guarda con qué
-- versión de plantilla se llenó, así los históricos no se rompen al editarla.

CREATE TABLE IF NOT EXISTS reporte_plantillas (
  codigo      VARCHAR(30)  PRIMARY KEY,       -- tienda | cafe | cocina | consolidado
  nombre      VARCHAR(120) NOT NULL,
  area        VARCHAR(20)  NOT NULL,
  version     INT          NOT NULL DEFAULT 1,
  campos      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  activo      BOOLEAN      NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reportes (
  id                SERIAL PRIMARY KEY,
  plantilla_codigo  VARCHAR(30) NOT NULL REFERENCES reporte_plantillas(codigo),
  plantilla_version INT         NOT NULL,
  local_id          INT         NOT NULL REFERENCES locales(id),
  empleado_id       INT         REFERENCES empleados(id),
  usuario_id        INT         NOT NULL REFERENCES usuarios(id),
  fecha             DATE        NOT NULL,
  turno             VARCHAR(30) NOT NULL,
  estado            VARCHAR(20) NOT NULL DEFAULT 'borrador',
  respuestas        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  enviado_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reportes DROP CONSTRAINT IF EXISTS reportes_estado_check;
ALTER TABLE reportes ADD CONSTRAINT reportes_estado_check CHECK (estado IN (
  'borrador', 'enviado', 'observado', 'aprobado'
));

-- Un reporte por persona, día y turno. Si vuelve a entrar, sigue editando el mismo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reportes_unico
  ON reportes(plantilla_codigo, local_id, fecha, turno, usuario_id);

CREATE INDEX IF NOT EXISTS idx_reportes_fecha   ON reportes(fecha DESC, local_id);
CREATE INDEX IF NOT EXISTS idx_reportes_estado  ON reportes(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_reportes_usuario ON reportes(usuario_id, fecha DESC);

CREATE TABLE IF NOT EXISTS reporte_adjuntos (
  id            SERIAL PRIMARY KEY,
  reporte_id    INT          NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  campo_codigo  VARCHAR(50)  NOT NULL,
  r2_key        VARCHAR(500) NOT NULL,
  nombre        VARCHAR(255),
  mime          VARCHAR(100),
  tamano        INT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjuntos_reporte ON reporte_adjuntos(reporte_id, campo_codigo);

CREATE TABLE IF NOT EXISTS reporte_revisiones (
  id          SERIAL PRIMARY KEY,
  reporte_id  INT         NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id  INT         NOT NULL REFERENCES usuarios(id),
  accion      VARCHAR(20) NOT NULL,          -- envio | observo | aprobo | reabrio
  comentario  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revisiones_reporte ON reporte_revisiones(reporte_id, created_at DESC);

-- Facturas cargadas desde el reporte de café: cabecera y renglones. El detalle es lo que
-- después permite ver a cuánto se está pagando cada insumo.
CREATE TABLE IF NOT EXISTS facturas (
  id          SERIAL PRIMARY KEY,
  local_id    INT           NOT NULL REFERENCES locales(id),
  reporte_id  INT           REFERENCES reportes(id) ON DELETE SET NULL,
  proveedor   VARCHAR(200)  NOT NULL,
  numero      VARCHAR(100),
  fecha       DATE          NOT NULL,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  r2_key      VARCHAR(500),
  created_by  INT           REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha     ON facturas(fecha DESC, local_id);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor ON facturas(proveedor);

CREATE TABLE IF NOT EXISTS facturas_items (
  id           SERIAL PRIMARY KEY,
  factura_id   INT           NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  producto     VARCHAR(200)  NOT NULL,
  cantidad     NUMERIC(12,3) NOT NULL DEFAULT 1,
  precio_unit  NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_facturas_items_factura  ON facturas_items(factura_id);
CREATE INDEX IF NOT EXISTS idx_facturas_items_producto ON facturas_items(producto);

-- ── Plantilla del reporte de café ────────────────────────────────────────────
-- Los 10 puntos del documento de reportes internos. Fecha y nombre no son campos:
-- salen del usuario que entra.
INSERT INTO reporte_plantillas (codigo, nombre, area, version, campos) VALUES (
  'cafe', 'Reporte de Café', 'cafe', 1,
  '[
    {"codigo":"turno","tipo":"seleccion","label":"Turno","opciones":["Mañana","Tarde"],"requerido":true},
    {"codigo":"horas_equipo","tipo":"horas_empleados","label":"Horas trabajadas del turno",
     "ayuda":"Todos los que trabajaron con vos, incluida vos","requerido":true},
    {"codigo":"personas","tipo":"numero","label":"Personas atendidas",
     "ayuda":"Cantidad de clientes del turno","requerido":true},
    {"codigo":"ventas","tipo":"moneda","label":"Ventas totales del turno",
     "ayuda":"Lo que muestra Fudo al cerrar caja","requerido":true},
    {"codigo":"quejas","tipo":"texto_largo","label":"Quejas e inconvenientes",
     "ayuda":"Si no hubo, dejalo vacío","requerido":false},
    {"codigo":"mantenimiento","tipo":"texto_largo","label":"Mantenimiento edilicio o de máquinas",
     "ayuda":"Si no hubo novedades, dejalo vacío","requerido":false},
    {"codigo":"faltantes","tipo":"si_no_lista","label":"¿Hubo faltantes de insumos?",
     "label_lista":"Qué faltó y de qué proveedor","requerido":true,
     "subcampos":[
       {"codigo":"insumo","label":"Insumo","tipo":"texto"},
       {"codigo":"proveedor","label":"Proveedor","tipo":"texto"}
     ]},
    {"codigo":"facturas","tipo":"facturas","label":"Facturas del turno",
     "ayuda":"Cargá proveedor, número y el detalle de lo que vino","requerido":false},
    {"codigo":"ausencias","tipo":"si_no_lista","label":"¿Hubo faltas o tardanzas?",
     "label_lista":"Quién y qué pasó","requerido":true,
     "subcampos":[
       {"codigo":"empleado","label":"Empleado","tipo":"texto"},
       {"codigo":"motivo","label":"Falta o tardanza","tipo":"texto"}
     ]},
    {"codigo":"foto_bano","tipo":"foto","label":"Foto del check de baño","max":2,"requerido":true}
  ]'::jsonb
) ON CONFLICT (codigo) DO NOTHING;
