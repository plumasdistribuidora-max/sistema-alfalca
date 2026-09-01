const jwt = require('jsonwebtoken');

// 'admin' es el código del rol de dueño — se mantiene por compatibilidad con los
// chequeos que ya existían en todo el backend. En la UI se muestra como "Dueño".
const ROLES = {
  ADMIN:             'admin',
  ENCARGADO_GENERAL: 'encargado_general',
  EMPLEADO_TIENDA:   'empleado_tienda',
  ENCARGADO_CAFE:    'encargado_cafe',
  ENCARGADO_COCINA:  'encargado_cocina',
};

// Los que ven la red entera y no solo su propio local.
const ROLES_RED = [ROLES.ADMIN, ROLES.ENCARGADO_GENERAL];

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== ROLES.ADMIN) {
    return res.status(403).json({ ok: false, error: 'Se requieren permisos de administrador' });
  }
  next();
}

// El dueño entra siempre, sin necesidad de listarlo en cada llamada.
function requireRol(...roles) {
  return (req, res, next) => {
    if (req.user?.rol === ROLES.ADMIN) return next();
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ ok: false, error: 'No tenés permiso para esta acción' });
    }
    next();
  };
}

function canAccessLocal(localIdGetter) {
  return (req, res, next) => {
    if (ROLES_RED.includes(req.user.rol)) return next();
    const localId = parseInt(localIdGetter(req));
    if (!localId || !req.user.locales_permitidos?.includes(localId)) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a este local' });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requireRol, canAccessLocal, ROLES, ROLES_RED };
