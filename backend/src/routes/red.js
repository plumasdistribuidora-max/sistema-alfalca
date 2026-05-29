'use strict';

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
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
      SELECT vt.local_id, SUM(vt.total) AS fact, COUNT(DISTINCT vt.id) AS tkt_ant
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
    ),
    docs_ant AS (
      SELECT vi.local_id,
        COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS docenas
      FROM ventas_items vi CROSS JOIN meta m
      WHERE vi.local_id IN (SELECT id FROM locales WHERE es_alfajorera = true AND activo = true)
        AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') >= m.mes_ant_ini
        AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') < m.mes_ini
        AND EXTRACT(DAY FROM (vi.fecha_creacion AT TIME ZONE '${TZ}')::date) <= m.n_dias
      GROUP BY vi.local_id
    ),
    personas_act AS (
      SELECT vt.local_id, COALESCE(SUM(vt.personas), 0) AS personas
      FROM ventas_tickets vt CROSS JOIN meta m
      WHERE vt.fecha >= m.mes_ini AND EXTRACT(DAY FROM vt.fecha) <= m.n_dias
      GROUP BY vt.local_id
    ),
    personas_ant AS (
      SELECT vt.local_id, COALESCE(SUM(vt.personas), 0) AS personas
      FROM ventas_tickets vt CROSS JOIN meta m
      WHERE vt.fecha >= m.mes_ant_ini AND vt.fecha < m.mes_ini
        AND EXTRACT(DAY FROM vt.fecha) <= m.n_dias
      GROUP BY vt.local_id
    )
    SELECT l.id, l.nombre, l.es_alfajorera,
      m.n_dias, m.mes_ini, m.mes_ant_ini, m.mes_label,
      COALESCE(a.fact,    0) AS facturacion_actual,
      COALESCE(ant.fact,  0) AS facturacion_anterior,
      COALESCE(a.tkt,     0) AS tickets,
      COALESCE(ant.tkt_ant, 0) AS tickets_anterior,
      COALESCE(d.docenas,  0) AS docenas,
      COALESCE(da.docenas, 0) AS docenas_anterior,
      COALESCE(pa.personas,  0) AS personas_actual,
      COALESCE(pan.personas, 0) AS personas_anterior
    FROM locales l
    CROSS JOIN meta m
    LEFT JOIN actual       a   ON a.local_id   = l.id
    LEFT JOIN anterior     ant ON ant.local_id = l.id
    LEFT JOIN docs         d   ON d.local_id   = l.id
    LEFT JOIN docs_ant     da  ON da.local_id  = l.id
    LEFT JOIN personas_act pa  ON pa.local_id  = l.id
    LEFT JOIN personas_ant pan ON pan.local_id = l.id
    WHERE l.activo = true
    ORDER BY COALESCE(a.fact, 0) DESC
  `, [hasta]);
}

function varPct(actual, ant) {
  if (!ant || ant === 0) return null;
  return Math.round((actual - ant) / ant * 1000) / 10;
}

function formatQuincenalRows(qRows) {
  if (!qRows.length) return { n_dias: 0, mes_actual_label: '', mes_ini: null, mes_ant_ini: null, tiendas: [] };
  const meta  = qRows[0];
  const nDias = n(meta.n_dias);

  return {
    n_dias:           nDias,
    mes_actual_label: (meta.mes_label || '').trim(),
    mes_ini:          meta.mes_ini,
    mes_ant_ini:      meta.mes_ant_ini,
    tiendas: qRows.map((r, i) => {
      const fact_act  = n(r.facturacion_actual);
      const fact_ant  = n(r.facturacion_anterior);
      const tkt_act   = n(r.tickets);
      const tkt_ant   = n(r.tickets_anterior);
      const doc_act   = Math.round(n(r.docenas)           * 100) / 100;
      const doc_ant   = Math.round(n(r.docenas_anterior)  * 100) / 100;
      const pers_act  = n(r.personas_actual);
      const pers_ant  = n(r.personas_anterior);
      const pt_act    = tkt_act > 0 ? Math.round(fact_act / tkt_act) : 0;
      const pt_ant    = tkt_ant > 0 ? Math.round(fact_ant / tkt_ant) : null;

      return {
        nombre:               r.nombre,
        es_alfajorera:        r.es_alfajorera,
        facturacion_actual:   fact_act,
        facturacion_anterior: fact_ant,
        var_facturacion:      varPct(fact_act, fact_ant),
        tickets:              tkt_act,
        tickets_anterior:     tkt_ant,
        var_tickets:          varPct(tkt_act, tkt_ant),
        prom_ticket:          pt_act,
        prom_ticket_anterior: pt_ant,
        var_prom_ticket:      pt_ant !== null ? varPct(pt_act, pt_ant) : null,
        docenas:              doc_act,
        docenas_anterior:     doc_ant,
        var_docenas:          varPct(doc_act, doc_ant),
        personas_actual:      pers_act,
        personas_anterior:    pers_ant,
        var_personas:         varPct(pers_act, pers_ant),
        medalla:              i + 1,
      };
    }),
  };
}

// ── Fiscal queries (module-scope, reutilizadas en /eerr y /finanzas/kpi) ─────

const QUERY_FISCAL = `
  SELECT
    COALESCE(SUM(CASE WHEN vt.fiscal = false THEN vt.total ELSE 0 END), 0) AS bruto_no_fiscal,
    COALESCE(SUM(CASE WHEN vt.fiscal = true  THEN vt.total ELSE 0 END), 0) AS bruto_fiscal,
    COALESCE(SUM(vf.total_sin_impuestos), 0)                                AS neto_fiscal,
    COALESCE(SUM(vf.iva_21),  0)                                            AS total_iva_21,
    COALESCE(SUM(vf.iva_105), 0)                                            AS total_iva_105
  FROM ventas_tickets vt
  LEFT JOIN ventas_fiscales vf
         ON vf.local_id = vt.local_id AND vf.pos_ticket_id = vt.pos_id
  WHERE vt.local_id = $1 AND vt.fecha BETWEEN $2 AND $3
`;

const QUERY_FISCAL_MULTI = `
  SELECT
    vt.local_id,
    TO_CHAR(DATE_TRUNC('month', vt.fecha), 'YYYY-MM') AS mes,
    COALESCE(SUM(CASE WHEN vt.fiscal = false THEN vt.total ELSE 0 END), 0) AS bruto_no_fiscal,
    COALESCE(SUM(CASE WHEN vt.fiscal = true  THEN vt.total ELSE 0 END), 0) AS bruto_fiscal,
    COALESCE(SUM(vf.total_sin_impuestos), 0)                                AS neto_fiscal,
    COALESCE(SUM(vf.iva_21),  0)                                            AS total_iva_21,
    COALESCE(SUM(vf.iva_105), 0)                                            AS total_iva_105
  FROM ventas_tickets vt
  LEFT JOIN ventas_fiscales vf ON vf.local_id = vt.local_id AND vf.pos_ticket_id = vt.pos_id
  WHERE vt.local_id = ANY($1::int[]) AND vt.fecha BETWEEN $2 AND $3
  GROUP BY vt.local_id, mes
  ORDER BY mes
`;

// ── KPI helpers ───────────────────────────────────────────────────────────────

function extractSueldos(gastos) {
  if (!gastos?.bloques) return 0;
  return gastos.bloques.reduce((s, b) =>
    s + (b.conceptos || []).reduce((ss, c) =>
      ss + (c.nombre?.toLowerCase().includes('sueldo') ? n(c.monto) : 0), 0), 0);
}

function aggregateEerrs(eerrs) {
  return {
    sumVN:      eerrs.reduce((s, e) => s + e.venta_neta,   0),
    sumCmv:     eerrs.reduce((s, e) => s + e.cmv,          0),
    sumMB:      eerrs.reduce((s, e) => s + e.margen_bruto, 0),
    sumGastos:  eerrs.reduce((s, e) => s + e.total_gastos, 0),
    sumEbitda:  eerrs.reduce((s, e) => s + e.ebitda,       0),
    sumSueldos: eerrs.reduce((s, e) => s + extractSueldos({ bloques: e.gastos_bloques }), 0),
  };
}

function computeKpisFromAgg(agg, mes, cajaTotal) {
  const { sumVN, sumCmv, sumMB, sumGastos, sumEbitda, sumSueldos } = agg;

  const mb_pct     = sumVN > 0 ? Math.round(sumMB     / sumVN * 1000) / 10 : null;
  const ebitda_pct = sumVN > 0 ? Math.round(sumEbitda / sumVN * 1000) / 10 : null;

  const cmv_pct = sumVN > 0 ? sumCmv / sumVN : 0;
  const be_rev  = cmv_pct < 1 ? sumGastos / (1 - cmv_pct) : null;
  const be_pct  = (be_rev != null && be_rev > 0) ? Math.round(sumVN / be_rev * 1000) / 10 : null;

  const sueldos_pct = sumVN > 0 ? Math.round(sumSueldos / sumVN * 1000) / 10 : null;

  let dias_caja = null;
  if (cajaTotal != null && sumGastos > 0 && mes) {
    const [y, m]  = mes.split('-').map(Number);
    const days    = new Date(y, m, 0).getDate();
    const burn    = sumGastos / days;
    if (burn > 0) dias_caja = Math.round(cajaTotal / burn * 10) / 10;
  }

  return { mb_pct, ebitda_pct, be_pct, sueldos_pct, dias_caja };
}

function buildDesgloseRow(kpiCod, aggRow) {
  const { sumVN, sumCmv, sumMB, sumGastos, sumEbitda, sumSueldos } = aggRow;

  if (kpiCod === 'margen_bruto') {
    const val = sumVN > 0 ? Math.round(sumMB / sumVN * 1000) / 10 : null;
    return {
      valor_kpi:   val,
      componentes: [
        { label: 'Venta Neta', valor: Math.round(sumVN),  formato: 'ars', signo:  1 },
        { label: '−CMV',       valor: Math.round(sumCmv), formato: 'ars', signo: -1 },
        { label: 'M. Bruto %', valor: val,                formato: 'pct', signo:  1, es_resultado: true },
      ],
    };
  }
  if (kpiCod === 'margen_ebitda') {
    const val = sumVN > 0 ? Math.round(sumEbitda / sumVN * 1000) / 10 : null;
    return {
      valor_kpi:   val,
      componentes: [
        { label: 'Venta Neta',  valor: Math.round(sumVN),     formato: 'ars', signo:  1 },
        { label: 'M. Bruto',    valor: Math.round(sumMB),     formato: 'ars', signo:  1 },
        { label: '−Gastos Op.', valor: Math.round(sumGastos), formato: 'ars', signo: -1 },
        { label: 'EBITDA %',    valor: val,                   formato: 'pct', signo:  1, es_resultado: true },
      ],
    };
  }
  if (kpiCod === 'breakeven') {
    const cmv_pct = sumVN > 0 ? sumCmv / sumVN : 0;
    const contrib = 1 - cmv_pct;
    const be_rev  = contrib > 0 ? sumGastos / contrib : null;
    const val     = (be_rev != null && be_rev > 0) ? Math.round(sumVN / be_rev * 1000) / 10 : null;
    return {
      valor_kpi:   val,
      componentes: [
        { label: 'Venta acum.', valor: Math.round(sumVN),                         formato: 'ars', signo: 1 },
        { label: 'Venta BE',    valor: be_rev != null ? Math.round(be_rev) : null, formato: 'ars', signo: 0 },
        { label: '% cubierto',  valor: val,                                        formato: 'pct', signo: 1, es_resultado: true },
      ],
    };
  }
  if (kpiCod === 'sueldos_venta') {
    const val = sumVN > 0 ? Math.round(sumSueldos / sumVN * 1000) / 10 : null;
    return {
      valor_kpi:   val,
      componentes: [
        { label: 'Sueldos',    valor: Math.round(sumSueldos), formato: 'ars', signo: 1 },
        { label: 'Venta Neta', valor: Math.round(sumVN),      formato: 'ars', signo: 1 },
        { label: '%',          valor: val,                    formato: 'pct', signo: 1, es_resultado: true },
      ],
    };
  }
  return { valor_kpi: null, componentes: [] };
}

function semaforoKpi(valor, umbral) {
  if (valor == null || umbral == null) return 'sin_datos';
  const v  = Number(valor);
  const gm = Number(umbral.verde_min);
  const am = Number(umbral.ambar_min);
  if (!umbral.invert) {
    if (v >= gm) return 'verde';
    if (v >= am) return 'ambar';
    return 'rojo';
  } else {
    if (v <= gm) return 'verde';
    if (v <= am) return 'ambar';
    return 'rojo';
  }
}

function prevNMeses(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
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
          n_dias:      nDias,
          mes_ini:     q.mes_ini,
          mes_ant_ini: q.mes_ant_ini,
          tiendas:     q.tiendas,
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

// ── EERR (Estado de Resultados) ───────────────────────────────────────────────

const DEFAULT_GASTOS = {
  bloques: [
    {
      nombre: '1- Comerciales',
      conceptos: [{ nombre: 'Sueldos Vendedores', monto: 0 }],
    },
    {
      nombre: '4- Estructura General',
      conceptos: [
        { nombre: 'Alquiler',      monto: 0 },
        { nombre: 'Expensas',      monto: 0 },
        { nombre: 'Luz',           monto: 0 },
        { nombre: 'Agua',          monto: 0 },
        { nombre: 'Seguros',       monto: 0 },
        { nombre: 'Sistema',       monto: 0 },
        { nombre: 'Contador',      monto: 0 },
        { nombre: 'Municipalidad', monto: 0 },
      ],
    },
  ],
};

function prevMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesRange(mes) {
  const [y, m] = mes.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { ini: `${mes}-01`, fin: `${mes}-${String(lastDay).padStart(2, '0')}` };
}

function calcTotalGastos(gastos) {
  return (gastos?.bloques || []).reduce(
    (s, b) => s + (b.conceptos || []).reduce((ss, c) => ss + (n(c.monto)), 0), 0
  );
}

function toFiscalData(row) {
  return {
    bruto_no_fiscal: n(row.bruto_no_fiscal),
    bruto_fiscal:    n(row.bruto_fiscal),
    neto_fiscal:     n(row.neto_fiscal),
    total_iva_21:    n(row.total_iva_21),
    total_iva_105:   n(row.total_iva_105),
  };
}

function calcEerr(fiscalData, record) {
  const { bruto_no_fiscal, bruto_fiscal, neto_fiscal, total_iva_21, total_iva_105 } = fiscalData;

  const venta_neta     = bruto_no_fiscal + neto_fiscal;
  const iva_descontado = Math.round(bruto_fiscal - neto_fiscal);

  let tipo_iva = null;
  if (total_iva_21 > 0 && total_iva_105 > 0) tipo_iva = 'IVA mixto';
  else if (total_iva_21 > 0)                  tipo_iva = 'IVA 21%';
  else if (total_iva_105 > 0)                 tipo_iva = 'IVA 10,5%';

  const pct_fiscal_sobre_total = venta_neta > 0
    ? Math.round(neto_fiscal / venta_neta * 1000) / 10
    : 0;

  const cmv_e2_pct   = record != null ? n(record.cmv_e2_pct)   : 45;
  const cmv_alim_pct = record != null ? n(record.cmv_alim_pct) : 70;
  const gastos_raw   = record?.gastos;
  const gastos       = (gastos_raw?.bloques?.length > 0) ? gastos_raw : DEFAULT_GASTOS;
  const imp          = record?.impuestos || { iibb: 0, novecientos31: 0, ganancias: 0 };

  const venta_e2        = venta_neta * 0.90;
  const venta_alim      = venta_neta * 0.10;
  const cmv             = (venta_e2 * cmv_e2_pct / 100) + (venta_alim * cmv_alim_pct / 100);
  const margen_bruto    = venta_neta - cmv;
  const total_gastos    = calcTotalGastos(gastos);
  const ebitda          = margen_bruto - total_gastos;
  const iibb            = n(imp.iibb);
  const novecientos31   = n(imp.novecientos31);
  const ganancias       = n(imp.ganancias);
  const total_impuestos = iibb + novecientos31 + ganancias;
  const resultado_neto  = ebitda - total_impuestos;

  const p = (v) => venta_neta > 0 ? Math.round(v / venta_neta * 1000) / 10 : 0;

  return {
    venta_neta, venta_e2, venta_alim,
    cmv_e2_pct, cmv_alim_pct, cmv,
    margen_bruto,
    gastos_bloques: gastos.bloques,
    total_gastos,
    ebitda,
    impuestos: { iibb, novecientos31, ganancias, total: total_impuestos },
    resultado_neto,
    pcts: {
      cmv:             p(cmv),
      margen_bruto:    p(margen_bruto),
      total_gastos:    p(total_gastos),
      ebitda:          p(ebitda),
      total_impuestos: p(total_impuestos),
      resultado_neto:  p(resultado_neto),
    },
    desglose_fiscal: {
      bruto_no_fiscal,
      bruto_fiscal,
      neto_fiscal:              Math.round(neto_fiscal),
      iva_descontado,
      tipo_iva,
      pct_fiscal_sobre_total,
      tiene_fiscal:             bruto_fiscal > 0,
      tiene_datos_fiscales:     neto_fiscal  > 0,
    },
  };
}

router.get('/eerr/locales', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, es_alfajorera FROM locales
       WHERE activo = true
       ORDER BY es_alfajorera DESC, nombre`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[red/eerr/locales]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/eerr', requireAuth, async (req, res) => {
  try {
    const { local_id, mes } = req.query;
    if (!local_id || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ ok: false, error: 'local_id y mes (YYYY-MM) requeridos' });
    }

    const mes_ant   = prevMes(mes);
    const { ini, fin }         = mesRange(mes);
    const { ini: ini_ant, fin: fin_ant } = mesRange(mes_ant);

    const [localR, vnR, vnAntR, recR, recAntR] = await Promise.all([
      pool.query('SELECT id, nombre FROM locales WHERE id = $1', [local_id]),
      pool.query(QUERY_FISCAL, [local_id, ini,     fin    ]),
      pool.query(QUERY_FISCAL, [local_id, ini_ant, fin_ant]),
      pool.query('SELECT * FROM eerr_local WHERE local_id=$1 AND mes=$2', [local_id, mes]),
      pool.query('SELECT * FROM eerr_local WHERE local_id=$1 AND mes=$2', [local_id, mes_ant]),
    ]);

    if (!localR.rows[0]) return res.status(404).json({ ok: false, error: 'Local no encontrado' });

    res.json({
      ok: true,
      data: {
        local:        localR.rows[0],
        mes,
        mes_anterior: mes_ant,
        actual:       calcEerr(toFiscalData(vnR.rows[0]),    recR.rows[0]),
        anterior:     calcEerr(toFiscalData(vnAntR.rows[0]), recAntR.rows[0]),
      },
    });
  } catch (err) {
    console.error('[red/eerr GET]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/eerr', requireAuth, async (req, res) => {
  try {
    const { local_id, mes, cmv_e2_pct, cmv_alim_pct, gastos, impuestos } = req.body;
    if (!local_id || !mes) return res.status(400).json({ ok: false, error: 'local_id y mes requeridos' });

    await pool.query(`
      INSERT INTO eerr_local (local_id, mes, cmv_e2_pct, cmv_alim_pct, gastos, impuestos, updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW())
      ON CONFLICT (local_id, mes) DO UPDATE SET
        cmv_e2_pct   = EXCLUDED.cmv_e2_pct,
        cmv_alim_pct = EXCLUDED.cmv_alim_pct,
        gastos       = EXCLUDED.gastos,
        impuestos    = EXCLUDED.impuestos,
        updated_at   = NOW()
    `, [
      local_id, mes,
      cmv_e2_pct   ?? 45,
      cmv_alim_pct ?? 70,
      JSON.stringify(gastos    || DEFAULT_GASTOS),
      JSON.stringify(impuestos || { iibb: 0, novecientos31: 0, ganancias: 0 }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[red/eerr POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── I) KPI Financieros ───────────────────────────────────────────────────────

const KPI_CODIGOS = ['margen_bruto', 'margen_ebitda', 'breakeven', 'sueldos_venta', 'dias_caja'];
const KPI_DEFAULTS = {
  margen_bruto:  { verde_min: 50, ambar_min: 40, invert: false },
  margen_ebitda: { verde_min: 15, ambar_min:  5, invert: false },
  breakeven:     { verde_min: 100, ambar_min: 80, invert: false },
  sueldos_venta: { verde_min:  30, ambar_min: 35, invert: true  },
  dias_caja:     { verde_min:  14, ambar_min:  7, invert: false },
};
const KPI_ALERTAS_LABELS = {
  margen_bruto:  'Margen Bruto',
  margen_ebitda: 'Margen EBITDA',
  breakeven:     'Cobertura Breakeven',
  sueldos_venta: 'Sueldos / Venta',
  dias_caja:     'Días de Caja',
};

router.get('/finanzas/kpi/umbrales', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM kpi_umbrales ORDER BY kpi_codigo');
    // Completar con defaults para KPIs que no tengan fila aún
    const map = Object.fromEntries(rows.map(r => [r.kpi_codigo, r]));
    const data = KPI_CODIGOS.map(cod => map[cod] || { kpi_codigo: cod, ...KPI_DEFAULTS[cod] });
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[red/finanzas/kpi/umbrales GET]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/finanzas/kpi/umbrales', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { umbrales } = req.body;
    if (!umbrales || typeof umbrales !== 'object')
      return res.status(400).json({ ok: false, error: 'umbrales requerido' });
    await Promise.all(
      Object.entries(umbrales).map(([cod, u]) =>
        pool.query(`
          INSERT INTO kpi_umbrales (kpi_codigo, verde_min, ambar_min, invert, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (kpi_codigo) DO UPDATE SET
            verde_min  = EXCLUDED.verde_min,
            ambar_min  = EXCLUDED.ambar_min,
            invert     = EXCLUDED.invert,
            updated_at = NOW()
        `, [cod, Number(u.verde_min), Number(u.ambar_min), Boolean(u.invert)])
      )
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[red/finanzas/kpi/umbrales POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/finanzas/kpi', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const mes = req.query.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'mes inválido (YYYY-MM)' });

    const locRes = await pool.query(
      'SELECT id, nombre FROM locales WHERE es_alfajorera = true AND activo = true ORDER BY nombre'
    );
    const locales   = locRes.rows;
    const local_ids = locales.map(l => l.id);

    if (!local_ids.length)
      return res.json({ ok: true, data: { mes, kpis: {}, sparklines: {}, alertas: [] } });

    const { ini, fin } = mesRange(mes);
    const spark_meses  = prevNMeses(mes, 6);
    const spark_ini    = spark_meses[0] + '-01';

    const [sparkVnRows, sparkEerrRows, cajaRows, umbralesRows] = await Promise.all([
      pool.query(QUERY_FISCAL_MULTI, [local_ids, spark_ini, fin]),
      pool.query(
        'SELECT * FROM eerr_local WHERE local_id = ANY($1::int[]) AND mes >= $2 AND mes <= $3',
        [local_ids, spark_meses[0], mes]
      ),
      pool.query(
        'SELECT DISTINCT ON (cuenta) cuenta, monto FROM cuentas_saldos ORDER BY cuenta, fecha_actualizacion DESC'
      ),
      pool.query('SELECT * FROM kpi_umbrales'),
    ]);

    // Umbrales con fallback a defaults
    const umbralesMap = Object.fromEntries(umbralesRows.rows.map(r => [r.kpi_codigo, r]));
    const umbrales    = Object.fromEntries(
      KPI_CODIGOS.map(cod => [cod, umbralesMap[cod] || KPI_DEFAULTS[cod]])
    );

    const cajaTotal = cajaRows.rows.reduce((s, r) => s + n(r.monto), 0);

    // Calcular EERR por local para cada mes del rango sparkline
    const sparkAgg = {};
    for (const sm of spark_meses) {
      const smEerrs = locales.map(loc => {
        const fnRow  = sparkVnRows.rows.find(r => r.local_id === loc.id && r.mes === sm) || {};
        const recRow = sparkEerrRows.rows.find(r => r.local_id === loc.id && r.mes === sm);
        return calcEerr(toFiscalData(fnRow), recRow || null);
      });
      sparkAgg[sm] = aggregateEerrs(smEerrs);
    }

    // KPIs del mes actual (con caja)
    const currKv    = computeKpisFromAgg(sparkAgg[mes], mes, cajaTotal);
    const kpiValues = {
      margen_bruto:  currKv.mb_pct,
      margen_ebitda: currKv.ebitda_pct,
      breakeven:     currKv.be_pct,
      sueldos_venta: currKv.sueldos_pct,
      dias_caja:     currKv.dias_caja,
    };

    const kpis = {};
    for (const cod of KPI_CODIGOS) {
      const u = umbrales[cod];
      kpis[cod] = {
        valor:     kpiValues[cod],
        semaforo:  semaforoKpi(kpiValues[cod], u),
        verde_min: Number(u.verde_min),
        ambar_min: Number(u.ambar_min),
        invert:    u.invert,
      };
    }

    // Sparklines (sin dias_caja — no hay histórico de caja)
    const sparklines = {};
    for (const cod of KPI_CODIGOS) sparklines[cod] = [];
    for (const sm of spark_meses) {
      const kv = computeKpisFromAgg(sparkAgg[sm], sm, null);
      sparklines.margen_bruto.push(  { mes: sm, valor: kv.mb_pct      });
      sparklines.margen_ebitda.push( { mes: sm, valor: kv.ebitda_pct  });
      sparklines.breakeven.push(     { mes: sm, valor: kv.be_pct      });
      sparklines.sueldos_venta.push( { mes: sm, valor: kv.sueldos_pct });
    }

    // Alertas
    const alertas = KPI_CODIGOS
      .filter(cod => ['rojo', 'ambar'].includes(kpis[cod].semaforo))
      .map(cod => ({
        kpi:      cod,
        label:    KPI_ALERTAS_LABELS[cod],
        semaforo: kpis[cod].semaforo,
        valor:    kpis[cod].valor,
      }));

    res.json({ ok: true, data: { mes, kpis, sparklines, alertas } });
  } catch (err) {
    console.error('[red/finanzas/kpi]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/finanzas/kpi/comparativa', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const mes = req.query.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'mes inválido (YYYY-MM)' });

    const locRes = await pool.query(
      'SELECT id, nombre FROM locales WHERE es_alfajorera = true AND activo = true ORDER BY nombre'
    );
    const locales   = locRes.rows;
    const local_ids = locales.map(l => l.id);

    if (!local_ids.length)
      return res.json({ ok: true, data: { mes, locales: [], tabla: [] } });

    const { ini, fin } = mesRange(mes);
    const [vnRows, eerrRows, umbralesRows] = await Promise.all([
      pool.query(QUERY_FISCAL_MULTI, [local_ids, ini, fin]),
      pool.query('SELECT * FROM eerr_local WHERE local_id = ANY($1::int[]) AND mes = $2', [local_ids, mes]),
      pool.query('SELECT * FROM kpi_umbrales'),
    ]);

    const umbralesMap = Object.fromEntries(umbralesRows.rows.map(r => [r.kpi_codigo, r]));
    const umbrales    = Object.fromEntries(
      KPI_CODIGOS.map(cod => [cod, umbralesMap[cod] || KPI_DEFAULTS[cod]])
    );

    const eerrByLocal = {};
    for (const loc of locales) {
      const fnRow  = vnRows.rows.find(r => r.local_id === loc.id && r.mes === mes) || {};
      const recRow = eerrRows.rows.find(r => r.local_id === loc.id);
      eerrByLocal[loc.id] = calcEerr(toFiscalData(fnRow), recRow || null);
    }

    const KPI_COMP = ['margen_bruto', 'margen_ebitda', 'breakeven', 'sueldos_venta'];
    const KPI_COMP_LABELS = {
      margen_bruto:  'Margen Bruto',
      margen_ebitda: 'EBITDA %',
      breakeven:     'BE Cobertura',
      sueldos_venta: 'Sueldos/Vta',
    };

    const por_local = {};
    for (const loc of locales) {
      const kv = computeKpisFromAgg(aggregateEerrs([eerrByLocal[loc.id]]), mes, null);
      por_local[loc.id] = {
        margen_bruto:  kv.mb_pct,
        margen_ebitda: kv.ebitda_pct,
        breakeven:     kv.be_pct,
        sueldos_venta: kv.sueldos_pct,
      };
    }

    const groupKv = computeKpisFromAgg(aggregateEerrs(Object.values(eerrByLocal)), mes, null);
    const grupo   = {
      margen_bruto:  groupKv.mb_pct,
      margen_ebitda: groupKv.ebitda_pct,
      breakeven:     groupKv.be_pct,
      sueldos_venta: groupKv.sueldos_pct,
    };

    const tabla = KPI_COMP.map(cod => ({
      kpi:    cod,
      label:  KPI_COMP_LABELS[cod],
      invert: umbrales[cod].invert,
      por_local: Object.fromEntries(locales.map(loc => [loc.nombre, {
        valor:    por_local[loc.id][cod],
        semaforo: semaforoKpi(por_local[loc.id][cod], umbrales[cod]),
      }])),
      grupo: {
        valor:    grupo[cod],
        semaforo: semaforoKpi(grupo[cod], umbrales[cod]),
      },
    }));

    res.json({ ok: true, data: { mes, locales: locales.map(l => ({ id: l.id, nombre: l.nombre })), tabla } });
  } catch (err) {
    console.error('[red/finanzas/kpi/comparativa]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── J) GET /finanzas/kpi/detalle ────────────────────────────────────────────

router.get('/finanzas/kpi/detalle', requireAuth, async (req, res) => {
  try {
    const { kpi, local, mes } = req.query;
    if (!kpi || !local || !mes || !/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'kpi, local y mes requeridos' });
    if (!KPI_CODIGOS.includes(kpi))
      return res.status(400).json({ ok: false, error: `kpi inválido: ${kpi}` });

    // Helpers de formato para formula_aplicada
    const fmtM_ = v => {
      if (v == null) return '—';
      const abs = Math.abs(Math.round(v));
      const s   = Number(v) < 0 ? '−' : '';
      if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
      if (abs >= 1_000)     return `${s}$${Math.round(abs / 1_000)}k`;
      return `${s}$${abs.toLocaleString('es-AR')}`;
    };
    const fmtP_ = v => v != null
      ? `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
      : '—';

    const esGrupo = local === 'grupo';
    let locales;
    if (esGrupo) {
      const r = await pool.query(
        'SELECT id, nombre FROM locales WHERE es_alfajorera = true AND activo = true ORDER BY nombre'
      );
      locales = r.rows;
    } else {
      const lid = parseInt(local);
      if (!lid) return res.status(400).json({ ok: false, error: 'local inválido' });
      const r   = await pool.query('SELECT id, nombre FROM locales WHERE id = $1', [lid]);
      if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Local no encontrado' });
      locales = r.rows;
    }

    const local_ids   = locales.map(l => l.id);
    const localNombre = esGrupo ? 'Grupo' : locales[0].nombre;
    const linkParams  = esGrupo ? null : { local_id: locales[0].id, mes };

    const { ini, fin } = mesRange(mes);
    const [vnRows, eerrRows, umbralesRows] = await Promise.all([
      pool.query(QUERY_FISCAL_MULTI, [local_ids, ini, fin]),
      pool.query('SELECT * FROM eerr_local WHERE local_id = ANY($1::int[]) AND mes = $2', [local_ids, mes]),
      pool.query('SELECT * FROM kpi_umbrales'),
    ]);

    const umbralesMap = Object.fromEntries(umbralesRows.rows.map(r => [r.kpi_codigo, r]));
    const umbrales    = Object.fromEntries(
      KPI_CODIGOS.map(cod => [cod, umbralesMap[cod] || KPI_DEFAULTS[cod]])
    );

    const eerrs = locales.map(loc => {
      const fnRow  = vnRows.rows.find(r => r.local_id === loc.id && r.mes === mes) || {};
      const recRow = eerrRows.rows.find(r => r.local_id === loc.id);
      return calcEerr(toFiscalData(fnRow), recRow || null);
    });
    const agg = aggregateEerrs(eerrs);

    // Desglose por local (solo para vista grupo, no para días de caja)
    let desglose_locales;
    if (esGrupo && kpi !== 'dias_caja') {
      const localRows = locales.map((loc, i) => {
        const e      = eerrs[i];
        const aggRow = {
          sumVN:      n(e.venta_neta),
          sumCmv:     n(e.cmv),
          sumMB:      n(e.margen_bruto),
          sumGastos:  n(e.total_gastos),
          sumEbitda:  n(e.ebitda),
          sumSueldos: extractSueldos({ bloques: e.gastos_bloques }),
        };
        const { valor_kpi, componentes } = buildDesgloseRow(kpi, aggRow);
        return {
          local_id:     loc.id,
          local_nombre: loc.nombre,
          componentes,
          valor_kpi,
          semaforo:     semaforoKpi(valor_kpi, umbrales[kpi]),
        };
      });
      const { valor_kpi: totValor, componentes: totComp } = buildDesgloseRow(kpi, agg);
      desglose_locales = [
        ...localRows,
        {
          local_id:     null,
          local_nombre: 'TOTAL',
          componentes:  totComp,
          valor_kpi:    totValor,
          semaforo:     semaforoKpi(totValor, umbrales[kpi]),
          es_total:     true,
        },
      ];
    }

    let detalle;

    if (kpi === 'margen_bruto') {
      const u     = umbrales.margen_bruto;
      const valor = agg.sumVN > 0 ? Math.round(agg.sumMB / agg.sumVN * 1000) / 10 : null;
      detalle = {
        kpi_label:        'Margen Bruto',
        descripcion:      'Rentabilidad después de descontar el costo del producto (CMV).',
        formula_template: '(Venta Neta − CMV) / Venta Neta × 100',
        formula_aplicada: `(${fmtM_(agg.sumVN)} − ${fmtM_(agg.sumCmv)}) / ${fmtM_(agg.sumVN)} × 100 = ${fmtP_(valor)}`,
        valor,
        semaforo:  semaforoKpi(valor, u),
        verde_min: Number(u.verde_min),
        ambar_min: Number(u.ambar_min),
        invert:    u.invert,
        componentes: [
          { label: 'Venta Neta',   valor: Math.round(agg.sumVN),  formato: 'ars', signo:  1, link_modulo: 'eerr', link_params: linkParams },
          { label: 'CMV',          valor: Math.round(agg.sumCmv), formato: 'ars', signo: -1 },
          { label: 'Margen Bruto', valor: Math.round(agg.sumMB),  formato: 'ars', signo:  1, es_total: true, es_resultado: true },
        ],
      };
    }

    else if (kpi === 'margen_ebitda') {
      const u     = umbrales.margen_ebitda;
      const valor = agg.sumVN > 0 ? Math.round(agg.sumEbitda / agg.sumVN * 1000) / 10 : null;
      detalle = {
        kpi_label:        'Margen EBITDA',
        descripcion:      'Rentabilidad operativa antes de impuestos.',
        formula_template: 'EBITDA / Venta Neta × 100',
        formula_aplicada: `${fmtM_(agg.sumEbitda)} / ${fmtM_(agg.sumVN)} × 100 = ${fmtP_(valor)}`,
        valor,
        semaforo:  semaforoKpi(valor, u),
        verde_min: Number(u.verde_min),
        ambar_min: Number(u.ambar_min),
        invert:    u.invert,
        componentes: [
          { label: 'Venta Neta',        valor: Math.round(agg.sumVN),     formato: 'ars', signo:  1, link_modulo: 'eerr', link_params: linkParams },
          { label: 'CMV',               valor: Math.round(agg.sumCmv),    formato: 'ars', signo: -1 },
          { label: 'Margen Bruto',      valor: Math.round(agg.sumMB),     formato: 'ars', signo:  1, es_total: true },
          { label: 'Gastos Operativos', valor: Math.round(agg.sumGastos), formato: 'ars', signo: -1, link_modulo: 'eerr', link_params: linkParams },
          { label: 'EBITDA',            valor: Math.round(agg.sumEbitda), formato: 'ars', signo:  1, es_total: true, es_resultado: true },
        ],
      };
    }

    else if (kpi === 'breakeven') {
      const u           = umbrales.breakeven;
      const cmv_pct     = agg.sumVN > 0 ? agg.sumCmv / agg.sumVN : 0;
      const contrib_pct = 1 - cmv_pct;
      const be_rev      = contrib_pct > 0 ? agg.sumGastos / contrib_pct : null;
      const valor       = (be_rev != null && be_rev > 0) ? Math.round(agg.sumVN / be_rev * 1000) / 10 : null;
      detalle = {
        kpi_label:        'Cobertura Breakeven',
        descripcion:      'Porcentaje de los gastos del mes ya cubiertos por las ventas. 100% = punto de equilibrio alcanzado.',
        formula_template: 'Venta Neta / (Gastos / Margen de contribución) × 100',
        formula_aplicada: be_rev != null
          ? `${fmtM_(agg.sumVN)} / ${fmtM_(be_rev)} × 100 = ${fmtP_(valor)}`
          : '— (sin datos)',
        valor,
        semaforo:  semaforoKpi(valor, u),
        verde_min: Number(u.verde_min),
        ambar_min: Number(u.ambar_min),
        invert:    u.invert,
        componentes: [
          { label: 'Gastos del mes',           valor: Math.round(agg.sumGastos),                        formato: 'ars', signo: 1, link_modulo: 'eerr', link_params: linkParams },
          { label: '% CMV',                    valor: Math.round(cmv_pct    * 1000) / 10,               formato: 'pct', signo: 0 },
          { label: 'Margen de contribución',   valor: Math.round(contrib_pct * 1000) / 10,              formato: 'pct', signo: 0, es_total: true },
          { label: 'Venta necesaria para BE',  valor: be_rev != null ? Math.round(be_rev) : null,       formato: 'ars', signo: 0 },
          { label: 'Venta Neta acumulada',     valor: Math.round(agg.sumVN),                            formato: 'ars', signo: 1 },
          { label: 'Cobertura',                valor,                                                    formato: 'pct', signo: 1, es_total: true, es_resultado: true },
        ],
      };
    }

    else if (kpi === 'sueldos_venta') {
      const u     = umbrales.sueldos_venta;
      const valor = agg.sumVN > 0 ? Math.round(agg.sumSueldos / agg.sumVN * 1000) / 10 : null;

      // Detalle de conceptos de sueldo
      const conceptosMap = {};
      for (const e of eerrs) {
        for (const b of (e.gastos_bloques || [])) {
          for (const c of (b.conceptos || [])) {
            if (c.nombre?.toLowerCase().includes('sueldo')) {
              conceptosMap[c.nombre] = (conceptosMap[c.nombre] || 0) + n(c.monto);
            }
          }
        }
      }
      const subItems = Object.entries(conceptosMap).map(([label, val]) => ({
        label, valor: Math.round(val), formato: 'ars', signo: 1, es_sub: true,
      }));

      detalle = {
        kpi_label:        'Sueldos / Venta',
        descripcion:      'Cuánto pesan los sueldos sobre la venta neta del período.',
        formula_template: 'Total Sueldos / Venta Neta × 100',
        formula_aplicada: `${fmtM_(agg.sumSueldos)} / ${fmtM_(agg.sumVN)} × 100 = ${fmtP_(valor)}`,
        valor,
        semaforo:  semaforoKpi(valor, u),
        verde_min: Number(u.verde_min),
        ambar_min: Number(u.ambar_min),
        invert:    u.invert,
        componentes: [
          ...(subItems.length ? subItems : [{ label: 'Sin conceptos de sueldo cargados', valor: 0, formato: 'ars', signo: 0, es_sub: true }]),
          { label: 'Total Sueldos', valor: Math.round(agg.sumSueldos), formato: 'ars', signo:  1, es_total: true, link_modulo: 'eerr', link_params: linkParams },
          { label: 'Venta Neta',   valor: Math.round(agg.sumVN),      formato: 'ars', signo:  1, link_modulo: 'eerr', link_params: linkParams },
          { label: 'Sueldos / Venta', valor,                           formato: 'pct', signo:  1, es_total: true, es_resultado: true },
        ],
      };
    }

    else if (kpi === 'dias_caja') {
      const u        = umbrales.dias_caja;
      const cajaRows = await pool.query(
        'SELECT DISTINCT ON (cuenta) cuenta, monto FROM cuentas_saldos ORDER BY cuenta, fecha_actualizacion DESC'
      );
      const cajaTotal   = cajaRows.rows.reduce((s, r) => s + n(r.monto), 0);
      const [y, m_]     = mes.split('-').map(Number);
      const days_in_m   = new Date(y, m_, 0).getDate();
      const burn_diario = agg.sumGastos > 0 ? agg.sumGastos / days_in_m : 0;
      const valor       = burn_diario > 0 ? Math.round(cajaTotal / burn_diario * 10) / 10 : null;

      const cajaSubs = cajaRows.rows.map(r => ({
        label: r.cuenta, valor: Math.round(n(r.monto)), formato: 'ars', signo: 1, es_sub: true,
      }));

      detalle = {
        kpi_label:        'Días de Caja',
        descripcion:      'Cuántos días podría operar el negocio si dejara de vender hoy, con la caja actual.',
        formula_template: 'Caja disponible / Burn diario promedio',
        formula_aplicada: burn_diario > 0
          ? `${fmtM_(cajaTotal)} / ${fmtM_(Math.round(burn_diario))} por día = ${valor != null ? valor.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' días' : '—'}`
          : '— (sin gastos registrados)',
        valor,
        semaforo:  semaforoKpi(valor, u),
        verde_min: Number(u.verde_min),
        ambar_min: Number(u.ambar_min),
        invert:    u.invert,
        componentes: [
          ...(cajaSubs.length ? cajaSubs : [{ label: 'Sin saldos registrados', valor: 0, formato: 'ars', signo: 0, es_sub: true }]),
          { label: 'Caja disponible',  valor: Math.round(cajaTotal),            formato: 'ars', signo:  1, es_total: true, link_modulo: 'cashflow' },
          { label: `Gastos (${mes})`,  valor: Math.round(agg.sumGastos),        formato: 'ars', signo: -1, link_modulo: 'eerr', link_params: linkParams },
          { label: `Días en el mes`,   valor: days_in_m,                        formato: 'num', signo:  0 },
          { label: 'Burn diario',      valor: Math.round(burn_diario),          formato: 'ars', signo:  0, es_total: true },
          { label: 'Días de caja',     valor,                                   formato: 'num', signo:  0, es_total: true, es_resultado: true },
        ],
      };
    }

    res.json({
      ok: true,
      data: {
        ...detalle,
        kpi_codigo: kpi,
        contexto:   `${mes} · ${localNombre}`,
        ...(desglose_locales ? { desglose_locales } : {}),
      },
    });
  } catch (err) {
    console.error('[red/finanzas/kpi/detalle]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── TEMP: init migración 024 en prod ─────────────────────────────────────────
router.post('/finanzas/kpi/init', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_umbrales (
        kpi_codigo   VARCHAR(50)   PRIMARY KEY,
        verde_min    NUMERIC(8,2)  NOT NULL,
        ambar_min    NUMERIC(8,2)  NOT NULL,
        invert       BOOLEAN       NOT NULL DEFAULT false,
        updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    const ins = await pool.query(`
      INSERT INTO kpi_umbrales (kpi_codigo, verde_min, ambar_min, invert) VALUES
        ('margen_bruto',   50, 40, false),
        ('margen_ebitda',  15,  5, false),
        ('breakeven',     100, 80, false),
        ('sueldos_venta',  30, 35, true),
        ('dias_caja',      14,  7, false)
      ON CONFLICT (kpi_codigo) DO NOTHING
    `);

    res.json({ ok: true, creada: true, defaults_cargados: ins.rowCount });
  } catch (err) {
    console.error('[red/finanzas/kpi/init]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── K) EERR Cafetería ────────────────────────────────────────────────────────

const CATS_CAFETERIA = ['cafeteria', 'panificados', 'promociones', 'menu_almuerzos', 'principales', 'bebidas'];
const CMV_DEFAULTS_CAFETERIA = { cafeteria: 28, panificados: 40, promociones: 33, menu_almuerzos: 50, principales: 50, bebidas: 27 };

const DEFAULT_GASTOS_CAFETERIA = {
  bloques: [{
    nombre: 'Gastos',
    conceptos: [
      { nombre: 'Sueldos',        monto: 0 },
      { nombre: 'Alquiler',       monto: 0 },
      { nombre: 'Luz',            monto: 0 },
      { nombre: 'Agua',           monto: 0 },
      { nombre: 'Internet',       monto: 0 },
      { nombre: 'Fudo',           monto: 0 },
      { nombre: 'Contador',       monto: 0 },
      { nombre: 'Municipalidad',  monto: 0 },
      { nombre: 'Seguros',        monto: 0 },
      { nombre: 'Gastos Oficina', monto: 0 },
    ],
  }],
};

function calcEerrCafeteria({ ventaRows, cmvMap, gastosRecord, impuestosRecord, dolarRecord }) {
  // Ventas por categoría
  const ventaMap = {};
  let venta_neta = 0, sin_categoria = 0;
  for (const row of (ventaRows || [])) {
    const venta = n(row.venta);
    if (CATS_CAFETERIA.includes(row.categoria)) {
      ventaMap[row.categoria] = (ventaMap[row.categoria] || 0) + venta;
    } else {
      sin_categoria += venta;
    }
    venta_neta += venta;
  }

  // CMV desglose
  const cmvDesglose = CATS_CAFETERIA.map(cat => {
    const pct   = n(cmvMap[cat] ?? CMV_DEFAULTS_CAFETERIA[cat]);
    const venta = n(ventaMap[cat] || 0);
    return { categoria: cat, cmv_pct: pct, venta: Math.round(venta), costo: Math.round(venta * pct / 100) };
  });
  const cmv_total = cmvDesglose.reduce((s, r) => s + r.costo, 0);
  const cmv_ponderado_pct = venta_neta > 0 ? Math.round(cmv_total / venta_neta * 1000) / 10 : 0;

  const margen_bruto = venta_neta - cmv_total;

  // Gastos (reutiliza eerr_local)
  const gastosRaw = gastosRecord?.gastos;
  const gastos    = gastosRaw?.bloques?.length > 0 ? gastosRaw : DEFAULT_GASTOS_CAFETERIA;
  const total_gastos = calcTotalGastos(gastos);

  const ebitda      = margen_bruto - total_gastos;
  const ebitda_base = Math.max(ebitda, 0);

  // Impuestos (% de EBITDA)
  const iibb_pct      = impuestosRecord ? n(impuestosRecord.iibb_pct)      : 3;
  const imp_gen_pct   = impuestosRecord ? n(impuestosRecord.imp_gen_pct)   : 30;
  const fee_marca_pct = impuestosRecord ? n(impuestosRecord.fee_marca_pct) : 4;
  const iibb          = Math.round(ebitda_base * iibb_pct      / 100);
  const imp_gen       = Math.round(ebitda_base * imp_gen_pct   / 100);
  const fee_marca     = Math.round(ebitda_base * fee_marca_pct / 100);
  const total_imp     = iibb + imp_gen + fee_marca;
  const total_imp_pct = ebitda_base > 0 ? Math.round(total_imp / ebitda_base * 1000) / 10 : 0;

  const resultado_neto  = ebitda - total_imp;
  const dolar_fin_mes   = dolarRecord ? n(dolarRecord.dolar_fin_mes) || null : null;

  const p = v => venta_neta > 0 ? Math.round(v / venta_neta * 1000) / 10 : 0;

  return {
    venta_neta:       Math.round(venta_neta),
    sin_categoria:    Math.round(sin_categoria),
    venta_categorias: cmvDesglose.map(r => ({ categoria: r.categoria, venta: r.venta, pct_venta: p(r.venta) })),
    cmv_desglose:     cmvDesglose,
    cmv_total:        Math.round(cmv_total),
    cmv_ponderado_pct,
    margen_bruto:     Math.round(margen_bruto),
    gastos_bloques:   gastos.bloques,
    total_gastos:     Math.round(total_gastos),
    ebitda:           Math.round(ebitda),
    impuestos: {
      iibb_pct, imp_gen_pct, fee_marca_pct,
      iibb, imp_gen, fee_marca,
      total: total_imp, total_pct: total_imp_pct,
    },
    resultado_neto: Math.round(resultado_neto),
    dolar_fin_mes,
    distribucion: {
      agus_pct:   50,
      agus_ars:   Math.round(resultado_neto / 2),
      agus_usd:   dolar_fin_mes ? Math.round(resultado_neto / 2 / dolar_fin_mes * 100) / 100 : null,
      plumas_pct: 50,
      plumas_ars: Math.round(resultado_neto / 2),
      plumas_usd: dolar_fin_mes ? Math.round(resultado_neto / 2 / dolar_fin_mes * 100) / 100 : null,
    },
    pcts: {
      cmv:           p(cmv_total),
      margen_bruto:  p(margen_bruto),
      gastos:        p(total_gastos),
      ebitda:        p(ebitda),
      impuestos:     p(total_imp),
      resultado_neto: p(resultado_neto),
    },
  };
}

router.get('/eerr/cafeteria', requireAuth, async (req, res) => {
  try {
    const { local_id, mes } = req.query;
    if (!local_id || !mes || !/^\d{4}-\d{2}$/.test(mes))
      return res.status(400).json({ ok: false, error: 'local_id y mes (YYYY-MM) requeridos' });

    const { ini, fin } = mesRange(mes);

    const [localR, ventaR, cmvR, gastosR, impR, dolarR, sinCatR] = await Promise.all([
      pool.query('SELECT id, nombre FROM locales WHERE id = $1', [local_id]),
      pool.query(`
        SELECT COALESCE(pcc.categoria, 'sin_categoria') AS categoria,
               COALESCE(SUM(vi.precio_total), 0)        AS venta
        FROM ventas_items vi
        JOIN ventas_tickets vt ON vt.id = vi.ticket_id
        LEFT JOIN productos_categoria_cafeteria pcc
               ON LOWER(TRIM(vi.producto_nombre_raw)) = pcc.producto_nombre_norm
        WHERE vi.local_id = $1 AND vt.fecha >= $2 AND vt.fecha <= $3
          AND COALESCE(vi.cancelada, false) = false
        GROUP BY categoria ORDER BY venta DESC
      `, [local_id, ini, fin]),
      pool.query('SELECT categoria, cmv_pct FROM eerr_cafeteria_cmv WHERE local_id=$1 AND mes=$2', [local_id, mes]),
      pool.query('SELECT * FROM eerr_local WHERE local_id=$1 AND mes=$2', [local_id, mes]),
      pool.query('SELECT * FROM eerr_cafeteria_impuestos WHERE local_id=$1 AND mes=$2', [local_id, mes]),
      pool.query('SELECT * FROM eerr_cafeteria_dolar WHERE local_id=$1 AND mes=$2', [local_id, mes]),
      pool.query(`
        SELECT COUNT(DISTINCT LOWER(TRIM(vi.producto_nombre_raw))) AS cnt
        FROM ventas_items vi
        JOIN ventas_tickets vt ON vt.id = vi.ticket_id
        LEFT JOIN productos_categoria_cafeteria pcc
               ON LOWER(TRIM(vi.producto_nombre_raw)) = pcc.producto_nombre_norm
        WHERE vi.local_id = $1 AND vt.fecha >= $2 AND vt.fecha <= $3
          AND COALESCE(vi.cancelada, false) = false AND pcc.producto_nombre_norm IS NULL
      `, [local_id, ini, fin]),
    ]);

    if (!localR.rows[0]) return res.status(404).json({ ok: false, error: 'Local no encontrado' });

    const cmvMap = Object.fromEntries(cmvR.rows.map(r => [r.categoria, n(r.cmv_pct)]));

    const eerr = calcEerrCafeteria({
      ventaRows:       ventaR.rows,
      cmvMap,
      gastosRecord:    gastosR.rows[0] || null,
      impuestosRecord: impR.rows[0]    || null,
      dolarRecord:     dolarR.rows[0]  || null,
    });

    res.json({
      ok: true,
      data: {
        local: localR.rows[0],
        mes,
        ...eerr,
        cmv_categorias_config: Object.fromEntries(
          CATS_CAFETERIA.map(cat => [cat, cmvMap[cat] ?? CMV_DEFAULTS_CAFETERIA[cat]])
        ),
        productos_sin_categoria: Number(sinCatR.rows[0]?.cnt || 0),
      },
    });
  } catch (err) {
    console.error('[red/eerr/cafeteria GET]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/eerr/cafeteria/cmv', requireAuth, async (req, res) => {
  try {
    const { local_id, mes, categorias } = req.body;
    if (!local_id || !mes || !categorias) return res.status(400).json({ ok: false, error: 'local_id, mes, categorias requeridos' });
    for (const [cat, pct] of Object.entries(categorias)) {
      if (!CATS_CAFETERIA.includes(cat)) continue;
      await pool.query(`
        INSERT INTO eerr_cafeteria_cmv (local_id, mes, categoria, cmv_pct, updated_at)
        VALUES ($1,$2,$3,$4,NOW())
        ON CONFLICT (local_id, mes, categoria) DO UPDATE SET cmv_pct=EXCLUDED.cmv_pct, updated_at=NOW()
      `, [local_id, mes, cat, parseFloat(pct) || 0]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[red/eerr/cafeteria/cmv]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/eerr/cafeteria/gastos', requireAuth, async (req, res) => {
  try {
    const { local_id, mes, gastos } = req.body;
    if (!local_id || !mes) return res.status(400).json({ ok: false, error: 'local_id y mes requeridos' });
    await pool.query(`
      INSERT INTO eerr_local (local_id, mes, gastos, updated_at)
      VALUES ($1,$2,$3::jsonb,NOW())
      ON CONFLICT (local_id, mes) DO UPDATE SET gastos=EXCLUDED.gastos, updated_at=NOW()
    `, [local_id, mes, JSON.stringify(gastos || DEFAULT_GASTOS_CAFETERIA)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[red/eerr/cafeteria/gastos]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/eerr/cafeteria/impuestos', requireAuth, async (req, res) => {
  try {
    const { local_id, mes, iibb_pct, imp_gen_pct, fee_marca_pct } = req.body;
    if (!local_id || !mes) return res.status(400).json({ ok: false, error: 'local_id y mes requeridos' });
    await pool.query(`
      INSERT INTO eerr_cafeteria_impuestos (local_id, mes, iibb_pct, imp_gen_pct, fee_marca_pct, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (local_id, mes) DO UPDATE
        SET iibb_pct=EXCLUDED.iibb_pct, imp_gen_pct=EXCLUDED.imp_gen_pct,
            fee_marca_pct=EXCLUDED.fee_marca_pct, updated_at=NOW()
    `, [local_id, mes, parseFloat(iibb_pct) ?? 3, parseFloat(imp_gen_pct) ?? 30, parseFloat(fee_marca_pct) ?? 4]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[red/eerr/cafeteria/impuestos]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/eerr/cafeteria/dolar', requireAuth, async (req, res) => {
  try {
    const { local_id, mes, dolar_fin_mes } = req.body;
    if (!local_id || !mes) return res.status(400).json({ ok: false, error: 'local_id y mes requeridos' });
    await pool.query(`
      INSERT INTO eerr_cafeteria_dolar (local_id, mes, dolar_fin_mes, updated_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (local_id, mes) DO UPDATE SET dolar_fin_mes=EXCLUDED.dolar_fin_mes, updated_at=NOW()
    `, [local_id, mes, parseFloat(dolar_fin_mes) || null]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[red/eerr/cafeteria/dolar]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/eerr/cafeteria/productos-categorias', requireAuth, async (req, res) => {
  try {
    const { local_id } = req.query;
    const lid = parseInt(local_id);
    if (!lid) return res.status(400).json({ ok: false, error: 'local_id requerido' });
    const { rows } = await pool.query(`
      SELECT LOWER(TRIM(vi.producto_nombre_raw)) AS nombre_norm,
             vi.producto_nombre_raw              AS nombre_raw,
             pcc.categoria,
             SUM(vi.precio_total)                AS venta_total,
             COUNT(*)                            AS apariciones
      FROM ventas_items vi
      LEFT JOIN productos_categoria_cafeteria pcc
             ON LOWER(TRIM(vi.producto_nombre_raw)) = pcc.producto_nombre_norm
      WHERE vi.local_id = $1 AND COALESCE(vi.cancelada, false) = false
      GROUP BY 1, 2, 3
      ORDER BY pcc.categoria NULLS FIRST, venta_total DESC
    `, [lid]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[red/eerr/cafeteria/productos-categorias GET]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/eerr/cafeteria/productos-categorias', requireAuth, async (req, res) => {
  try {
    const { asignaciones } = req.body;
    if (!Array.isArray(asignaciones) || !asignaciones.length)
      return res.status(400).json({ ok: false, error: 'asignaciones[] requerido' });
    for (const { producto_nombre_norm, categoria } of asignaciones) {
      if (!producto_nombre_norm || !CATS_CAFETERIA.includes(categoria)) continue;
      await pool.query(`
        INSERT INTO productos_categoria_cafeteria (producto_nombre_norm, categoria)
        VALUES ($1,$2)
        ON CONFLICT (producto_nombre_norm) DO UPDATE SET categoria=EXCLUDED.categoria
      `, [producto_nombre_norm.toLowerCase().trim(), categoria]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[red/eerr/cafeteria/productos-categorias POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── TEMP: diagnóstico de locales + ventas de cafetería ───────────────────────
router.get('/eerr/cafeteria/diagnostico', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Todos los locales con sus ventas (sin filtro es_alfajorera para ver todo)
    const localesR = await pool.query(`
      SELECT l.id, l.nombre, l.activo, l.es_alfajorera,
             COUNT(DISTINCT vt.id)  AS tickets,
             COUNT(DISTINCT vi.id)  AS items,
             MIN(vt.fecha)          AS primera_venta,
             MAX(vt.fecha)          AS ultima_venta
      FROM locales l
      LEFT JOIN ventas_tickets vt ON vt.local_id = l.id
      LEFT JOIN ventas_items   vi ON vi.local_id = l.id
      GROUP BY l.id, l.nombre, l.activo, l.es_alfajorera
      ORDER BY l.es_alfajorera DESC, tickets DESC
    `);
    res.json({ ok: true, locales: localesR.rows });
  } catch (err) {
    console.error('[eerr/cafeteria/diagnostico]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── TEMP: init migración 025 cafetería en prod ────────────────────────────────
router.post('/eerr/cafeteria/init', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eerr_cafeteria_cmv (
        local_id INT NOT NULL REFERENCES locales(id),
        mes CHAR(7) NOT NULL,
        categoria TEXT NOT NULL,
        cmv_pct NUMERIC(5,2) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (local_id, mes, categoria)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eerr_cafeteria_impuestos (
        local_id INT NOT NULL REFERENCES locales(id),
        mes CHAR(7) NOT NULL,
        iibb_pct NUMERIC(5,2) NOT NULL DEFAULT 3,
        imp_gen_pct NUMERIC(5,2) NOT NULL DEFAULT 30,
        fee_marca_pct NUMERIC(5,2) NOT NULL DEFAULT 4,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (local_id, mes)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eerr_cafeteria_dolar (
        local_id INT NOT NULL REFERENCES locales(id),
        mes CHAR(7) NOT NULL,
        dolar_fin_mes NUMERIC(10,2),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (local_id, mes)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos_categoria_cafeteria (
        producto_nombre_norm TEXT PRIMARY KEY,
        categoria TEXT NOT NULL
          CHECK (categoria IN ('cafeteria','panificados','promociones',
                               'menu_almuerzos','principales','bebidas'))
      )
    `);

    // Contar productos de cafetería todavía sin categoría asignada
    const sinCat = await pool.query(`
      SELECT COUNT(DISTINCT LOWER(TRIM(vi.producto_nombre_raw))) AS cnt
      FROM ventas_items vi
      JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = false AND l.activo = true
      LEFT JOIN productos_categoria_cafeteria pcc
             ON LOWER(TRIM(vi.producto_nombre_raw)) = pcc.producto_nombre_norm
      WHERE COALESCE(vi.cancelada, false) = false
        AND pcc.producto_nombre_norm IS NULL
    `);

    res.json({
      ok: true,
      tablas_creadas: [
        'eerr_cafeteria_cmv',
        'eerr_cafeteria_impuestos',
        'eerr_cafeteria_dolar',
        'productos_categoria_cafeteria',
      ],
      productos_sin_categoria: Number(sinCat.rows[0]?.cnt || 0),
    });
  } catch (err) {
    console.error('[red/eerr/cafeteria/init]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
