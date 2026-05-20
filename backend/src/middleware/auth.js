const jwt = require('jsonwebtoken');

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
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Se requieren permisos de administrador' });
  }
  next();
}

function canAccessLocal(localIdGetter) {
  return (req, res, next) => {
    if (req.user.rol === 'admin') return next();
    const localId = parseInt(localIdGetter(req));
    if (!localId || !req.user.locales_permitidos?.includes(localId)) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a este local' });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, canAccessLocal };
