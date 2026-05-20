const express  = require('express');
const multer   = require('multer');
const xlsx     = require('xlsx');
const pool     = require('../config/db');
const { uploadToR2 } = require('../config/r2');
const { requireAuth, canAccessLocal } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Helpers ────────────────────────────────────────────────────────────────

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  if (typeof val === 'number') {
    // Excel serial → JS timestamp. 25569 = days between 1899-12-30 and 1970-01-01
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizeEstado(val) {
  if (!val) return 'cerrada';
  const v = val.toString().toLowerCase().trim();
  if (v === 'cerrada')  return 'cerrada';
  if (v === 'eliminada') return 'eliminada';
  if (v.includes('curso')) return 'en_curso';
  return 'cerrada';
}

function parseFiscal(val) {
  if (!val) return false;
  return val.toString().toLowerCase().trim() === 'si';
}

function getCol(row, ...names) {
  for (const n of names) {
    if (row[n] !== null && row[n] !== undefined) return row[n];
  }
  return null;
}

function checkLocalAccess(user, localId) {
  if (user.rol === 'admin') return true;
  return user.locales_permitidos?.includes(parseInt(localId));
}

// ── POST /import ───────────────────────────────────────────────────────────

router.post('/import', requireAuth, upload.single('archivo'), async (req, res) => {
  const { local_id } = req.body;

  if (!local_id || !req.file)
    return res.status(400).json({ ok: false, error: 'local_id y archivo son requeridos' });

  if (!checkLocalAccess(req.user, local_id))
    return res.status(403).json({ ok: false, error: 'Sin acceso a este local' });

  const localRes = await pool.query('SELECT * FROM locales WHERE id = $1 AND activo = true', [local_id]);
  if (!localRes.rows.length)
    return res.status(404).json({ ok: false, error: 'Local no encontrado' });
  const local = localRes.rows[0];

  // Registrar el import como "procesando"
  const logRes = await pool.query(`
    INSERT INTO imports_log (local_id, tipo, archivo_nombre, status, created_by)
    VALUES ($1, 'ventas', $2, 'procesando', $3) RETURNING id
  `, [local_id, req.file.originalname, req.user.id]);
  const importId = logRes.rows[0].id;

  try {
    // Upload a R2
    const fechaStr = new Date().toISOString().split('T')[0];
    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `imports/${local.codigo}/${fechaStr}-${safeFilename}`;
    await uploadToR2(r2Key, req.file.buffer, req.file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Parsear Excel — header en fila 4 → range: 3
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { range: 3, defval: null });

    // Mapa de empleados del local para auto-match
    const empRes = await pool.query(
      'SELECT id, nombre_pos FROM empleados WHERE local_id_principal = $1 AND activo = true',
      [local_id]
    );
    const empMap = {};
    empRes.rows.forEach(e => { empMap[e.nombre_pos.toLowerCase()] = e.id; });

    let insertadas = 0, actualizadas = 0, errores = 0;
    let fechaDesde = null, fechaHasta = null;
    const errorDetails = [];

    for (const row of rows) {
      try {
        const posId = parseInt(getCol(row, 'Id', 'ID', 'id'));
        if (!posId || isNaN(posId)) { errores++; continue; }

        const fecha      = parseExcelDate(getCol(row, 'Fecha'));
        const creacion   = parseExcelDate(getCol(row, 'Creación', 'Creacion', 'Apertura'));
        const cerrada    = parseExcelDate(getCol(row, 'Cerrada', 'Cierre'));
        const estado     = normalizeEstado(getCol(row, 'Estado'));
        const camareroRaw = getCol(row, 'Camarero / Repartidor', 'Camarero', 'Repartidor', 'Mozo');
        const camareroPos = camareroRaw ? camareroRaw.toString().toLowerCase().trim() : null;
        const empleadoId  = camareroPos ? (empMap[camareroPos] ?? null) : null;
        const fiscal      = parseFiscal(getCol(row, 'Fiscal'));
        const total       = parseFloat(getCol(row, 'Total') ?? 0) || 0;
        const personas    = parseInt(getCol(row, 'Personas')) || null;

        if (fecha) {
          const d = new Date(fecha);
          if (!fechaDesde || d < new Date(fechaDesde)) fechaDesde = d.toISOString().split('T')[0];
          if (!fechaHasta || d > new Date(fechaHasta)) fechaHasta = d.toISOString().split('T')[0];
        }

        const upsert = await pool.query(`
          INSERT INTO ventas_tickets (
            local_id, pos_id, fecha, creacion, cerrada, caja, estado,
            cliente, mesa, sala, personas, camarero_pos, empleado_id,
            medio_pago, total, fiscal, tipo_venta, comentario, origen, id_origen,
            archivo_import_id, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
          ON CONFLICT (local_id, pos_id) DO UPDATE SET
            fecha             = EXCLUDED.fecha,
            creacion          = EXCLUDED.creacion,
            cerrada           = EXCLUDED.cerrada,
            caja              = EXCLUDED.caja,
            estado            = EXCLUDED.estado,
            cliente           = EXCLUDED.cliente,
            mesa              = EXCLUDED.mesa,
            sala              = EXCLUDED.sala,
            personas          = EXCLUDED.personas,
            camarero_pos      = EXCLUDED.camarero_pos,
            empleado_id       = COALESCE(EXCLUDED.empleado_id, ventas_tickets.empleado_id),
            medio_pago        = EXCLUDED.medio_pago,
            total             = EXCLUDED.total,
            fiscal            = EXCLUDED.fiscal,
            tipo_venta        = EXCLUDED.tipo_venta,
            comentario        = EXCLUDED.comentario,
            origen            = EXCLUDED.origen,
            id_origen         = EXCLUDED.id_origen,
            archivo_import_id = EXCLUDED.archivo_import_id,
            updated_at        = NOW()
          RETURNING (xmax = 0) AS inserted
        `, [
          local_id, posId, fecha, creacion, cerrada,
          getCol(row, 'Caja') || null,
          estado,
          getCol(row, 'Cliente') || null,
          getCol(row, 'Mesa') || null,
          getCol(row, 'Sala') || null,
          personas,
          camareroPos || null,
          empleadoId,
          getCol(row, 'Medio de Pago', 'Medio Pago') || null,
          total,
          fiscal,
          getCol(row, 'Tipo de Venta', 'Tipo Venta') || null,
          getCol(row, 'Comentario') || null,
          getCol(row, 'Origen') || null,
          getCol(row, 'Id. Origen', 'Id Origen') || null,
          importId,
        ]);

        upsert.rows[0].inserted ? insertadas++ : actualizadas++;

      } catch (rowErr) {
        errores++;
        errorDetails.push({ pos_id: row['Id'], error: rowErr.message });
      }
    }

    await pool.query(`
      UPDATE imports_log SET
        archivo_r2_key    = $1,
        filas_total       = $2,
        filas_insertadas  = $3,
        filas_actualizadas= $4,
        filas_error       = $5,
        status            = 'completado',
        error_detail      = $6,
        fecha_desde       = $7,
        fecha_hasta       = $8
      WHERE id = $9
    `, [r2Key, rows.length, insertadas, actualizadas, errores,
        errorDetails.length ? JSON.stringify(errorDetails) : null,
        fechaDesde, fechaHasta, importId]);

    res.json({
      ok: true,
      data: { import_id: importId, filas_total: rows.length, insertadas, actualizadas, errores, fechaDesde, fechaHasta },
    });

  } catch (err) {
    console.error(err);
    await pool.query(
      "UPDATE imports_log SET status = 'error', error_detail = $1 WHERE id = $2",
      [JSON.stringify({ error: err.message }), importId]
    );
    res.status(500).json({ ok: false, error: 'Error al procesar el archivo: ' + err.message });
  }
});

// ── GET /imports (historial) ───────────────────────────────────────────────

router.get('/imports', requireAuth, async (req, res) => {
  try {
    const { local_id } = req.query;
    const params = [];
    let where = '';
    if (local_id) { params.push(local_id); where = 'WHERE il.local_id = $1'; }

    const { rows } = await pool.query(`
      SELECT il.*, l.nombre AS local_nombre, u.nombre AS usuario_nombre
      FROM imports_log il
      JOIN locales l ON l.id = il.local_id
      LEFT JOIN usuarios u ON u.id = il.created_by
      ${where}
      ORDER BY il.created_at DESC
      LIMIT 200
    `, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener historial' });
  }
});

// ── GET / (listado paginado) ───────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const { local_id, desde, hasta, estado, fiscal, medio_pago, empleado_id, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params     = [];

    const p = (val) => { params.push(val); return `$${params.length}`; };

    if (local_id)   conditions.push(`vt.local_id = ${p(local_id)}`);
    if (desde)      conditions.push(`vt.fecha >= ${p(desde)}`);
    if (hasta)      conditions.push(`vt.fecha <= ${p(hasta)}`);
    if (estado)     conditions.push(`vt.estado = ${p(estado)}`);
    if (fiscal !== undefined && fiscal !== '') conditions.push(`vt.fiscal = ${p(fiscal === 'true')}`);
    if (medio_pago) conditions.push(`vt.medio_pago = ${p(medio_pago)}`);
    if (empleado_id) conditions.push(`vt.empleado_id = ${p(empleado_id)}`);

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const countRes = await pool.query(`SELECT COUNT(*) FROM ventas_tickets vt ${where}`, params);

    const dataParams = [...params, parseInt(limit), offset];
    const { rows } = await pool.query(`
      SELECT vt.*, l.nombre AS local_nombre, e.nombre AS empleado_nombre
      FROM ventas_tickets vt
      JOIN locales l ON l.id = vt.local_id
      LEFT JOIN empleados e ON e.id = vt.empleado_id
      ${where}
      ORDER BY vt.fecha DESC, vt.pos_id DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      ok: true,
      data: rows,
      meta: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas' });
  }
});

// ── GET /resumen ───────────────────────────────────────────────────────────

router.get('/resumen', requireAuth, async (req, res) => {
  try {
    const { local_id, desde, hasta } = req.query;
    if (!local_id || !desde || !hasta)
      return res.status(400).json({ ok: false, error: 'local_id, desde y hasta son requeridos' });

    const [porDia, mixMedios, rankingEmp, totales] = await Promise.all([
      pool.query(`
        SELECT
          fecha,
          COUNT(*)    FILTER (WHERE estado = 'cerrada')                    AS tickets,
          SUM(total)  FILTER (WHERE estado = 'cerrada')                    AS ventas_brutas,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = true)  AS ventas_fiscal,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = false) AS ventas_no_fiscal,
          ROUND(AVG(total) FILTER (WHERE estado = 'cerrada'), 2)           AS ticket_promedio
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY fecha ORDER BY fecha
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          COALESCE(medio_pago, 'Sin especificar') AS medio_pago,
          COUNT(*)   AS tickets,
          SUM(total) AS total
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2 AND $3 AND estado = 'cerrada'
        GROUP BY medio_pago ORDER BY total DESC NULLS LAST
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          vt.camarero_pos,
          e.nombre         AS empleado_nombre,
          COUNT(*)         AS tickets,
          SUM(vt.total)    AS total,
          ROUND(AVG(vt.total), 2) AS ticket_promedio
        FROM ventas_tickets vt
        LEFT JOIN empleados e ON e.id = vt.empleado_id
        WHERE vt.local_id = $1 AND vt.fecha BETWEEN $2 AND $3 AND vt.estado = 'cerrada'
          AND vt.camarero_pos IS NOT NULL AND vt.camarero_pos != ''
        GROUP BY vt.camarero_pos, e.nombre
        ORDER BY total DESC NULLS LAST
        LIMIT 15
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          COUNT(*)    FILTER (WHERE estado = 'cerrada')                    AS tickets_total,
          SUM(total)  FILTER (WHERE estado = 'cerrada')                    AS ventas_total,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = true)  AS ventas_fiscal,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = false) AS ventas_no_fiscal,
          ROUND(AVG(total) FILTER (WHERE estado = 'cerrada'), 2)           AS ticket_promedio
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2 AND $3
      `, [local_id, desde, hasta]),
    ]);

    res.json({
      ok: true,
      data: {
        totales:           totales.rows[0],
        por_dia:           porDia.rows,
        mix_medios:        mixMedios.rows,
        ranking_empleados: rankingEmp.rows,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen' });
  }
});

// ── GET /consolidado ───────────────────────────────────────────────────────

router.get('/consolidado', requireAuth, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta)
      return res.status(400).json({ ok: false, error: 'desde y hasta son requeridos' });

    const { rows } = await pool.query(`
      SELECT
        l.id                                                                   AS local_id,
        l.nombre                                                               AS local_nombre,
        l.codigo,
        l.tipo,
        COUNT(vt.id)    FILTER (WHERE vt.estado = 'cerrada')                   AS tickets,
        SUM(vt.total)   FILTER (WHERE vt.estado = 'cerrada')                   AS ventas_total,
        SUM(vt.total)   FILTER (WHERE vt.estado = 'cerrada' AND vt.fiscal = true)  AS ventas_fiscal,
        SUM(vt.total)   FILTER (WHERE vt.estado = 'cerrada' AND vt.fiscal = false) AS ventas_no_fiscal,
        ROUND(AVG(vt.total) FILTER (WHERE vt.estado = 'cerrada'), 2)           AS ticket_promedio
      FROM locales l
      LEFT JOIN ventas_tickets vt
        ON vt.local_id = l.id AND vt.fecha BETWEEN $1 AND $2
      WHERE l.activo = true
      GROUP BY l.id, l.nombre, l.codigo, l.tipo
      ORDER BY ventas_total DESC NULLS LAST
    `, [desde, hasta]);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener consolidado' });
  }
});

// ── GET /comparativo ──────────────────────────────────────────────────────

router.get('/comparativo', requireAuth, async (req, res) => {
  try {
    const { desde, hasta, agrupacion = 'dia' } = req.query;
    if (!desde || !hasta)
      return res.status(400).json({ ok: false, error: 'desde y hasta son requeridos' });

    const trunc = agrupacion === 'mes'    ? "DATE_TRUNC('month', fecha)"
                : agrupacion === 'semana' ? "DATE_TRUNC('week', fecha)"
                : 'fecha';

    const { rows } = await pool.query(`
      SELECT
        ${trunc}            AS periodo,
        l.id                AS local_id,
        l.nombre            AS local_nombre,
        l.codigo,
        COUNT(*)   FILTER (WHERE vt.estado = 'cerrada') AS tickets,
        SUM(total) FILTER (WHERE vt.estado = 'cerrada') AS ventas_total
      FROM ventas_tickets vt
      JOIN locales l ON l.id = vt.local_id
      WHERE vt.fecha BETWEEN $1 AND $2
      GROUP BY periodo, l.id, l.nombre, l.codigo
      ORDER BY periodo, l.id
    `, [desde, hasta]);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener comparativo' });
  }
});

module.exports = router;
