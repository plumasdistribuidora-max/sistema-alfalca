-- Reporte de barista en dos etapas: "recibo el turno" y "entrego el turno".
--
-- La tolva se entrega siempre vacía (el café se pone malo), así que el stock es solo
-- bolsa abierta + bolsas cerradas, y el consumo del turno es la diferencia entre lo
-- que recibió y lo que entregó. El pesaje del cambio de turno lo hacen las dos
-- baristas juntas: la que recibe ve el de la que entrega y confirma que coincide.
--
-- Lo que se carga al recibir se confirma una vez y queda fijo durante el turno:
-- apertura_at marca ese momento. Un reporte devuelto por el encargado vuelve a ser
-- editable entero, incluida la apertura.

ALTER TABLE reportes ADD COLUMN IF NOT EXISTS apertura_at TIMESTAMPTZ;

-- Los campos con "etapa":"apertura" se contestan al recibir; el resto al entregar.
-- pesaje_cafe agrupa bolsa abierta + bolsas cerradas con sus fotos; con "con_previa"
-- muestra la entrega del turno anterior para confirmarla en vez de volver a cargar.
UPDATE reporte_plantillas SET
  campos = '[
    {"codigo":"turno","tipo":"seleccion","label":"Turno","opciones":["Mañana","Tarde"],"requerido":true},
    {"codigo":"equipamiento_ok","tipo":"si_no","etapa":"apertura",
     "label":"¿Recibís el equipamiento en orden y limpio?","requerido":true},
    {"codigo":"foto_equipamiento_recibo","tipo":"foto","etapa":"apertura",
     "label":"Foto de cómo recibís el equipamiento","max":3,"requerido":true},
    {"codigo":"tolva_vacia","tipo":"si_no","etapa":"apertura",
     "label":"¿Recibís la tolva vacía?",
     "ayuda":"El café no queda en la tolva entre turnos: se entrega siempre vacía.","requerido":true},
    {"codigo":"foto_tolva_recibo","tipo":"foto","etapa":"apertura",
     "label":"Foto de la tolva como la recibís","max":2,"requerido":true},
    {"codigo":"cafe_recibo","tipo":"pesaje_cafe","etapa":"apertura","con_previa":true,
     "label":"Café al recibir el turno",
     "ayuda":"Con la tolva vacía: pesá la bolsa abierta en la balanza de cocina y sumá lo que dice cada bolsa cerrada.",
     "requerido":true},
    {"codigo":"foto_equipamiento_entrego","tipo":"foto",
     "label":"Equipamiento limpio y ordenado","ayuda":"Cómo lo entregás","max":3,"requerido":true},
    {"codigo":"foto_tolva_entrego","tipo":"foto",
     "label":"Tolva vacía para entregar","max":2,"requerido":true},
    {"codigo":"cafe_entrego","tipo":"pesaje_cafe",
     "label":"Café al entregar el turno",
     "ayuda":"Vaciá la tolva y pesá la bolsa abierta junto con quien recibe: es un solo pesaje para las dos.",
     "requerido":true},
    {"codigo":"mantenimiento","tipo":"mantenimiento",
     "label":"Mantenimiento que necesita la máquina",
     "ayuda":"Lo que ya está reportado aparece solo: decí si se solucionó o sigue igual. Abajo podés agregar algo nuevo.","requerido":false},
    {"codigo":"faltantes","tipo":"si_no_lista","label":"¿Te faltó algún insumo?",
     "label_lista":"Qué te faltó","requerido":true,
     "subcampos":[{"codigo":"insumo","label":"Insumo","tipo":"texto"}]}
  ]'::jsonb,
  version = version + 1,
  updated_at = NOW()
WHERE codigo = 'barista' AND NOT (campos @> '[{"tipo":"pesaje_cafe"}]'::jsonb);
