CREATE TABLE IF NOT EXISTS variedades_alfajor (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE,
  mix_pct       NUMERIC(5,2) NOT NULL,
  doc_por_bulto NUMERIC(6,2) NOT NULL,
  activo        BOOLEAN DEFAULT true,
  orden         INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO variedades_alfajor (nombre, mix_pct, doc_por_bulto, orden) VALUES
  ('Chocolate Negro',                18.5, 6,  1),
  ('Mini Doypack',                   12.2, 13, 2),
  ('Chocolate Blanco',               12.2, 6,  3),
  ('Frambuesa',                       5.4, 6,  4),
  ('DDL al Ron',                      5.3, 6,  5),
  ('Doble',                           4.0, 6,  6),
  ('Conitos Negros',                  3.9, 5,  7),
  ('Café',                            3.6, 6,  8),
  ('Naranja',                         3.5, 6,  9),
  ('70% Cacao (sin gluten)',          3.4, 6,  10),
  ('DDL al Cognac',                   3.3, 6,  11),
  ('Pistacho (sin gluten)',           3.2, 6,  12),
  ('DDL al Whisky',                   3.1, 6,  13),
  ('Galletas Bañadas Choc Negro',     3.0, 7,  14),
  ('Merengue',                        2.8, 4,  15),
  ('Maicena y DDL',                   2.5, 4,  16),
  ('Mas',                             2.3, 6,  17),
  ('Hojaldre Negro',                  2.3, 4,  18),
  ('Membrillo y Glasé de Limón',      2.1, 4,  19),
  ('Conitos Blanco',                  1.4, 5,  20),
  ('Alfacoco',                        1.1, 4,  21),
  ('Mini Chocolate Negro',            0.5, 10, 22),
  ('Galletas Bañadas Choc Blanco',    0.3, 7,  23)
ON CONFLICT (nombre) DO NOTHING;
