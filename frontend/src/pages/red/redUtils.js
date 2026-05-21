// ── Paleta por tienda (consistente en todos los gráficos) ───────────────────
export const TIENDA_COLORS = {
  'Peatonal Tienda de Alfajores':   '#4C1D95',
  '9 de Julio Tienda de Alfajores': '#7C3AED',
  'Amigorena Tienda de Alfajores':  '#A78BFA',
  'Sheraton Tienda de Alfajores':   '#C4B5FD',
  'Café Peatonal Cafetería':        '#E0D4FA',
};

export const TIENDA_FALLBACK = ['#4C1D95','#7C3AED','#A78BFA','#C4B5FD','#E0D4FA'];

export function colorDeTienda(nombre, idx = 0) {
  return TIENDA_COLORS[nombre] ?? TIENDA_FALLBACK[idx % TIENDA_FALLBACK.length];
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
