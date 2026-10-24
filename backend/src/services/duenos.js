// La sección Dueños (23/10/2026): los números de cada unidad para el método "Crecer
// ordenados". Todo arranca y termina en la rentabilidad: resultado del EERR sobre la venta
// neta, el mismo número que muestra Finanzas en cada local, Kankay en su estado de
// resultados y Senzen en el suyo (venta y costo de Dux, gastos a mano).

const pool = require('../config/db');
const { eerr } = require('../routes/red');
const kankay = require('./kankay');
const { hoyStr } = require('../utils/fechas');

// Las unidades, en el orden en que se muestran. "entre_dos" es el consolidado de los cinco.
const UNIDADES = [
  { k: 'amigorena',     nombre: 'Amigorena',  negocio: 'entre_dos', local_id: 1 },
  { k: 'nuevedejulio',  nombre: '9 de Julio', negocio: 'entre_dos', local_id: 2 },
  { k: 'peatonal',      nombre: 'Peatonal',   negocio: 'entre_dos', local_id: 3 },
  { k: 'sheraton',      nombre: 'Sheraton',   negocio: 'entre_dos', local_id: 4 },
  { k: 'cafe_peatonal', nombre: 'Café',       negocio: 'entre_dos', local_id: 5, cafe: true },
  { k: 'entre_dos',     nombre: 'Entre Dos',  negocio: 'entre_dos', consolidado: true },
  { k: 'kankay',        nombre: 'Kankay',     negocio: 'kankay' },
  { k: 'senzen',        nombre: 'Senzen',     negocio: 'senzen' },
];
const UNIDAD = Object.fromEntries(UNIDADES.map(u => [u.k, u]));
// Las que se cierran una por una (el consolidado sale solo de los cinco locales).
const A_CERRAR = UNIDADES.filter(u => !u.consolidado);

const esMes = m => /^\d{4}-\d{2}$/.test(m || '');
const mesDe = f => f.slice(0, 7);
function sumarMeses(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const ultimoDia = mes => { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const mesActual = () => mesDe(hoyStr());
// El mes que se cierra es el anterior al de hoy; tiene hasta el día 5 del siguiente. El
// método arranca con octubre de 2026 (primera reunión con su EERR, hasta el 5/11): antes
// de eso no se pide cerrar nada.
const DESDE = '2026-10';
const mesACerrar = () => { const m = sumarMeses(mesActual(), -1); return m < DESDE ? DESDE : m; };
// El mes que se planifica: el de hoy, salvo antes de la primera reunión (noviembre de 2026).
// Los microobjetivos que se repasan un miércoles son los del mes de ese miércoles.
const mesDeSemana = semana => { const m = semana.slice(0, 7); const primero = sumarMeses(DESDE, 1); return m < primero ? primero : m; };
const mesPlan = () => { const m = mesActual(); const primero = sumarMeses(DESDE, 1); return m < primero ? primero : m; };
const plazoCierre = mes => `${sumarMeses(mes, 1)}-05`;
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = mes => NOMBRE_MES[Number(mes.slice(5, 7)) - 1];

const pct = (res, venta) => (venta > 0 && res != null ? Math.round((res / venta) * 1000) / 10 : null);

// ── Senzen ───────────────────────────────────────────────────────────────────
async function senzenMes(mes) {
  const [{ rows: [v] }, { rows: [g] }, { rows: [sync] }] = await Promise.all([
    pool.query(`
      SELECT COALESCE(SUM(f.neto), 0)::float AS neto,
             COALESCE((SELECT SUM(i.costo) FROM senzen_factura_items i JOIN senzen_facturas f2 USING (id_comp_venta)
                       WHERE NOT f2.anulada AND to_char(f2.fecha, 'YYYY-MM') = $1), 0)::float AS costo
      FROM senzen_facturas f WHERE NOT f.anulada AND to_char(f.fecha, 'YYYY-MM') = $1`, [mes]),
    pool.query('SELECT gastos FROM senzen_eerr WHERE mes = $1', [mes]),
    pool.query(`SELECT to_char(MAX(termino) AT TIME ZONE 'America/Argentina/Mendoza', 'YYYY-MM-DD') AS hasta FROM senzen_sync WHERE ok`),
  ]);
  // Los renglones de gastos se arrastran del último mes cargado, en $ 0 (como Entre Dos).
  let gastos = g?.gastos || [];
  if (!gastos.length) {
    const prev = (await pool.query(`SELECT gastos FROM senzen_eerr WHERE mes < $1 AND jsonb_array_length(gastos) > 0 ORDER BY mes DESC LIMIT 1`, [mes])).rows[0];
    gastos = (prev?.gastos || [{ nombre: 'Sueldo y comisión de Pepa' }, { nombre: 'Fletes' }, { nombre: 'Otros' }]).map(x => ({ nombre: x.nombre, monto: 0 }));
  }
  const totalGastos = gastos.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const resultado = v.neto - v.costo - totalGastos;
  return {
    venta_neta: v.neto, costo: v.costo, gastos, total_gastos: totalGastos,
    gastos_cargados: totalGastos > 0, resultado: totalGastos > 0 ? resultado : null,
    ventas_hasta: sync?.hasta || null,
  };
}

// ── Una unidad en un mes ─────────────────────────────────────────────────────
// { venta_neta, resultado, pct, gastos_cargados, ventas_hasta, ventas_completas, cmv_pct }
// resultado es null mientras no haya gastos cargados: sin gastos la ganancia daría de más.
async function numerosDe(unidades, mes, ctx = {}) {
  const fin = ultimoDia(mes);
  const out = {};
  const tiendas = unidades.filter(u => u.local_id);
  const hastas = tiendas.length ? Object.fromEntries((await pool.query(
    `SELECT local_id, MAX(fecha)::text AS hasta FROM ventas_tickets WHERE estado = 'cerrada' AND local_id = ANY($1) GROUP BY local_id`,
    [tiendas.map(u => u.local_id)])).rows.map(r => [r.local_id, r.hasta])) : {};

  await Promise.all(unidades.map(async u => {
    if (u.local_id) {
      const e = u.cafe ? await eerr.eerrCafe(u.local_id, mes) : await eerr.eerrTienda(u.local_id, mes);
      const cmv = u.cafe ? e.cmv_total : e.cmv;
      out[u.k] = {
        venta_neta: e.venta_neta, resultado: e.gastos_cargados ? e.resultado_neto : null,
        gastos_cargados: e.gastos_cargados, total_gastos: e.total_gastos,
        cmv_pct: pct(cmv, e.venta_neta), ventas_hasta: hastas[u.local_id] || null,
      };
    } else if (u.k === 'kankay') {
      const D = ctx.kankay || (ctx.kankay = await kankay.datos());
      const M = D.vacio ? null : D.meses[mes];
      const r = M ? await kankay.resultadoMes(mes, D) : null;
      out[u.k] = {
        venta_neta: M?.neto || 0, resultado: r && !r.estimado ? r.res : null,
        gastos_cargados: !!r && !r.estimado, cmv_pct: M ? pct(M.cmv, M.neto) : null,
        ventas_hasta: D.ultimoImport?.hasta || null,
      };
    } else if (u.k === 'senzen') {
      const s = await senzenMes(mes);
      out[u.k] = { ...s, cmv_pct: pct(s.costo, s.venta_neta) };
    }
  }));

  // El consolidado de Entre Dos: la suma de los cinco, si están todos con gastos.
  if (unidades.some(u => u.consolidado)) {
    const cinco = UNIDADES.filter(u => u.local_id);
    const faltan = cinco.filter(u => !out[u.k]);
    if (faltan.length) Object.assign(out, await numerosDe(faltan, mes, ctx));
    const xs = cinco.map(u => out[u.k]);
    const venta = xs.reduce((s, x) => s + x.venta_neta, 0);
    const todos = xs.every(x => x.gastos_cargados);
    out.entre_dos = {
      venta_neta: venta, gastos_cargados: todos,
      resultado: todos ? xs.reduce((s, x) => s + x.resultado, 0) : null,
      ventas_hasta: xs.map(x => x.ventas_hasta).sort()[0] || null,
    };
  }
  for (const k of Object.keys(out)) {
    const x = out[k];
    x.pct = pct(x.resultado, x.venta_neta);
    x.ventas_completas = !!x.ventas_hasta && x.ventas_hasta >= fin;
  }
  return out;
}

// ── Ventas del mes, en vivo ──────────────────────────────────────────────────
// Para los objetivos de ventas: lo que se cobró (con IVA), como lo muestran Fudo y Dux.
// hasta = el último día con datos, para calcular el ritmo.
async function ventasRango(k, ini, fin) {
  const u = UNIDAD[k];
  if (u?.local_id || u?.consolidado) {
    const ids = u.consolidado ? UNIDADES.filter(x => x.local_id).map(x => x.local_id) : [u.local_id];
    const { rows: [r] } = await pool.query(`SELECT COALESCE(SUM(total), 0)::float AS total, MAX(fecha)::text AS hasta FROM ventas_tickets
      WHERE estado = 'cerrada' AND local_id = ANY($1) AND fecha BETWEEN $2 AND $3`, [ids, ini, fin]);
    return r;
  }
  if (k === 'kankay') {
    const { rows: [r] } = await pool.query(`SELECT COALESCE(SUM(total), 0)::float AS total,
      to_char(LEAST($2::date, GREATEST((SELECT MAX(fecha) FROM kankay_ventas WHERE fecha BETWEEN $1 AND $2), (SELECT MAX(hasta) FROM kankay_imports))), 'YYYY-MM-DD') AS hasta
      FROM kankay_ventas WHERE fecha BETWEEN $1 AND $2`, [ini, fin]);
    return r;
  }
  if (k === 'senzen') {
    const { rows: [r] } = await pool.query(`SELECT COALESCE(SUM(total), 0)::float AS total,
      to_char(LEAST($2::date, (SELECT MAX(termino) AT TIME ZONE 'America/Argentina/Mendoza' FROM senzen_sync WHERE ok)::date), 'YYYY-MM-DD') AS hasta
      FROM senzen_facturas WHERE NOT anulada AND fecha BETWEEN $1 AND $2`, [ini, fin]);
    return r;
  }
  return { total: 0, hasta: null };
}

// { total, hasta, dia, dias, ritmo, anterior (mismo tramo del mes anterior), var_pct }
async function ventasMes(k, mes) {
  const fin = ultimoDia(mes);
  const v = await ventasRango(k, `${mes}-01`, fin);
  const dias = Number(fin.slice(8, 10));
  const hasta = v.hasta && v.hasta >= `${mes}-01` ? v.hasta : null;
  const dia = hasta ? Number(hasta.slice(8, 10)) : 0;
  const ant = sumarMeses(mes, -1);
  const finAnt = Math.min(dia, Number(ultimoDia(ant).slice(8, 10)));
  const a = dia ? await ventasRango(k, `${ant}-01`, `${ant}-${String(finAnt).padStart(2, '0')}`) : { total: 0 };
  return {
    total: v.total, hasta, dia, dias,
    ritmo: dia ? Math.round(v.total / dia * dias) : null,
    anterior: a.total, var_pct: a.total > 0 ? Math.round((v.total / a.total - 1) * 1000) / 10 : null,
  };
}

// ── Cierre del mes ───────────────────────────────────────────────────────────
async function cierre(mes) {
  const [nums, { rows: listos }, { rows: [resp] }] = await Promise.all([
    numerosDe(UNIDADES, mes),
    pool.query(`SELECT c.unidad, c.listo_at, u.nombre FROM cierres_mes c LEFT JOIN usuarios u ON u.id = c.listo_por WHERE c.mes = $1`, [mes]),
    pool.query(`SELECT u.id, u.nombre FROM parametros p JOIN usuarios u ON u.id = p.valor::int WHERE p.clave = 'cierre_responsable_id'`),
  ]);
  const listo = Object.fromEntries(listos.map(l => [l.unidad, l]));
  const unidades = UNIDADES.map(u => ({
    k: u.k, nombre: u.nombre, negocio: u.negocio, consolidado: !!u.consolidado,
    ...nums[u.k],
    listo: u.consolidado
      ? A_CERRAR.filter(x => x.negocio === 'entre_dos').every(x => listo[x.k])
      : listo[u.k] ? { por: String(listo[u.k].nombre || '').replace(/\s*\(.*\)\s*$/, ''), at: listo[u.k].listo_at } : null,
  }));
  const faltan = unidades.filter(u => !u.consolidado && !u.listo);
  return {
    mes, nombre_mes: nombreMes(mes), plazo: plazoCierre(mes), vencido: hoyStr() > plazoCierre(mes) && faltan.length > 0,
    responsable: resp ? { id: resp.id, nombre: String(resp.nombre).replace(/\s*\(.*\)\s*$/, '') } : null,
    unidades, completo: faltan.length === 0, faltan: faltan.map(u => u.nombre),
    senzen_gastos: nums.senzen.gastos,
  };
}

async function faltanCerrar(mes) {
  const { rows } = await pool.query('SELECT unidad FROM cierres_mes WHERE mes = $1', [mes]);
  const hechos = new Set(rows.map(r => r.unidad));
  return A_CERRAR.filter(u => !hechos.has(u.k));
}

module.exports = {
  UNIDADES, UNIDAD, A_CERRAR, numerosDe, ventasMes, cierre, faltanCerrar, senzenMes,
  DESDE, sumarMeses, ultimoDia, mesActual, mesPlan, mesDeSemana, mesACerrar, plazoCierre, nombreMes, esMes,
};
