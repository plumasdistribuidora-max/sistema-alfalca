// Kankay: import del Excel de Dux, los números del dashboard y el estado de resultados.
//
// Reglas (Martín, 11/10/2026):
// - Una venta sin número de comprobante es una factura que no llegó a emitirse (AFIP no la
//   tomó). Va como venta sin factura, completa, aunque el Excel le calcule IVA.
// - Lo que no tiene IVA (CX) también entra completo. Lo facturado va "Total Sin IVA".
// - Costo de mercadería = "Costo Total Producto". El costo financiero de las cuotas no se
//   usa: la comisión de tarjetas es un % de la venta neta que incluye cuotas y gastos.

const XLSX = require('xlsx');
const pool = require('../config/db');

const GASTOS_BASE = [
  'Sueldos', 'Alquiler', 'Expensas', 'Servicios (luz, agua, internet)', 'Marketing y publicidad',
  'Fondo de promoción', 'Envíos y logística', 'Fletes', 'Honorarios (contador, etc.)',
  'Sistemas y software', 'Otros gastos',
];

const titulo = s => {
  s = String(s ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
};
const pad = n => String(n).padStart(2, '0');

// ---------------------------------------------------------------- Excel

// Devuelve los renglones listos para guardar, o tira un error con un mensaje para la pantalla.
// Un día sin ventas no aparece en el Excel: con permitirVacio, un Excel sin renglones vale.
function leerExcel(buffer, { permitirVacio = false } = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const idx = filas.findIndex(f => f.includes('Total Sin IVA') && f.includes('Fecha Registro'));
  if (idx < 0) throw new Error('Este Excel no es la "Consulta de ventas detallada" de Dux: no tiene las columnas "Total Sin IVA" y "Fecha Registro".');
  const h = filas[idx];
  const col = n => {
    const i = h.indexOf(n);
    if (i < 0) throw new Error(`Al Excel le falta la columna "${n}".`);
    return i;
  };
  const C = Object.fromEntries(['Empresa', 'Cliente', 'Comprobante', 'Código Producto', 'Producto', 'Rubro', 'Sub Rubro',
    'Vendedor', 'Cantidad', 'Total Sin IVA', 'Total', 'Costo Total Producto', 'Fecha Registro'].map(n => [n, col(n)]));

  const out = [];
  for (const f of filas.slice(idx + 1)) {
    if (!String(f[C.Empresa]).trim()) continue;
    const reg = String(f[C['Fecha Registro']]).trim();
    const m = reg.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!m) throw new Error(`Hay una fecha que no se entiende: "${reg}".`);
    const [, dd, mm, yy, hh, mi] = m;
    const comprobante = String(f[C.Comprobante]).trim() || null;
    const total = Number(f[C.Total]) || 0;
    const cliente = String(f[C.Cliente]).trim() || null;
    out.push({
      fecha: `${yy}-${mm}-${dd}`,
      hora: Number(hh),
      registrado: `${yy}-${mm}-${dd} ${pad(hh)}:${mi}:00`,
      comprobante,
      ticket: comprobante || `S/N|${cliente || ''}|${reg}`,
      cliente,
      codigo: String(f[C['Código Producto']]).trim() || null,
      producto: titulo(f[C.Producto]) || 'Sin nombre',
      rubro: titulo(f[C.Rubro]) || 'Sin rubro',
      subrubro: titulo(f[C['Sub Rubro']]) || null,
      vendedor: titulo(f[C.Vendedor]).replace(/^Kankay, kankay$/, 'Usuario Kankay') || null,
      cantidad: Number(f[C.Cantidad]) || 0,
      total,
      neto: comprobante ? (Number(f[C['Total Sin IVA']]) || 0) : total,
      cmv: Number(f[C['Costo Total Producto']]) || 0,
      facturada: !!comprobante && Math.abs(total - (Number(f[C['Total Sin IVA']]) || 0)) > 0.5,
    });
  }
  if (!out.length && !permitirVacio) throw new Error('El Excel no tiene ventas.');
  return out;
}

function resumir(rs) {
  const tk = {};
  for (const r of rs) tk[r.ticket] = (tk[r.ticket] || 0) + Number(r.total);
  const s = k => rs.reduce((a, r) => a + Number(r[k]), 0);
  return {
    renglones: rs.length,
    ventas: Object.values(tk).filter(v => v > 0).length,
    unidades: s('cantidad'),
    productos: new Set(rs.map(r => r.producto)).size,
    total: s('total'), neto: s('neto'), cmv: s('cmv'),
    sinNumero: rs.filter(r => !r.comprobante).length,
  };
}

// Hasta qué día está cargado Kankay: el último día con ventas o, si es posterior, el último
// día que alguien cargó como "sin ventas" (queda en kankay_imports.hasta).
const SQL_CUBIERTO = `GREATEST((SELECT MAX(fecha) FROM kankay_ventas), (SELECT MAX(hasta) FROM kankay_imports))`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hoyMza = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' });
const sumarDia = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Lo que trae el Excel, sin guardar nada: para que la pantalla pregunte por los días que faltan.
async function revisar(buffer) {
  const rs = leerExcel(buffer, { permitirVacio: true });
  const dias = [...new Set(rs.map(r => r.fecha))].sort();
  const { rows: [c] } = await pool.query(`SELECT to_char(${SQL_CUBIERTO},'YYYY-MM-DD') AS cubierto`);
  return { desde: dias[0] || null, ultimo: dias.at(-1) || null, renglones: rs.length,
    cubierto: c.cubierto, ayer: sumarDia(hoyMza(), -1) };
}

// Guarda el Excel: los días que trae se reemplazan enteros. Con sinVentasHasta, los días
// entre el último del Excel (o lo ya cargado, si viene vacío) y esa fecha quedan como días
// sin ventas: Dux no exporta nada de un día en que no se vendió.
async function importar(buffer, archivo, usuarioId, sinVentasHasta) {
  if (sinVentasHasta && !ISO.test(sinVentasHasta)) throw new Error('La fecha "hasta" no se entiende.');
  const rs = leerExcel(buffer, { permitirVacio: !!sinVentasHasta });
  const dias = [...new Set(rs.map(r => r.fecha))].sort();
  const res = resumir(rs);
  let huecoDesde = null, hasta = dias.at(-1);
  if (sinVentasHasta) {
    if (sinVentasHasta > hoyMza()) throw new Error('La fecha "hasta" no puede ser posterior a hoy.');
    if (dias.length && sinVentasHasta < dias.at(-1)) throw new Error(`El Excel trae ventas del ${dias.at(-1).split('-').reverse().join('/')}, después de la fecha "hasta".`);
    // El hueco arranca después de lo último que hay: lo que trae el Excel o lo ya cargado.
    const { rows: [c] } = await pool.query(`SELECT to_char(${SQL_CUBIERTO},'YYYY-MM-DD') AS cubierto`);
    const base = [dias.at(-1), c.cubierto].filter(Boolean).sort().at(-1);
    if (!base) throw new Error('El Excel no tiene ventas.');
    huecoDesde = sumarDia(base, 1);
    if (!dias.length && huecoDesde > sinVentasHasta) throw new Error(`Kankay ya está cargado hasta el ${base.split('-').reverse().join('/')}.`);
    if (huecoDesde > sinVentasHasta) huecoDesde = null;
    hasta = sinVentasHasta;
  }
  const desde = dias[0] || huecoDesde;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Si en los días "sin ventas" ya hay ventas cargadas, la fecha está mal: no se borran.
    if (huecoDesde) {
      const { rows: [h] } = await client.query(
        `SELECT to_char(MIN(fecha),'DD/MM') AS f FROM kankay_ventas WHERE fecha BETWEEN $1 AND $2`, [huecoDesde, hasta]);
      if (h.f) throw new Error(`El ${h.f} ya tiene ventas cargadas y este Excel no las trae. Revisá hasta qué día cubre el Excel.`);
    }
    const { rows: [imp] } = await client.query(`
      INSERT INTO kankay_imports (archivo, desde, hasta, renglones, ventas, total, neto, cmv, subido_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, subido_en
    `, [archivo, desde, hasta, res.renglones, res.ventas, res.total, res.neto, res.cmv, usuarioId || null]);
    const { rows: [borr] } = await client.query(`
      WITH b AS (DELETE FROM kankay_ventas WHERE fecha = ANY($1::date[]) RETURNING fecha)
      SELECT COUNT(DISTINCT fecha)::int AS dias FROM b
    `, [dias]);
    const campos = ['import_id', 'fecha', 'hora', 'registrado', 'comprobante', 'ticket', 'cliente', 'codigo', 'producto',
      'rubro', 'subrubro', 'vendedor', 'cantidad', 'total', 'neto', 'cmv', 'facturada'];
    for (let i = 0; i < rs.length; i += 200) {
      const lote = rs.slice(i, i + 200);
      const vals = [], ph = [];
      lote.forEach((r, j) => {
        ph.push(`(${campos.map((_, k) => `$${j * campos.length + k + 1}`).join(',')})`);
        vals.push(imp.id, ...campos.slice(1).map(c => r[c]));
      });
      await client.query(`INSERT INTO kankay_ventas (${campos.join(',')}) VALUES ${ph.join(',')}`, vals);
    }
    await client.query('COMMIT');
    const diasSinVentas = huecoDesde ? Math.round((new Date(hasta) - new Date(huecoDesde)) / 864e5) + 1 : 0;
    return { id: imp.id, archivo, desde, hasta, diasReemplazados: borr.dias, diasSinVentas, sinVentasDesde: huecoDesde,
      meses: [...new Set([...dias, ...(huecoDesde ? [huecoDesde, hasta] : [])].map(d => d.slice(0, 7)))].sort(), ...res };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- Dashboard

const ultimoDia = p => new Date(Number(p.slice(0, 4)), Number(p.slice(5)), 0).getDate();
const isoHoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function agg(rs) {
  const tk = {};
  rs.forEach(r => { tk[r.ticket] = (tk[r.ticket] || 0) + r.total; });
  const sum = k => rs.reduce((a, r) => a + r[k], 0);
  return {
    tot: sum('total'), neto: sum('neto'), cmv: sum('cmv'), q: sum('cantidad'),
    ventas: Object.values(tk).filter(v => v > 0).length,
    sinFact: rs.filter(r => !r.facturada && r.total > 0).reduce((a, r) => a + r.total, 0),
    dias: new Set(rs.filter(r => r.total > 0).map(r => r.fecha)).size,
  };
}
function por(rs, key) {
  const o = {};
  rs.forEach(r => { const k = typeof key === 'function' ? key(r) : r[key]; (o[k] = o[k] || []).push(r); });
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, agg(v)]));
}

// Todo lo que muestra el dashboard, armado de una vez: Kankay vende poco y el período es corto.
async function datos() {
  const { rows } = await pool.query(`
    SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, hora, ticket, producto, rubro, subrubro, vendedor,
           cantidad::float AS cantidad, total::float AS total, neto::float AS neto, cmv::float AS cmv, facturada
    FROM kankay_ventas ORDER BY fecha, registrado
  `);
  const { rows: [ult] } = await pool.query(`
    SELECT i.subido_en, i.archivo, to_char(${SQL_CUBIERTO},'YYYY-MM-DD') AS hasta,
           to_char((SELECT MIN(fecha) FROM kankay_ventas),'YYYY-MM-DD') AS desde, u.nombre
    FROM kankay_imports i LEFT JOIN usuarios u ON u.id = i.subido_por ORDER BY i.subido_en DESC LIMIT 1
  `);
  if (!rows.length) return { vacio: true };

  rows.forEach(r => {
    const [y, m, d] = r.fecha.split('-').map(Number);
    r.mes = r.fecha.slice(0, 7); r.dia = d; r.dow = new Date(y, m - 1, d).getDay();
    r.vendedor = r.vendedor || 'Sin vendedor';
  });
  const meses = {};
  for (const mes of [...new Set(rows.map(r => r.mes))].sort()) {
    const rs = rows.filter(r => r.mes === mes);
    const M = agg(rs);
    M.rubro = por(rs, 'rubro');
    M.prod = por(rs, 'producto');
    M.porDia = Object.fromEntries(Object.entries(por(rs, 'dia')).map(([d, v]) => [d, v.tot]));
    M.porDiaNeto = Object.fromEntries(Object.entries(por(rs, 'dia')).map(([d, v]) => [d, v.neto]));
    M.hasta1_ = {}; // venta acumulada hasta cada día, para comparar "mismos días"
    for (let d = 1; d <= 31; d++) M.hasta1_[d] = agg(rs.filter(r => r.dia <= d));
    M.desde = rs[0].fecha; M.hasta = rs.at(-1).fecha;
    meses[mes] = M;
  }
  const total = agg(rows);
  total.rubro = por(rows, 'rubro');
  total.prod = por(rows, 'producto');
  total.sub = por(rows.filter(r => r.rubro === 'Sartenes'), r => r.subrubro || 'Sin línea');
  total.vend = por(rows, 'vendedor');
  total.vdow = {}; total.vturno = {}; total.vdias = {};
  for (const r of rows) {
    const v = r.vendedor;
    const a = (total.vdow[v] = total.vdow[v] || {}); a[r.dow] = a[r.dow] || { tot: 0, f: new Set() };
    a[r.dow].tot += r.total; if (r.total > 0) a[r.dow].f.add(r.fecha);
    const t = (total.vturno[v] = total.vturno[v] || { man: 0, tar: 0 }); t[r.hora < 15 ? 'man' : 'tar'] += r.total;
    (total.vdias[v] = total.vdias[v] || new Set()); if (r.total > 0) total.vdias[v].add(r.fecha);
  }
  for (const v in total.vdias) total.vdias[v] = total.vdias[v].size;
  for (const v in total.vdow) for (const d in total.vdow[v]) total.vdow[v][d].f = total.vdow[v][d].f.size;
  total.desde = rows[0].fecha; total.hasta = rows.at(-1).fecha;
  // Los días sin ventas cargados después de la última venta también cuentan como cargados.
  const cub = ult?.hasta;
  if (cub && cub > total.hasta) {
    total.hasta = cub;
    for (const [mes, M] of Object.entries(meses)) {
      const fin = `${mes}-${pad(ultimoDia(mes))}`;
      if (M.hasta < cub) M.hasta = cub < fin ? cub : fin;
    }
  }

  const tk = {};
  for (const r of rows) { const t = (tk[r.ticket] = tk[r.ticket] || { f: r.fecha, h: r.hora, tot: 0 }); t.tot += r.total; }
  const tickets = Object.values(tk).map(t => [t.f, t.h, Math.round(t.tot)]);

  return { meses, total, tickets, hoy: isoHoy(), ultimoImport: ult || null };
}

// ---------------------------------------------------------------- Estado de resultados

async function comisionPct() {
  const { rows } = await pool.query(`SELECT valor FROM parametros WHERE clave = 'kankay_comision_pct'`);
  return rows.length ? Number(rows[0].valor) : 6;
}

// Lo cargado a mano de cada mes con ventas. Un mes sin cargar arranca con los renglones
// del último mes cargado, vacíos.
async function eerrManual() {
  const { rows: ms } = await pool.query(`SELECT DISTINCT to_char(fecha,'YYYY-MM') AS p FROM kankay_ventas ORDER BY 1`);
  const { rows } = await pool.query(`
    SELECT e.periodo, e.gastos, e.iibb::float, e.f931::float, e.nc::float, e.actualizado_en, u.nombre AS actualizado_por,
           e.terminado_en, t.nombre AS terminado_por
    FROM kankay_eerr e LEFT JOIN usuarios u ON u.id = e.actualizado_por
    LEFT JOIN usuarios t ON t.id = e.terminado_por ORDER BY e.periodo
  `);
  const porP = Object.fromEntries(rows.map(r => [r.periodo, r]));
  const out = {};
  let nombres = GASTOS_BASE;
  for (const p of [...new Set([...ms.map(m => m.p), ...rows.map(r => r.periodo)])].sort()) {
    const r = porP[p];
    if (r) { nombres = r.gastos.map(g => g[0]); out[p] = { ...r, guardado: true }; }
    else out[p] = { periodo: p, gastos: nombres.map(n => [n, null]), iibb: null, f931: null, nc: null, guardado: false };
  }
  return { comisionPct: await comisionPct(), meses: out };
}

const num = v => (v === '' || v === null || v === undefined || !isFinite(Number(v))) ? null : Number(v);

async function guardarEerr(periodo, body, usuarioId) {
  const gastos = (Array.isArray(body.gastos) ? body.gastos : [])
    .filter(g => Array.isArray(g) && String(g[0] || '').trim())
    .map(g => [String(g[0]).trim().slice(0, 80), num(g[1])]);
  const { rows: [antes] } = await pool.query('SELECT gastos, iibb::float, f931::float, nc::float FROM kankay_eerr WHERE periodo = $1', [periodo]);
  await pool.query(`
    INSERT INTO kankay_eerr (periodo, gastos, iibb, f931, nc, actualizado_en, actualizado_por)
    VALUES ($1,$2,$3,$4,$5,NOW(),$6)
    ON CONFLICT (periodo) DO UPDATE SET gastos = EXCLUDED.gastos, iibb = EXCLUDED.iibb, f931 = EXCLUDED.f931,
      nc = EXCLUDED.nc, actualizado_en = NOW(), actualizado_por = EXCLUDED.actualizado_por
  `, [periodo, JSON.stringify(gastos), num(body.iibb), num(body.f931), num(body.nc), usuarioId]);

  // Qué cambió, para el aviso.
  const cambios = [];
  const a = antes || { gastos: [], iibb: null, f931: null, nc: null };
  const gA = Object.fromEntries((a.gastos || []).map(g => [g[0], g[1]]));
  for (const [n, v] of gastos) if ((gA[n] ?? null) !== v) cambios.push(n);
  if ((a.iibb ?? null) !== num(body.iibb)) cambios.push('Ingresos brutos');
  if ((a.f931 ?? null) !== num(body.f931)) cambios.push('F. 931');
  if ((a.nc ?? null) !== num(body.nc)) cambios.push('Nota de crédito');
  return cambios;
}

// Dar el mes por terminado: recién ahí se avisa a los dueños.
async function terminarEerr(periodo, usuarioId) {
  const { rowCount } = await pool.query(
    'UPDATE kankay_eerr SET terminado_en = NOW(), terminado_por = $2 WHERE periodo = $1', [periodo, usuarioId]);
  return rowCount > 0;
}

// Resultado y punto de equilibrio de un mes, con lo que haya cargado.
async function resultadoMes(periodo, D) {
  const M = D.meses[periodo];
  if (!M) return null;
  const { comisionPct: pct, meses } = await eerrManual();
  const e = meses[periodo];
  const cargado = e && e.gastos.some(g => g[1] !== null);
  const gT = cargado ? e.gastos.reduce((a, g) => a + (g[1] || 0), 0) : null;
  const com = M.neto * pct / 100;
  const mb = M.neto - M.cmv;
  // Equilibrio: gastos fijos del mes, o los del último mes cargado.
  const ref = cargado ? e : Object.values(meses).filter(x => x.periodo < periodo && x.gastos.some(g => g[1] !== null)).at(-1);
  let pe = null;
  if (ref) {
    const g = ref.gastos.reduce((a, x) => a + (x[1] || 0), 0) + (ref.f931 || 0);
    const netoRef = D.meses[ref.periodo]?.neto || M.neto;
    const variable = M.cmv / M.neto + pct / 100 + (ref.iibb ? ref.iibb / netoRef : 0);
    pe = g / (1 - variable);
  }
  const ro = cargado ? mb - gT : null;
  const res = cargado ? ro - (e.iibb || 0) - (e.f931 || 0) - com + (e.nc || 0) : null;
  return { mb, ro, res, pe, estimado: !cargado };
}


// ---------------------------------------------------------------- Portada

// Lo que la portada del grupo muestra de Kankay: ayer, hoy, el mes hasta el último día
// cargado contra los mismos días del mes anterior, y qué falta (EERR del mes pasado, Excel viejo).
async function resumenInicio() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' });
  const { rows: [r] } = await pool.query(`
    WITH u AS (SELECT ${SQL_CUBIERTO} AS hasta)
    SELECT to_char(u.hasta,'YYYY-MM-DD') AS hasta,
      COALESCE(SUM(v.total) FILTER (WHERE v.fecha = $1::date - 1), 0)::float AS ayer,
      COALESCE(SUM(v.total) FILTER (WHERE v.fecha = $1::date), 0)::float     AS hoy,
      COALESCE(SUM(v.total) FILTER (WHERE v.fecha >= date_trunc('month', u.hasta)), 0)::float AS mes,
      COUNT(DISTINCT v.ticket) FILTER (WHERE v.fecha >= date_trunc('month', u.hasta) AND v.total > 0)::int AS ventas_mes,
      COALESCE(SUM(v.total) FILTER (WHERE v.fecha >= date_trunc('month', u.hasta) - INTERVAL '1 month'
                                     AND v.fecha <= u.hasta - INTERVAL '1 month'), 0)::float AS mes_ant,
      bool_or(v.fecha < date_trunc('month', u.hasta) AND v.fecha >= date_trunc('month', u.hasta) - INTERVAL '1 month') AS hay_mes_ant
    FROM kankay_ventas v, u GROUP BY u.hasta
  `, [hoy]);
  if (!r) return null;
  // El EERR que debería estar cerrado: el del mes anterior al de hoy, si ese mes tuvo ventas.
  const d = new Date(`${hoy}T12:00:00`); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const periodo = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const { rows: [e] } = await pool.query(`
    SELECT EXISTS (SELECT 1 FROM kankay_ventas WHERE to_char(fecha,'YYYY-MM') = $1) AS vendio,
           (SELECT terminado_en FROM kankay_eerr WHERE periodo = $1) AS terminado_en
  `, [periodo]);
  const { rows: meses } = await pool.query(`
    SELECT to_char(fecha,'YYYY-MM') AS periodo, SUM(total)::float AS total FROM kankay_ventas GROUP BY 1 ORDER BY 1
  `);
  return {
    meses,
    hoy_fecha: hoy, hasta: r.hasta, ayer: r.ayer, hoy: r.hoy, mes: r.mes, ventas_mes: r.ventas_mes,
    mes_ant: r.hay_mes_ant ? r.mes_ant : null,
    eerr_pendiente: e.vendio && !e.terminado_en ? periodo : null,
  };
}

module.exports = { resumenInicio, leerExcel, revisar, importar, datos, eerrManual, guardarEerr, terminarEerr, comisionPct, resultadoMes, ultimoDia, GASTOS_BASE };
