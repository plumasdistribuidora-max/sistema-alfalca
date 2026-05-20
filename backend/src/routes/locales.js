const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM locales ORDER BY id');
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener locales' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM locales WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Local no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener local' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { codigo, nombre, tipo, direccion } = req.body;
    if (!codigo || !nombre || !tipo)
      return res.status(400).json({ ok: false, error: 'codigo, nombre y tipo son requeridos' });

    const { rows } = await pool.query(
      'INSERT INTO locales (codigo, nombre, tipo, direccion) VALUES ($1,$2,$3,$4) RETURNING *',
      [codigo.trim(), nombre.trim(), tipo, direccion]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'El código ya existe' });
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al crear local' });
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nombre, tipo, direccion, activo } = req.body;
    const { rows } = await pool.query(`
      UPDATE locales SET
        nombre    = COALESCE($1, nombre),
        tipo      = COALESCE($2::tipo_local, tipo),
        direccion = COALESCE($3, direccion),
        activo    = COALESCE($4, activo)
      WHERE id = $5 RETURNING *
    `, [nombre, tipo, direccion, activo, req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Local no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al actualizar local' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE locales SET activo = false WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Local no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al desactivar local' });
  }
});

module.exports = router;
