// Carga en eerr_historico los estados de resultados anteriores a 2026, tal cual están en
// las planillas "Info Financiera …" de Martín. No recalcula nada: copia los números.
//
//   node backend/scripts/cargar_eerr_historico.js [carpeta]     (por defecto ~/Downloads)
//
// Planillas de tiendas: hoja "EERR" o "E.E.R.R." con 12 meses en las columnas D, F, H … Z
// (el % al lado) y hoja "Datos" con el detalle de gastos en B … M. Los meses se toman por
// posición desde el mes con que arranca el archivo; el detalle de gastos se busca por mes.
// La del Café va por rubro y tiene otra forma (ver cargarCafe).
// Se puede correr de nuevo: pisa los meses que carga.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const path = require('path');
const os   = require('os');
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const HASTA = '2026-01';   // de acá en adelante, el EERR lo arma el sistema

const TIENDAS = [
  { archivo: 'Info Financiera Amigorena Sep 23 - Ago 24.xlsx', local: 'amigorena',    desde: '2023-09' },
  { archivo: 'Info Finaciera Amigorena Sep 24-Ago 25.xlsx',    local: 'amigorena',    desde: '2024-09' },
  { archivo: 'Info Financiera Amigorena Sep 25 - Ago 26.xlsx', local: 'amigorena',    desde: '2025-09' },
  { archivo: 'Info Financiera 9 de Julio Mar 24 - Feb 25.xlsx', local: 'nuevedejulio', desde: '2024-03' },
  { archivo: 'Info Financiera 9 Julio Mar 25 - Feb 26.xlsx',   local: 'nuevedejulio', desde: '2025-03' },
  { archivo: 'Info Financiera Peatonal Ene 25 - Dic 25.xlsx',  local: 'peatonal',     desde: '2025-01' },
];
const CAFE = { archivo: 'Info Financiera Cafeteria.xlsx', local: 'cafe_peatonal', desde: '2025-07' };

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const r2  = v => Math.round(num(v) * 100) / 100;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function sumarMes(mes, i) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const col  = i => XLSX.utils.encode_col(i);
const cell = (ws, c, r) => ws[`${c}${r}`]?.v;

// Fila de cada renglón del EERR, buscada por el texto de la columna A.
function filas(ws) {
  const out = {};
  for (let r = 1; r <= 45; r++) {
    const t = norm(cell(ws, 'A', r));
    if (t && !(t in out)) out[t] = r;
  }
  return out;
}
function fila(f, ...claves) {
  for (const k of Object.keys(f)) if (claves.some(c => (c instanceof RegExp ? c.test(k) : k === c))) return f[k];
  return null;
}

// Detalle de gastos de la hoja Datos/Gastos: filas 2 a 11, un mes por columna (B a M).
// La columna se busca por el mes del encabezado, sin mirar el año: hay planillas que van de
// enero a diciembre aunque el año arranque en marzo o septiembre, y años mal tipeados.
function gastosDelMes(ws, mes) {
  const mm = Number(mes.slice(5));
  let c = null;
  for (let i = 1; i <= 12; i++) {
    const h = cell(ws, col(i), 1);
    if (typeof h === 'number' && XLSX.SSF.parse_date_code(h).m === mm) { c = col(i); break; }
  }
  if (!c) throw new Error(`no encuentro la columna de gastos de ${mes}`);
  const out = [];
  for (let r = 2; r <= 11; r++) {
    const nombre = String(cell(ws, 'A', r) || '').trim();
    const monto = r2(cell(ws, c, r));
    if (nombre && monto) out.push({ nombre, monto });
  }
  return out;
}

// El total de gastos manda (es el que usa el EERR). Si el detalle no suma igual, la diferencia
// queda como un renglón aparte para que el total siga siendo el del Excel.
function cuadrarGastos(detalle, total, avisos, etiqueta) {
  const suma = detalle.reduce((s, g) => s + g.monto, 0);
  const dif = r2(total - suma);
  if (Math.abs(dif) > 1) {
    avisos.push(`${etiqueta}: el detalle de gastos suma ${Math.round(suma)} y el EERR dice ${Math.round(total)}`);
    detalle.push({ nombre: 'Sin detalle en la planilla', monto: dif });
  }
  return detalle;
}

async function guardar(localId, mes, datos, fuente) {
  await pool.query(`
    INSERT INTO eerr_historico (local_id, mes, datos, fuente, cargado_en)
    VALUES ($1, $2, $3::jsonb, $4, NOW())
    ON CONFLICT (local_id, mes) DO UPDATE SET datos = EXCLUDED.datos, fuente = EXCLUDED.fuente, cargado_en = NOW()
  `, [localId, mes, JSON.stringify(datos), fuente]);
}

async function cargarTienda(cfg, carpeta, locales, avisos) {
  const wb = XLSX.readFile(path.join(carpeta, cfg.archivo));
  const hoja = wb.SheetNames.find(n => /^e\.?e\.?r\.?r\.?$/i.test(n.trim()));
  const ws = wb.Sheets[hoja], datosWs = wb.Sheets['Datos'];
  const f = filas(ws);
  const F = {
    vE2:  fila(f, 'ventas entre dos', 'venta entre dos'),
    cE2:  fila(f, 'costo entre dos'),
    vAl:  fila(f, 'venta alimendos', 'ventas alimendos'),
    cAl:  fila(f, 'costo alimendos'),
    mb:   fila(f, 'margen bruto'),
    gas:  fila(f, /^gastos generales/),
    ebitda: fila(f, 'ebitda'),
    amort:  fila(f, /^gastos de amortizacion/),
    ingEx:  fila(f, 'ingresos extraordinarios'),
    gasEx:  fila(f, 'gastos extraordinarios'),
    ingFi:  fila(f, 'ingresos financieros'),
    gasFi:  fila(f, 'gastos financieros'),
    ebt:    fila(f, 'ebt'),
    iibb:   fila(f, 'ingresos brutos'),
    impGen: fila(f, /^impuestos/),
    fee:    fila(f, 'fee marca'),
    res:    fila(f, 'resultado'),
  };
  for (const [k, v] of Object.entries(F)) if (!v) throw new Error(`${cfg.archivo}: no encuentro el renglón ${k}`);
  const nombreImp = String(cell(ws, 'A', F.impGen)).trim().replace('ganacias', 'ganancias');

  const cargados = [];
  for (let i = 0; i < 12; i++) {
    const mes = sumarMes(cfg.desde, i);
    if (mes >= HASTA) break;
    const c = col(3 + 2 * i), p = col(4 + 2 * i);
    const v = r => num(cell(ws, c, r));
    if (!v(F.vE2) && !v(F.vAl)) continue;   // mes sin cargar en la planilla

    const etiqueta = `${cfg.local} ${mes}`;
    const datos = {
      ventas: [
        { nombre: 'Entre Dos', monto: r2(v(F.vE2)) },
        { nombre: 'Alimendos', monto: r2(v(F.vAl)) },
      ],
      cmv: [
        { nombre: 'Entre Dos', monto: r2(v(F.cE2)), pct: r2(num(cell(ws, p, F.cE2)) * 100) },
        { nombre: 'Alimendos', monto: r2(v(F.cAl)), pct: r2(num(cell(ws, p, F.cAl)) * 100) },
      ],
      margen_bruto: r2(v(F.mb)),
      gastos: cuadrarGastos(gastosDelMes(datosWs, mes), r2(v(F.gas)), avisos, etiqueta),
      gastos_total: r2(v(F.gas)),
      ebitda: r2(v(F.ebitda)),
      otros: [
        { nombre: 'Amortizaciones y provisiones', monto: -r2(v(F.amort)) },
        { nombre: 'Ingresos extraordinarios',     monto:  r2(v(F.ingEx)) },
        { nombre: 'Gastos extraordinarios',       monto: -r2(v(F.gasEx)) },
        { nombre: 'Ingresos financieros',         monto:  r2(v(F.ingFi)) },
        { nombre: 'Gastos financieros',           monto: -r2(v(F.gasFi)) },
      ].filter(o => o.monto),
      ebt: r2(v(F.ebt)),
      impuestos: [
        { nombre: 'Ingresos brutos', monto: r2(v(F.iibb)),   pct: r2(num(cell(ws, p, F.iibb)) * 100) },
        { nombre: nombreImp,         monto: r2(v(F.impGen)), pct: r2(num(cell(ws, p, F.impGen)) * 100) },
        { nombre: 'Fee de marca',    monto: r2(v(F.fee)),    pct: r2(num(cell(ws, p, F.fee)) * 100) },
      ].filter(t => t.monto),
      resultado: r2(v(F.res)),
    };
    await guardar(locales[cfg.local], mes, datos, `${cfg.archivo} · hoja ${hoja}, columna ${c}`);
    cargados.push(mes);
  }
  console.log(`${cfg.local.padEnd(13)} ${cfg.archivo}: ${cargados.join(', ') || 'nada antes de 2026'}`);
}

async function cargarCafe(cfg, carpeta, locales, avisos) {
  const wb = XLSX.readFile(path.join(carpeta, cfg.archivo));
  const ws = wb.Sheets['E.E.R.R.'], gas = wb.Sheets['Gastos'];
  const COLS = ['F', 'I', 'L', 'P', 'T', 'X'];           // valor de cada mes; el % va a la derecha
  const pctCol = c => col(XLSX.utils.decode_col(c) + 1);
  const cargados = [];
  for (let i = 0; i < COLS.length; i++) {
    const mes = sumarMes(cfg.desde, i), c = COLS[i];
    const v = r => num(cell(ws, c, r));
    const rubros = [2, 3, 4, 5, 6, 7];
    const etiqueta = `${cfg.local} ${mes}`;
    const datos = {
      ventas: rubros.map(r => ({ nombre: String(cell(ws, 'A', r)).trim(), monto: r2(v(r)) })),
      cmv: rubros.map(r => ({
        nombre: String(cell(ws, 'A', r)).trim(), monto: r2(v(r + 7)), pct: r2(num(cell(ws, pctCol(c), r + 7)) * 100),
      })),
      margen_bruto: r2(v(16)),
      gastos: cuadrarGastos(gastosDelMes(gas, mes), r2(v(19)), avisos, etiqueta),
      gastos_total: r2(v(19)),
      ebitda: r2(v(20)),
      otros: [
        { nombre: 'Amortizaciones y provisiones', monto: -r2(v(22)) },
        { nombre: 'Ingresos extraordinarios',     monto:  r2(v(25)) },
        { nombre: 'Gastos extraordinarios',       monto: -r2(v(26)) },
        { nombre: 'Ingresos financieros',         monto:  r2(v(28)) },
        { nombre: 'Gastos financieros',           monto: -r2(v(29)) },
      ].filter(o => o.monto),
      ebt: r2(v(31)),
      impuestos: [
        { nombre: 'Ingresos brutos',     monto: r2(v(32)), pct: r2(num(cell(ws, pctCol(c), 32)) * 100) },
        { nombre: 'Impuestos generales', monto: r2(v(33)), pct: r2(num(cell(ws, pctCol(c), 33)) * 100) },
        { nombre: 'Fee de marca',        monto: r2(v(34)), pct: r2(num(cell(ws, pctCol(c), 34)) * 100) },
      ].filter(t => t.monto),
      resultado: r2(v(35)),
    };
    await guardar(locales[cfg.local], mes, datos, `${cfg.archivo} · hoja E.E.R.R., columna ${c}`);
    cargados.push(mes);
  }
  console.log(`${cfg.local.padEnd(13)} ${cfg.archivo}: ${cargados.join(', ')}`);
}

// Control: cada mes tiene que cerrar como la planilla (venta − costo = margen, etc.).
async function controlar() {
  const { rows } = await pool.query('SELECT l.codigo, h.mes, h.datos FROM eerr_historico h JOIN locales l ON l.id = h.local_id ORDER BY 1, 2');
  const sum = a => a.reduce((s, x) => s + x.monto, 0);
  const malos = [];
  for (const { codigo, mes, datos: d } of rows) {
    const checks = [
      ['margen bruto', sum(d.ventas) - sum(d.cmv), d.margen_bruto],
      ['gastos',       sum(d.gastos), d.gastos_total],
      ['EBITDA',       d.margen_bruto - d.gastos_total, d.ebitda],
      ['EBT',          d.ebitda + sum(d.otros), d.ebt],
      ['resultado',    d.ebt - sum(d.impuestos), d.resultado],
    ];
    for (const [que, calc, excel] of checks) {
      if (Math.abs(calc - excel) > 1) malos.push(`${codigo} ${mes}: ${que} da ${Math.round(calc)} y la planilla dice ${Math.round(excel)}`);
    }
  }
  return { meses: rows.length, malos };
}

async function main() {
  const carpeta = process.argv[2] || path.join(os.homedir(), 'Downloads');
  const { rows } = await pool.query('SELECT id, codigo FROM locales');
  const locales = Object.fromEntries(rows.map(r => [r.codigo, r.id]));
  const avisos = [];
  for (const cfg of TIENDAS) await cargarTienda(cfg, carpeta, locales, avisos);
  await cargarCafe(CAFE, carpeta, locales, avisos);

  const { meses, malos } = await controlar();
  console.log(`\n${meses} meses cargados.`);
  if (avisos.length) console.log('\nAvisos:\n  ' + avisos.join('\n  '));
  if (malos.length) console.log('\nNo cierra en la planilla:\n  ' + malos.join('\n  '));
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
