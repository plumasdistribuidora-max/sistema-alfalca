import { useEffect, useState } from 'react';
import api from '../../api';
import { colorDeTienda } from '../red/redUtils';

// Montos exactos, sin abreviar: $ 412.300.
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const pesos = v => `$ ${money.format(Math.round(Number(v) || 0))}`;

export const ddmm = f => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const diaCorto = f => `${DIA[new Date(`${f}T12:00:00`).getDay()]} ${ddmm(f)}`;
export const diaLargo = f => `${DIA_LARGO[new Date(`${f}T12:00:00`).getDay()]} ${ddmm(f)}`;

export function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function cuando(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${DIA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "3 días 4 h", "5 h", "20 min".
export function duracion(ms) {
  if (ms == null) return '—';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24), r = h % 24;
  return `${d} día${d === 1 ? '' : 's'}${r ? ` ${r} h` : ''}`;
}

export function PuntoLocal({ nombre }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDeTienda(nombre) }} />;
}

// El tipo de problema. El color va por familia, y la palabra lo dice sin depender del color.
const COLOR_TIPO = {
  no_cargo: 'bg-red-100 text-red-700',
  ventas: 'bg-amber-100 text-amber-800',
  cafe: 'bg-amber-100 text-amber-800',
  vencimiento: 'bg-amber-100 text-amber-800',
  mantenimiento: 'bg-sky-100 text-sky-800',
  faltante: 'bg-sky-100 text-sky-800',
  ausencia: 'bg-red-100 text-red-700',
  queja: 'bg-stone-200 text-stone-700',
};
export function ChipTipo({ tipo, label }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${COLOR_TIPO[tipo] || 'bg-stone-100 text-stone-600'}`}>
      {label}
    </span>
  );
}

export function Chip({ tono = 'gris', children }) {
  const t = {
    rojo: 'bg-red-100 text-red-700', ambar: 'bg-amber-100 text-amber-800',
    verde: 'bg-green-100 text-green-700', azul: 'bg-sky-100 text-sky-800', gris: 'bg-stone-100 text-stone-600',
  }[tono];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${t}`}>{children}</span>;
}

// En qué está la tarea, dicho como lo leería el que la mira.
export function EstadoTarea({ t }) {
  if (t.estado === 'terminada') return <Chip tono="verde">{t.causa_id && !t.terminada_por ? 'Aprobada sola' : 'Terminada'}</Chip>;
  if (t.estado === 'por_aprobar') return <Chip tono="ambar">{t.cierre_tipo === 'descarte' ? 'Descarte por aprobar' : 'Por aprobar'}</Chip>;
  if (t.estado === 'nueva') return <Chip tono="rojo">Sin tomar</Chip>;
  if (t.dias_vencida > 0) return <Chip tono="rojo">Vencida hace {t.dias_vencida} día{t.dias_vencida === 1 ? '' : 's'}</Chip>;
  if (t.plazo === hoyStr()) return <Chip tono="ambar">Vence hoy</Chip>;
  return <Chip tono="verde">Para el {diaCorto(t.plazo)}</Chip>;
}

let opcionesCache = null;
export function useOpciones() {
  const [o, setO] = useState(opcionesCache);
  useEffect(() => {
    if (opcionesCache) return;
    api.get('/tareas/opciones').then(r => { opcionesCache = r.data.data; setO(opcionesCache); }).catch(() => {});
  }, []);
  return o;
}

// Una foto o un PDF de una tarea. Las fotos se ven chicas y se agrandan al tocarlas.
export function Adjunto({ a }) {
  const [url, setUrl] = useState(null);
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    let vivo = true, creada = null;
    api.get(`/tareas/adjuntos/${a.id}`, { responseType: 'blob' })
      .then(r => { if (!vivo) return; creada = URL.createObjectURL(r.data); setUrl(creada); })
      .catch(() => {});
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [a.id]);
  const etiqueta = { presupuesto: 'Presupuesto', comprobante: 'Comprobante', foto: 'Foto' }[a.rol] || 'Archivo';
  if (a.mime === 'application/pdf') {
    return (
      <a href={url || '#'} target="_blank" rel="noopener noreferrer"
         className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-ahg-accent/50 hover:bg-ahg-bg">
        📄 {etiqueta} (PDF)
      </a>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setGrande(true)} className="relative w-20 h-16 rounded-lg overflow-hidden bg-ahg-accent/20 border border-ahg-accent/40">
        {url && <img src={url} alt={etiqueta} className="w-full h-full object-cover" />}
        <span className="absolute bottom-0 inset-x-0 text-[9px] text-white bg-black/50 text-center">{etiqueta}</span>
      </button>
      {grande && url && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setGrande(false)}>
          <img src={url} alt={etiqueta} className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </>
  );
}

export function Cargando() {
  return <p className="text-sm text-ahg-text/50 py-6">Cargando…</p>;
}

export function MensajeError({ texto }) {
  return texto ? <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{texto}</div> : null;
}

export function Titulo({ eyebrow, children, derecha }) {
  return (
    <div className="rounded-2xl px-5 py-4 flex items-end justify-between gap-3 flex-wrap" style={{ background: '#45484c' }}>
      <div>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>{eyebrow}</p>
        <h1 className="text-xl font-bold text-white mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{children}</h1>
      </div>
      {derecha}
    </div>
  );
}

export function Seccion({ titulo, sub, children, derecha }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</h2>
          {sub && <p className="text-xs text-ahg-text/55 mt-0.5">{sub}</p>}
        </div>
        {derecha}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
