-- El stock de cocina: qué hay, dónde y con qué vencimiento.
--
-- Hoy el control de stock de cocina es una foto: cero datos, así que no se puede
-- pedir ni bajar nada. Acá empieza a ser números.
--
-- Tres ideas de fondo:
--
--  1. Un producto vive en DOS lugares a la vez. El freezer es la reserva y la
--     heladera es lo que está listo para hoy. Con un solo número no se puede saber
--     ni qué pedir ni qué bajar: son dos preguntas distintas.
--
--  2. El stock es por LOTE, no por producto. Dentro de "milanesa de carne" conviven
--     bolsas con fechas distintas, y lo que se baja tiene que ser lo que vence antes.
--     Un lote es un par (producto, fecha de vencimiento).
--
--  3. El conteo se guarda aparte del reporte. El reporte dice quién contó y cuándo;
--     los números viven acá, para poder compararlos día contra día.

-- ── Los productos que se cuentan ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cocina_productos (
  id            SERIAL       PRIMARY KEY,
  proveedor     VARCHAR(60)  NOT NULL,
  nombre        VARCHAR(60)  NOT NULL,
  unidad        VARCHAR(20)  NOT NULL DEFAULT 'unid.',
  -- Dónde vive. Los dos en false no tiene sentido: algo que no se guarda no se cuenta.
  en_freezer    BOOLEAN      NOT NULL DEFAULT true,
  en_heladera   BOOLEAN      NOT NULL DEFAULT true,
  -- Qué días se revisa: 0 domingo … 6 sábado. Vacío = nunca.
  dias_revision SMALLINT[]   NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  orden         INT          NOT NULL DEFAULT 0,
  activo        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- La muzza de Club de Campo y la de Celidiet son dos productos: se cuentan aparte
-- y se le pide a cada uno. Por eso la clave es el par, no el nombre solo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cocina_productos_clave
  ON cocina_productos (lower(proveedor), lower(nombre));

-- ── Los lotes: un producto con una fecha de vencimiento ─────────────────────
CREATE TABLE IF NOT EXISTS cocina_lotes (
  id          SERIAL      PRIMARY KEY,
  producto_id INT         NOT NULL REFERENCES cocina_productos(id) ON DELETE CASCADE,
  -- NULL es el lote "sin fecha": lo que ya estaba cuando arrancó todo esto, o algo
  -- que llegó sin vencimiento legible. No se inventa una fecha para completar.
  vence       DATE,
  -- Dónde nació: de una factura que cargó el encargado, o de un conteo de cocina.
  origen      VARCHAR(12) NOT NULL DEFAULT 'conteo',
  cerrado     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cocina_lotes_unico
  ON cocina_lotes (producto_id, COALESCE(vence, '1900-01-01'::date));
CREATE INDEX IF NOT EXISTS idx_cocina_lotes_producto ON cocina_lotes(producto_id, vence);

-- ── El conteo del día ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cocina_conteos (
  id         SERIAL      PRIMARY KEY,
  local_id   INT         NOT NULL REFERENCES locales(id),
  fecha      DATE        NOT NULL,
  reporte_id INT         REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id INT         REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cocina_conteos_reporte ON cocina_conteos(reporte_id);
CREATE INDEX IF NOT EXISTS idx_cocina_conteos_fecha ON cocina_conteos(local_id, fecha DESC);

CREATE TABLE IF NOT EXISTS cocina_conteo_lineas (
  conteo_id INT           NOT NULL REFERENCES cocina_conteos(id) ON DELETE CASCADE,
  lote_id   INT           NOT NULL REFERENCES cocina_lotes(id)   ON DELETE CASCADE,
  freezer   NUMERIC(10,2),
  heladera  NUMERIC(10,2),
  PRIMARY KEY (conteo_id, lote_id)
);

-- ── Qué lleva cada plato ────────────────────────────────────────────────────
-- Se mapea por NOMBRE normalizado y no por id de catálogo a propósito: así la misma
-- receta sirve para el plato suelto ("Milanesa Pollo c/ensalada") y para el
-- modificador con el que el mozo resuelve un menú, que se llama igual.
CREATE TABLE IF NOT EXISTS cocina_recetas (
  id                 SERIAL        PRIMARY KEY,
  nombre_normalizado TEXT          NOT NULL,
  nombre_display     TEXT          NOT NULL,
  producto_id        INT           NOT NULL REFERENCES cocina_productos(id) ON DELETE CASCADE,
  cantidad           NUMERIC(10,3) NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cocina_recetas_unica
  ON cocina_recetas (nombre_normalizado, producto_id);
CREATE INDEX IF NOT EXISTS idx_cocina_recetas_nombre ON cocina_recetas (nombre_normalizado);

-- ── Los modificadores de Fudo ───────────────────────────────────────────────
-- La hoja "Adiciones de Modificadores" del mismo Excel que ya se importa. Nunca la
-- habíamos leído, y ahí está lo que faltaba: el mozo ya elige si el Menú 1 de hoy fue
-- milanesa de carne o de pollo. Sin esto, 529 menús en 60 días no consumían nada.
CREATE TABLE IF NOT EXISTS ventas_modificadores (
  id             SERIAL        PRIMARY KEY,
  local_id       INT           NOT NULL REFERENCES locales(id),
  pos_ticket_id  TEXT,
  pos_adicion_id TEXT,
  producto       TEXT,
  grupo          TEXT,
  modificador    TEXT          NOT NULL,
  cantidad       NUMERIC(12,3) NOT NULL DEFAULT 1,
  fecha_creacion TIMESTAMPTZ,
  cancelada      BOOLEAN       NOT NULL DEFAULT false,
  linea          INT           NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_modif_unico
  ON ventas_modificadores (local_id, pos_ticket_id, pos_adicion_id, modificador, fecha_creacion, linea);
CREATE INDEX IF NOT EXISTS idx_ventas_modif_fecha ON ventas_modificadores (local_id, fecha_creacion DESC);

-- ── Los 25 productos, como los pasó Martín ──────────────────────────────────
-- La unidad y el lugar donde vive cada uno son una PRIMERA APROXIMACIÓN: se corrigen
-- desde pantalla, producto por producto. Lo único que está confirmado es el nombre y
-- de quién viene.
--
-- dias_revision: {0..6} es todos los días; {1,4} es lunes y jueves.
INSERT INTO cocina_productos (proveedor, nombre, unidad, en_freezer, en_heladera, dias_revision, orden) VALUES
  ('Club de Campo', 'SANG. POLLO',     'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 10),
  ('Club de Campo', 'SANG. MILA',      'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 20),
  ('Club de Campo', 'MILA DE CARNE',   'bolsas', true,  true,  '{0,1,2,3,4,5,6}', 30),
  ('Club de Campo', 'MILA DE POLLO',   'bolsas', true,  true,  '{0,1,2,3,4,5,6}', 40),
  ('Club de Campo', 'MUZA',            'kg',     false, true,  '{0,1,2,3,4,5,6}', 50),
  ('Club de Campo', 'T. POLLO',        'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 60),
  ('Club de Campo', 'T. J Y Q',        'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 70),
  ('Club de Campo', 'T. VERDURA',      'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 80),
  ('Club de Campo', 'EMP. J Y Q',      'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 90),
  ('Club de Campo', 'EMP. CARNE',      'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 100),
  ('Club de Campo', 'CESAR',           'unid.',  false, true,  '{0,1,2,3,4,5,6}', 110),
  ('Club de Campo', 'CHIPA',           'bolsas', true,  true,  '{0,1,2,3,4,5,6}', 120),
  ('Club de Campo', 'P. PAPA',         'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 130),
  ('Club de Campo', 'P. CAMOTE',       'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 140),

  ('Celidiet',      'MUZZA',           'kg',     false, true,  '{0,1,2,3,4,5,6}', 210),
  ('Celidiet',      'PANES',           'unid.',  false, true,  '{0,1,2,3,4,5,6}', 220),
  ('Celidiet',      'SACRAMENTOS',     'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 230),
  ('Celidiet',      'TORTAS',          'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 240),
  ('Celidiet',      'T. VERDURA',      'unid.',  true,  true,  '{0,1,2,3,4,5,6}', 250),
  ('Celidiet',      'MILA CARNE',      'bolsas', true,  true,  '{0,1,2,3,4,5,6}', 260),
  ('Celidiet',      'MILA POLLO',      'bolsas', true,  true,  '{0,1,2,3,4,5,6}', 270),

  ('Hojaldre',      'MEDIALUNAS',      'unid.',  true,  true,  '{1,4}',           310),
  ('Hojaldre',      'TORTAS RASPADAS', 'unid.',  true,  true,  '{1,4}',           320),
  ('Hojaldre',      'TORTAS HOJA',     'unid.',  true,  true,  '{1,4}',           330),

  ('Trigal',        'PAN DE CAMPO',    'unid.',  false, true,  '{1,4}',           410)
ON CONFLICT DO NOTHING;
