-- El check de vencimientos deja de escribirse a mano.
--
-- En la base había 32 textos distintos para los mismos diez alfajores: "ron",
-- "alfajor ron", "alfajor de ron", "alf ron y cognac". Así no se puede agrupar ni
-- comparar entre locales, y el informe queda escrito en vez de esquematizado.
--
-- Ahora el empleado elige el producto de esta lista y carga LA FECHA que viene
-- impresa en el paquete. Los días los calcula el sistema, contra la fecha del cierre:
-- mirar un cierre viejo muestra los días que faltaban ese día, no los de hoy.
--
-- La lista es la que armó Martín el 22/9/2026. Se edita desde pantalla, sin deploy.

CREATE TABLE IF NOT EXISTS vencimiento_productos (
  id         SERIAL       PRIMARY KEY,
  nombre     VARCHAR(60)  NOT NULL,
  orden      INT          NOT NULL DEFAULT 0,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- "Ron" y "ron" son el mismo producto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vencimiento_productos_nombre
  ON vencimiento_productos (lower(nombre));

INSERT INTO vencimiento_productos (nombre, orden) VALUES
  ('Negro',            10),
  ('Blanco',           20),
  ('Maicena',          30),
  ('Membrillo',        40),
  ('Merengue',         50),
  ('Café',             60),
  ('Alfa Coco',        70),
  ('Ron',              80),
  ('Cognac',           90),
  ('Whisky',          100),
  ('Frambuesa',       110),
  ('Naranja',         120),
  ('Hojaldre',        130),
  ('Doble Cobertura', 140),
  ('70% Cacao',       150),
  ('Mas DDL',         160),
  ('Pistacho',        170),
  ('Super Blanco',    180),
  ('Mini Negro',      190),
  ('Mini Blanco',     200),
  ('Conito Negro',    210),
  ('Conito Blanco',   220),
  ('Conito Menta',    230)
ON CONFLICT DO NOTHING;

-- El campo de la plantilla pasa de lista con texto libre a lista con producto y fecha.
-- Se busca por código, no por posición. Idempotente: solo toca la que sigue en si_no_lista.
UPDATE reporte_plantillas p SET
  campos = (
    SELECT jsonb_agg(
      CASE WHEN c->>'codigo' = 'vencimientos' AND c->>'tipo' = 'si_no_lista'
           THEN (c - 'subcampos') || jsonb_build_object(
                  'tipo',        'vencimientos',
                  'label_lista', 'Qué producto y qué fecha dice el paquete',
                  'ayuda',       'Elegí el producto de la lista y cargá la fecha impresa. Los días los saca el sistema.'
                )
           ELSE c END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.campos) WITH ORDINALITY AS t(c, ord)
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE campos @> '[{"codigo":"vencimientos","tipo":"si_no_lista"}]'::jsonb;
