import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import AvisosBoton from '../../components/AvisosBoton';
import { colorDeTienda } from '../red/redUtils';
import { pesos, ddmm, hoyStr, useOpciones, Cargando, MensajeError, Titulo } from './comunes';

// El tablero de tareas del encargado (23/10/2026): reemplaza a la lista. Tres columnas;
// lo que cierra un dueño sale del tablero y queda en el registro. La tarjeta muestra lo
// justo y al tocarla se abre la tarea, donde se hace todo.
const COLUMNAS = [
  { estado: 'nueva',       nombre: 'Sin empezar',      regla: 'Nadie la tomó todavía.',                                       color: '#8d9095' },
  { estado: 'en_curso',    nombre: 'En proceso',       regla: 'El encargado la tomó y dijo para cuándo.',                     color: '#c48a1c' },
  { estado: 'por_aprobar', nombre: 'Esperando cierre', regla: 'El encargado dice que terminó. Falta que un dueño la cierre.', color: '#2d68b0' },
];

const devuelta = t => t.estado === 'en_curso' && ['pidio_mas', 'rechazada'].includes(t.ultimo?.tipo);
const vencida = t => t.dias_vencida > 0;
const venceHoy = t => t.estado !== 'por_aprobar' && t.plazo === hoyStr();
// Lo cargado por un dueño lo cierra ese dueño; lo que salió de un reporte, cualquiera.
const puedeCerrar = (t, user) => t.tipo !== 'encargo' || !t.cargada_por_id || t.cargada_por_id === user.id;

// Lo que más apura arriba: vencidas y devueltas, después por fecha.
const orden = (a, b) => (Number(!(vencida(b) || devuelta(b))) - Number(!(vencida(a) || devuelta(a))))
  || (a.plazo || a.fecha).localeCompare(b.plazo || b.fecha) || a.id - b.id;

const svg = (d, w = 14) => (
  <svg width={w} height={w} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">{d}</svg>
);
const IcoCal = () => svg(<><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>, 13);
const IcoFlag = () => svg(<path d="M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8" />, 13);
const IcoCom = () => svg(<path d="M2.5 3h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />, 13);
const IcoClip = () => svg(<path d="M10.5 4.5 5.3 9.7a1.3 1.3 0 0 0 1.8 1.8l5.6-5.6a2.6 2.6 0 0 0-3.7-3.7L3.4 7.8a3.9 3.9 0 0 0 5.5 5.5l4.6-4.6" />, 13);
const IcoMas = () => svg(<path d="M8 3v10M3 8h10" />);
const IcoFiltro = () => svg(<path d="M2.5 4h11M4.5 8h7M6.5 12h3" />);
const IcoArch = () => svg(<><rect x="2" y="3" width="12" height="3.5" rx="1" /><path d="M3 6.5V12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12V6.5M6.5 9h3" /></>);

function Tarjeta({ t, dueno }) {
  const nuevos = t.sin_leer?.total || 0;
  const coms = t.sin_leer?.comentarios || 0;
  const fecha = vencida(t) ? { txt: `Venció ${ddmm(t.plazo)}`, cls: 'text-red-700 font-semibold' }
    : venceHoy(t) ? { txt: 'Vence hoy', cls: 'text-amber-700 font-semibold' }
    : t.plazo ? { txt: ddmm(t.plazo), cls: '' }
    : { txt: `Del ${ddmm(t.fecha)}`, cls: '' };
  return (
    <Link to={`/tareas/${t.id}`} draggable
          onDragStart={e => e.dataTransfer.setData('text/plain', `${t.id}|${t.estado}`)}
          className={`group relative block bg-white rounded-[10px] border px-3 pt-2.5 pb-2.5 space-y-2 transition-all hover:-translate-y-px hover:shadow-md
            ${nuevos ? 'border-[#2d68b0]/55 shadow-[0_0_0_3px_rgba(45,104,176,0.14)]' : 'border-ahg-accent/40 shadow-[0_1px_1px_rgba(31,32,34,0.04)] hover:border-ahg-accent/70'}`}>
      {nuevos > 0 && <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#2d68b0]" aria-hidden="true" />}
      <p className="flex items-center gap-1.5 text-[11.5px] text-ahg-text/55 pr-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-ahg-text font-medium">
          <span className="w-[7px] h-[7px] rounded-sm" style={{ background: t.local_nombre ? colorDeTienda(t.local_nombre) : '#9aa08a' }} />
          {t.local_corto || 'Todo el grupo'}
        </span>
        <span className="opacity-50">·</span>{t.area_label}
      </p>
      <p className="text-[13.5px] leading-snug font-medium text-ahg-text">{t.titulo}</p>
      <div className="flex items-center gap-3 text-xs text-ahg-text/55 flex-wrap">
        <span className={`inline-flex items-center gap-1 tabular-nums ${fecha.cls}`} title={t.plazo ? 'Fecha límite' : 'Día del problema'}><IcoCal />{fecha.txt}</span>
        {t.prioridad === 'alta' && <span className="inline-flex items-center gap-1 text-red-700 font-medium" title="Prioridad alta"><IcoFlag />Alta</span>}
        {t.mensajes > 0 && <span className="inline-flex items-center gap-1" title="Mensajes"><IcoCom />{t.mensajes}</span>}
        {t.cargada_por_nombre && <span className="ml-auto truncate" title="La cargó">{t.cargada_por_nombre}</span>}
      </div>
      {t.pedido_foto && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border-t border-ahg-accent/30 pt-2">
          <IcoClip />{dueno ? `Falta la foto o PDF que pidió ${t.pedido_foto.quien}` : `${t.pedido_foto.quien} te pidió una foto o PDF`}
        </p>
      )}
      {devuelta(t) && !t.pedido_foto && (
        <p className="text-xs font-medium text-amber-700 border-t border-ahg-accent/30 pt-2">
          {t.ultimo.usuario} {t.ultimo.tipo === 'pidio_mas' ? 'pidió algo más' : 'no la aprobó'}
        </p>
      )}
      {nuevos > 0 && (
        <p className={`text-xs font-medium text-[#2d68b0] ${t.pedido_foto || devuelta(t) ? '' : 'border-t border-ahg-accent/30 pt-2'}`}>
          {coms ? `${coms} comentario${coms === 1 ? '' : 's'} sin leer` : 'Hay un cambio sin ver'}
        </p>
      )}
    </Link>
  );
}

// Un dueño le carga algo al encargado. Le llega el aviso y sigue el camino de siempre.
function NuevaTarea({ areas, onCerrar }) {
  const navigate = useNavigate();
  const [locales, setLocales] = useState([]);
  const [f, setF] = useState({ titulo: '', texto: '', local: '', para: '', area: 'operacion', prioridad: 'media' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo))).catch(() => {});
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      const r = await api.post('/tareas/nueva', {
        titulo: f.titulo, texto: f.texto, local_id: f.local || null, para_cuando: f.para || null, area: f.area, prioridad: f.prioridad,
      });
      navigate(`/tareas/${r.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la tarea');
      setGuardando(false);
    }
  }

  const etiq = 'text-xs text-ahg-text/60 grid gap-1';
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onCerrar}>
      <form onSubmit={guardar} onClick={e => e.stopPropagation()} className="card p-5 grid gap-3 w-full max-w-lg my-6">
        <p className="font-semibold">Nueva tarea para el encargado</p>
        <label className={etiq}>¿Qué hay que hacer?
          <input id="nt-titulo" className="input" maxLength={200} value={f.titulo} onChange={campo('titulo')} placeholder="Ej.: cambiar el cartel de la vidriera" autoFocus />
        </label>
        <label className={etiq}>Más detalle (opcional)
          <textarea id="nt-texto" className="input" rows={3} maxLength={1000} value={f.texto} onChange={campo('texto')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={etiq}>Local
            <select id="nt-local" className="input" value={f.local} onChange={campo('local')}>
              <option value="">Todo el grupo / ninguno en particular</option>
              {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </label>
          <label className={etiq}>Área
            <select id="nt-area" className="input" value={f.area} onChange={campo('area')}>
              {Object.entries(areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={etiq}>Para cuándo (opcional)
            <input id="nt-para" type="date" className="input" min={hoyStr()} value={f.para} onChange={campo('para')} />
          </label>
          <label className={etiq}>Prioridad
            <select id="nt-prioridad" className="input" value={f.prioridad} onChange={campo('prioridad')}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={guardando || f.titulo.trim().length < 3}>{guardando ? 'Guardando…' : 'Cargar la tarea'}</button>
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
        <p className="text-xs text-ahg-text/50">Al encargado le llega el aviso en el celular. Él la toma y la resuelve. La cerrás vos, porque la cargaste vos.</p>
      </form>
    </div>
  );
}

// Lo cerrado, por semana. Se abre desde el botón del tablero. Las horas vienen en UTC:
// el día se cuenta en la hora del teléfono, que es la de Mendoza.
const fechaLocal = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function lunesDe(ts) {
  const d = new Date(ts); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return fechaLocal(d);
}
function Registro({ onCerrar }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [local, setLocal] = useState('');
  const [quien, setQuien] = useState('');
  useEffect(() => {
    api.get('/tareas/registro').then(r => setLista(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudo cargar el registro'));
  }, []);
  const locales = useMemo(() => [...new Set((lista || []).map(t => t.local_corto || 'Todo el grupo'))].sort(), [lista]);
  const quienes = useMemo(() => [...new Set((lista || []).map(t => t.terminada_por_nombre || 'Se aprobó sola'))].sort(), [lista]);
  const filtradas = (lista || []).filter(t => (!q || t.titulo.toLowerCase().includes(q.toLowerCase()))
    && (!local || (t.local_corto || 'Todo el grupo') === local) && (!quien || (t.terminada_por_nombre || 'Se aprobó sola') === quien));
  let semana = '';
  const sel = 'border border-ahg-accent/50 rounded-lg px-2 py-1.5 text-sm bg-white';
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start sm:items-center justify-center p-3" onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-3xl max-h-[calc(100vh-24px)] flex flex-col shadow-xl">
        <div className="px-5 pt-4 pb-3 border-b border-ahg-accent/30 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Registro de tareas cerradas</h2>
            <p className="text-xs text-ahg-text/55 mt-0.5">Todo lo que se cerró desde que arrancaron las tareas, de lo más nuevo a lo más viejo.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-ahg-bg hover:bg-ahg-accent/40 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-3 flex flex-wrap gap-2 items-center">
          <input id="reg-q" type="search" className="input !w-auto flex-1 min-w-[200px] !py-1.5" placeholder="Buscar por título" value={q} onChange={e => setQ(e.target.value)} />
          <select id="reg-local" aria-label="Local" className={sel} value={local} onChange={e => setLocal(e.target.value)}>
            <option value="">Todos los locales</option>{locales.map(l => <option key={l}>{l}</option>)}
          </select>
          <select id="reg-quien" aria-label="Quién la cerró" className={sel} value={quien} onChange={e => setQuien(e.target.value)}>
            <option value="">Cerró cualquiera</option>{quienes.map(l => <option key={l}>{l}</option>)}
          </select>
          <span className="text-xs text-ahg-text/50">{filtradas.length} tareas</span>
        </div>
        <div className="overflow-y-auto px-5 pb-5">
          {error && <MensajeError texto={error} />}
          {!lista && !error && <Cargando />}
          {lista && filtradas.length === 0 && <p className="text-sm text-ahg-text/50 py-6 text-center">No hay tareas cerradas con esos filtros.</p>}
          {filtradas.map(t => {
            const l = lunesDe(t.terminada_at || t.created_at);
            const cabeza = l !== semana ? (semana = l, <p className="text-[11px] uppercase tracking-wider font-semibold text-ahg-text/45 pt-4 pb-1">Semana del {ddmm(l)}</p>) : null;
            const dias = Math.max(0, Math.round((new Date(t.terminada_at) - new Date(t.created_at)) / 86400000));
            return (
              <div key={t.id}>
                {cabeza}
                <Link to={`/tareas/${t.id}`} className="grid grid-cols-[52px_1fr_auto] gap-3 items-baseline py-2.5 border-b border-ahg-accent/25 hover:bg-ahg-bg/60 -mx-2 px-2 rounded">
                  <span className="text-xs text-ahg-text/50 tabular-nums">{ddmm(fechaLocal(t.terminada_at || t.created_at))}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.titulo}</span>
                    <span className="block text-xs text-ahg-text/55">{t.local_corto || 'Todo el grupo'} · {t.area_label} · {t.sola ? 'se aprobó sola' : `cerró ${t.terminada_por_nombre}`} · {dias === 0 ? 'en el día' : `tardó ${dias} día${dias === 1 ? '' : 's'}`}</span>
                  </span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${t.cierre_tipo === 'descarte' ? 'bg-stone-100 text-stone-600' : 'bg-green-100 text-green-700'}`}>
                    {t.cierre_tipo === 'descarte' ? 'Descartada' : 'Resuelta'}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const FILTRO_VACIO = { local: '', area: '', origen: '', cargo: '', venc: false };

export default function TableroGordo() {
  const { user } = useAuth();
  const dueno = esDueno(user);
  const navigate = useNavigate();
  const opciones = useOpciones();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('todas');
  const [verFiltros, setVerFiltros] = useState(false);
  const [f, setF] = useState(FILTRO_VACIO);
  const [nueva, setNueva] = useState(false);
  const [registro, setRegistro] = useState(false);
  const [sobre, setSobre] = useState(null);

  useEffect(() => {
    api.get('/tareas').then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar las tareas'));
  }, []);

  if (error) return <MensajeError texto={error} />;
  if (!d || !opciones) return <Cargando />;

  const abiertas = d.tareas.filter(t => t.estado !== 'terminada');
  // Vistas rápidas: lo que cada uno tiene que mirar primero.
  const vistas = [
    { id: 'todas', nombre: 'Todas', f: () => true },
    ...(dueno ? [
      { id: 'cargue', nombre: 'Las que cargué yo', f: t => t.cargada_por_id === user.id },
      { id: 'cerrar', nombre: 'Para cerrar', f: t => t.estado === 'por_aprobar' && puedeCerrar(t, user) },
    ] : [
      { id: 'piden', nombre: 'Me piden algo', f: t => !!t.pedido_foto || devuelta(t) },
    ]),
    { id: 'sinleer', nombre: 'Sin leer', f: t => t.sin_leer?.total > 0 },
  ].map(v => ({ ...v, n: abiertas.filter(v.f).length }));
  const v0 = vistas.find(v => v.id === vista) || vistas[0];

  const localesDe = [...new Map(abiertas.filter(t => t.local_id).map(t => [t.local_id, t.local_corto])).entries()];
  const cargaron = [...new Set(abiertas.map(t => t.cargada_por_nombre).filter(Boolean))].sort();
  const activos = Object.values(f).filter(Boolean).length;
  const lista = abiertas.filter(t => v0.f(t)
    && (!f.local || String(t.local_id ?? 'grupo') === f.local)
    && (!f.area || t.area === f.area)
    && (!f.origen || (f.origen === 'dueno' ? t.tipo === 'encargo' : t.tipo !== 'encargo'))
    && (!f.cargo || t.cargada_por_nombre === f.cargo)
    && (!f.venc || vencida(t) || venceHoy(t)));
  const gastos = dueno ? d.gastos_pendientes : [];
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const sel = `border rounded-lg px-2 py-1.5 text-sm bg-white`;
  const segBtn = on => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${on ? 'bg-white text-ahg-text shadow-sm' : 'text-ahg-text/60 hover:text-ahg-text'}`;

  return (
    <div className="space-y-4">
      <Titulo eyebrow="Entre Dos" derecha={<Link to="/dia" className="text-sm text-white/80 hover:text-white underline">Reporte del día →</Link>}>
        Tareas
      </Titulo>

      <AvisosBoton />

      {gastos.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50 max-w-3xl">
          <p className="text-sm font-semibold text-amber-800">{gastos.length === 1 ? 'Un gasto espera' : `${gastos.length} gastos esperan`} tu aprobación</p>
          {gastos.map(g => (
            <Link key={g.id} to={`/tareas/${g.tarea_id}`} className="block text-sm mt-1 hover:underline">
              {g.local_corto} · {g.concepto} · {pesos(g.monto)}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2.5 items-center justify-between max-w-[1240px]">
        <div className="inline-flex flex-wrap gap-0.5 bg-ahg-accent/35 rounded-[10px] p-[3px]" role="group" aria-label="Qué tareas ver">
          {vistas.map(v => (
            <button key={v.id} onClick={() => setVista(v.id)} aria-pressed={v0.id === v.id} className={segBtn(v0.id === v.id)}>
              {v.nombre}
              <span className={`text-[11.5px] tabular-nums ${v.id === 'sinleer' && v.n ? 'text-white bg-[#2d68b0] rounded-full px-1.5' : 'opacity-70'}`}>{v.n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setVerFiltros(x => !x)} aria-expanded={verFiltros}
                  className={`inline-flex items-center gap-1.5 bg-white border rounded-lg px-3 py-1.5 text-[13px] font-medium ${activos ? 'border-ahg-text' : 'border-ahg-accent/60 hover:border-ahg-accent'}`}>
            <IcoFiltro />Filtros{activos > 0 && <span className="text-ahg-text/50">{activos}</span>}
          </button>
          <button onClick={() => setRegistro(true)} className="inline-flex items-center gap-1.5 bg-white border border-ahg-accent/60 hover:border-ahg-accent rounded-lg px-3 py-1.5 text-[13px] font-medium">
            <IcoArch />Registro de cerradas
          </button>
        </div>
      </div>

      {(verFiltros || activos > 0) && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-[11px] text-ahg-text/55 font-medium grid gap-1">Local
            <select id="fg-local" className={`${sel} ${f.local ? 'border-ahg-text' : 'border-ahg-accent/60'}`} value={f.local} onChange={campo('local')}>
              <option value="">Todos</option>
              {localesDe.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              <option value="grupo">Todo el grupo</option>
            </select>
          </label>
          <label className="text-[11px] text-ahg-text/55 font-medium grid gap-1">Área
            <select id="fg-area" className={`${sel} ${f.area ? 'border-ahg-text' : 'border-ahg-accent/60'}`} value={f.area} onChange={campo('area')}>
              <option value="">Todas</option>
              {Object.entries(opciones.areas || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-ahg-text/55 font-medium grid gap-1">Origen
            <select id="fg-origen" className={`${sel} ${f.origen ? 'border-ahg-text' : 'border-ahg-accent/60'}`} value={f.origen} onChange={campo('origen')}>
              <option value="">Todos</option><option value="reporte">Reporte de turno</option><option value="dueno">Cargada por un dueño</option>
            </select>
          </label>
          {cargaron.length > 0 && (
            <label className="text-[11px] text-ahg-text/55 font-medium grid gap-1">Cargó
              <select id="fg-cargo" className={`${sel} ${f.cargo ? 'border-ahg-text' : 'border-ahg-accent/60'}`} value={f.cargo} onChange={campo('cargo')}>
                <option value="">Cualquiera</option>{cargaron.map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
          )}
          <label htmlFor="fg-venc" className={`flex items-center gap-1.5 bg-white border rounded-lg px-2.5 py-1.5 text-sm cursor-pointer ${f.venc ? 'border-red-600 text-red-700' : 'border-ahg-accent/60'}`}>
            <input id="fg-venc" type="checkbox" checked={f.venc} onChange={campo('venc')} /> Vencidas o vencen hoy
          </label>
          {activos > 0 && <button onClick={() => setF(FILTRO_VACIO)} className="text-xs underline text-ahg-text/55 hover:text-ahg-text pb-2">Sacar filtros</button>}
        </div>
      )}

      {/* En el celular cada columna ocupa casi toda la pantalla y se asoma la siguiente. */}
      <div className="overflow-x-auto pb-6 -mx-1 px-1 snap-x snap-mandatory md:snap-none">
        <div className="grid grid-flow-col auto-cols-[86%] gap-3 md:grid-flow-row md:auto-cols-auto md:grid-cols-3 md:gap-4 md:min-w-[880px] max-w-[1240px] items-start">
          {COLUMNAS.map(c => {
            const ts = lista.filter(t => t.estado === c.estado).sort(orden);
            return (
              <section key={c.estado} aria-label={c.nombre}
                       onDragOver={e => { e.preventDefault(); setSobre(c.estado); }} onDragLeave={() => setSobre(null)}
                       onDrop={e => { e.preventDefault(); setSobre(null); const [id, de] = e.dataTransfer.getData('text/plain').split('|'); if (id && de !== c.estado) navigate(`/tareas/${id}`); }}
                       className="snap-start rounded-xl border p-2.5 flex flex-col gap-2 min-h-[140px] transition-colors"
                       style={{ background: sobre === c.estado ? `${c.color}12` : 'rgba(225,223,218,0.45)', borderColor: sobre === c.estado ? c.color : 'rgba(195,194,189,0.55)' }}>
                <div className="flex items-center gap-2 px-1 pt-1 pb-1.5" title={c.regla}>
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  <h2 className="text-[13px] font-semibold">{c.nombre}</h2>
                  <span className="text-xs text-ahg-text/50 tabular-nums">{ts.length}</span>
                  {c.estado === 'nueva' && dueno && (
                    <button onClick={() => setNueva(true)} title="Cargar una tarea para el encargado" aria-label="Cargar una tarea para el encargado"
                            className="ml-auto w-6 h-6 rounded-md grid place-items-center text-ahg-text/55 hover:bg-white hover:text-ahg-text"><IcoMas /></button>
                  )}
                </div>
                {ts.map(t => <Tarjeta key={t.id} t={t} dueno={dueno} />)}
                {ts.length === 0 && <p className="text-[12.5px] text-ahg-text/45 border border-dashed border-ahg-accent/60 rounded-[10px] py-4 px-3 text-center">No hay tareas acá</p>}
              </section>
            );
          })}
        </div>
      </div>

      {nueva && <NuevaTarea areas={opciones.areas || {}} onCerrar={() => setNueva(false)} />}
      {registro && <Registro onCerrar={() => setRegistro(false)} />}
    </div>
  );
}
