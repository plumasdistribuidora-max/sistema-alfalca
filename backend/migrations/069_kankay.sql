-- Kankay: ventas desde el Excel de Dux, estado de resultados nuevo y avisos por tema.
--
-- Las ventas vienen de la "Consulta de ventas detallada" de Dux: un renglón por producto
-- vendido. Cada vez que se sube un Excel, los días que trae se reemplazan enteros, así
-- que subir de nuevo una parte de un mes no duplica nada.

CREATE TABLE IF NOT EXISTS kankay_imports (
  id          SERIAL PRIMARY KEY,
  archivo     TEXT        NOT NULL,
  desde       DATE        NOT NULL,
  hasta       DATE        NOT NULL,
  renglones   INTEGER     NOT NULL,
  ventas      INTEGER     NOT NULL,           -- tickets distintos con monto positivo
  total       NUMERIC(14,2) NOT NULL,         -- con IVA
  neto        NUMERIC(14,2) NOT NULL,         -- sin IVA (lo sin factura entra completo)
  cmv         NUMERIC(14,2) NOT NULL,
  subido_por  INTEGER REFERENCES usuarios(id),
  subido_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kankay_ventas (
  id           BIGSERIAL PRIMARY KEY,
  import_id    INTEGER NOT NULL REFERENCES kankay_imports(id),
  fecha        DATE     NOT NULL,             -- de "Fecha Registro", hora de Mendoza
  hora         SMALLINT NOT NULL,
  registrado   TIMESTAMP NOT NULL,            -- fecha y hora tal cual las muestra Dux
  comprobante  TEXT,                          -- vacío = factura que no llegó a emitirse
  ticket       TEXT     NOT NULL,             -- comprobante, o cliente + fecha si no tiene número
  cliente      TEXT,
  codigo       TEXT,
  producto     TEXT     NOT NULL,
  rubro        TEXT     NOT NULL,
  subrubro     TEXT,
  vendedor     TEXT,
  cantidad     NUMERIC(12,3) NOT NULL,
  total        NUMERIC(14,2) NOT NULL,        -- con IVA
  neto         NUMERIC(14,2) NOT NULL,        -- sin IVA; sin comprobante = total
  cmv          NUMERIC(14,2) NOT NULL,        -- "Costo Total Producto"
  facturada    BOOLEAN  NOT NULL
);
CREATE INDEX IF NOT EXISTS kankay_ventas_fecha ON kankay_ventas (fecha);

-- El estado de resultados de cada mes: ventas y costo salen de kankay_ventas; acá va
-- solo lo que se carga a mano. gastos = [[nombre, monto|null], ...] en el orden de pantalla.
CREATE TABLE IF NOT EXISTS kankay_eerr (
  periodo         CHAR(7) PRIMARY KEY,        -- 'YYYY-MM'
  gastos          JSONB   NOT NULL DEFAULT '[]',
  iibb            NUMERIC(14,2),
  f931            NUMERIC(14,2),
  nc              NUMERIC(14,2),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por INTEGER REFERENCES usuarios(id)
);

-- Agosto 2026 pasa del estado de resultados a mano (eerr_manual, que queda como estaba)
-- a la estructura nueva. Sueldos es sin 931; Fletes pasa a gastos; IIBB a Impuestos;
-- la nota de crédito de Kankay, abajo.
INSERT INTO kankay_eerr (periodo, gastos, iibb, f931, nc)
VALUES ('2026-08', '[
  ["Sueldos", 1657005], ["Alquiler", 1500000], ["Expensas", 284306],
  ["Servicios (luz, agua, internet)", 0], ["Marketing y publicidad", 350000],
  ["Fondo de promoción", 150000], ["Envíos y logística", 160000], ["Fletes", 0],
  ["Honorarios (contador, etc.)", 200000], ["Sistemas y software", 70000], ["Otros gastos", 0]
]'::jsonb, 230000, NULL, 1500000)
ON CONFLICT (periodo) DO NOTHING;

-- Comisión de tarjetas: incluye cuotas y gastos de tarjeta, sobre la venta neta.
INSERT INTO parametros (clave, valor) VALUES ('kankay_comision_pct', '6')
ON CONFLICT (clave) DO NOTHING;

-- Qué avisos quiere recibir cada usuario. Sin fila = el valor por defecto del tema.
CREATE TABLE IF NOT EXISTS avisos_preferencias (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tema       TEXT    NOT NULL,
  activo     BOOLEAN NOT NULL,
  PRIMARY KEY (usuario_id, tema)
);

-- Para no mandar dos veces el mismo aviso programado (cierre de mes, equilibrio, etc.).
CREATE TABLE IF NOT EXISTS avisos_enviados (
  clave      TEXT PRIMARY KEY,
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
