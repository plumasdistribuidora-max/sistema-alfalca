import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import AvisosBoton from '../../components/AvisosBoton';
import { colorDeTienda } from '../red/redUtils';
import { pesos, ddmm, hoyStr, useOpciones, Cargando, MensajeError, Titulo } from './comunes';
import {
  IcoCal, IcoFlag, IcoCom, IcoClip, IcoFiltro, IcoArch, COLUMNAS as COLS, fechaLocal, lunesDe,
  Vistas, BotonBarra, Columna, Tablero, marcoTarjeta, SinLeer, PuntoSinLeer,
} from './kanban';

// El tablero de tareas del encargado (23/10/2026): reemplaza a la lista. Tres columnas;
// lo que cierra un dueño sale del tablero y queda en el registro. La tarjeta muestra lo
// justo y al tocarla se abre la tarea, donde se hace todo.
const REGLAS = {
  nueva: 'Nadie la tomó todavía.',
  en_curso: 'El encargado la tomó y dijo para cuándo.',
  por_aprobar: 'El encargado dice que terminó. Falta que un dueño la cierre.',
};
const COLUMNAS = COLS.map(c => ({ ...c, regla: REGLAS[c.estado] }));
const sinParentesis = n => String(n || '').replace(/\s*\(.*\)\s*$/, '');

const devuelta = t => t.estado === 'en_curso' && ['pidio_mas', 'rechazada'].includes(t.ultimo?.tipo);
const vencida = t => t.dias_vencida > 0;
const venceHoy = t => t.estado !== 'por_aprobar' && t.plazo === hoyStr();
// Lo que más apura arriba: vencidas y devueltas, después por fecha.
const orden = (a, b) => (Number(!(vencida(b) || devuelta(b))) - Number(!(vencida(a) || devuelta(a))))
  || (a.plazo || a.fecha).localeCompare(b.plazo || b.fecha) || a.id - b.id;

function Tarjeta({ t, dueno }) {
  const fecha = vencida(t) ? { txt: `Venció ${ddmm(t.plazo)}`, cls: 'text-red-700 font-semibold' }
    : venceHoy(t) ? { txt: 'Vence hoy', cls: 'text-amber-700 font-semibold' }
    : t.plazo ? { txt: ddmm(t.plazo), cls: '' }
    : { txt: `Del ${ddmm(t.fecha)}`, cls: '' };
  return (
    <Link to={`/tareas/${t.id}`} draggable
          onDragStart={e => e.dataTransfer.setData('text/plain', `${t.id}|${t.estado}`)}
          className={marcoTarjeta(t.sin_leer?.total > 0)}>
      <PuntoSinLeer t={t} />
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
        {t.cargada_por_nombre && <span className="ml-auto truncate" title="La cargó">{sinParentesis(t.cargada_por_nombre)}</span>}
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
      <SinLeer t={t} conBorde={!t.pedido_foto && !devuelta(t)} />
    </Link>
  );
}

// Un dueño le carga algo al encargado. Le llega el aviso y sigue el camino de siempre.
function NuevaTarea({ areas, onCerrar }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [locales, setLocales] = useState([]);
  const [f, setF] = useState({ titulo: '', texto: '', local: '', para: '', area: 'operacion', prioridad: 'media', micro: '' });
  const [micros, setMicros] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo))).catch(() => {});
    // Los microobjetivos del dueño que la carga: la tarea puede ser para ayudar con uno.
    api.get('/tareas-duenos').then(r => setMicros(r.data.data.microobjetivos.filter(m => m.dueno_id === user?.id))).catch(() => {});
  }, [user?.id]);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      const r = await api.post('/tareas/nueva', {
        titulo: f.titulo, texto: f.texto, local_id: f.local || null, para_cuando: f.para || null, area: f.area, prioridad: f.prioridad,
        microobjetivo_id: f.micro || null,
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
        {micros.length > 0 && (
          <label className={etiq}>¿Es para un microobjetivo tuyo? (opcional)
            <select id="nt-micro" className="input" value={f.micro} onChange={campo('micro')}>
              <option value="">No, es una tarea suelta</option>
              {micros.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.unidades.length ? ` – ${m.unidades.join(', ')}` : ''}</option>)}
            </select>
          </label>
        )}
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

// Lo cerrado, por semana. Se abre desde el botón del tablero.
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
      { id: 'cerrar', nombre: 'Para cerrar', f: t => t.estado === 'por_aprobar' },
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
        <Vistas vistas={vistas} actual={v0.id} onCambio={setVista} />
        <div className="flex gap-1.5 flex-wrap">
          <BotonBarra icono={<IcoFiltro />} on={activos > 0} onClick={() => setVerFiltros(x => !x)} aria-expanded={verFiltros}>
            Filtros{activos > 0 && <span className="text-ahg-text/50">{activos}</span>}
          </BotonBarra>
          <BotonBarra icono={<IcoArch />} onClick={() => setRegistro(true)}>Registro de cerradas</BotonBarra>
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

      <Tablero>
        {COLUMNAS.map(c => {
          const ts = lista.filter(t => t.estado === c.estado).sort(orden);
          return (
            <Columna key={c.estado} col={c} n={ts.length} onSoltar={id => navigate(`/tareas/${id}`)}
                     onAgregar={c.estado === 'nueva' && dueno ? () => setNueva(true) : null} agregarTexto="Cargar una tarea para el encargado">
              {ts.map(t => <Tarjeta key={t.id} t={t} dueno={dueno} />)}
            </Columna>
          );
        })}
      </Tablero>

      {nueva && <NuevaTarea areas={opciones.areas || {}} onCerrar={() => setNueva(false)} />}
      {registro && <Registro onCerrar={() => setRegistro(false)} />}
    </div>
  );
}
