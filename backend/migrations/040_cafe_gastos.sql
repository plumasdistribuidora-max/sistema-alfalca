-- El café paga cosas desde la caja: un proveedor que pasa a cobrar, un insumo que faltó y
-- alguien fue a comprar. Sin registrarlo, la venta reportada no cierra contra la caja y
-- nadie sabe en qué se fue la plata. Va después de las facturas del turno.
UPDATE reporte_plantillas
SET campos = (
  SELECT jsonb_agg(c ORDER BY ord)
  FROM (
    SELECT c, ord FROM jsonb_array_elements(campos) WITH ORDINALITY AS t(c, ord)
    UNION ALL
    SELECT '{
      "tipo": "si_no_lista",
      "codigo": "gastos",
      "label": "¿Hubo gastos del turno?",
      "ayuda": "Plata que salió de la caja: un pago a un proveedor o algo que hubo que comprar",
      "requerido": true,
      "label_lista": "Qué se pagó y cuánto",
      "subcampos": [
        { "codigo": "tipo",    "tipo": "seleccion", "label": "Tipo", "opciones": ["Pago a proveedor", "Compra de insumo", "Otro"] },
        { "codigo": "detalle", "tipo": "texto",     "label": "A quién se pagó o qué se compró" },
        { "codigo": "monto",   "tipo": "moneda",    "label": "Monto" }
      ]
    }'::jsonb,
    (SELECT ord FROM jsonb_array_elements(campos) WITH ORDINALITY AS t(c, ord) WHERE c->>'codigo' = 'facturas') + 0.5
  ) x
),
version = version + 1, updated_at = NOW()
WHERE codigo = 'cafe'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(campos) c WHERE c->>'codigo' = 'gastos');
