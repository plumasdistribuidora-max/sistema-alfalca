-- Fees de la franquicia en el EERR de las tiendas: fee de marca y fee de marketing.
-- Entre Dos cobra cada uno como un % de lo que se le compra (el costo de Entre Dos del CMV),
-- 2% cada uno. Se guardan por local y mes, como los % de CMV, para poder cambiarlos.
ALTER TABLE eerr_local ADD COLUMN IF NOT EXISTS fee_marca_pct NUMERIC(5,2) NOT NULL DEFAULT 2;
ALTER TABLE eerr_local ADD COLUMN IF NOT EXISTS fee_mkt_pct   NUMERIC(5,2) NOT NULL DEFAULT 2;
