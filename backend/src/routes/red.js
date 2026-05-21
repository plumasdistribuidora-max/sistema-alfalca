'use strict';

const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { generarConclusiones } = require('../utils/conclusiones');

const router = express.Router();
const TZ = 'America/Argentina/Mendoza';

// ── Helpers ──────────────────────────────────────────────────────────────────

function n(v)             { return Number(v) || 0; }
function pct(part, total) { return total > 0 ? Math.round(part / total * 1000) / 10 : 0; }
function isDate(s)        { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }

function fmtOperacion(dpd) {
  const v = Number(dpd);
  if (!v) return '× 0';
  if (v >= 0.5) return `× ${parseFloat(v.toFixed(4)).toString().replace('.', ',')}`;
  if (Math.abs(v - 0.25) < 0.001) return '× 0,25';
  return `÷ ${Math.round(1 / v)}`;
}

function yearRange() {
  const y = new Date().getFullYear();
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

function parseRange(req) {
  const def   = yearRange();
  const desde = req.query.desde || def.desde;
  const hasta  = req.query.hasta || def.hasta;
  return isDate(desde) && isDate(hasta) ? [desde, hasta] : null;
}

// Pivot rows [{nombre, mes, valor}] → {meses, series:[{tienda, por_mes:{}}]} ordenado por total DESC
function pivot(rows) {
  const meses = [...new Set(rows.map(r => r.mes))].sort();
  const names = [...new Set(rows.map(r => r.nombre))];
  const lu    = {};
  rows.forEach(r => { lu[`${r.nombre}|${r.mes}`] = n(r.valor); });
  const series = names.map(nombre => ({
    tienda:  nombre,
    por_mes: Object.fromEntries(meses.map(mes => [mes, lu[`${nombre}|${mes}`] || 0])),
  }));
  series.sort((a, b) => {
    const totA = Object.values(a.por_mes).reduce((s, v) => s + v, 0);
    const totB = Object.values(b.por_mes).reduce((s, v) => s + v, 0);
    return totB - totA;
  });
  return { meses, series };
}

// Totalizador con variacion_pct por celda
function buildTotalizador(rows, tiendas) {
  const meses = [...new Set(rows.map(r => r.mes))].sort();
  const lu    = {};
  rows.forEach(r => { if (!lu[r.nombre]) lu[r.nombre] = {}; lu[r.nombre][r.mes] = n(r.valor); });

  const filas = meses.map((mes, idx) => {
    const por_tienda = {};
    let total = 0;
    tiendas.forEach(({ nombre }) => {
      const valor   = lu[nombre]?.[mes] || 0;
      const prev    = idx > 0 ? (lu[nombre]?.[meses[idx - 1]] || 0) : 0;
      const var_pct = (idx > 0 && prev > 0) ? Math.round((valor - prev) / prev * 1000) / 10 : null;
      por_tienda[nombre] = { valor: Math.round(valor), variacion_pct: var_pct };
      total += valor;
    });
    return { mes, por_tienda, total: Math.round(total) };
  });

  const totales_tienda = Object.fromEntries(tiendas.map(({ nombre }) => [
    nombre, Math.round(meses.reduce((s, mes) => s + (lu[nombre]?.[mes] || 0), 0)),
  ]));

  return {
    filas,
    totales_tienda,
    total_general: Math.round(Object.values(totales_tienda).reduce((s, v) => s + v, 0)),
  };
}

// Quincenal: comparación de primeros N días del mes actual vs mes anterior
async function queryQuincenal(hasta) {
  return pool.query(`
    WITH max_f AS (
      SELECT MAX(vt.fecha) AS mx FROM ventas_tickets vt WHERE vt.fecha <= $1::date
    ),
    meta AS (
      SELECT
        DATE_TRUNC('month', mf.mx)::date                           AS mes_ini,
        (DATE_TRUNC('month', mf.mx) - INTERVAL '1 month')::date   AS mes_ant_ini,
        (SELECT COUNT(DISTINCT v2.fecha) FROM ventas_tickets v2, max_f mf2
         WHERE v2.fecha >= DATE_TRUNC('month', mf2.mx)::date AND v2.fecha <= mf2.mx
        )::int                                                     AS n_dias,
        TO_CHAR(DATE_TRUNC('month', mf.mx), 'Month YYYY')         AS mes_label
      FROM max_f mf
    ),
    actual AS (
      SELECT vt.local_id, SUM(vt.total) AS fact, COUNT(DISTINCT vt.id) AS tkt
      FROM ventas_tickets vt CROSS JOIN meta m
      WHERE vt.fecha >= m.mes_ini AND EXTRACT(DAY FROM vt.fecha) <= m.n_dias
      GROUP BY vt.local_id
    ),
    anterior AS (
      SELECT vt.local_id, SUM(vt.total) AS fact
      FROM ventas_tickets vt CROSS JOIN meta m
      WHERE vt.fecha >= m.mes_ant_ini AND vt.fecha < m.mes_ini
        AND EXTRACT(DAY FROM vt.fecha) <= m.n_dias
      GROUP BY vt.local_id
    ),
    docs AS (
      SELECT vi.local_id,
        COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
      FROM ventas_items vi CROSS JOIN meta m
      WHERE vi.local_id IN (SELECT id FROM locales WHERE es_alfajorera = true AND activo = true)
        AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') >= m.mes_ini
        AND EXTRACT(DAY FROM (vi.fecha_creacion AT TIME ZONE '${TZ}')::date) <= m.n_dias
      GROUP BY vi.local_id
    )
    SELECT l.id, l.nombre, l.es_alfajorera,
      m.n_dias, m.mes_ini, m.mes_ant_ini, m.mes_label,
      COALESCE(a.fact,   0) AS facturacion_actual,
      COALESCE(ant.fact, 0) AS facturacion_anterior,
      COALESCE(a.tkt,    0) AS tickets,
      CASE WHEN COALESCE(ant.fact, 0) > 0
        THEN ROUND(((COALESCE(a.fact, 0) - COALESCE(ant.fact, 0))
                    / COALESCE(ant.fact, 0) * 100)::numeric, 1)
        ELSE NULL END AS variacion_pct,
      COALESCE(d.docenas, 0) AS docenas
    FROM locales l
    CROSS JOIN meta m
    LEFT JOIN actual    a   ON a.local_id   = l.id
    LEFT JOIN anterior  ant ON ant.local_id = l.id
    LEFT JOIN docs      d   ON d.local_id   = l.id
    WHERE l.activo = true
    ORDER BY COALESCE(a.fact, 0) DESC
  `, [hasta]);
}

function formatQuincenalRows(qRows) {
  const meta = qRows[0] || {};
  return {
    n_dias:           n(meta.n_dias),
    mes_actual_label: (meta.mes_label || '').trim(),
    tiendas: qRows.map((r, i) => ({
      nombre:               r.nombre,
      es_alfajorera:        r.es_alfajorera,
      facturacion_actual:   n(r.facturacion_actual),
      facturacion_anterior: n(r.facturacion_anterior),
      variacion_pct:        r.variacion_pct != null ? Number(r.variacion_pct) : null,
      tickets:              n(r.tickets),
      prom_ticket:          n(r.tickets) > 0 ? Math.round(n(r.facturacion_actual) / n(r.tickets)) : 0,
      docenas:              Math.round(n(r.docenas) * 100) / 100,
      unidad_medida:        r.es_alfajorera ? 'tickets' : 'mesas',
      medalla:              i < 3 ? i + 1 : null,
    })),
  };
}

// ── A) GET /resumen ──────────────────────────────────────────────────────────

router.get('/resumen', requireAuth, async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ ok: false, error: 'Fechas inválidas (YYYY-MM-DD)' });
    const [desde, hasta] = range;
    const p = [desde, hasta];

    const [locRes, factRes, docRes, mejorMesRes, evolRes, qRes] = await Promise.all([

      pool.query('SELECT id, nombre, es_alfajorera FROM locales WHERE activo = true ORDER BY id'),

      // Facturación + tickets por tienda
      pool.query(`
        SELECT l.id, l.nombre, l.es_alfajorera,
          COALESCE(SUM(vt.total), 0) AS facturacion,
          COUNT(DISTINCT vt.id)      AS tickets
        FROM locales l
        LEFT JOIN ventas_tickets vt ON vt.local_id = l.id AND vt.fecha BETWEEN $1::date AND $2::date
        WHERE l.activo = true
        GROUP BY l.id, l.nombre, l.es_alfajorera
        ORDER BY facturacion DESC
      `, p),

      // Docenas totales (solo alfajoreras)
      pool.query(`
        SELECT COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
        FROM ventas_items vi
        JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
        WHERE DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
      `, p),

      // Mejor mes (todas las unidades)
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', vt.fecha), 'YYYY-MM') AS mes,
               SUM(vt.total) AS facturacion
        FROM ventas_tickets vt
        JOIN locales l ON l.id = vt.local_id AND l.activo = true
        WHERE vt.fecha BETWEEN $1::date AND $2::date
        GROUP BY mes ORDER BY facturacion DESC LIMIT 1
      `, p),

      // Evolución mensual por tienda
      pool.query(`
        SELECT l.nombre, TO_CHAR(DATE_TRUNC('month', vt.fecha), 'YYYY-MM') AS mes,
               SUM(vt.total) AS valor
        FROM ventas_tickets vt
        JOIN locales l ON l.id = vt.local_id AND l.activo = true
        WHERE vt.fecha BETWEEN $1::date AND $2::date
        GROUP BY l.nombre, mes ORDER BY mes, l.nombre
      `, p),

      queryQuincenal(hasta),
    ]);

    const locales  = locRes.rows;
    const factRows = factRes.rows;
    const facturacion_total = factRows.reduce((s, r) => s + n(r.facturacion), 0);
    const fact_alfajoreras  = factRows.filter(r => r.es_alfajorera).reduce((s, r) => s + n(r.facturacion), 0);
    const docenas_totales   = n(docRes.rows[0]?.docenas);
    const precio_implicito_docena = docenas_totales > 0 ? Math.round(fact_alfajoreras / docenas_totales) : null;

    const mesesEvol   = [...new Set(evolRes.rows.map(r => r.mes))].sort();
    const tiendaOrden = factRows.map(r => r.nombre); // ya viene ORDER BY facturacion DESC
    const evolLu      = {};
    evolRes.rows.forEach(r => { evolLu[`${r.nombre}|${r.mes}`] = n(r.valor); });
    const evolucion_mensual = mesesEvol.map(mes => {
      const por_tienda = {};
      tiendaOrden.forEach(nombre => { por_tienda[nombre] = evolLu[`${nombre}|${mes}`] || 0; });
      return { mes, por_tienda };
    });

    const q       = formatQuincenalRows(qRes.rows);
    const nDias   = q.n_dias;
    const mesLbl  = q.mes_actual_label;

    res.json({
      ok: true,
      data: {
        facturacion_total:       Math.round(facturacion_total),
        docenas_totales:         Math.round(docenas_totales * 100) / 100,
        precio_implicito_docena,
        unidad_lider: factRows[0] ? {
          nombre:      factRows[0].nombre,
          facturacion: n(factRows[0].facturacion),
          porcentaje:  pct(n(factRows[0].facturacion), facturacion_total),
        } : null,
        mejor_mes: mejorMesRes.rows[0] ? {
          mes:         mejorMesRes.rows[0].mes,
          facturacion: n(mejorMesRes.rows[0].facturacion),
        } : null,
        num_unidades: locales.length,
        num_meses:    mesesEvol.length,
        comparativo_quincenal: {
          titulo: `${mesLbl} · primeros ${nDias} días vs mismos días del mes anterior`,
          mes_actual_label: mesLbl,
          n_dias: nDias,
          tiendas: q.tiendas,
        },
        evolucion_mensual,
        participacion: factRows.map(r => ({
          tienda:      r.nombre,
          facturacion: n(r.facturacion),
          porcentaje:  pct(n(r.facturacion), facturacion_total),
        })),
      },
    });
  } catch (err) {
    console.error('[red/resumen]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── B) GET /docenas-mensuales ────────────────────────────────────────────────

router.get('/docenas-mensuales', requireAuth, async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ ok: false, error: 'Fechas inválidas' });
    const [desde, hasta] = range;

    const r = await pool.query(`
      SELECT l.id, l.nombre,
        TO_CHAR(DATE_TRUNC('month', vi.fecha_creacion AT TIME ZONE '${TZ}'), 'YYYY-MM') AS mes,
        COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS valor
      FROM ventas_items vi
      JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
      WHERE DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
      GROUP BY l.id, l.nombre, mes
      ORDER BY mes, l.nombre
    `, [desde, hasta]);

    // Pivot inline para incluir local_id en series
    const meses  = [...new Set(r.rows.map(row => row.mes))].sort();
    const names  = [...new Set(r.rows.map(row => row.nombre))];
    const lu     = {};
    const idMap  = {};
    r.rows.forEach(row => {
      lu[`${row.nombre}|${row.mes}`] = n(row.valor);
      idMap[row.nombre] = Number(row.id);
    });
    const series = names.map(nombre => ({
      tienda:   nombre,
      local_id: idMap[nombre],
      por_mes:  Object.fromEntries(meses.map(mes => [mes, lu[`${nombre}|${mes}`] || 0])),
    }));
    series.sort((a, b) => {
      const totA = Object.values(a.por_mes).reduce((s, v) => s + v, 0);
      const totB = Object.values(b.por_mes).reduce((s, v) => s + v, 0);
      return totB - totA;
    });

    res.json({ ok: true, data: { meses, series } });
  } catch (err) {
    console.error('[red/docenas-mensuales]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── C) GET /tiendas-comparativo ──────────────────────────────────────────────

router.get('/tiendas-comparativo', requireAuth, async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ ok: false, error: 'Fechas inválidas' });
    const [desde, hasta] = range;

    // Opcional: filtrar por lista de local_ids y/o meses
    const tiendaIds = (req.query.tiendas || '').split(',').map(Number).filter(Boolean);
    const mesesNum  = (req.query.meses  || '').split(',').map(Number).filter(Boolean);

    const tiendaFilter = tiendaIds.length ? `AND l.id = ANY($3::int[])` : '';
    const mesFilter    = mesesNum.length  ? `AND EXTRACT(MONTH FROM vt.fecha) = ANY($${tiendaIds.length ? 4 : 3}::int[])` : '';

    const extraParams = [...(tiendaIds.length ? [tiendaIds] : []), ...(mesesNum.length ? [mesesNum] : [])];
    const params      = [desde, hasta, ...extraParams];

    const [factRes, docRes, evolFactRes, evolDocRes] = await Promise.all([
      pool.query(`
        SELECT l.id, l.nombre, l.es_alfajorera,
          COALESCE(SUM(vt.total), 0) AS facturacion,
          COUNT(DISTINCT vt.id) AS tickets
        FROM locales l
        LEFT JOIN ventas_tickets vt ON vt.local_id = l.id
          AND vt.fecha BETWEEN $1::date AND $2::date ${mesFilter}
        WHERE l.activo = true ${tiendaFilter}
        GROUP BY l.id, l.nombre, l.es_alfajorera
        ORDER BY facturacion DESC
      `, params),

      pool.query(`
        SELECT l.id, l.nombre,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
        FROM ventas_items vi
        JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
          ${tiendaFilter}
        WHERE DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
          ${mesesNum.length ? `AND EXTRACT(MONTH FROM (vi.fecha_creacion AT TIME ZONE '${TZ}')) = ANY($${tiendaIds.length ? 4 : 3}::int[])` : ''}
        GROUP BY l.id, l.nombre
      `, params),

      pool.query(`
        SELECT l.nombre, TO_CHAR(DATE_TRUNC('month', vt.fecha), 'YYYY-MM') AS mes,
               SUM(vt.total) AS valor
        FROM ventas_tickets vt
        JOIN locales l ON l.id = vt.local_id AND l.activo = true ${tiendaFilter}
        WHERE vt.fecha BETWEEN $1::date AND $2::date ${mesFilter}
        GROUP BY l.nombre, mes ORDER BY mes, l.nombre
      `, params),

      pool.query(`
        SELECT l.nombre,
          TO_CHAR(DATE_TRUNC('month', vi.fecha_creacion AT TIME ZONE '${TZ}'), 'YYYY-MM') AS mes,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS valor
        FROM ventas_items vi
        JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true ${tiendaFilter}
        WHERE DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
          ${mesesNum.length ? `AND EXTRACT(MONTH FROM (vi.fecha_creacion AT TIME ZONE '${TZ}')) = ANY($${tiendaIds.length ? 4 : 3}::int[])` : ''}
        GROUP BY l.nombre, mes ORDER BY mes, l.nombre
      `, params),
    ]);

    const docMap  = Object.fromEntries(docRes.rows.map(r => [r.id, n(r.docenas)]));
    const factTot = factRes.rows.reduce((s, r) => s + n(r.facturacion), 0);

    const resumen_filtrado = factRes.rows.map((r, i) => ({
      local_id:              r.id,
      tienda:                r.nombre,
      es_alfajorera:         r.es_alfajorera,
      facturacion:           n(r.facturacion),
      porcentaje_del_filtro: pct(n(r.facturacion), factTot),
      tickets:               n(r.tickets),
      prom_ticket:           n(r.tickets) > 0 ? Math.round(n(r.facturacion) / n(r.tickets)) : 0,
      docenas:               Math.round((docMap[r.id] || 0) * 100) / 100,
      medalla:               i < 3 ? i + 1 : null,
    }));

    res.json({
      ok: true,
      data: {
        resumen_filtrado,
        facturacion_por_mes_tienda: pivot(evolFactRes.rows),
        docenas_por_mes_tienda:     pivot(evolDocRes.rows),
      },
    });
  } catch (err) {
    console.error('[red/tiendas-comparativo]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── D) GET /meses-resumen ────────────────────────────────────────────────────

router.get('/meses-resumen', requireAuth, async (req, res) => {
  try {
    const anio  = parseInt(req.query.anio) || new Date().getFullYear();
    const r = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', vt.fecha), 'YYYY-MM')   AS mes,
        TO_CHAR(DATE_TRUNC('month', vt.fecha), 'TMMonth')   AS mes_nombre,
        SUM(vt.total)          AS facturacion,
        COUNT(DISTINCT vt.id)  AS tickets
      FROM ventas_tickets vt
      JOIN locales l ON l.id = vt.local_id AND l.activo = true
      WHERE EXTRACT(YEAR FROM vt.fecha) = $1
      GROUP BY mes, mes_nombre
      ORDER BY mes
    `, [anio]);

    res.json({
      ok: true,
      data: {
        meses: r.rows.map(row => ({
          mes:         row.mes,
          mes_nombre:  row.mes_nombre,
          facturacion: n(row.facturacion),
          tickets:     n(row.tickets),
        })),
      },
    });
  } catch (err) {
    console.error('[red/meses-resumen]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── E) GET /mes-detalle ──────────────────────────────────────────────────────

router.get('/mes-detalle', requireAuth, async (req, res) => {
  try {
    const mes = req.query.mes;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'mes requerido (YYYY-MM)' });

    const [anio, m] = mes.split('-').map(Number);
    const desde      = `${anio}-${String(m).padStart(2, '0')}-01`;
    const hasta      = new Date(anio, m, 0).toISOString().split('T')[0];

    const [factRes, docRes, docAcumRes] = await Promise.all([
      pool.query(`
        SELECT l.id, l.nombre, l.es_alfajorera,
          COALESCE(SUM(vt.total), 0) AS facturacion,
          COUNT(DISTINCT vt.id)      AS tickets
        FROM locales l
        LEFT JOIN ventas_tickets vt ON vt.local_id = l.id AND vt.fecha BETWEEN $1::date AND $2::date
        WHERE l.activo = true
        GROUP BY l.id, l.nombre, l.es_alfajorera
        ORDER BY facturacion DESC
      `, [desde, hasta]),

      pool.query(`
        SELECT vi.local_id,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
        FROM ventas_items vi
        JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
        WHERE DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
        GROUP BY vi.local_id
      `, [desde, hasta]),

      // Docenas acumuladas del año por mes (solo alfajoreras)
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', vi.fecha_creacion AT TIME ZONE '${TZ}'), 'YYYY-MM') AS mes,
               COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
        FROM ventas_items vi
        JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
        WHERE EXTRACT(YEAR FROM (vi.fecha_creacion AT TIME ZONE '${TZ}')) = $1
        GROUP BY mes ORDER BY mes
      `, [anio]),
    ]);

    const docMap  = Object.fromEntries(docRes.rows.map(r => [r.local_id, n(r.docenas)]));
    const factTot = factRes.rows.reduce((s, r) => s + n(r.facturacion), 0);

    const tiendas = factRes.rows.map((r, i) => ({
      local_id:     r.id,
      nombre:       r.nombre,
      es_alfajorera: r.es_alfajorera,
      facturacion:  n(r.facturacion),
      tickets:      n(r.tickets),
      prom_ticket:  n(r.tickets) > 0 ? Math.round(n(r.facturacion) / n(r.tickets)) : 0,
      docenas:      Math.round((docMap[r.id] || 0) * 100) / 100,
      unidad_medida: r.es_alfajorera ? 'tickets' : 'mesas',
      medalla:      i < 3 ? i + 1 : null,
    }));

    res.json({
      ok: true,
      data: {
        mes,
        facturacion_total: Math.round(factTot),
        tiendas,
        docenas_acumuladas_alfajoreras: docAcumRes.rows.map(r => ({
          mes:     r.mes,
          docenas: Math.round(n(r.docenas) * 100) / 100,
        })),
        facturacion_comparativa: tiendas.map(t => ({ tienda: t.nombre, facturacion: t.facturacion })),
      },
    });
  } catch (err) {
    console.error('[red/mes-detalle]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── F) GET /analisis ─────────────────────────────────────────────────────────

router.get('/analisis', requireAuth, async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ ok: false, error: 'Fechas inválidas' });
    const [desde, hasta] = range;
    const p = [desde, hasta];

    const [locRes, factMesRes, docMesRes, totRes, qRes] = await Promise.all([

      pool.query('SELECT id, nombre, es_alfajorera FROM locales WHERE activo = true ORDER BY id'),

      // Facturación mensual por tienda (todas)
      pool.query(`
        SELECT l.nombre, l.es_alfajorera,
          TO_CHAR(DATE_TRUNC('month', vt.fecha), 'YYYY-MM') AS mes,
          SUM(vt.total) AS valor, COUNT(DISTINCT vt.id) AS tickets
        FROM ventas_tickets vt
        JOIN locales l ON l.id = vt.local_id AND l.activo = true
        WHERE vt.fecha BETWEEN $1::date AND $2::date
        GROUP BY l.nombre, l.es_alfajorera, mes ORDER BY mes, l.nombre
      `, p),

      // Docenas mensuales por tienda (solo alfajoreras)
      pool.query(`
        SELECT l.nombre,
          TO_CHAR(DATE_TRUNC('month', vi.fecha_creacion AT TIME ZONE '${TZ}'), 'YYYY-MM') AS mes,
          COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS valor
        FROM ventas_items vi
        JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
        WHERE DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
        GROUP BY l.nombre, mes ORDER BY mes, l.nombre
      `, p),

      // KPIs globales
      pool.query(`
        SELECT
          COALESCE(SUM(vt.total), 0)          AS facturacion_total,
          COUNT(DISTINCT vt.id)               AS tickets_totales,
          CASE WHEN COUNT(DISTINCT vt.id) > 0
            THEN SUM(vt.total) / COUNT(DISTINCT vt.id)
            ELSE 0 END                        AS ticket_promedio
        FROM ventas_tickets vt
        JOIN locales l ON l.id = vt.local_id AND l.activo = true
        WHERE vt.fecha BETWEEN $1::date AND $2::date
      `, p),

      queryQuincenal(hasta),
    ]);

    const locales    = locRes.rows;
    const factRows   = factMesRes.rows;
    const docRows    = docMesRes.rows;
    const totGlobal  = totRes.rows[0];

    // ── Mes actual (parcial) vs completos ────────────────────────────────────
    const hoy        = new Date();
    const mesActual  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const allMeses   = [...new Set(factRows.map(r => r.mes))].sort();
    const mesesComp  = allMeses.filter(m => m < mesActual);   // meses completos

    // ── Totales de docenas por mes (alfajoreras) ─────────────────────────────
    const docMeses = [...new Set(docRows.map(r => r.mes))].sort();
    const docTotPorMes = {};
    docRows.forEach(r => { docTotPorMes[r.mes] = (docTotPorMes[r.mes] || 0) + n(r.valor); });

    const docenas_acumuladas = docMeses.reduce((s, m) => s + (docTotPorMes[m] || 0), 0);

    // Facturación alfajoreras por mes (para precio/docena)
    const factAlfaMes = {};
    factRows.filter(r => r.es_alfajorera).forEach(r => {
      factAlfaMes[r.mes] = (factAlfaMes[r.mes] || 0) + n(r.valor);
    });

    // ── Docenas tendencia (series) ───────────────────────────────────────────
    const docenas_tendencia = {
      meses:          docMeses,
      docenas_totales: docMeses.map(m => Math.round((docTotPorMes[m] || 0) * 100) / 100),
      precio_por_docena: docMeses.map(m => {
        const doc  = docTotPorMes[m] || 0;
        const fact = factAlfaMes[m] || 0;
        return doc > 0 ? Math.round(fact / doc) : null;
      }),
    };

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const facturacion_total = n(totGlobal?.facturacion_total);
    const fact_alfajoreras  = factRows
      .filter(r => r.es_alfajorera)
      .reduce((s, r) => s + n(r.valor), 0);
    const precio_implicito_docena = docenas_acumuladas > 0
      ? Math.round(fact_alfajoreras / docenas_acumuladas) : null;

    // Crecimiento promedio mensual (meses completos consecutivos)
    const monthlyTotals = mesesComp.map(mes =>
      factRows.filter(r => r.mes === mes).reduce((s, r) => s + n(r.valor), 0)
    );
    const growthRates = [];
    for (let i = 1; i < monthlyTotals.length; i++) {
      if (monthlyTotals[i - 1] > 0) growthRates.push((monthlyTotals[i] - monthlyTotals[i - 1]) / monthlyTotals[i - 1] * 100);
    }
    const crecimiento_prom_mensual_pct = growthRates.length > 0
      ? Math.round(growthRates.reduce((s, v) => s + v, 0) / growthRates.length * 10) / 10 : null;

    // Tendencia docenas % (primer vs último mes completo)
    const docMesesComp = docMeses.filter(m => m < mesActual);
    let tendencia_docenas_pct = null;
    if (docMesesComp.length >= 2) {
      const dIni = docTotPorMes[docMesesComp[0]] || 0;
      const dFin = docTotPorMes[docMesesComp[docMesesComp.length - 1]] || 0;
      if (dIni > 0) tendencia_docenas_pct = Math.round((dFin - dIni) / dIni * 1000) / 10;
    }

    // Concentración top 2
    const factPorTienda = {};
    factRows.forEach(r => { factPorTienda[r.nombre] = (factPorTienda[r.nombre] || 0) + n(r.valor); });
    const top2 = Object.values(factPorTienda).sort((a, b) => b - a).slice(0, 2);
    const concentracion_top2_pct = facturacion_total > 0
      ? Math.round(top2.reduce((s, v) => s + v, 0) / facturacion_total * 1000) / 10 : null;

    // ── Resumen tiendas ordenado por facturación DESC ────────────────────────
    const tiendas_resumen = locales.map(l => {
      const factTienda = factRows.filter(r => r.nombre === l.nombre).reduce((s, r) => s + n(r.valor), 0);
      const tickTienda = factRows.filter(r => r.nombre === l.nombre).reduce((s, r) => s + n(r.tickets), 0);
      return {
        nombre:        l.nombre,
        es_alfajorera: l.es_alfajorera,
        facturacion:   factTienda,
        tickets:       tickTienda,
        prom_ticket:   tickTienda > 0 ? Math.round(factTienda / tickTienda) : 0,
      };
    }).sort((a, b) => b.facturacion - a.facturacion);

    // ── Totalizador mensual ──────────────────────────────────────────────────
    const todasTiendas       = tiendas_resumen.map(l => ({ nombre: l.nombre, es_alfajorera: l.es_alfajorera }));
    const alfajorerasTiendas = tiendas_resumen.filter(l => l.es_alfajorera).map(l => ({ nombre: l.nombre }));

    const totalizador_mensual = {
      modo_facturacion: buildTotalizador(factRows, todasTiendas),
      modo_docenas:     buildTotalizador(docRows, alfajorerasTiendas),
    };

    // ── Pivot facturación mensual (todas las unidades) ───────────────────────
    const facturacion_mensual_acumulada = pivot(factRows);

    // ── Quincenal para conclusiones ──────────────────────────────────────────
    const q = formatQuincenalRows(qRes.rows);

    // ── Conclusiones ─────────────────────────────────────────────────────────
    const conclusiones = generarConclusiones({
      kpis: {
        precio_implicito_docena,
        crecimiento_prom_mensual_pct,
        tendencia_docenas_pct,
      },
      docenas_tendencia,
      totalizador_mensual,
      comparativo_quincenal: q,
      tiendas_resumen,
    });

    res.json({
      ok: true,
      data: {
        kpis: {
          facturacion_total:            Math.round(facturacion_total),
          docenas_acumuladas:           Math.round(docenas_acumuladas * 100) / 100,
          precio_implicito_docena,
          tickets_totales:              n(totGlobal?.tickets_totales),
          ticket_promedio:              Math.round(n(totGlobal?.ticket_promedio)),
          crecimiento_prom_mensual_pct,
          tendencia_docenas_pct,
          concentracion_top2_pct,
        },
        facturacion_mensual_acumulada,
        docenas_tendencia,
        totalizador_mensual,
        conclusiones,
      },
    });
  } catch (err) {
    console.error('[red/analisis]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── G) GET /docenas-detalle ──────────────────────────────────────────────────

async function fetchDetalleDocenas(localId, mes) {
  const [localRes, itemRes] = await Promise.all([
    pool.query('SELECT nombre FROM locales WHERE id = $1', [localId]),
    pool.query(`
      SELECT
        COALESCE(p.nombre_display, vi.producto_nombre_raw) AS producto,
        COALESCE(p.categoria, vi.categoria_raw)            AS categoria,
        ROUND(SUM(vi.cantidad)::numeric, 2)                AS cantidad,
        ROUND(SUM(vi.docenas_equivalentes)::numeric, 4)    AS docenas,
        ROUND(SUM(vi.precio_total)::numeric, 0)            AS facturacion,
        ROUND(
          CASE WHEN SUM(vi.cantidad) > 0
               THEN SUM(vi.docenas_equivalentes) / SUM(vi.cantidad)
               ELSE 0
          END::numeric, 4
        ) AS dpd
      FROM ventas_items vi
      LEFT JOIN productos_catalogo p ON p.id = vi.producto_id
      WHERE vi.local_id = $1
        AND TO_CHAR(DATE_TRUNC('month', vi.fecha_creacion AT TIME ZONE '${TZ}'), 'YYYY-MM') = $2
        AND NOT vi.cancelada
      GROUP BY
        COALESCE(p.nombre_display, vi.producto_nombre_raw),
        COALESCE(p.categoria, vi.categoria_raw)
      ORDER BY docenas DESC, cantidad DESC
    `, [localId, mes]),
  ]);

  const localNombre = localRes.rows[0]?.nombre || '';
  const all = itemRes.rows.map(r => ({
    producto:    r.producto,
    categoria:   r.categoria || null,
    cantidad:    Number(r.cantidad),
    docenas:     Math.round(Number(r.docenas) * 10000) / 10000,
    facturacion: Number(r.facturacion),
    dpd:         Number(r.dpd),
    operacion:   fmtOperacion(Number(r.dpd)),
  }));

  const productos_que_suman   = all.filter(r => r.docenas > 0);
  const productos_sin_docenas = all.filter(r => r.docenas <= 0);
  const docenas_total     = Math.round(productos_que_suman.reduce((s, r) => s + r.docenas, 0) * 10000) / 10000;
  const facturacion_total = Math.round(all.reduce((s, r) => s + r.facturacion, 0));

  return { localNombre, productos_que_suman, productos_sin_docenas, docenas_total, facturacion_total };
}

router.get('/docenas-detalle', requireAuth, async (req, res) => {
  try {
    const localId = parseInt(req.query.local_id);
    const mes     = req.query.mes;
    if (!localId || !mes || !/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'local_id y mes (YYYY-MM) requeridos' });

    const result = await fetchDetalleDocenas(localId, mes);
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error('[red/docenas-detalle]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── H) GET /docenas-detalle/export ──────────────────────────────────────────

router.get('/docenas-detalle/export', requireAuth, async (req, res) => {
  try {
    const localId = parseInt(req.query.local_id);
    const mes     = req.query.mes;
    if (!localId || !mes || !/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'local_id y mes (YYYY-MM) requeridos' });

    const { localNombre, productos_que_suman, productos_sin_docenas, docenas_total } = await fetchDetalleDocenas(localId, mes);

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num    = v => String(v).replace('.', ',');

    const header = '﻿Producto;Categoría;Cantidad;Conversión;Docenas;% Total;Facturación\r\n';
    const rows   = [
      ...productos_que_suman.map(r => [
        escape(r.producto), escape(r.categoria || ''), num(r.cantidad), escape(r.operacion),
        num(r.docenas),
        docenas_total > 0 ? num((r.docenas / docenas_total * 100).toFixed(1)) : '0',
        num(r.facturacion),
      ].join(';')),
      ...(productos_sin_docenas.length ? [
        `"--- Sin docenas ---";;;;;;;`,
        ...productos_sin_docenas.map(r => [
          escape(r.producto), escape(r.categoria || ''), num(r.cantidad), '',
          '0', '', num(r.facturacion),
        ].join(';')),
      ] : []),
    ];

    const filename = `docenas_${localNombre.replace(/\s+/g, '_')}_${mes}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(header + rows.join('\r\n'));
  } catch (err) {
    console.error('[red/docenas-detalle/export]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
