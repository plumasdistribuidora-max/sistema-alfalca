-- Qué días abre cada local.
--
-- El sistema daba por sentado que los cinco locales abren los siete días: espera un
-- reporte por turno todos los días, y un domingo que nadie carga nada queda como un
-- día incompleto, con reportes faltando que no faltan. Eso ensucia el cierre, el
-- resumen semanal y la portada.
--
-- Es un dato del local, no del formulario: si mañana una tienda cierra los lunes, se
-- marca acá y todo lo demás se acomoda solo.
ALTER TABLE locales ADD COLUMN IF NOT EXISTS dias_abierto SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}';

COMMENT ON COLUMN locales.dias_abierto IS 'Días que abre: 0 domingo … 6 sábado. Los días que no están no esperan reportes.';

-- La cafetería no abre los domingos. Eso vale para sus tres formularios —café, cocina
-- y barista— porque los tres son del mismo local.
UPDATE locales SET dias_abierto = '{1,2,3,4,5,6}' WHERE tipo = 'cafeteria';
