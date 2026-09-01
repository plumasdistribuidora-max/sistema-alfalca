-- El valor hora pasa a ser de la persona, no del puesto.
--
-- Estaba atado a (local, puesto) porque la grilla del café se organiza por puesto,
-- pero dos personas en el mismo puesto no cobran necesariamente igual. Se conserva
-- la historia por fecha: un aumento no cambia lo que costó un día ya cerrado.

CREATE TABLE IF NOT EXISTS valor_hora_empleado (
  id            SERIAL PRIMARY KEY,
  empleado_id   INT           NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  valor_hora    NUMERIC(12,2) NOT NULL,
  vigente_desde DATE          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empleado_id, vigente_desde)
);
CREATE INDEX IF NOT EXISTS idx_valor_hora_emp ON valor_hora_empleado(empleado_id, vigente_desde DESC);

-- Los valores que ya estaban cargados por puesto se reparten a cada persona de ese
-- puesto, para no perderlos ni tener que recargarlos a mano.
INSERT INTO valor_hora_empleado (empleado_id, valor_hora, vigente_desde)
SELECT e.id, v.valor_hora, v.vigente_desde
FROM valor_hora v
JOIN empleados e ON e.local_id_principal = v.local_id AND e.puesto = v.puesto
ON CONFLICT (empleado_id, vigente_desde) DO NOTHING;

DROP TABLE IF EXISTS valor_hora;

-- El nombre del POS deja de pedirse: no se usa para nada que el usuario vea.
-- La columna queda porque alimenta el match retroactivo de tickets viejos.
ALTER TABLE empleados ALTER COLUMN nombre_pos DROP NOT NULL;

-- ── Calendario de trabajo ────────────────────────────────────────────────────
-- Cada local define sus filas: el café las de su planilla (encargado, barista,
-- mozo, bacha, refuerzo, cocina, ref cocina), las tiendas solo mañana y tarde.
CREATE TABLE IF NOT EXISTS local_posiciones (
  id            SERIAL PRIMARY KEY,
  local_id      INT         NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  nombre        VARCHAR(60) NOT NULL,
  turno         VARCHAR(20) NOT NULL,
  hora_desde    VARCHAR(10),
  hora_hasta    VARCHAR(10),
  orden         INT         NOT NULL DEFAULT 0,
  -- Si esta posición carga reporte, quien la cubra necesita usuario. De acá sale
  -- el aviso cuando se asigna a alguien que no reporta.
  requiere_reporte BOOLEAN  NOT NULL DEFAULT false,
  area          VARCHAR(20) NOT NULL DEFAULT 'tienda',
  activo        BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_posiciones_local ON local_posiciones(local_id, orden);

-- Una celda del calendario: una posición, un día, una persona.
CREATE TABLE IF NOT EXISTS turnos_planificados (
  id           SERIAL PRIMARY KEY,
  posicion_id  INT         NOT NULL REFERENCES local_posiciones(id) ON DELETE CASCADE,
  fecha        DATE        NOT NULL,
  empleado_id  INT         REFERENCES empleados(id) ON DELETE SET NULL,
  -- 'asignado' | 'franco' | 'sin_cubrir'
  estado       VARCHAR(20) NOT NULL DEFAULT 'asignado',
  hora_desde   VARCHAR(10),
  hora_hasta   VARCHAR(10),
  nota         VARCHAR(120),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (posicion_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos_planificados(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_empleado ON turnos_planificados(empleado_id, fecha);

-- ── Posiciones del Café Peatonal, según la planilla real ─────────────────────
INSERT INTO local_posiciones (local_id, nombre, turno, hora_desde, hora_hasta, orden, requiere_reporte, area)
SELECT l.id, x.nombre, x.turno, x.hd, x.hh, x.orden, x.rep, x.area
FROM locales l, (VALUES
  ('Encargado',    'Mañana', '7.30',  '15.00',  1,  true,  'cafe'),
  ('Barista',      'Mañana', '8.00',  '15.30',  2,  false, 'cafe'),
  ('Cocina',       'Mañana', '7.30',  '15.30',  3,  true,  'cocina'),
  ('Ref. cocina',  'Mañana', '10.30', '14.30',  4,  false, 'cocina'),
  ('Mozo 1',       'Mañana', '8.00',  '15.30',  5,  false, 'cafe'),
  ('Mozo 2',       'Mañana', '9.30',  '15.30',  6,  false, 'cafe'),
  ('Encargado',    'Tarde',  '15.00', 'cierre', 7,  true,  'cafe'),
  ('Barista',      'Tarde',  '15.00', 'cierre', 8,  false, 'cafe'),
  ('Cocina',       'Tarde',  '15.00', 'cierre', 9,  true,  'cocina'),
  ('Mozo 1',       'Tarde',  '15.00', 'cierre', 10, false, 'cafe'),
  ('Mozo 2',       'Tarde',  '16.00', 'cierre', 11, false, 'cafe'),
  ('Bacha',        'Tarde',  '17.00', 'cierre', 12, false, 'cafe'),
  ('Refuerzo',     'Tarde',  '17.00', 'cierre', 13, false, 'cafe')
) AS x(nombre, turno, hd, hh, orden, rep, area)
WHERE l.tipo = 'cafeteria'
  AND NOT EXISTS (SELECT 1 FROM local_posiciones p WHERE p.local_id = l.id);

-- ── Tiendas de alfajores: mañana y tarde ─────────────────────────────────────
INSERT INTO local_posiciones (local_id, nombre, turno, orden, requiere_reporte, area)
SELECT l.id, x.nombre, x.turno, x.orden, true, 'tienda'
FROM locales l, (VALUES ('Mañana', 'Mañana', 1), ('Tarde', 'Tarde', 2)) AS x(nombre, turno, orden)
WHERE l.tipo = 'alfajores'
  AND NOT EXISTS (SELECT 1 FROM local_posiciones p WHERE p.local_id = l.id);
