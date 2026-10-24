// Lo que comparten las pantallas de la sección Dueños (23/10/2026).
import { Link } from 'react-router-dom';

export const NEG_COLOR = { entre_dos: '#a0782f', kankay: '#2e3033', senzen: '#55805e', general: '#7a5878' };
export const SEM = {
  verde:    { txt: 'Verde',    color: '#3f8f63', cls: 'bg-green-100 text-green-800' },
  amarillo: { txt: 'Amarillo', color: '#c08a12', cls: 'bg-amber-100 text-amber-800' },
  rojo:     { txt: 'Rojo',     color: '#c4473b', cls: 'bg-red-100 text-red-700' },
};

const dec = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct = v => (v == null ? '—' : `${dec.format(v)} %`);
export const puntos = v => (v == null ? '' : `${v > 0 ? '+' : ''}${dec.format(v)}`);
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const pesos = v => `$ ${money.format(Math.round(Number(v) || 0))}`;
export const mesLargo = m => { if (!m) return ''; const t = new Date(`${m}-01T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
export const sumarMes = (m, n) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function PuntoSemaforo({ s, size = 12 }) {
  return <span aria-label={s ? SEM[s].txt : 'Sin dato'} title={s ? SEM[s].txt : 'Sin dato'} className="inline-block rounded-full flex-shrink-0"
               style={{ width: size, height: size, background: s ? SEM[s].color : 'transparent', border: s ? 'none' : '1.5px dashed #9ca3af' }} />;
}

// ← octubre 2026 →
export function MesNav({ mes, onCambio }) {
  const b = 'w-8 h-8 grid place-items-center rounded-lg border border-ahg-accent/60 bg-white hover:bg-ahg-bg text-ahg-text/70';
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={b} aria-label="Mes anterior" onClick={() => onCambio(sumarMes(mes, -1))}>‹</button>
      <span className="text-sm font-semibold min-w-[130px] text-center">{mesLargo(mes)}</span>
      <button type="button" className={b} aria-label="Mes siguiente" onClick={() => onCambio(sumarMes(mes, 1))}>›</button>
    </div>
  );
}

// Barra del real contra el objetivo. La escala va de 0 a un poco más que el mayor.
export function Barra({ real, objetivo, color }) {
  const tope = Math.max(5, (Math.max(real ?? 0, objetivo ?? 0)) * 1.25);
  const w = v => `${Math.max(0, Math.min(100, (v / tope) * 100))}%`;
  return (
    <div className="relative h-2.5 rounded-full bg-ahg-accent/40" aria-hidden="true">
      {real != null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(real), background: color }} />}
      {objetivo != null && <div className="absolute -top-1 -bottom-1 w-[2px] bg-ahg-text" style={{ left: w(objetivo) }} />}
    </div>
  );
}

export function Aviso({ tono = 'rojo', children, a, texto }) {
  const cls = tono === 'rojo' ? 'border-red-200 bg-red-50 text-red-800' : tono === 'ambar' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-900';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm flex flex-wrap gap-x-3 gap-y-1 items-center justify-between ${cls}`}>
      <span>{children}</span>
      {a && <Link to={a} className="font-semibold underline">{texto}</Link>}
    </div>
  );
}
