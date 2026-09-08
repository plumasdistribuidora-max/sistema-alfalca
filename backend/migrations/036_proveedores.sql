-- Etapa 4: proveedores y pagos.
--
-- Las facturas ya llegaban desde el reporte del turno, pero morían ahí: nadie las
-- volvía a mirar y el proveedor era texto libre, así que "Lácteos Cuyo" y "lacteos
-- cuyo" eran dos proveedores distintos. Acá el proveedor pasa a ser una ficha que
-- carga el encargado una sola vez, y el turno elige de esa lista.

-- Los días en que cobra cada proveedor van como arreglo de números de día de la
-- semana, igual que getDay() de JavaScript: 0 domingo, 1 lunes … 6 sábado. Con eso
-- el sistema puede decir "no cobra antes del viernes" cuando se arma un pago.
CREATE TABLE IF NOT EXISTS proveedores (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  medio_pago  VARCHAR(20)  NOT NULL DEFAULT 'santander',
  dias_pago   SMALLINT[]   NOT NULL DEFAULT '{1,2,3,4,5}',
  plazo_dias  INT          NOT NULL DEFAULT 30,
  nota        VARCHAR(300),
  activo      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Los mismos medios que ya usa Cash Flow, más cheque.
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_medio_check;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_medio_check CHECK (medio_pago IN (
  'santander', 'mp', 'galicia', 'efectivo', 'cheque'
));

ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_plazo_check;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_plazo_check
  CHECK (plazo_dias >= 0 AND plazo_dias <= 365);

-- Sin distinguir mayúsculas ni espacios: es justamente el duplicado que se quiere evitar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedores_nombre
  ON proveedores (lower(btrim(nombre)));

-- ── Facturas: proveedor de la lista y fecha de vencimiento ───────────────────
-- La columna de texto se queda: es el nombre tal como se escribió el día que se
-- cargó, y sirve de respaldo si después alguien renombra al proveedor.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS proveedor_id INT REFERENCES proveedores(id);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS vencimiento  DATE;

CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_id ON facturas(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_facturas_vencimiento  ON facturas(vencimiento);

-- ── Pagos ────────────────────────────────────────────────────────────────────
-- Un pago es una fila, no un campo de la factura: una factura se puede pagar en
-- dos veces, y lo que hay que poder responder después es "cuándo y con qué se pagó".
CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id          SERIAL PRIMARY KEY,
  factura_id  INT           NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  fecha       DATE          NOT NULL,
  monto       NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  medio       VARCHAR(20)   NOT NULL,
  comprobante VARCHAR(100),
  nota        TEXT,
  usuario_id  INT           NOT NULL REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE pagos_proveedor DROP CONSTRAINT IF EXISTS pagos_proveedor_medio_check;
ALTER TABLE pagos_proveedor ADD CONSTRAINT pagos_proveedor_medio_check CHECK (medio IN (
  'santander', 'mp', 'galicia', 'efectivo', 'cheque'
));

CREATE INDEX IF NOT EXISTS idx_pagos_factura ON pagos_proveedor(factura_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha   ON pagos_proveedor(fecha DESC);

-- ── Rescate de lo ya cargado ─────────────────────────────────────────────────
-- Los proveedores que los turnos venían escribiendo a mano pasan a ser fichas. Se
-- quedan con los valores por defecto (Santander, lunes a viernes, 30 días) porque
-- el sistema no tiene cómo saberlos: el encargado los corrige desde la pantalla.
INSERT INTO proveedores (nombre)
SELECT DISTINCT ON (lower(btrim(proveedor))) btrim(proveedor)
FROM facturas
WHERE btrim(COALESCE(proveedor, '')) <> ''
ORDER BY lower(btrim(proveedor)), btrim(proveedor)
ON CONFLICT DO NOTHING;

UPDATE facturas f
SET proveedor_id = p.id
FROM proveedores p
WHERE f.proveedor_id IS NULL
  AND lower(btrim(f.proveedor)) = lower(btrim(p.nombre));

-- Vencimiento de lo viejo: el plazo de la ficha, y 30 días para lo que quedó
-- sin proveedor. Es una estimación, pero es mejor que no tener fecha.
UPDATE facturas f
SET vencimiento = f.fecha + p.plazo_dias
FROM proveedores p
WHERE f.vencimiento IS NULL AND f.proveedor_id = p.id;

UPDATE facturas SET vencimiento = fecha + 30 WHERE vencimiento IS NULL;
