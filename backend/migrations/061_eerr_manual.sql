-- Estado de resultados cargado a mano, por marca y por mes.
--
-- Kankay todavía no tiene de dónde sacar ventas ni gastos: el dueño va escribiendo
-- los montos a mano mientras tanto. Cada mes guarda sus líneas tal cual las dejó
-- (nombre, grupo y monto), así puede agregar, renombrar o borrar renglones sin tocar
-- el esquema. Cuando se conecte a datos reales, las líneas que vengan de ahí dejan
-- de escribirse acá.
CREATE TABLE IF NOT EXISTS eerr_manual (
  marca          TEXT        NOT NULL,
  periodo        CHAR(7)     NOT NULL,              -- 'YYYY-MM'
  lineas         JSONB       NOT NULL DEFAULT '[]', -- [{ id, grupo, nombre, monto }]
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por INTEGER,
  PRIMARY KEY (marca, periodo)
);

COMMENT ON TABLE eerr_manual IS 'Estado de resultados cargado a mano (por ahora Kankay). grupo: ingresos | deducciones | cmv | gastos | otros | financieros.';
