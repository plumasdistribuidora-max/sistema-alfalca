-- CMV por categoría de cafetería (editable por local + mes)
CREATE TABLE IF NOT EXISTS eerr_cafeteria_cmv (
  local_id   INT          NOT NULL REFERENCES locales(id),
  mes        CHAR(7)      NOT NULL,
  categoria  TEXT         NOT NULL,
  cmv_pct    NUMERIC(5,2) NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (local_id, mes, categoria)
);

-- Impuestos y fee de marca (% sobre EBITDA) por local + mes
CREATE TABLE IF NOT EXISTS eerr_cafeteria_impuestos (
  local_id      INT          NOT NULL REFERENCES locales(id),
  mes           CHAR(7)      NOT NULL,
  iibb_pct      NUMERIC(5,2) NOT NULL DEFAULT 3,
  imp_gen_pct   NUMERIC(5,2) NOT NULL DEFAULT 30,
  fee_marca_pct NUMERIC(5,2) NOT NULL DEFAULT 4,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (local_id, mes)
);

-- Tipo de cambio dólar fin de mes
CREATE TABLE IF NOT EXISTS eerr_cafeteria_dolar (
  local_id      INT          NOT NULL REFERENCES locales(id),
  mes           CHAR(7)      NOT NULL,
  dolar_fin_mes NUMERIC(10,2),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (local_id, mes)
);

-- Mapeo producto (nombre normalizado) → categoría de cafetería
CREATE TABLE IF NOT EXISTS productos_categoria_cafeteria (
  producto_nombre_norm TEXT PRIMARY KEY,
  categoria            TEXT NOT NULL
    CHECK (categoria IN ('cafeteria','panificados','promociones',
                         'menu_almuerzos','principales','bebidas'))
);
