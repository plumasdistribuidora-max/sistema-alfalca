-- Corrección: "Promo Media Docena Conitos" estaba categorizado como
-- "Aceites, Acetos y Vinagres" por error del POS. Categoría correcta: Alfajores.
UPDATE productos_catalogo
SET
  categoria  = 'Alfajores, Conos y Galletas',
  updated_at = NOW()
WHERE LOWER(nombre_normalizado) LIKE '%promo%docena%conito%'
   OR LOWER(nombre_display)     ILIKE '%promo%docena%conito%';
