const express = require('express');
const pool    = require('../config/db');
const { hoyStr } = require('../utils/fechas');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');

const router = express.Router();

// El encargado general da de alta y de baja a su gente sin depender del dueño.
const puedeAdministrar = requireRol(ROLES.ENCARGADO_GENERAL);

router.get('/', requireAuth, async (req, res) => {
  try {
    const { local_id } = req.query;
    const params = [];
    let where = '';
    if (local_id) { params.push(local_id); where = 'WHERE e.local_id_principal = $1'; }

    const { rows } = await pool.query(`
      SELECT e.*, l.nombre AS local_nombre,
             u.id AS usuario_id, u.email AS usuario_email, u.rol AS usuario_rol,
             v.valor_hora, v.vigente_desde::text AS valor_hora_desde
      FROM empleados e
      JOIN locales l ON l.id = e.local_id_principal
      LEFT JOIN usuarios u ON u.empleado_id = e.id AND u.activo = true
      LEFT JOIN LATERAL (
        SELECT valor_hora, vigente_desde FROM valor_hora_empleado
        WHERE empleado_id = e.id ORDER BY vigente_desde DESC LIMIT 1
      ) v ON true
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

router.post('/', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { nombre, local_id_principal, area, puesto, carga_reporte } = req.body;
    if (!nombre || !local_id_principal)
      return res.status(400).json({ ok: false, error: 'Falta el nombre o el local' });

    // El nombre del POS dejó de pedirse. Se deriva del nombre real, que es como
    // suele figurar en Fudo, y solo sirve para enganchar tickets viejos sin dueño.
    const posNorm = nombre.toLowerCase().trim();
    const { rows } = await pool.query(
      `INSERT INTO empleados (nombre, nombre_pos, local_id_principal, area, puesto, carga_reporte)
       VALUES ($1, $2, $3, COALESCE($4, 'tienda'), $5, COALESCE($6, true)) RETURNING *`,
      [nombre.trim(), posNorm, local_id_principal, area || null,
       puesto?.trim() || null,
       typeof carga_reporte === 'boolean' ? carga_reporte : null]
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

router.put('/:id', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { nombre, local_id_principal, area, puesto, carga_reporte, activo } = req.body;
    const { rows } = await pool.query(`
      UPDATE empleados SET
        nombre             = COALESCE($1, nombre),
        local_id_principal = COALESCE($2, local_id_principal),
        area               = COALESCE($3, area),
        puesto             = COALESCE($4, puesto),
        carga_reporte      = COALESCE($5, carga_reporte),
        activo             = COALESCE($6, activo)
      WHERE id = $7 RETURNING *
    `, [
      nombre, local_id_principal, area,
      puesto?.trim() || null,
      typeof carga_reporte === 'boolean' ? carga_reporte : null,
      activo, req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al actualizar empleado' });
  }
});

router.delete('/:id', requireAuth, puedeAdministrar, async (req, res) => {
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

// ── PUT /:id/valor-hora ───────────────────────────────────────────────────────
// Cada cambio queda con su fecha: subir un valor no cambia lo que costó un mes
// que ya se cerró.

router.put('/:id/valor-hora', requireAuth, puedeAdministrar, async (req, res) => {
  try {
    const { valor_hora, vigente_desde } = req.body;
    if (!(Number(valor_hora) > 0)) {
      return res.status(400).json({ ok: false, error: 'El valor hora tiene que ser mayor a cero' });
    }
    const existe = await pool.query('SELECT 1 FROM empleados WHERE id = $1', [req.params.id]);
    if (!existe.rowCount) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });

    const hoy = hoyStr();

    await pool.query(`
      INSERT INTO valor_hora_empleado (empleado_id, valor_hora, vigente_desde)
      VALUES ($1, $2, $3)
      ON CONFLICT (empleado_id, vigente_desde) DO UPDATE SET valor_hora = EXCLUDED.valor_hora
    `, [req.params.id, Number(valor_hora), vigente_desde || hoy]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[empleados/valor-hora]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el valor hora' });
  }
});

module.exports = router;
