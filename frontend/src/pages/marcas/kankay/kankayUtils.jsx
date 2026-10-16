// Formatos y cuentas que comparten las pantallas de Kankay.

export const fmt = n => `${n < 0 ? '− ' : ''}$ ${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
export const num = n => Math.round(n).toLocaleString('es-AR');
export const pc  = (n, d = 1) => `${(n * 100).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;

export const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export const MC  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
export const DW  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export const mesN = p => MES[Number(p.slice(5)) - 1];
export const cap  = s => s.charAt(0).toUpperCase() + s.slice(1);
export const ultimoDia = p => new Date(Number(p.slice(0, 4)), Number(p.slice(5)), 0).getDate();
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "1.234.567" o "1234567,50" → número. Vacío → null (sin cargar).
export function parseMonto(txt) {
  const s = String(txt ?? '').replace(/[$\s.]/g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function Chg({ v }) {
  return <span className={`chg ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '▲' : '▼'} {pc(Math.abs(v))}</span>;
}

// El mes "en curso" es el que tiene la última venta cargada, si todavía no terminó.
export function enCurso(D) {
  const p = D.total.hasta.slice(0, 7);
  return D.hoy.slice(0, 7) === p && D.meses[p] ? p : null;
}
// Hasta qué día hay ventas en un mes en curso.
export const diaHasta = (D, p) => Number(D.meses[p].hasta.slice(8));

// Resultado de un mes con lo cargado a mano (eerr) y la comisión.
export function calcMes(D, eerr, p, comPct) {
  const M = D.meses[p], s = eerr.meses[p] || { gastos: [], iibb: null, f931: null, nc: null };
  const cargado = s.gastos.some(g => g[1] != null);
  const gT = s.gastos.reduce((a, g) => a + (g[1] || 0), 0);
  const mb = M.neto - M.cmv, imp = (s.iibb || 0) + (s.f931 || 0), com = M.neto * comPct / 100;
  const ro = cargado ? mb - gT : null, antes = cargado ? ro - imp - com : null, res = cargado ? antes + (s.nc || 0) : null;
  return { M, s, cargado, gT, mb, imp, com, ro, antes, res };
}

// Gastos fijos para el equilibrio: los del mes o, si no hay, los del último mes cargado.
export function gastosRef(D, eerr, p, comPct) {
  const c = calcMes(D, eerr, p, comPct);
  if (c.cargado) return { g: c.gT + (c.s.f931 || 0), de: null, iibb: c.s.iibb, netoRef: c.M.neto };
  const prev = Object.keys(eerr.meses).sort().reverse().find(x => x < p && D.meses[x] && calcMes(D, eerr, x, comPct).cargado);
  if (!prev) return null;
  const q = calcMes(D, eerr, prev, comPct);
  return { g: q.gT + (q.s.f931 || 0), de: prev, iibb: q.s.iibb, netoRef: q.M.neto };
}
