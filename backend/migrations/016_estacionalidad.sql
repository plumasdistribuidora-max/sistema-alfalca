CREATE TABLE IF NOT EXISTS estacionalidad_mensual (
  mes    INT PRIMARY KEY,
  indice NUMERIC(4,2) NOT NULL
);

INSERT INTO estacionalidad_mensual (mes, indice) VALUES
  (1,  0.81),
  (2,  0.80),
  (3,  1.12),
  (4,  0.95),
  (5,  0.94),
  (6,  0.88),
  (7,  1.25),
  (8,  1.10),
  (9,  1.07),
  (10, 1.08),
  (11, 1.19),
  (12, 0.80)
ON CONFLICT (mes) DO UPDATE SET indice = EXCLUDED.indice;
