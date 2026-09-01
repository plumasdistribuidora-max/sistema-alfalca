const express = require('express');
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');

const router = express.Router();

const ROLES_VALIDOS = Object.values(ROLES);

// Quién puede administrar usuarios. El encargado general da de alta y de baja a su gente
// sin depender del dueño; solo el dueño puede crear otros dueños.
const puedeAdministrar = requireRol(ROLES.ENCARGADO_GENERAL);

const SELECT_USUARIO = `
  SELECT u.id, u.email, u.nombre, u.rol, u.locales_permitidos, u.empleado_id, u.activo,
         u.created_at,
         e.nombre AS empleado_nombre, e.area AS empleado_area,
         l.nombre AS local_nombre
  FROM usuarios u
  LEFT JOIN empleados e ON e.id = u.empleado_id
  LEFT JOIN locales   l ON l.id = e.local_id_principal
`;

function validarRol(rol, actor) {
  if (!ROLES_VALIDOS.includes(rol)) {
    return `Rol inválido. Opciones: ${ROLES_VALIDOS.join(', ')}`;
  }
  if (rol === ROLES.ADMIN && actor !== ROLES.ADMIN) {
    return 'Solo un dueño puede crear o asignar el rol de dueño';
  }
  return null;
}

function normalizarLocales(locales_permitidos) {
  if (!Array.isArray(locales_permitidos)) return null;
  const ids = locales_permitidos.map(Number).filter(n => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
}

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { incluir_inactivos } = req.query;
    const where = incluir_inactivos === 'true' ? '' : 'WHERE u.activo = true';
    const { rows } = await pool.query(`${SELECT_USUARIO} ${where} ORDER BY u.activo DESC, u.nombre`);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[usuarios GET]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { email, password, nombre, rol, locales_permitidos, empleado_id } = req.body;

    if (!email || !password || !nombre || !rol) {
      return res.status(400).json({ ok: false, error: 'email, password, nombre y rol son requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña necesita al menos 8 caracteres' });
    }
    const errorRol = validarRol(rol, req.user.rol);
    if (errorRol) return res.status(403).json({ ok: false, error: errorRol });

    const emailNorm = email.toLowerCase().trim();
    const yaExiste = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [emailNorm]);
    if (yaExiste.rowCount) {
      return res.status(409).json({ ok: false, error: 'Ya hay un usuario con ese email' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(`
      INSERT INTO usuarios (email, password_hash, nombre, rol, locales_permitidos, empleado_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      emailNorm, hash, nombre.trim(), rol,
      normalizarLocales(locales_permitidos),
      empleado_id || null,
    ]);

    const creado = await pool.query(`${SELECT_USUARIO} WHERE u.id = $1`, [rows[0].id]);
    res.status(201).json({ ok: true, data: creado.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ese empleado ya tiene un usuario asignado' });
    }
    console.error('[usuarios POST]', err);
    res.status(500).json({ ok: false, error: 'Error al crear el usuario' });
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

router.put('/:id', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { nombre, rol, locales_permitidos, empleado_id, activo } = req.body;

    if (rol) {
      const errorRol = validarRol(rol, req.user.rol);
      if (errorRol) return res.status(403).json({ ok: false, error: errorRol });
    }

    const objetivo = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.params.id]);
    if (!objetivo.rowCount) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    // Un encargado general no puede editar a un dueño.
    if (objetivo.rows[0].rol === ROLES.ADMIN && req.user.rol !== ROLES.ADMIN) {
      return res.status(403).json({ ok: false, error: 'No podés editar a un dueño' });
    }
    if (Number(req.params.id) === req.user.id && activo === false) {
      return res.status(400).json({ ok: false, error: 'No podés desactivar tu propio usuario' });
    }

    const { rows } = await pool.query(`
      UPDATE usuarios SET
        nombre             = COALESCE($1, nombre),
        rol                = COALESCE($2, rol),
        locales_permitidos = COALESCE($3, locales_permitidos),
        empleado_id        = COALESCE($4, empleado_id),
        activo             = COALESCE($5, activo)
      WHERE id = $6
      RETURNING id
    `, [
      nombre?.trim() || null, rol || null,
      normalizarLocales(locales_permitidos),
      empleado_id || null,
      typeof activo === 'boolean' ? activo : null,
      req.params.id,
    ]);

    const actualizado = await pool.query(`${SELECT_USUARIO} WHERE u.id = $1`, [rows[0].id]);
    res.json({ ok: true, data: actualizado.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ese empleado ya tiene un usuario asignado' });
    }
    console.error('[usuarios PUT]', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar el usuario' });
  }
});

// ── PATCH /:id/password ───────────────────────────────────────────────────────

router.patch('/:id/password', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña necesita al menos 8 caracteres' });
    }

    const objetivo = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.params.id]);
    if (!objetivo.rowCount) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (objetivo.rows[0].rol === ROLES.ADMIN && req.user.rol !== ROLES.ADMIN) {
      return res.status(403).json({ ok: false, error: 'No podés cambiarle la contraseña a un dueño' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[usuarios PATCH password]', err);
    res.status(500).json({ ok: false, error: 'Error al cambiar la contraseña' });
  }
});

// ── PATCH /mi-password ────────────────────────────────────────────────────────
// Cualquiera puede cambiar la suya, verificando la actual.

router.patch('/mi/password', requireAuth, async (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body;
    if (!password_actual || !password_nueva) {
      return res.status(400).json({ ok: false, error: 'Ingresá tu contraseña actual y la nueva' });
    }
    if (password_nueva.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña nueva necesita al menos 8 caracteres' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!await bcrypt.compare(password_actual, rows[0].password_hash)) {
      return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta' });
    }

    const hash = await bcrypt.hash(password_nueva, 12);
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[usuarios PATCH mi/password]', err);
    res.status(500).json({ ok: false, error: 'Error al cambiar la contraseña' });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
// Baja lógica: el histórico de reportes tiene que seguir apuntando al usuario.

router.delete('/:id', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No podés darte de baja a vos mismo' });
    }

    const objetivo = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.params.id]);
    if (!objetivo.rowCount) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (objetivo.rows[0].rol === ROLES.ADMIN && req.user.rol !== ROLES.ADMIN) {
      return res.status(403).json({ ok: false, error: 'No podés dar de baja a un dueño' });
    }

    await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[usuarios DELETE]', err);
    res.status(500).json({ ok: false, error: 'Error al dar de baja el usuario' });
  }
});

module.exports = router;
