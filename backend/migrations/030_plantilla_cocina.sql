-- Reporte de cocina: los 5 puntos del documento de reportes internos.
-- Va junto con el de café porque en el Café Peatonal las dos encargadas de cocina
-- ya están cargadas como que reportan; sin esta plantilla les daría error al entrar.

INSERT INTO reporte_plantillas (codigo, nombre, area, version, campos) VALUES (
  'cocina', 'Reporte de Cocina', 'cocina', 1,
  '[
    {"codigo":"turno","tipo":"seleccion","label":"Turno","opciones":["Mañana","Tarde"],"requerido":true},
    {"codigo":"horas","tipo":"decimal","label":"Horas trabajadas",
     "ayuda":"Las tuyas, del turno de hoy","requerido":true},
    {"codigo":"control_stock","tipo":"si_no","label":"¿Hiciste el control de stock?","requerido":true},
    {"codigo":"foto_stock","tipo":"foto","label":"Foto del control de stock","max":3,"requerido":true},
    {"codigo":"foto_entrega","tipo":"foto","label":"Foto de la entrega de cocina del turno","max":3,"requerido":true},
    {"codigo":"desechos","tipo":"texto_largo","label":"Reporte de desechos",
     "ayuda":"Qué se tiró y por qué. Si no se tiró nada, escribí “sin desechos”.","requerido":true}
  ]'::jsonb
) ON CONFLICT (codigo) DO NOTHING;

-- Un nombre quedó con un espacio al final al cargarlo, y eso rompe los match por nombre.
UPDATE empleados SET nombre = TRIM(nombre) WHERE nombre <> TRIM(nombre);
