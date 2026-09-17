// 'admin' es el código del rol de dueño — se mantiene por compatibilidad con el backend.
// Lo que ve el usuario es siempre la etiqueta de ROL_LABEL.
export const ROLES = {
  ADMIN:             'admin',
  ENCARGADO_GENERAL: 'encargado_general',
  EMPLEADO_TIENDA:   'empleado_tienda',
  ENCARGADO_CAFE:    'encargado_cafe',
  ENCARGADO_COCINA:  'encargado_cocina',
  BARISTA:           'barista',
};

export const ROL_LABEL = {
  [ROLES.ADMIN]:             'Dueño',
  [ROLES.ENCARGADO_GENERAL]: 'Encargado General',
  [ROLES.EMPLEADO_TIENDA]:   'Empleado de tienda',
  [ROLES.ENCARGADO_CAFE]:    'Encargada de café',
  [ROLES.ENCARGADO_COCINA]:  'Encargada de cocina',
  [ROLES.BARISTA]:           'Barista',
};

export const ROL_DESCRIPCION = {
  [ROLES.ADMIN]:             'Ve todo y configura el sistema',
  [ROLES.ENCARGADO_GENERAL]: 'Recibe los reportes de turno y cierra el consolidado diario',
  [ROLES.EMPLEADO_TIENDA]:   'Carga el reporte de su turno en una tienda de alfajores',
  [ROLES.ENCARGADO_CAFE]:    'Carga el reporte del turno del sector café',
  [ROLES.ENCARGADO_COCINA]:  'Carga el reporte del turno de cocina',
  [ROLES.BARISTA]:           'Carga el reporte de barista: máquina, tolva y stock de café',
};

export const AREAS = ['tienda', 'cafe', 'cocina', 'barista', 'general'];

export const AREA_LABEL = {
  tienda:  'Tienda',
  cafe:    'Café',
  cocina:  'Cocina',
  barista: 'Barista',
  general: 'General',
};

// Puestos de la grilla de turnos, por área.
export const PUESTOS_POR_AREA = {
  tienda:  ['vendedor', 'encargado'],
  cafe:    ['encargado', 'mozo', 'bacha', 'refuerzo'],
  cocina:  ['cocina', 'ref cocina', 'bacha'],
  barista: ['barista'],
  general: ['encargado general'],
};

// De un turno de café de siete personas, solo dos cargan reporte. El resto trabaja,
// se le cuentan las horas, y no entra al sistema. Esto es solo la sugerencia inicial:
// el campo se puede cambiar a mano en cualquier empleado.
const PUESTOS_QUE_REPORTAN = ['encargado', 'encargado general', 'cocina', 'vendedor', 'barista'];

export const puestoReportaPorDefecto = puesto =>
  !puesto || PUESTOS_QUE_REPORTAN.includes(puesto);

// Rol que le corresponde por defecto a un empleado según su área.
export const ROL_POR_AREA = {
  tienda:  ROLES.EMPLEADO_TIENDA,
  cafe:    ROLES.ENCARGADO_CAFE,
  cocina:  ROLES.ENCARGADO_COCINA,
  barista: ROLES.BARISTA,
  general: ROLES.ENCARGADO_GENERAL,
};

export const ROLES_RED = [ROLES.ADMIN, ROLES.ENCARGADO_GENERAL];

// Los que solo cargan su propio reporte de turno.
export const ROLES_DE_TURNO = [
  ROLES.EMPLEADO_TIENDA,
  ROLES.ENCARGADO_CAFE,
  ROLES.ENCARGADO_COCINA,
  ROLES.BARISTA,
];

export const esDueno    = user => user?.rol === ROLES.ADMIN;
export const esDeRed    = user => ROLES_RED.includes(user?.rol);
export const esDeTurno  = user => ROLES_DE_TURNO.includes(user?.rol);

export const rolLabel = rol => ROL_LABEL[rol] || rol || '—';
