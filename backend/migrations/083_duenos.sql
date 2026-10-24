-- La sección Dueños (23/10/2026): el método "Crecer ordenados" de los cuatro socios.
--
-- Cada mes: se cierran los números de cada unidad (hasta el día 5), en la reunión mensual
-- se fija la rentabilidad objetivo de cada una y se baja a microobjetivos, y cada miércoles
-- se repasa el semáforo de cada microobjetivo. Las unidades son los cinco locales de
-- Entre Dos (por su código), "entre_dos" para el consolidado, "kankay" y "senzen".

-- Números listos: el responsable (Tincho) marca cada unidad cuando su mes quedó cerrado.
CREATE TABLE IF NOT EXISTS cierres_mes (
  unidad     VARCHAR(20)  NOT NULL,
  mes        VARCHAR(7)   NOT NULL,                 -- 'YYYY-MM'
  listo_por  INT          REFERENCES usuarios(id),
  listo_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unidad, mes)
);

-- La rentabilidad objetivo de cada unidad: % de resultado sobre la venta neta, como el
-- EERR. En pesos no sirve con la inflación (Martín, 23/10/2026).
CREATE TABLE IF NOT EXISTS objetivos_mes (
  unidad      VARCHAR(20)   NOT NULL,
  mes         VARCHAR(7)    NOT NULL,
  pct         NUMERIC(6,2)  NOT NULL,
  cargado_por INT           REFERENCES usuarios(id),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unidad, mes)
);

-- Cuántos puntos de rentabilidad aporta cada palanca, y si se cumplió al cerrar el mes.
ALTER TABLE microobjetivos ADD COLUMN IF NOT EXISTS aporte_pts NUMERIC(5,2);
ALTER TABLE microobjetivos ADD COLUMN IF NOT EXISTS resultado VARCHAR(12) CHECK (resultado IN ('cumplido', 'no_cumplido'));
ALTER TABLE microobjetivos ADD COLUMN IF NOT EXISTS viene_de INT REFERENCES microobjetivos(id);

-- El semáforo de cada semana, para ver la historia. La semana es el miércoles de la reunión.
CREATE TABLE IF NOT EXISTS microobjetivo_semanas (
  microobjetivo_id INT          NOT NULL REFERENCES microobjetivos(id) ON DELETE CASCADE,
  semana           DATE         NOT NULL,
  semaforo         VARCHAR(10)  CHECK (semaforo IN ('verde', 'amarillo', 'rojo')),
  nota             TEXT,
  usuario_id       INT          REFERENCES usuarios(id),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (microobjetivo_id, semana)
);

-- La reunión mensual: la fecha la fijan los socios y queda guardado cuándo se terminó.
CREATE TABLE IF NOT EXISTS reuniones_mes (
  mes          VARCHAR(7)   PRIMARY KEY,           -- el mes que se planifica
  fecha        DATE,
  notas        TEXT,
  terminada_por INT         REFERENCES usuarios(id),
  terminada_at TIMESTAMPTZ
);

-- Senzen no tenía EERR: la venta y el costo salen de Dux, los gastos se cargan a mano.
CREATE TABLE IF NOT EXISTS senzen_eerr (
  mes        VARCHAR(7)   PRIMARY KEY,
  gastos     JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- [{ nombre, monto }]
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Quién cierra los números: Tincho (Martín, 23/10/2026).
INSERT INTO parametros (clave, valor) VALUES ('cierre_responsable_id', '1') ON CONFLICT (clave) DO NOTHING;
