-- Senzen: distribución en Mendoza con una vendedora (Pepa).
--
-- Dos mitades:
-- 1) Lo que pasa en la calle y Dux no sabe: los comercios, cada contacto de Pepa (visita,
--    llamada o WhatsApp) con su resultado y foto, y las tareas de a quién volver a hablar.
-- 2) Una copia de lo que sí está en Dux de Plumas, sucursal 2 "SENZEN" y depósito CARMIX:
--    facturas, pedidos, cobros y stock. La lee sola el sistema con la API (services/senzenDux.js).
--    Lo de Senzen que sale de Casa Central no se trae: es Plumas comprando al costo.

-- Perfil nuevo: la vendedora solo ve su semana, sus tareas y sus comercios.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN (
  'admin', 'encargado_general', 'empleado_tienda', 'encargado_cafe', 'encargado_cocina',
  'barista', 'vendedora'
));

CREATE TABLE IF NOT EXISTS senzen_comercios (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT    NOT NULL,
  tipo           TEXT    CHECK (tipo IN ('supermercado','minimercado','almacen','casa_limpieza','bazar','ferreteria','otro')),
  localidad      TEXT,
  direccion      TEXT,
  contacto       TEXT,
  telefono       TEXT,
  dux_id_cliente BIGINT  UNIQUE,              -- el cliente de Dux, cuando ya compró
  consignacion   BOOLEAN NOT NULL DEFAULT false, -- se le factura y cobra cuando repone (QuickGo)
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_por     INTEGER REFERENCES usuarios(id), -- null = lo trajo Dux
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cada vez que Pepa habla con un comercio. La foto es obligatoria en las visitas.
CREATE TABLE IF NOT EXISTS senzen_contactos (
  id           SERIAL PRIMARY KEY,
  comercio_id  INTEGER NOT NULL REFERENCES senzen_comercios(id),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  fecha        DATE    NOT NULL,              -- de Mendoza
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  medio        TEXT    NOT NULL CHECK (medio IN ('visita','llamada','whatsapp')),
  resultado    TEXT    NOT NULL CHECK (resultado IN ('pedido','va_a_comprar','volver','no_compro')),
  motivo       TEXT    CHECK (motivo IN ('tiene_stock','precio','no_estaba','otra_marca','no_le_interesa')),
  volver_el    DATE,
  lat          NUMERIC(9,6),
  lng          NUMERIC(9,6),
  foto_key     TEXT,
  foto_mime    TEXT
);
CREATE INDEX IF NOT EXISTS senzen_contactos_fecha ON senzen_contactos (fecha);
CREATE INDEX IF NOT EXISTS senzen_contactos_comercio ON senzen_contactos (comercio_id);

-- A quién volver a hablar. Las arma el sistema (creada_por null) o un dueño (visitar).
-- volver: Pepa eligió la fecha · va_a_comprar: dijo que iba a comprar · dormido: no compra
-- hace rato · segunda: 15 días después de su primera compra · visitar: encargo de un dueño.
CREATE TABLE IF NOT EXISTS senzen_tareas (
  id           SERIAL PRIMARY KEY,
  comercio_id  INTEGER NOT NULL REFERENCES senzen_comercios(id),
  tipo         TEXT    NOT NULL CHECK (tipo IN ('volver','va_a_comprar','dormido','segunda','visitar')),
  vence        DATE    NOT NULL,
  estado       TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','hecha','descartada')),
  contacto_id  INTEGER REFERENCES senzen_contactos(id), -- el contacto que la cerró
  creada_por   INTEGER REFERENCES usuarios(id),
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrada_en   TIMESTAMPTZ
);
-- Una sola tarea abierta por comercio: hablarle una vez resuelve todo lo pendiente con él.
CREATE UNIQUE INDEX IF NOT EXISTS senzen_tareas_una_abierta ON senzen_tareas (comercio_id) WHERE estado = 'pendiente';

-- Copia de Dux.
CREATE TABLE IF NOT EXISTS senzen_facturas (
  id_comp_venta  BIGINT PRIMARY KEY,
  fecha          DATE    NOT NULL,
  comprobante    TEXT,
  tipo_comp      TEXT,
  id_cliente     BIGINT,
  total          NUMERIC(14,2) NOT NULL,
  neto           NUMERIC(14,2) NOT NULL,      -- total − IVA
  anulada        BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS senzen_factura_items (
  id_comp_venta  BIGINT  NOT NULL REFERENCES senzen_facturas(id_comp_venta) ON DELETE CASCADE,
  renglon        INTEGER NOT NULL,
  cod_item       TEXT,
  item           TEXT    NOT NULL,
  cantidad       NUMERIC(12,3) NOT NULL,
  subtotal       NUMERIC(14,2) NOT NULL,      -- cantidad × precio con descuento, como lo factura Dux
  costo          NUMERIC(14,2) NOT NULL,      -- cantidad × costo del producto al traerlo
  PRIMARY KEY (id_comp_venta, renglon)
);
CREATE TABLE IF NOT EXISTS senzen_pedidos (
  id_pedido      BIGINT PRIMARY KEY,
  nro_pedido     TEXT,
  fecha          DATE    NOT NULL,
  id_cliente     BIGINT,
  total          NUMERIC(14,2) NOT NULL,
  estado         TEXT,                        -- estado_facturacion de Dux
  anulado        BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS senzen_cobros (
  id_cobro       BIGINT PRIMARY KEY,
  fecha          DATE    NOT NULL,
  cliente        TEXT,
  monto          NUMERIC(14,2) NOT NULL,
  imputaciones   JSONB   NOT NULL DEFAULT '[]'  -- [{id_comp_venta, monto}]
);
CREATE TABLE IF NOT EXISTS senzen_stock (
  cod_item       TEXT PRIMARY KEY,
  item           TEXT    NOT NULL,
  cantidad       NUMERIC(12,3) NOT NULL,
  costo          NUMERIC(14,2) NOT NULL       -- unitario, sin IVA
);
CREATE TABLE IF NOT EXISTS senzen_sync (
  id         SERIAL PRIMARY KEY,
  empezo     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  termino    TIMESTAMPTZ,
  ok         BOOLEAN,
  detalle    JSONB
);

-- Metas de Pepa: vacías hasta que los socios las definan.
INSERT INTO parametros (clave, valor) VALUES
  ('senzen_meta_contactos', ''),
  ('senzen_meta_nuevos',    ''),
  ('senzen_meta_ventas',    '')
ON CONFLICT (clave) DO NOTHING;
