// 'admin' es el código del rol de dueño — se mantiene por compatibilidad con el backend.
// Lo que ve el usuario es siempre la etiqueta de ROL_LABEL.
export const ROLES = {
  ADMIN:             'admin',
  ENCARGADO_GENERAL: 'encargado_general',
  EMPLEADO_TIENDA:   'empleado_tienda',
  ENCARGADO_CAFE:    'encargado_cafe',
  ENCARGADO_COCINA:  'encargado_cocina',
};

export const ROL_LABEL = {
  [ROLES.ADMIN]:             'Dueño',
  [ROLES.ENCARGADO_GENERAL]: 'Encargado General',
  [ROLES.EMPLEADO_TIENDA]:   'Empleado de tienda',
  [ROLES.ENCARGADO_CAFE]:    'Encargada de café',
  [ROLES.ENCARGADO_COCINA]:  'Encargada de cocina',
};

export const ROL_DESCRIPCION = {
  [ROLES.ADMIN]:             'Ve todo y configura el sistema',
  [ROLES.ENCARGADO_GENERAL]: 'Recibe los reportes de turno y cierra el consolidado diario',
  [ROLES.EMPLEADO_TIENDA]:   'Carga el reporte de su turno en una tienda de alfajores',
  [ROLES.ENCARGADO_CAFE]:    'Carga el reporte del turno del sector café',
  [ROLES.ENCARGADO_COCINA]:  'Carga el reporte del turno de cocina',
};

export const AREAS = ['tienda', 'cafe', 'cocina', 'general'];

export const AREA_LABEL = {
  tienda:  'Tienda',
  cafe:    'Café',
  cocina:  'Cocina',
  general: 'General',
};

// Rol que le corresponde por defecto a un empleado según su área.
export const ROL_POR_AREA = {
  tienda:  ROLES.EMPLEADO_TIENDA,
  cafe:    ROLES.ENCARGADO_CAFE,
  cocina:  ROLES.ENCARGADO_COCINA,
  general: ROLES.ENCARGADO_GENERAL,
};

export const ROLES_RED = [ROLES.ADMIN, ROLES.ENCARGADO_GENERAL];

// Los que solo cargan su propio reporte de turno.
export const ROLES_DE_TURNO = [
  ROLES.EMPLEADO_TIENDA,
  ROLES.ENCARGADO_CAFE,
  ROLES.ENCARGADO_COCINA,
];

export const esDueno    = user => user?.rol === ROLES.ADMIN;
export const esDeRed    = user => ROLES_RED.includes(user?.rol);
export const esDeTurno  = user => ROLES_DE_TURNO.includes(user?.rol);

export const rolLabel = rol => ROL_LABEL[rol] || rol || '—';
