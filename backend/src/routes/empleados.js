const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { local_id } = req.query;
    const params = [];
    let where = '';
    if (local_id) { params.push(local_id); where = 'WHERE e.local_id_principal = $1'; }

    const { rows } = await pool.query(`
      SELECT e.*, l.nombre AS local_nombre
      FROM empleados e
      JOIN locales l ON l.id = e.local_id_principal
      ${where}
      ORDER BY e.nombre
    `, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener empleados' });
  }
});

// Nombres POS que aparecen en tickets pero no tienen empleado asignado
router.get('/sin-matchear/:local_id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT vt.camarero_pos
      FROM ventas_tickets vt
      WHERE vt.local_id = $1
        AND vt.camarero_pos IS NOT NULL
        AND vt.camarero_pos != ''
        AND vt.empleado_id IS NULL
      ORDER BY vt.camarero_pos
    `, [req.params.local_id]);
    res.json({ ok: true, data: rows.map(r => r.camarero_pos) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener nombres sin matchear' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nombre, nombre_pos, local_id_principal } = req.body;
    if (!nombre || !nombre_pos || !local_id_principal)
      return res.status(400).json({ ok: false, error: 'nombre, nombre_pos y local_id_principal son requeridos' });

    const posNorm = nombre_pos.toLowerCase().trim();
    const { rows } = await pool.query(
      'INSERT INTO empleados (nombre, nombre_pos, local_id_principal) VALUES ($1,$2,$3) RETURNING *',
      [nombre.trim(), posNorm, local_id_principal]
    );

    // Retroactivo: asignar empleado_id a tickets existentes sin match
    await pool.query(`
      UPDATE ventas_tickets
      SET empleado_id = $1
      WHERE local_id = $2 AND LOWER(camarero_pos) = $3 AND empleado_id IS NULL
    `, [rows[0].id, local_id_principal, posNorm]);

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al crear empleado' });
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nombre, nombre_pos, local_id_principal, activo } = req.body;
    const { rows } = await pool.query(`
      UPDATE empleados SET
        nombre             = COALESCE($1, nombre),
        nombre_pos         = COALESCE($2, nombre_pos),
        local_id_principal = COALESCE($3, local_id_principal),
        activo             = COALESCE($4, activo)
      WHERE id = $5 RETURNING *
    `, [nombre, nombre_pos, local_id_principal, activo, req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al actualizar empleado' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE empleados SET activo = false WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al desactivar empleado' });
  }
});

module.exports = router;
