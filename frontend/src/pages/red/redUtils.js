// ── Paleta por tienda (consistente en todos los gráficos) ───────────────────
// Tomada del tablero "Entre Dos" que eligió Martín: azul, verde, ámbar, azul
// claro y marrón. Tres de los cinco quedaron tal cual la foto; el gris azulado
// de Sheraton y el marrón del Café tuvieron que moverse un poco — el gris casi
// no tenía color (croma 0,04) y se leía gris, y el marrón caía por debajo de la
// banda de luminosidad. Con ese ajuste la paleta pasa los cuatro chequeos.
//
// El ORDEN es fijo y no por ranking: los pares validados son los que quedan
// pegados en el apilado, y así los dos azules nunca se tocan.
export const TIENDA_ORDEN = [
  'Peatonal Tienda de Alfajores',
  '9 de Julio Tienda de Alfajores',
  'Amigorena Tienda de Alfajores',
  'Sheraton Tienda de Alfajores',
  'Café Peatonal Cafetería',
];

export const TIENDA_COLORS = {
  'Peatonal Tienda de Alfajores':   '#2b5991', // azul marino mate
  '9 de Julio Tienda de Alfajores': '#00633a', // verde racing mate
  'Amigorena Tienda de Alfajores':  '#b06f2d', // bronce satinado
  'Sheraton Tienda de Alfajores':   '#0581a3', // azul petróleo mate
  'Café Peatonal Cafetería':        '#833f1d', // cobre mate
};

// Slots libres para una tienda que todavía no esté en el mapa.
export const TIENDA_FALLBACK = ['#7a4f9c', '#9c2f2f', '#4f6b1f'];

export function colorDeTienda(nombre, idx = 0) {
  return TIENDA_COLORS[nombre] ?? TIENDA_FALLBACK[idx % TIENDA_FALLBACK.length];
}

/**
 * Ordena nombres de tienda según el orden canónico de la paleta.
 * Los gráficos apilados y la dona deben usarlo siempre: el color identifica a
 * la tienda, nunca a su puesto en el ranking, y así los pares que quedan
 * adyacentes son los que se validaron.
 */
export function ordenarTiendas(nombres) {
  const pos = n => {
    const i = TIENDA_ORDEN.indexOf(n);
    return i === -1 ? TIENDA_ORDEN.length : i;
  };
  return [...nombres].sort((a, b) => pos(a) - pos(b) || String(a).localeCompare(b));
}

// Nombre corto para labels de gráficos
export const TIENDA_SHORT = {
  'Peatonal Tienda de Alfajores':   'Peatonal',
  '9 de Julio Tienda de Alfajores': '9 de Julio',
  'Amigorena Tienda de Alfajores':  'Amigorena',
  'Sheraton Tienda de Alfajores':   'Sheraton',
  'Café Peatonal Cafetería':        'Café',
};

export function shortName(nombre) {
  return TIENDA_SHORT[nombre] ?? (nombre || '').split(' ')[0];
}

// ── Formatters ───────────────────────────────────────────────────────────────

/** $1.2M / $450k / $3.200 */
export function fmtM(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000)
    return `$${(n / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1_000)
    return `$${(n / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k`;
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

/** Pesos con símbolo completo es-AR */
export function fmtARS(v) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(v) || 0);
}

/** Número entero con separador de miles */
export function fmtNum(v) {
  return (Number(v) || 0).toLocaleString('es-AR');
}

/** Docenas con 2 decimales */
export function fmtDoc(v) {
  return (Number(v) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Porcentaje con 1 decimal */
export function fmtPct(v) {
  return `${(Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

// ── Período default: año actual ───────────────────────────────────────────────
export function yearRange() {
  const y = new Date().getFullYear();
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

// ── Períodos para el filtro del comparativo ──────────────────────────────────

function iso(d) { return d.toISOString().slice(0, 10); }

/** Corre una fecha ISO N meses o años hacia atrás, sin que el timezone la mueva. */
export function correrFecha(isoStr, unidad, cantidad) {
  const d = new Date(`${isoStr}T12:00:00Z`);
  if (unidad === 'month') d.setUTCMonth(d.getUTCMonth() - cantidad);
  else                    d.setUTCFullYear(d.getUTCFullYear() - cantidad);
  return iso(d);
}

/** Rangos rápidos para el selector de período. */
export function rangosRapidos() {
  const hoy = new Date();
  const y = hoy.getUTCFullYear(), m = hoy.getUTCMonth();
  const finMesAnt = new Date(Date.UTC(y, m, 0));
  return [
    { id: 'mes_actual',  label: 'Mes en curso',  desde: iso(new Date(Date.UTC(y, m, 1))),       hasta: iso(hoy) },
    { id: 'mes_pasado',  label: 'Mes pasado',    desde: iso(new Date(Date.UTC(y, m - 1, 1))),   hasta: iso(finMesAnt) },
    { id: 'ult_30',      label: 'Últimos 30 días', desde: iso(new Date(Date.UTC(y, m, hoy.getUTCDate() - 29))), hasta: iso(hoy) },
    { id: 'anio',        label: 'Año completo',  desde: `${y}-01-01`,                            hasta: iso(hoy) },
  ];
}

/** "2026-09-01" → "1 sep 2026" */
const MES_AB = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function fmtFechaCorta(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  return `${parseInt(d, 10)} ${MES_AB[parseInt(m, 10) - 1]} ${y}`;
}

/** "1 sep – 2 sep 2026", colapsando lo que se repite */
export function fmtRango(desde, hasta) {
  if (!desde || !hasta) return '—';
  const [ya, ma, da] = desde.split('-');
  const [yb, mb, db] = hasta.split('-');
  if (desde === hasta) return fmtFechaCorta(desde);
  if (ya === yb && ma === mb) return `${parseInt(da, 10)}–${parseInt(db, 10)} ${MES_AB[parseInt(ma, 10) - 1]} ${ya}`;
  if (ya === yb) return `${parseInt(da, 10)} ${MES_AB[parseInt(ma, 10) - 1]} – ${parseInt(db, 10)} ${MES_AB[parseInt(mb, 10) - 1]} ${ya}`;
  return `${fmtFechaCorta(desde)} – ${fmtFechaCorta(hasta)}`;
}
