const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Constantes y helpers ────────────────────────────────────────────────────

const TZ = 'America/Argentina/Mendoza';

const DIA_NOMBRE = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves',
  5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
};

function firstOfMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function dias(desde, hasta) {
  return Math.ceil((new Date(hasta) - new Date(desde)) / 86400000) + 1;
}

function n(v) { return Number(v) || 0; }   // safe numeric cast
function pct(part, total) {                 // porcentaje redondeado
  return total > 0 ? Math.round(part / total * 1000) / 10 : 0;
}

// Resuelve y valida local_id, desde, hasta. Devuelve null y escribe el error si algo falla.
async function resolveParams(req, res) {
  const { local_id, desde: dq, hasta: hq } = req.query;
  if (!local_id) {
    res.status(400).json({ ok: false, error: 'local_id es requerido' });
    return null;
  }
  const desde = dq || firstOfMonth();
  const hasta  = hq || todayStr();
  if (!isValidDate(desde) || !isValidDate(hasta)) {
    res.status(400).json({ ok: false, error: 'Fechas inválidas (usar YYYY-MM-DD)' });
    return null;
  }
  const lr = await pool.query('SELECT id FROM locales WHERE id = $1 AND activo = true', [local_id]);
  if (!lr.rows.length) { res.status(404).json({ ok: false, error: 'Local no encontrado' }); return null; }
  return { local_id: parseInt(local_id), desde, hasta, d: dias(desde, hasta) };
}

// WHERE reutilizable para ventas_items filtrado por local + rango en TZ argentina
function viWhere(alias = 'vi') {
  return `${alias}.local_id = $1 AND DATE(${alias}.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $2::date AND $3::date`;
}

// ── A) GET /catalogo ─────────────────────────────────────────────────────────

router.get('/catalogo', requireAuth, async (req, res) => {
  try {
    const p = await resolveParams(req, res);
    if (!p) return;
    const { local_id, desde, hasta } = p;

    const [catRes, metaRes] = await Promise.all([
      pool.query(`
        SELECT
          pc.id,
          pc.nombre_display,
          pc.categoria,
          pc.subcategoria,
          pc.codigo_pos,
          pc.docenas_por_unidad,
          pc.es_adicional,
          pc.regla_descripcion,
          pc.precio_promedio,
          COALESCE(SUM(vi.cantidad)     FILTER (WHERE NOT vi.cancelada), 0) AS total_vendido_cantidad,
          COALESCE(SUM(vi.precio_total) FILTER (WHERE NOT vi.cancelada), 0) AS total_vendido_pesos
        FROM productos_catalogo pc
        LEFT JOIN ventas_items vi
          ON vi.producto_id = pc.id
         AND vi.local_id = $1
         AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $2::date AND $3::date
        GROUP BY pc.id
        ORDER BY total_vendido_cantidad DESC NULLS LAST
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          COUNT(*)                                        AS total_productos,
          COUNT(*) FILTER (WHERE docenas_por_unidad > 0) AS productos_con_docenas,
          COUNT(*) FILTER (WHERE es_adicional = true)    AS productos_adicionales
        FROM productos_catalogo
      `),
    ]);

    const m = metaRes.rows[0];
    res.json({
      ok: true,
      data: catRes.rows,
      meta: {
        total_productos:       n(m.total_productos),
        productos_con_docenas: n(m.productos_con_docenas),
        productos_adicionales: n(m.productos_adicionales),
      },
    });
  } catch (err) {
    console.error('[productos/catalogo]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── B) GET /docenas-resumen ───────────────────────────────────────────────────

router.get('/docenas-resumen', requireAuth, async (req, res) => {
  try {
    const p = await resolveParams(req, res);
    if (!p) return;
    const { local_id, desde, hasta, d } = p;
    const params = [local_id, desde, hasta];

    const [totRes, topRes, catRes] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS total_docenas,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE     vi.cancelada), 0) AS total_docenas_canceladas,
          COUNT(*)              FILTER (WHERE NOT vi.cancelada)                      AS total_items_vendidos,
          COUNT(*)              FILTER (WHERE     vi.cancelada)                      AS total_items_cancelados,
          COUNT(*) FILTER (WHERE NOT vi.cancelada AND EXISTS (
            SELECT 1 FROM productos_catalogo pc2
            WHERE pc2.id = vi.producto_id AND pc2.es_adicional = true
          ))                                                                         AS adicionales_total
        FROM ventas_items vi
        WHERE ${viWhere()}
      `, params),

      pool.query(`
        SELECT
          pc.nombre_display                                                          AS producto,
          SUM(vi.cantidad)                                                           AS cantidad,
          pc.docenas_por_unidad,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS total_docenas
        FROM ventas_items vi
        JOIN productos_catalogo pc ON pc.id = vi.producto_id
        WHERE ${viWhere()} AND vi.docenas_equivalentes > 0
        GROUP BY pc.id, pc.nombre_display, pc.docenas_por_unidad
        ORDER BY total_docenas DESC
        LIMIT 10
      `, params),

      pool.query(`
        SELECT
          COALESCE(pc.categoria, 'Sin categoría')                                   AS categoria,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
        FROM ventas_items vi
        LEFT JOIN productos_catalogo pc ON pc.id = vi.producto_id
        WHERE ${viWhere()} AND vi.docenas_equivalentes > 0
        GROUP BY pc.categoria
        ORDER BY docenas DESC
      `, params),
    ]);

    const tot        = totRes.rows[0];
    const totalDoc   = n(tot.total_docenas);

    res.json({
      ok: true,
      data: {
        periodo: { desde, hasta, dias: d },
        total_docenas:              Math.round(totalDoc * 10000) / 10000,
        total_docenas_canceladas:   Math.round(n(tot.total_docenas_canceladas) * 10000) / 10000,
        total_items_vendidos:       n(tot.total_items_vendidos),
        total_items_cancelados:     n(tot.total_items_cancelados),
        adicionales_total:          n(tot.adicionales_total),
        top_productos_docenas:      topRes.rows.map(r => ({
          producto:          r.producto,
          cantidad:          n(r.cantidad),
          docenas_por_unidad: n(r.docenas_por_unidad),
          total_docenas:     Math.round(n(r.total_docenas) * 10000) / 10000,
          porcentaje_del_total: pct(n(r.total_docenas), totalDoc),
        })),
        por_categoria:              catRes.rows.map(r => ({
          categoria:  r.categoria,
          docenas:    Math.round(n(r.docenas) * 10000) / 10000,
          porcentaje: pct(n(r.docenas), totalDoc),
        })),
        docenas_promedio_por_dia:   d > 0 ? Math.round(totalDoc / d * 100) / 100 : 0,
      },
    });
  } catch (err) {
    console.error('[productos/docenas-resumen]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── C) GET /docenas-por-empleado ──────────────────────────────────────────────

router.get('/docenas-por-empleado', requireAuth, async (req, res) => {
  try {
    const p = await resolveParams(req, res);
    if (!p) return;
    const { local_id, desde, hasta, d } = p;
    const params = [local_id, desde, hasta];

    const [empRes, totRes] = await Promise.all([
      pool.query(`
        SELECT
          vi.empleado                                                                       AS nombre,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0)        AS docenas_vendidas,
          COUNT(*)                              FILTER (WHERE NOT vi.cancelada)             AS items_vendidos,
          COUNT(*)                              FILTER (WHERE     vi.cancelada)             AS items_cancelados,
          COUNT(DISTINCT vi.ticket_id)                                                      AS tickets_atendidos
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.empleado IS NOT NULL AND vi.empleado != ''
        GROUP BY vi.empleado
        ORDER BY docenas_vendidas DESC
      `, params),

      pool.query(`
        SELECT COALESCE(SUM(docenas_equivalentes) FILTER (WHERE NOT cancelada), 0) AS total
        FROM ventas_items
        WHERE ${viWhere().replace(/vi\./g, '')}
      `, params),
    ]);

    const totalDoc = n(totRes.rows[0].total);

    const empleados = empRes.rows.map((r, i) => {
      const doc  = n(r.docenas_vendidas);
      const vend = n(r.items_vendidos);
      const canc = n(r.items_cancelados);
      const tkt  = n(r.tickets_atendidos);
      return {
        nombre:                      r.nombre,
        docenas_vendidas:            Math.round(doc * 10000) / 10000,
        porcentaje:                  pct(doc, totalDoc),
        items_vendidos:              vend,
        items_cancelados:            canc,
        tasa_cancelacion:            pct(canc, vend + canc),
        tickets_atendidos:           tkt,
        docenas_por_ticket_promedio: tkt > 0 ? Math.round(doc / tkt * 100) / 100 : 0,
        ranking:                     i + 1,
      };
    });

    res.json({
      ok: true,
      data: {
        periodo:       { desde, hasta, dias: d },
        total_docenas: Math.round(totalDoc * 10000) / 10000,
        empleados,
      },
    });
  } catch (err) {
    console.error('[productos/docenas-por-empleado]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── D) GET /docenas-por-dia ───────────────────────────────────────────────────

router.get('/docenas-por-dia', requireAuth, async (req, res) => {
  try {
    const p = await resolveParams(req, res);
    if (!p) return;
    const { local_id, desde, hasta, d } = p;
    const params = [local_id, desde, hasta];

    const [serieRes, semanaRes, mesRes] = await Promise.all([
      pool.query(`
        SELECT
          DATE_TRUNC('day', vi.fecha_creacion AT TIME ZONE '${TZ}')::date AS fecha,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas,
          COUNT(*)              FILTER (WHERE NOT vi.cancelada)                      AS items,
          COUNT(DISTINCT vi.ticket_id) FILTER (WHERE NOT vi.cancelada)              AS tickets
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.fecha_creacion IS NOT NULL
        GROUP BY fecha
        ORDER BY fecha
      `, params),

      pool.query(`
        SELECT
          DATE_TRUNC('week', vi.fecha_creacion AT TIME ZONE '${TZ}')::date         AS semana_inicio,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas,
          COUNT(DISTINCT DATE(vi.fecha_creacion AT TIME ZONE '${TZ}'))
            FILTER (WHERE NOT vi.cancelada)                                          AS dias_con_venta
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.fecha_creacion IS NOT NULL
        GROUP BY semana_inicio
        ORDER BY semana_inicio
      `, params),

      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', vi.fecha_creacion AT TIME ZONE '${TZ}'), 'YYYY-MM') AS mes,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0)        AS docenas
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.fecha_creacion IS NOT NULL
        GROUP BY mes
        ORDER BY mes
      `, params),
    ]);

    res.json({
      ok: true,
      data: {
        serie: serieRes.rows.map(r => ({
          fecha:   r.fecha,
          docenas: Math.round(n(r.docenas) * 10000) / 10000,
          items:   n(r.items),
          tickets: n(r.tickets),
        })),
        resumen_semanal: semanaRes.rows.map(r => ({
          semana_inicio: r.semana_inicio,
          docenas:       Math.round(n(r.docenas) * 10000) / 10000,
          dias_con_venta: n(r.dias_con_venta),
        })),
        resumen_mensual: mesRes.rows.map(r => ({
          mes:     r.mes,
          docenas: Math.round(n(r.docenas) * 10000) / 10000,
        })),
      },
    });
  } catch (err) {
    console.error('[productos/docenas-por-dia]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── E) GET /docenas-por-hora ──────────────────────────────────────────────────

router.get('/docenas-por-hora', requireAuth, async (req, res) => {
  try {
    const p = await resolveParams(req, res);
    if (!p) return;
    const { local_id, desde, hasta } = p;
    const params = [local_id, desde, hasta];

    // Fórmula DOW: postgres 0=dom→7, 1=lun→1, ..., 6=sab→6
    const dowExpr = `CASE WHEN EXTRACT(DOW FROM vi.fecha_creacion AT TIME ZONE '${TZ}') = 0
                     THEN 7 ELSE EXTRACT(DOW FROM vi.fecha_creacion AT TIME ZONE '${TZ}')::int END`;

    const [heatRes, diaRes] = await Promise.all([
      pool.query(`
        SELECT
          ${dowExpr}                                                                    AS dia_semana,
          EXTRACT(HOUR FROM vi.fecha_creacion AT TIME ZONE '${TZ}')::int               AS hora,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0)    AS docenas
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.fecha_creacion IS NOT NULL
        GROUP BY dia_semana, hora
        ORDER BY dia_semana, hora
      `, params),

      pool.query(`
        SELECT
          ${dowExpr}                                                                    AS dia_semana,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0)    AS docenas
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.fecha_creacion IS NOT NULL
        GROUP BY dia_semana
        ORDER BY dia_semana
      `, params),
    ]);

    const heatmap = heatRes.rows.map(r => ({
      dia_semana: n(r.dia_semana),
      hora:       n(r.hora),
      docenas:    Math.round(n(r.docenas) * 10000) / 10000,
    }));

    const horaPico = heatmap.length
      ? heatmap.reduce((best, r) => r.docenas > best.docenas ? r : best, heatmap[0])
      : null;

    const resumenDia = diaRes.rows.map(r => ({
      dia_semana: n(r.dia_semana),
      nombre:     DIA_NOMBRE[n(r.dia_semana)] || '',
      docenas:    Math.round(n(r.docenas) * 10000) / 10000,
    }));

    res.json({
      ok: true,
      data: { heatmap, hora_pico: horaPico, resumen_dia_semana: resumenDia },
    });
  } catch (err) {
    console.error('[productos/docenas-por-hora]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── F) GET /items-cancelados ──────────────────────────────────────────────────

router.get('/items-cancelados', requireAuth, async (req, res) => {
  try {
    const p = await resolveParams(req, res);
    if (!p) return;
    const { local_id, desde, hasta } = p;
    const params = [local_id, desde, hasta];

    const [totRes, empRes, prodRes, diaRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE     vi.cancelada) AS total_cancelados,
          COUNT(*) FILTER (WHERE NOT vi.cancelada) AS total_no_cancelados,
          COALESCE(SUM(vi.precio_total) FILTER (WHERE vi.cancelada), 0) AS monto_total_cancelado
        FROM ventas_items vi
        WHERE ${viWhere()}
      `, params),

      pool.query(`
        SELECT
          vi.empleado,
          COUNT(*) FILTER (WHERE     vi.cancelada)                              AS cantidad_cancelada,
          COALESCE(SUM(vi.precio_total) FILTER (WHERE vi.cancelada), 0)        AS monto_cancelado,
          ROUND(
            COUNT(*) FILTER (WHERE vi.cancelada)::numeric
            / NULLIF(COUNT(*), 0) * 100, 2
          )                                                                     AS tasa_cancelacion
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.empleado IS NOT NULL AND vi.empleado != ''
        GROUP BY vi.empleado
        HAVING COUNT(*) FILTER (WHERE vi.cancelada) > 0
        ORDER BY cantidad_cancelada DESC
      `, params),

      pool.query(`
        SELECT
          vi.producto_nombre_raw                                         AS producto,
          COUNT(*)                                                       AS veces_cancelado,
          COALESCE(SUM(vi.precio_total), 0)                             AS monto_cancelado
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.cancelada = true
        GROUP BY vi.producto_nombre_raw
        ORDER BY veces_cancelado DESC
        LIMIT 20
      `, params),

      pool.query(`
        SELECT
          DATE_TRUNC('day', vi.fecha_creacion AT TIME ZONE '${TZ}')::date AS fecha,
          COUNT(*)                                                          AS cancelados
        FROM ventas_items vi
        WHERE ${viWhere()} AND vi.cancelada = true AND vi.fecha_creacion IS NOT NULL
        GROUP BY fecha
        ORDER BY fecha
      `, params),
    ]);

    const tot           = totRes.rows[0];
    const totalCanc     = n(tot.total_cancelados);
    const totalNoCanc   = n(tot.total_no_cancelados);
    const totalItems    = totalCanc + totalNoCanc;

    res.json({
      ok: true,
      data: {
        total_cancelados:      totalCanc,
        monto_total_cancelado: n(tot.monto_total_cancelado),
        tasa_cancelacion_global: pct(totalCanc, totalItems),
        por_empleado: empRes.rows.map(r => ({
          empleado:          r.empleado,
          cantidad_cancelada: n(r.cantidad_cancelada),
          monto_cancelado:   n(r.monto_cancelado),
          tasa_cancelacion:  n(r.tasa_cancelacion),
        })),
        por_producto: prodRes.rows.map(r => ({
          producto:       r.producto,
          veces_cancelado: n(r.veces_cancelado),
          monto_cancelado: n(r.monto_cancelado),
        })),
        por_dia: diaRes.rows.map(r => ({
          fecha:      r.fecha,
          cancelados: n(r.cancelados),
        })),
      },
    });
  } catch (err) {
    console.error('[productos/items-cancelados]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
