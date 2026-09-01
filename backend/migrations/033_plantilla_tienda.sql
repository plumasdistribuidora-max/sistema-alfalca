-- Reporte de Empleado de Tienda: los 8 puntos del documento de reportes internos.
-- Va para las 4 tiendas de alfajores.
--
-- El checklist Alimendos arranca con ítems provisorios porque todavía no tenemos la
-- lista real. No queda clavado: se edita desde la pantalla de formularios, sin deploy.

INSERT INTO reporte_plantillas (codigo, nombre, area, version, campos) VALUES (
  'tienda', 'Reporte de Turno', 'tienda', 1,
  '[
    {"codigo":"turno","tipo":"seleccion","label":"Turno","opciones":["Mañana","Tarde"],"requerido":true},
    {"codigo":"horas","tipo":"decimal","label":"Horas trabajadas",
     "ayuda":"Las tuyas, del turno de hoy","requerido":true},
    {"codigo":"personas","tipo":"numero","label":"Personas atendidas",
     "ayuda":"Cantidad de tickets del turno","requerido":true},
    {"codigo":"ventas","tipo":"moneda","label":"Venta del turno",
     "ayuda":"Lo que muestra Fudo al cerrar caja","requerido":true},
    {"codigo":"vencimientos","tipo":"si_no_lista","label":"¿Hiciste el check de vencimientos?",
     "label_lista":"Productos a menos de 25 días de vencer","requerido":true,
     "subcampos":[
       {"codigo":"producto","label":"Producto","tipo":"texto"},
       {"codigo":"dias","label":"Días para vencer","tipo":"texto"}
     ]},
    {"codigo":"promocion","tipo":"texto","label":"Promoción activada en el turno",
     "ayuda":"Cuál se activó. Si no hubo, escribí “ninguna”.","requerido":true},
    {"codigo":"mantenimiento","tipo":"texto_largo","label":"Mantenimiento",
     "ayuda":"Novedades edilicias, de máquinas o de pisos. Si no hubo, dejalo vacío.","requerido":false},
    {"codigo":"checklist_alimendos","tipo":"checklist","label":"Checklist Alimendos",
     "ayuda":"Provisorio — falta cargar la lista real",
     "items":["Vitrina repuesta y rotada","Temperatura de heladera controlada","Mercadería vencida retirada"],
     "requerido":true},
    {"codigo":"fotos_cierre","tipo":"foto","label":"Fotos de cómo queda la tienda",
     "ayuda":"Al terminar el turno","max":4,"requerido":true}
  ]'::jsonb
) ON CONFLICT (codigo) DO NOTHING;
