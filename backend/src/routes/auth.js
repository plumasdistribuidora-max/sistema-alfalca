const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ ok: false, error: 'Email y password requeridos' });

    const { rows } = await pool.query(`
      SELECT u.*, e.area AS empleado_area, e.local_id_principal AS empleado_local_id
      FROM usuarios u
      LEFT JOIN empleados e ON e.id = u.empleado_id
      WHERE u.email = $1 AND u.activo = true
    `, [email.toLowerCase().trim()]);
    if (!rows.length)
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    const user = rows[0];
    if (!await bcrypt.compare(password, user.password_hash))
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    // Un empleado siempre tiene acceso al local donde está asignado, aunque nadie
    // le haya cargado locales_permitidos a mano.
    const locales = user.locales_permitidos?.length
      ? user.locales_permitidos
      : (user.empleado_local_id ? [user.empleado_local_id] : null);

    const payload = {
      id:                 user.id,
      email:              user.email,
      nombre:             user.nombre,
      rol:                user.rol,
      locales_permitidos: locales,
      empleado_id:        user.empleado_id,
      area:               user.empleado_area,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ ok: true, data: { token, user: payload } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.nombre, u.rol, u.locales_permitidos, u.empleado_id, u.created_at,
             e.area AS area, e.local_id_principal AS empleado_local_id,
             l.nombre AS local_nombre
      FROM usuarios u
      LEFT JOIN empleados e ON e.id = u.empleado_id
      LEFT JOIN locales   l ON l.id = e.local_id_principal
      WHERE u.id = $1 AND u.activo = true
    `, [req.user.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const u = rows[0];
    if (!u.locales_permitidos?.length && u.empleado_local_id) {
      u.locales_permitidos = [u.empleado_local_id];
    }
    res.json({ ok: true, data: u });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
