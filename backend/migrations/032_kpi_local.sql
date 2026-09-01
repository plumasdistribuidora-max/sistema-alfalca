-- Corrección del doble control.
--
-- ventas_fudo pedía que el encargado tipeara lo que ve en Fudo, pero la venta del
-- sistema YA sale del Excel de Fudo que él mismo importa: era comparar Fudo contra
-- Fudo. El control que sirve es contra lo que reportó cada turno a mano al cerrar
-- la caja, que es un dato independiente. Eso ya se calcula de los reportes, así que
-- la columna no va más.
ALTER TABLE consolidados DROP COLUMN IF EXISTS ventas_fudo;

-- Objetivo de gasto de personal sobre ventas, por local. Lo que importa no es el
-- día suelto sino el mes contra este número.
ALTER TABLE locales ADD COLUMN IF NOT EXISTS objetivo_horas_ventas NUMERIC(5,2) NOT NULL DEFAULT 16;
