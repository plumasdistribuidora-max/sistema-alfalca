-- Ventas ficticias (3/11/2026): tickets que Sheraton carga en Fudo con cliente "-" para que
-- Entre Dos le haga una nota de crédito. Quedan con este estado y no cuentan como venta.
-- Los tickets se marcan con la migración 087 (el valor nuevo del enum recién se puede usar
-- después de este COMMIT).
ALTER TYPE estado_ticket ADD VALUE IF NOT EXISTS 'ficticia';
