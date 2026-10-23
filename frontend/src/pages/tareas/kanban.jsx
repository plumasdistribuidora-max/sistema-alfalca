import { useState } from 'react';

// Las piezas que comparten el tablero del encargado y el de los dueños (23/10/2026):
// íconos, la columna que recibe tarjetas arrastradas, las vistas rápidas y los botones
// de la barra. Las tarjetas son de cada tablero porque muestran cosas distintas.

const svg = (d, w = 14) => (
  <svg width={w} height={w} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">{d}</svg>
);
export const IcoCal = () => svg(<><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>, 13);
export const IcoFlag = () => svg(<path d="M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8" />, 13);
export const IcoCom = () => svg(<path d="M2.5 3h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />, 13);
export const IcoClip = () => svg(<path d="M10.5 4.5 5.3 9.7a1.3 1.3 0 0 0 1.8 1.8l5.6-5.6a2.6 2.6 0 0 0-3.7-3.7L3.4 7.8a3.9 3.9 0 0 0 5.5 5.5l4.6-4.6" />, 13);
export const IcoMas = () => svg(<path d="M8 3v10M3 8h10" />);
export const IcoFiltro = () => svg(<path d="M2.5 4h11M4.5 8h7M6.5 12h3" />);
export const IcoArch = () => svg(<><rect x="2" y="3" width="12" height="3.5" rx="1" /><path d="M3 6.5V12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12V6.5M6.5 9h3" /></>);

export const AZUL = '#2d68b0';

export const COLUMNAS = [
  { estado: 'nueva',       nombre: 'Sin empezar',      color: '#8d9095' },
  { estado: 'en_curso',    nombre: 'En proceso',       color: '#c48a1c' },
  { estado: 'por_aprobar', nombre: 'Esperando cierre', color: AZUL },
];

// Las horas vienen en UTC: el día se cuenta en la hora del teléfono, que es la de Mendoza.
export const fechaLocal = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function lunesDe(ts) {
  const d = new Date(ts); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return fechaLocal(d);
}

export function Vistas({ vistas, actual, onCambio }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 bg-ahg-accent/35 rounded-[10px] p-[3px]" role="group" aria-label="Qué tareas ver">
      {vistas.map(v => {
        const on = actual === v.id;
        return (
          <button key={v.id} onClick={() => onCambio(v.id)} aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${on ? 'bg-white text-ahg-text shadow-sm' : 'text-ahg-text/60 hover:text-ahg-text'}`}>
            {v.nombre}
            <span className={`text-[11.5px] tabular-nums ${v.id === 'sinleer' && v.n ? 'text-white rounded-full px-1.5' : 'opacity-70'}`}
                  style={v.id === 'sinleer' && v.n ? { background: AZUL } : undefined}>{v.n}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BotonBarra({ icono, children, on, ...rest }) {
  return (
    <button {...rest} className={`inline-flex items-center gap-1.5 bg-white border rounded-lg px-3 py-1.5 text-[13px] font-medium ${on ? 'border-ahg-text' : 'border-ahg-accent/60 hover:border-ahg-accent'}`}>
      {icono}{children}
    </button>
  );
}

// Una columna. Soltar una tarjeta de otra columna llama a onSoltar(id): el tablero abre la
// tarea, porque cada paso pide escribir algo.
export function Columna({ col, n, onAgregar, agregarTexto, onSoltar, vacia = true, children }) {
  const [sobre, setSobre] = useState(false);
  return (
    <section aria-label={col.nombre}
             onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
             onDrop={e => { e.preventDefault(); setSobre(false); const [id, de] = e.dataTransfer.getData('text/plain').split('|'); if (id && de !== col.estado) onSoltar?.(id); }}
             className="snap-start rounded-xl border p-2.5 flex flex-col gap-2 min-h-[140px] transition-colors"
             style={{ background: sobre ? `${col.color}12` : 'rgba(225,223,218,0.45)', borderColor: sobre ? col.color : 'rgba(195,194,189,0.55)' }}>
      <div className="flex items-center gap-2 px-1 pt-1 pb-1.5" title={col.regla}>
        <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
        <h2 className="text-[13px] font-semibold">{col.nombre}</h2>
        <span className="text-xs text-ahg-text/50 tabular-nums">{n}</span>
        {onAgregar && (
          <button onClick={onAgregar} title={agregarTexto} aria-label={agregarTexto}
                  className="ml-auto w-6 h-6 rounded-md grid place-items-center text-ahg-text/55 hover:bg-white hover:text-ahg-text"><IcoMas /></button>
        )}
      </div>
      {children}
      {n === 0 && vacia && <p className="text-[12.5px] text-ahg-text/45 border border-dashed border-ahg-accent/60 rounded-[10px] py-4 px-3 text-center">No hay tareas acá</p>}
    </section>
  );
}

// Tres columnas una al lado de la otra; en el celular cada una ocupa casi toda la pantalla
// y se asoma la siguiente.
export function Tablero({ children }) {
  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory md:snap-none">
      <div className="grid grid-flow-col auto-cols-[86%] gap-3 md:grid-flow-row md:auto-cols-auto md:grid-cols-3 md:gap-4 md:min-w-[880px] max-w-[1240px] items-start">
        {children}
      </div>
    </div>
  );
}

// La tarjeta por fuera: blanca, borde fino y, si hay algo sin leer, borde y punto azul.
export function marcoTarjeta(sinLeer) {
  return `group relative block w-full text-left bg-white rounded-[10px] border px-3 pt-2.5 pb-2.5 space-y-2 transition-all hover:-translate-y-px hover:shadow-md
    ${sinLeer ? 'border-[#2d68b0]/55 shadow-[0_0_0_3px_rgba(45,104,176,0.14)]' : 'border-ahg-accent/40 shadow-[0_1px_1px_rgba(31,32,34,0.04)] hover:border-ahg-accent/70'}`;
}

export function SinLeer({ t, conBorde = true }) {
  const n = t.sin_leer?.total || 0, c = t.sin_leer?.comentarios || 0;
  if (!n) return null;
  return (
    <p className={`text-xs font-medium ${conBorde ? 'border-t border-ahg-accent/30 pt-2' : ''}`} style={{ color: AZUL }}>
      {c ? `${c} comentario${c === 1 ? '' : 's'} sin leer` : 'Hay un cambio sin ver'}
    </p>
  );
}

export function PuntoSinLeer({ t }) {
  return t.sin_leer?.total > 0 ? <span className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: AZUL }} aria-hidden="true" /> : null;
}

// Un modal centrado; en el celular arranca arriba y scrollea.
export function Modal({ onCerrar, ancho = 'max-w-lg', children }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} className={`bg-white rounded-2xl w-full ${ancho} my-6 shadow-xl`}>{children}</div>
    </div>
  );
}
