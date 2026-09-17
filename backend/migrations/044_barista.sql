-- Perfil de Barista.
--
-- En el café hay un barista por turno y tiene cosas propias que reportar: cómo recibe
-- la máquina y la tolva, cuánto café hay (bolsas cerradas + bolsa abierta pesada), y al
-- cerrar, fotos de cómo deja todo. Nada de eso lo cubre el reporte de la encargada.
--
-- Va como área propia (como cocina) y no como puesto dentro de "cafe": el área es lo
-- que le dice al encargado cuántos reportes esperar por local, y acá espera dos más.

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN (
  'admin', 'encargado_general', 'empleado_tienda', 'encargado_cafe', 'encargado_cocina',
  'barista'
));

ALTER TABLE empleados DROP CONSTRAINT IF EXISTS empleados_area_check;
ALTER TABLE empleados ADD CONSTRAINT empleados_area_check CHECK (area IN (
  'tienda', 'cafe', 'cocina', 'general', 'barista'
));

-- Los baristas ya cargados pasan al área nueva y empiezan a reportar.
UPDATE empleados SET area = 'barista', carga_reporte = true
WHERE puesto = 'barista' AND area = 'cafe';

-- El formulario. Los campos con "etapa":"apertura" se contestan al empezar el turno y
-- se confirman en bloque (el cierre parcial); el resto al terminar. Hasta que el motor
-- soporte la etapa, se cargan todos juntos.
INSERT INTO reporte_plantillas (codigo, nombre, area, version, campos) VALUES (
  'barista', 'Reporte de Barista', 'barista', 1,
  '[
    {"codigo":"turno","tipo":"seleccion","label":"Turno","opciones":["Mañana","Tarde"],"requerido":true},
    {"codigo":"equipamiento_ok","tipo":"si_no","etapa":"apertura",
     "label":"¿Recibís el equipamiento del turno anterior en orden y limpio?","requerido":true},
    {"codigo":"tolva_recibida","tipo":"seleccion","etapa":"apertura",
     "label":"¿Cómo recibís la tolva?","ayuda":"Cada turno la tiene que dejar llena al máximo",
     "opciones":["Llena al máximo","Por la mitad","Casi vacía"],"requerido":true},
    {"codigo":"cafe_cerrado_kg","tipo":"decimal","etapa":"apertura",
     "label":"Kilos de café en bolsas cerradas","ayuda":"Las del depósito. Sumá lo que dice cada bolsa.","requerido":true},
    {"codigo":"foto_cerradas","tipo":"foto","etapa":"apertura",
     "label":"Foto de las bolsas cerradas","max":3,"requerido":true},
    {"codigo":"cafe_abierto_kg","tipo":"decimal","etapa":"apertura",
     "label":"Kilos en la bolsa abierta","ayuda":"Pesala en la balanza de cocina","requerido":true},
    {"codigo":"foto_abierta","tipo":"foto","etapa":"apertura",
     "label":"Foto de la balanza con la bolsa abierta","max":2,"requerido":true},
    {"codigo":"foto_equipamiento","tipo":"foto",
     "label":"Equipamiento limpio y ordenado","ayuda":"Cómo lo dejás para el próximo turno","max":3,"requerido":true},
    {"codigo":"foto_tolva","tipo":"foto",
     "label":"Tolva llena para cerrar el turno","max":2,"requerido":true},
    {"codigo":"mantenimiento","tipo":"mantenimiento",
     "label":"Mantenimiento que necesita la máquina",
     "ayuda":"Lo que ya está reportado aparece solo: decí si se solucionó o sigue igual. Abajo podés agregar algo nuevo.","requerido":false},
    {"codigo":"faltantes","tipo":"si_no_lista","label":"¿Te faltó algún insumo?",
     "label_lista":"Qué te faltó","requerido":true,
     "subcampos":[{"codigo":"insumo","label":"Insumo","tipo":"texto"}]}
  ]'::jsonb
) ON CONFLICT (codigo) DO NOTHING;
