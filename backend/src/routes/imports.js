const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getFromR2, deleteFromR2 }   = require('../config/r2');

const router = express.Router();

// GET /api/imports/historial
router.get('/historial', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        il.id,
        il.tipo,
        il.local_id,
        l.nombre        AS local_nombre,
        il.fecha_desde,
        il.fecha_hasta,
        il.created_at,
        il.archivo_nombre,
        il.archivo_r2_key,
        il.filas_total,
        il.filas_insertadas,
        il.filas_actualizadas,
        il.filas_duplicadas,
        il.filas_error,
        il.status,
        u.nombre        AS usuario_nombre
      FROM imports_log il
      JOIN locales l ON l.id = il.local_id
      LEFT JOIN usuarios u ON u.id = il.created_by
      ORDER BY il.created_at DESC
      LIMIT 500
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener historial' });
  }
});

// GET /api/imports/historial/:id/descargar
router.get('/historial/:id/descargar', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT archivo_r2_key, archivo_nombre FROM imports_log WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Import no encontrado' });

    const { archivo_r2_key, archivo_nombre } = rows[0];
    if (!archivo_r2_key) {
      return res.status(404).json({ ok: false, error: 'Este import no tiene archivo guardado en R2' });
    }

    const s3Res = await getFromR2(archivo_r2_key);
    res.setHeader(
      'Content-Type',
      s3Res.ContentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(archivo_nombre)}`
    );
    s3Res.Body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al descargar el archivo' });
  }
});

// DELETE /api/imports/historial/:id?nivel=A|B
router.delete('/historial/:id', requireAuth, requireAdmin, async (req, res) => {
  const { nivel = 'A' } = req.query;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

  try {
    const { rows } = await pool.query('SELECT * FROM imports_log WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Import no encontrado' });
    const imp = rows[0];

    // Opción A: solo quita el registro del historial
    if (nivel === 'A') {
      await pool.query('DELETE FROM imports_log WHERE id = $1', [id]);
      return res.json({ ok: true, mensaje: 'Registro eliminado del historial' });
    }

    // Opción B: elimina datos + R2 + registro (destructivo, irreversible)
    if (nivel === 'B') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: tickets } = await client.query(
          'SELECT id FROM ventas_tickets WHERE archivo_import_id = $1',
          [id]
        );
        const ticketIds = tickets.map(t => t.id);

        if (ticketIds.length > 0) {
          await client.query('DELETE FROM ventas_fiscales   WHERE ticket_id = ANY($1::int[])', [ticketIds]);
          await client.query('DELETE FROM ventas_descuentos WHERE ticket_id = ANY($1::int[])', [ticketIds]);
          await client.query('DELETE FROM ventas_pagos      WHERE ticket_id = ANY($1::int[])', [ticketIds]);
          await client.query('DELETE FROM ventas_items      WHERE ticket_id = ANY($1::int[])', [ticketIds]);
          await client.query('DELETE FROM ventas_tickets    WHERE archivo_import_id = $1', [id]);
        }

        await client.query('DELETE FROM imports_log WHERE id = $1', [id]);
        await client.query('COMMIT');

        if (imp.archivo_r2_key) {
          try { await deleteFromR2(imp.archivo_r2_key); } catch (e) {
            console.error('R2 delete failed (datos ya borrados de DB):', e);
          }
        }

        return res.json({
          ok: true,
          mensaje: `Import eliminado: ${ticketIds.length} ticket(s) y sus datos asociados fueron borrados`,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return res.status(400).json({ ok: false, error: 'El parámetro nivel debe ser A o B' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al eliminar el import' });
  }
});

module.exports = router;
