-- Recupero de la inversión de Kankay, en dólares oficiales BNA (Martín, 13/10/2026).
--
-- - La inversión es el local y la mercadería inicial. Se carga a mano, en pesos o en dólares;
--   los pesos se pasan con el dólar oficial del día.
-- - Lo recuperado es el resultado del mes del estado de resultados (con la nota de crédito,
--   que es ganancia real), pasado con el promedio del dólar oficial de ese mes.
-- - El stock se valoriza con la "Consulta Stock" de Dux, un Excel por depósito: Stock Real ×
--   Costo (sin IVA). Los combos (rubro PROMOCIONES) no son stock: Dux descuenta los productos
--   que los forman cuando se venden.

-- Dólar oficial BNA, venta, por día. Se completa solo desde api.argentinadatos.com.
CREATE TABLE IF NOT EXISTS dolar_oficial (
  fecha  DATE PRIMARY KEY,
  venta  NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS kankay_inversiones (
  id          SERIAL PRIMARY KEY,
  fecha       DATE NOT NULL,
  concepto    TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('local', 'mercaderia')),
  moneda      TEXT NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  monto       NUMERIC(14,2) NOT NULL,
  creado_por  INTEGER REFERENCES usuarios(id),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un renglón por depósito y día. El stock de hoy es el último de cada depósito.
CREATE TABLE IF NOT EXISTS kankay_stock (
  id          SERIAL PRIMARY KEY,
  fecha       DATE NOT NULL,
  deposito    TEXT NOT NULL,
  archivo     TEXT,
  unidades    NUMERIC(12,3) NOT NULL,
  valor       NUMERIC(14,2) NOT NULL,         -- a costo, sin IVA, sin combos
  combos      NUMERIC(14,2) NOT NULL DEFAULT 0, -- lo que se dejó afuera, para mostrarlo
  detalle     JSONB NOT NULL DEFAULT '[]',    -- [[codigo, producto, rubro, cantidad, costo], ...]
  subido_por  INTEGER REFERENCES usuarios(id),
  subido_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fecha, deposito)
);
