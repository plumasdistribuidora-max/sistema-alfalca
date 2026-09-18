-- Reporte de barista simplificado: dos pesajes por día, uno en cada reporte.
--
-- El de dos etapas (recibo/entrego, con un pesaje compartido en el cambio de turno)
-- era demasiado complicado. Ahora cada barista carga un solo reporte, de una vez:
--   Mañana: al entrar, antes de cargar la tolva, pesa el café que hay.
--   Tarde:  al terminar el día, ya sin sacar más café, vacía la tolva de vuelta a la
--           bolsa abierta y pesa lo que queda.
-- El consumo del día es mañana menos tarde, y se compara con el teórico del día entero.
-- Se sacan las fotos de máquina y tolva y la pregunta de la tolva vacía: queda un sí/no
-- de cómo se recibió la máquina, el pesaje con sus fotos, mantenimiento y faltantes.
--
-- Los textos cambian según el turno: "por_turno" pisa label y ayuda del campo.

UPDATE reporte_plantillas SET
  campos = '[
    {"codigo":"turno","tipo":"seleccion","label":"Turno","opciones":["Mañana","Tarde"],"requerido":true},
    {"codigo":"maquina_ok","tipo":"si_no","label":"¿Recibiste la máquina en orden y limpia?","requerido":true,
     "por_turno":{
       "Mañana":{"ayuda":"Como la dejó el turno de ayer a la tarde."},
       "Tarde":{"ayuda":"Como la dejó el turno de la mañana."}}},
    {"codigo":"cafe","tipo":"pesaje_cafe","label":"Café","requerido":true,
     "por_turno":{
       "Mañana":{"label":"Café al empezar el día",
                 "ayuda":"Antes de cargar la tolva: pesá la bolsa abierta en la balanza de cocina y sumá lo que dice cada bolsa cerrada."},
       "Tarde":{"label":"Café al terminar el día",
                "ayuda":"Ya no se saca más café. Vaciá la tolva de vuelta a la bolsa abierta, pesala en la balanza de cocina y sumá lo que dice cada bolsa cerrada."}}},
    {"codigo":"mantenimiento","tipo":"mantenimiento",
     "label":"¿Hay que hacer algún mantenimiento?",
     "ayuda":"Un problema por renglón, así cada uno tiene su solución. Lo que ya está reportado aparece solo: decí si se solucionó o sigue igual.",
     "requerido":false},
    {"codigo":"faltantes","tipo":"si_no_lista","label":"¿Te faltó algún insumo?",
     "label_lista":"Qué te faltó","requerido":true,
     "subcampos":[{"codigo":"insumo","label":"Insumo","tipo":"texto"}]}
  ]'::jsonb,
  version = version + 1,
  updated_at = NOW()
WHERE codigo = 'barista' AND campos @> '[{"etapa":"apertura"}]'::jsonb;

-- Los borradores del formulario viejo arrancan de cero: sin apertura confirmada y sin
-- las respuestas de los campos que ya no existen.
UPDATE reportes SET
  apertura_at = NULL,
  respuestas  = respuestas - 'equipamiento_ok' - 'foto_equipamiento_recibo' - 'tolva_vacia'
                           - 'foto_tolva_recibo' - 'cafe_recibo' - 'cafe_entrego',
  updated_at  = NOW()
WHERE plantilla_codigo = 'barista' AND estado = 'borrador'
  AND (apertura_at IS NOT NULL OR respuestas ?| ARRAY['cafe_recibo', 'cafe_entrego', 'tolva_vacia']);
