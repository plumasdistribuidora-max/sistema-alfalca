-- Asistente de los dueños: Claude responde preguntas del negocio consultando la base.
--
-- El sistema se conecta como postgres (superusuario). Las consultas que escribe Claude
-- corren con SET LOCAL ROLE asistente_lectura adentro de una transacción READ ONLY, así
-- que aunque se equivoque no puede tocar nada ni leer lo que no debe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asistente_lectura') THEN
    CREATE ROLE asistente_lectura NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO asistente_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO asistente_lectura;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO asistente_lectura;

-- Lo que no ve: contraseñas, las claves de los avisos y los aparatos suscriptos.
REVOKE SELECT ON usuarios, app_config, avisos_suscripciones FROM asistente_lectura;
GRANT SELECT (id, email, nombre, rol, locales_permitidos, activo, created_at, empleado_id)
  ON usuarios TO asistente_lectura;

-- Cada pregunta queda registrada con lo que costó.
CREATE TABLE IF NOT EXISTS asistente_preguntas (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER REFERENCES usuarios(id),
  pregunta      TEXT        NOT NULL,
  respuesta     TEXT,
  consultas     JSONB,                    -- el SQL que corrió, en orden
  tokens_in     INTEGER,
  tokens_cache  INTEGER,
  tokens_out    INTEGER,
  costo_usd     NUMERIC(10,4),
  segundos      NUMERIC(6,1),
  error         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE SELECT ON asistente_preguntas FROM asistente_lectura;

-- set_config('role', ...) haría lo mismo que SET ROLE y, como la sesión es de postgres,
-- lo dejaría volver a superusuario. El sistema corre como postgres y no lo necesita.
REVOKE EXECUTE ON FUNCTION set_config(text, text, boolean) FROM PUBLIC;
