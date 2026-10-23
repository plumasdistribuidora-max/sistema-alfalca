import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { ddmm, hoyStr, cuando, Cargando, MensajeError, Titulo } from './comunes';
import {
  IcoCal, IcoFlag, IcoCom, IcoFiltro, IcoArch, IcoMas, COLUMNAS as COLS, fechaLocal, lunesDe, AZUL,
  Vistas, BotonBarra, Columna, Tablero, marcoTarjeta, SinLeer, PuntoSinLeer, Modal,
} from './kanban';

// El tablero de los dueños (23/10/2026). Cada tarea tiene un dueño responsable: la toma,
// cuenta cómo viene y pide el cierre. La cierra otro dueño. Las tareas del encargado no
// aparecen acá; las que le cargan para un microobjetivo cuentan en el avance del
// microobjetivo.
const REGLAS = {
  nueva: 'Nadie la tomó todavía.',
  en_curso: 'El responsable la tomó y dijo para cuándo.',
  por_aprobar: 'El responsable dice que terminó. La cierra otro dueño.',
};
const COLUMNAS = COLS.map(c => ({ ...c, regla: REGLAS[c.estado] }));
const NEG_COLOR = { entre_dos: '#a0782f', kankay: '#2e3033', senzen: '#55805e', general: '#7a5878' };
const AV_COLOR = ['#3f5e7a', '#7a4f3a', '#4f6b45', '#6b4a6e', '#5c5f63'];
const SEMAFORO = {
  verde:    { txt: 'Verde',    cls: 'bg-green-100 text-green-800' },
  amarillo: { txt: 'Amarillo', cls: 'bg-amber-100 text-amber-800' },
  rojo:     { txt: 'Rojo',     cls: 'bg-red-100 text-red-700' },
};
const ESTADO_TXT = { nueva: 'Sin empezar', en_curso: 'En proceso', por_aprobar: 'Esperando cierre', terminada: 'Cerrada' };

const orden = (a, b) => (Number(b.vencida) - Number(a.vencida)) || (a.plazo || '9').localeCompare(b.plazo || '9') || a.id - b.id;
const mesTxt = m => new Date(`${m}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
const lugar = t => (t.negocio === 'entre_dos' && t.local_corto ? t.local_corto : t.negocio_label);

function Avatar({ id, nombre, duenos }) {
  const i = Math.max(0, duenos.findIndex(d => d.id === id));
  return (
    <span title={nombre} className="w-[22px] h-[22px] rounded-full grid place-items-center text-[10px] font-semibold text-white flex-shrink-0 ring-2 ring-white"
          style={{ background: AV_COLOR[i % AV_COLOR.length] }}>{(nombre || '?').slice(0, 2)}</span>
  );
}

function Tarjeta({ t, duenos, onAbrir }) {
  const fecha = t.vencida ? { txt: `Venció ${ddmm(t.plazo)}`, cls: 'text-red-700 font-semibold' }
    : t.vence_hoy ? { txt: 'Vence hoy', cls: 'text-amber-700 font-semibold' }
    : t.plazo ? { txt: ddmm(t.plazo), cls: '' } : { txt: 'Sin fecha', cls: '' };
  return (
    <button type="button" draggable onClick={() => onAbrir(t.id)}
            onDragStart={e => e.dataTransfer.setData('text/plain', `${t.id}|${t.estado}`)}
            className={marcoTarjeta(t.sin_leer?.total > 0)}>
      <PuntoSinLeer t={t} />
      <span className="flex items-center gap-1.5 text-[11.5px] text-ahg-text/55 pr-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-ahg-text font-medium">
          <span className="w-[7px] h-[7px] rounded-sm" style={{ background: NEG_COLOR[t.negocio] }} />{lugar(t)}
        </span>
        <span className="opacity-50">·</span>{t.area_label}
      </span>
      <span className="block text-[13.5px] leading-snug font-medium text-ahg-text">{t.titulo}</span>
      {t.microobjetivo_nombre && <span className="block text-[11.5px] text-ahg-text/55">◎ {t.microobjetivo_nombre}</span>}
      <span className="flex items-center gap-3 text-xs text-ahg-text/55 flex-wrap">
        <span className={`inline-flex items-center gap-1 tabular-nums ${fecha.cls}`} title="Fecha límite"><IcoCal />{fecha.txt}</span>
        {t.prioridad === 'alta' && <span className="inline-flex items-center gap-1 text-red-700 font-medium" title="Prioridad alta"><IcoFlag />Alta</span>}
        {t.mensajes > 0 && <span className="inline-flex items-center gap-1" title="Mensajes"><IcoCom />{t.mensajes}</span>}
        <span className="ml-auto"><Avatar id={t.responsable_id} nombre={t.responsable} duenos={duenos} /></span>
      </span>
      <SinLeer t={t} />
    </button>
  );
}

// El negocio y, si es Entre Dos, la unidad: un solo desplegable.
function OpcionesNegocio({ d, conTodos }) {
  return (
    <>
      {conTodos && <option value="">Todos</option>}
      <optgroup label="Entre Dos">
        <option value="entre_dos">Entre Dos{conTodos ? ' (todas)' : ' (varias o ninguna)'}</option>
        {d.locales.map(l => <option key={l.id} value={`entre_dos:${l.id}`}>{l.nombre}</option>)}
      </optgroup>
      <option value="kankay">Kankay</option><option value="senzen">Senzen</option><option value="general">General / Sociedad</option>
    </>
  );
}
const partirNegocio = v => { const [negocio, local] = String(v).split(':'); return { negocio, local_id: local ? Number(local) : null }; };

function NuevaTarea({ d, user, microInicial, onCerrar, onListo }) {
  const [f, setF] = useState({ titulo: '', detalle: '', responsable_id: user.id, negocio: 'entre_dos', area: 'operacion', micro: microInicial || '', plazo: '', prioridad: 'media' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  async function guardar(e) {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      const r = await api.post('/tareas-duenos', { ...f, ...partirNegocio(f.negocio), microobjetivo_id: f.micro || null, plazo: f.plazo || null });
      onListo(r.data.data.id);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cargar'); setGuardando(false); }
  }
  const etiq = 'text-xs text-ahg-text/60 grid gap-1';
  return (
    <Modal onCerrar={onCerrar}>
      <form onSubmit={guardar} className="p-5 grid gap-3">
        <p className="font-semibold">Nueva tarea de dueños</p>
        <label className={etiq}>¿Qué hay que hacer?
          <input id="nd-titulo" className="input" maxLength={200} value={f.titulo} onChange={campo('titulo')} placeholder="Ej.: armar la lista de empresas a visitar" autoFocus />
        </label>
        <label className={etiq}>Más detalle (opcional)
          <textarea id="nd-detalle" className="input" rows={2} maxLength={2000} value={f.detalle} onChange={campo('detalle')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={etiq}>La hace
            <select id="nd-resp" className="input" value={f.responsable_id} onChange={campo('responsable_id')}>
              {d.duenos.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.id === user.id ? ' (vos)' : ''}</option>)}
            </select>
          </label>
          <label className={etiq}>Negocio
            <select id="nd-negocio" className="input" value={f.negocio} onChange={campo('negocio')}><OpcionesNegocio d={d} /></select>
          </label>
          <label className={etiq}>Área
            <select id="nd-area" className="input" value={f.area} onChange={campo('area')}>
              {Object.entries(d.areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={etiq}>Microobjetivo
            <select id="nd-micro" className="input" value={f.micro} onChange={campo('micro')}>
              <option value="">Sin microobjetivo</option>
              {d.microobjetivos.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m.dueno}</option>)}
            </select>
          </label>
          <label className={etiq}>Para cuándo (opcional)
            <input id="nd-plazo" type="date" className="input" min={hoyStr()} value={f.plazo} onChange={campo('plazo')} />
          </label>
          <label className={etiq}>Prioridad
            <select id="nd-prio" className="input" value={f.prioridad} onChange={campo('prioridad')}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={guardando || f.titulo.trim().length < 3}>{guardando ? 'Guardando…' : 'Cargar la tarea'}</button>
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function NuevoMicro({ d, user, onCerrar, onListo }) {
  const hoy = hoyStr();
  const [f, setF] = useState({ nombre: '', dueno_id: user.id, negocio: 'entre_dos', local_ids: [], area: 'cmv', meta: '', mes: hoy.slice(0, 7) });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const unidad = id => setF(v => ({ ...v, local_ids: v.local_ids.includes(id) ? v.local_ids.filter(x => x !== id) : [...v.local_ids, id] }));
  async function guardar(e) {
    e.preventDefault(); setGuardando(true); setError('');
    try { await api.post('/tareas-duenos/microobjetivos', f); onListo(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); setGuardando(false); }
  }
  const etiq = 'text-xs text-ahg-text/60 grid gap-1';
  return (
    <Modal onCerrar={onCerrar}>
      <form onSubmit={guardar} className="p-5 grid gap-3">
        <div>
          <p className="font-semibold">Nuevo microobjetivo</p>
          <p className="text-xs text-ahg-text/55 mt-0.5">Una palanca para llegar al objetivo de rentabilidad del mes. Tiene un solo dueño responsable.</p>
        </div>
        <label className={etiq}>Microobjetivo
          <input id="nm-nombre" className="input" maxLength={200} value={f.nombre} onChange={campo('nombre')} placeholder="Ej.: bajar el CMV 1 punto" autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={etiq}>Dueño responsable
            <select id="nm-dueno" className="input" value={f.dueno_id} onChange={campo('dueno_id')}>
              {d.duenos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label className={etiq}>Mes
            <input id="nm-mes" type="month" className="input" value={f.mes} onChange={campo('mes')} />
          </label>
          <label className={etiq}>Negocio
            <select id="nm-negocio" className="input" value={f.negocio} onChange={campo('negocio')}>
              <option value="entre_dos">Entre Dos</option><option value="kankay">Kankay</option><option value="senzen">Senzen</option><option value="general">General / Sociedad</option>
            </select>
          </label>
          <label className={etiq}>Área que mueve
            <select id="nm-area" className="input" value={f.area} onChange={campo('area')}>
              {Object.entries(d.areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        {f.negocio === 'entre_dos' && (
          <fieldset className="grid gap-1.5">
            <legend className="text-xs text-ahg-text/60 mb-1">Unidades a las que aplica</legend>
            <div className="flex flex-wrap gap-2">
              {d.locales.map(l => (
                <label key={l.id} className={`text-sm px-2.5 py-1 rounded-full border cursor-pointer ${f.local_ids.includes(l.id) ? 'border-ahg-text bg-ahg-bg' : 'border-ahg-accent/60'}`}>
                  <input type="checkbox" className="sr-only" checked={f.local_ids.includes(l.id)} onChange={() => unidad(l.id)} />{l.nombre}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className={etiq}>Indicador y meta (opcional)
          <input id="nm-meta" className="input" maxLength={200} value={f.meta} onChange={campo('meta')} placeholder="Ej.: CMV de 38 % a 37 %" />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={guardando || f.nombre.trim().length < 3}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// La ficha de una tarea de dueños: los datos se corrigen ahí mismo, y abajo el historial y
// lo que puede hacer quien mira.
function Ficha({ id, d, user, onCerrar, onCambio }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [plazo, setPlazo] = useState('');
  const [cambiaFecha, setCambiaFecha] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  function cargar() {
    api.get(`/tareas-duenos/${id}`).then(r => { setData(r.data.data); setPlazo(r.data.data.tarea.plazo || ''); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la tarea'));
  }
  useEffect(cargar, [id]);

  async function accion(a, extra = {}) {
    setOcupado(true); setError('');
    try {
      await api.post(`/tareas-duenos/${id}/accion`, { accion: a, texto, ...extra });
      setTexto(''); onCambio(); if (a === 'cerrar') onCerrar(); else cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }
  async function editar(campos) {
    setError('');
    try { await api.post(`/tareas-duenos/${id}/editar`, campos); setCambiaFecha(false); setMotivo(''); onCambio(); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }

  if (!data) return <Modal onCerrar={onCerrar}><div className="p-5">{error ? <MensajeError texto={error} /> : <Cargando />}</div></Modal>;
  const t = data.tarea;
  const yoHago = t.responsable_id === user.id;
  const cerrada = t.estado === 'terminada';
  const nuevo = e => e.usuario_id && e.usuario_id !== user.id && (!data.visto_antes || new Date(e.created_at) > new Date(data.visto_antes));
  const col = COLUMNAS.find(c => c.estado === t.estado);
  const sel = 'input !py-1 text-sm';
  const negocioValor = t.negocio === 'entre_dos' && t.local_id ? `entre_dos:${t.local_id}` : t.negocio;
  const evTexto = e => ({
    creada: 'Cargó la tarea', comentario: '', pidio_cierre: 'Terminó y pide el cierre', cerrada: 'Cerró la tarea',
    devuelta: 'La devolvió a En proceso', cambio: 'Cambió los datos de la tarea',
    fecha: e.datos?.despues ? `Cambió la fecha${e.datos.antes ? ` del ${ddmm(e.datos.antes)}` : ''} al ${ddmm(e.datos.despues)}` : 'Sacó la fecha',
    mov: e.datos?.a === 'en_curso' ? `La tomó${e.datos.plazo ? `, para el ${ddmm(e.datos.plazo)}` : ''}` : 'La volvió a Sin empezar',
  }[e.tipo] ?? '');

  return (
    <Modal onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="px-5 pt-4 pb-3 border-b border-ahg-accent/30 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: col?.color || '#3f6e3b' }}>
            <span className="w-2 h-2 rounded-sm" style={{ background: col?.color || '#3f6e3b' }} />{ESTADO_TXT[t.estado]}
          </p>
          <h2 className="text-lg font-semibold mt-1 leading-snug">{t.titulo}</h2>
          {t.detalle && <p className="text-sm text-ahg-text/75 mt-1 whitespace-pre-line">{t.detalle}</p>}
        </div>
        <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-ahg-bg hover:bg-ahg-accent/40 text-lg leading-none">×</button>
      </div>

      <div className="p-5 grid gap-4 max-h-[calc(100vh-180px)] overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-ahg-text/60">
          <label className="grid gap-1">La hace
            <select id="f-resp" className={sel} disabled={cerrada} value={t.responsable_id} onChange={e => editar({ responsable_id: e.target.value })}>
              {d.duenos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Negocio
            <select id="f-negocio" className={sel} disabled={cerrada} value={negocioValor} onChange={e => editar(partirNegocio(e.target.value))}><OpcionesNegocio d={d} /></select>
          </label>
          <label className="grid gap-1">Área
            <select id="f-area" className={sel} disabled={cerrada} value={t.area} onChange={e => editar({ area: e.target.value })}>
              {Object.entries(d.areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="grid gap-1 col-span-2 sm:col-span-1">Microobjetivo
            <select id="f-micro" className={sel} disabled={cerrada} value={t.microobjetivo_id || ''} onChange={e => editar({ microobjetivo_id: e.target.value || null })}>
              <option value="">Sin microobjetivo</option>
              {d.microobjetivos.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m.dueno}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Prioridad
            <select id="f-prio" className={sel} disabled={cerrada} value={t.prioridad || ''} onChange={e => editar({ prioridad: e.target.value })}>
              <option value="">Sin definir</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
            </select>
          </label>
          <div className="grid gap-1">Fecha límite
            <span className="text-sm text-ahg-text">
              <span className={t.vencida ? 'text-red-700 font-semibold' : t.vence_hoy ? 'text-amber-700 font-semibold' : ''}>{t.plazo ? ddmm(t.plazo) : 'Sin fecha'}</span>
              {!cerrada && <button type="button" className="ml-2 underline text-xs text-ahg-text/55" onClick={() => setCambiaFecha(x => !x)}>Cambiar</button>}
            </span>
          </div>
        </div>

        {cambiaFecha && (
          <div className="rounded-xl border border-[#2d68b0]/50 p-3 grid gap-2 bg-ahg-bg/50">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-xs text-ahg-text/60 grid gap-1">Fecha nueva
                <input id="f-plazo" type="date" className="input !py-1.5 !w-auto" min={hoyStr()} value={plazo} onChange={e => setPlazo(e.target.value)} />
              </label>
              {t.plazo && (
                <label className="text-xs text-ahg-text/60 grid gap-1 flex-1 min-w-[200px]">¿Por qué cambia?
                  <input id="f-motivo" className="input !py-1.5" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: el proveedor contesta el jueves" />
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary !py-1.5" onClick={() => editar({ plazo: plazo || null, motivo })}>Guardar fecha</button>
              <button className="btn-secondary !py-1.5" onClick={() => setCambiaFecha(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div>
          <p className="text-[13px] font-semibold mb-2">Historial</p>
          <div className="space-y-2">
            {data.eventos.map(e => {
              const extra = evTexto(e);
              const n = nuevo(e);
              return (
                <div key={e.id} className={`rounded-xl px-3 py-2 text-sm border ${n ? 'border-[#2d68b0]/60 bg-[#e2ecf8]' : e.tipo === 'comentario' ? 'bg-ahg-bg/70 border-transparent' : 'border-ahg-accent/40'}`}>
                  <p className="text-[11px] text-ahg-text/55"><b className="text-ahg-text">{e.usuario || 'Sistema'}</b> · {cuando(e.created_at)}{n && <b className="ml-1.5" style={{ color: AZUL }}>Nuevo</b>}</p>
                  {extra && <p className="text-xs font-semibold text-ahg-text/75 mt-0.5">{extra}</p>}
                  {e.texto && <p className="whitespace-pre-line break-words mt-0.5">{e.texto}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {!cerrada && (
          <div className="rounded-xl border border-ahg-accent/50 p-3 grid gap-2">
            {yoHago && t.estado === 'nueva' && <p className="text-sm font-semibold">Tomala: elegí para cuándo y, si querés, contá cómo la vas a encarar.</p>}
            {yoHago && t.estado === 'en_curso' && <p className="text-sm font-semibold">Contá cómo viene. Cuando termines, pedí el cierre: la cierra otro dueño.</p>}
            {!yoHago && t.estado === 'por_aprobar' && <p className="text-sm font-semibold">{t.responsable} dice que terminó. Cerrala o devolvésela con lo que falta.</p>}
            {yoHago && t.estado === 'por_aprobar' && <p className="text-sm text-ahg-text/70">Esperando que otro dueño la cierre.</p>}
            <textarea id="f-texto" className="input" rows={2} maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)}
                      placeholder={yoHago && t.estado === 'en_curso' ? 'Qué hiciste, qué falta…' : 'Escribí un comentario'} />
            {yoHago && t.estado === 'nueva' && (
              <label className="text-xs text-ahg-text/60 grid gap-1 w-44">¿Para cuándo?
                <input id="f-tomar-plazo" type="date" className="input !py-1.5" min={hoyStr()} value={plazo} onChange={e => setPlazo(e.target.value)} />
              </label>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {yoHago && t.estado === 'nueva' && <button className="btn-primary" disabled={ocupado || !plazo} onClick={() => accion('tomar', { plazo })}>Tomarla</button>}
              {yoHago && t.estado === 'en_curso' && <button className="btn-primary" disabled={ocupado || texto.trim().length < 3} onClick={() => accion('pedir_cierre')}>Terminé · pedir cierre</button>}
              {!yoHago && t.estado === 'por_aprobar' && <>
                <button className="btn-primary !bg-green-700 hover:!bg-green-800" disabled={ocupado} onClick={() => accion('cerrar')}>Cerrar tarea</button>
                <button className="btn-secondary" disabled={ocupado || texto.trim().length < 3} onClick={() => accion('devolver')}>Devolver a En proceso</button>
              </>}
              <button className={yoHago && t.estado !== 'por_aprobar' ? 'btn-secondary' : (!yoHago && t.estado === 'por_aprobar' ? 'text-sm underline text-ahg-text/60 ml-auto' : 'btn-primary')}
                      disabled={ocupado || !texto.trim()} onClick={() => accion('comentar')}>Comentar</button>
            </div>
            {!yoHago && t.estado === 'por_aprobar' && <p className="text-xs text-ahg-text/50">Para devolverla, escribí arriba qué falta. Al cerrarla sale del tablero y queda en el registro.</p>}
          </div>
        )}
        {cerrada && <p className="text-sm text-green-800 bg-green-50 rounded-xl px-3 py-2">La cerró {t.terminada_por_corto} el {ddmm(fechaLocal(t.terminada_at))}.</p>}
      </div>
    </Modal>
  );
}

function Registro({ onCerrar, onAbrir }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    api.get('/tareas-duenos/registro').then(r => setLista(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudo cargar el registro'));
  }, []);
  const filtradas = (lista || []).filter(t => !q || t.titulo.toLowerCase().includes(q.toLowerCase()));
  let semana = '';
  return (
    <Modal onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="px-5 pt-4 pb-3 border-b border-ahg-accent/30 flex items-start gap-3">
        <div className="flex-1"><h2 className="text-lg font-semibold">Registro de tareas cerradas · dueños</h2></div>
        <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-ahg-bg hover:bg-ahg-accent/40 text-lg leading-none">×</button>
      </div>
      <div className="px-5 py-3"><input id="rd-q" type="search" className="input !py-1.5" placeholder="Buscar por título" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="px-5 pb-5 max-h-[65vh] overflow-y-auto">
        {error && <MensajeError texto={error} />}
        {!lista && !error && <Cargando />}
        {lista && filtradas.length === 0 && <p className="text-sm text-ahg-text/50 py-6 text-center">Todavía no hay tareas cerradas.</p>}
        {filtradas.map(t => {
          const l = lunesDe(t.terminada_at);
          const cabeza = l !== semana ? (semana = l, <p className="text-[11px] uppercase tracking-wider font-semibold text-ahg-text/45 pt-4 pb-1">Semana del {ddmm(l)}</p>) : null;
          const dias = Math.max(0, Math.round((new Date(t.terminada_at) - new Date(t.created_at)) / 86400000));
          return (
            <div key={t.id}>
              {cabeza}
              <button type="button" onClick={() => onAbrir(t.id)} className="w-full text-left grid grid-cols-[52px_1fr] gap-3 items-baseline py-2.5 border-b border-ahg-accent/25 hover:bg-ahg-bg/60 -mx-2 px-2 rounded">
                <span className="text-xs text-ahg-text/50 tabular-nums">{ddmm(fechaLocal(t.terminada_at))}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t.titulo}</span>
                  <span className="block text-xs text-ahg-text/55">{lugar(t)} · {t.area_label} · la hizo {t.responsable} · cerró {t.terminada_por_corto} · {dias === 0 ? 'en el día' : `tardó ${dias} día${dias === 1 ? '' : 's'}`}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Una fila por microobjetivo: el semáforo y la nota los actualiza el dueño responsable.
function CabezaMicro({ m, user, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState(m.nota || '');
  const total = m.tareas + m.tareas_gordo, hechas = m.cerradas + m.cerradas_gordo;
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const mio = m.dueno_id === user.id;
  async function guardar(campos) { await api.post(`/tareas-duenos/microobjetivos/${m.id}`, campos); setEditando(false); onCambio(); }
  return (
    <div className="px-3 py-2.5 border-b border-ahg-accent/30 grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{m.nombre}</h3>
        {mio ? (
          <select id={`sem-${m.id}`} aria-label="Semáforo" value={m.semaforo || ''} onChange={e => guardar({ semaforo: e.target.value })}
                  className={`text-xs font-semibold rounded-full px-2 py-0.5 border-0 ${SEMAFORO[m.semaforo]?.cls || 'bg-stone-100 text-stone-600'}`}>
            <option value="">Sin semáforo</option><option value="verde">Verde</option><option value="amarillo">Amarillo</option><option value="rojo">Rojo</option>
          </select>
        ) : m.semaforo && <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${SEMAFORO[m.semaforo].cls}`}>{SEMAFORO[m.semaforo].txt}</span>}
        <span className="text-xs text-ahg-text/55">{m.dueno} · {m.unidades.length ? m.unidades.join(', ') : m.negocio_label} · {m.area_label}{m.meta ? ` · Meta: ${m.meta}` : ''}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-ahg-text/55">
          <span className="w-16 h-1.5 rounded-full bg-ahg-accent/40 overflow-hidden"><span className="block h-full bg-green-700" style={{ width: `${pct}%` }} /></span>
          {pct} % cerradas{m.tareas_gordo ? ` · ${m.tareas_gordo} del Gordo` : ''}
        </span>
      </div>
      {editando ? (
        <div className="flex gap-2 items-start">
          <textarea id={`nota-${m.id}`} className="input !py-1.5 text-sm" rows={2} maxLength={600} value={nota} onChange={e => setNota(e.target.value)} placeholder="Qué se hizo esta semana y qué traba" />
          <button className="btn-primary !py-1.5" onClick={() => guardar({ nota })}>Guardar</button>
        </div>
      ) : (
        <p className="text-xs text-ahg-text/60">
          {m.nota ? <>Nota de la semana: {m.nota}</> : 'Sin nota de la semana.'}
          {mio && <button className="ml-2 underline" onClick={() => setEditando(true)}>{m.nota ? 'Cambiar' : 'Escribir la nota'}</button>}
        </p>
      )}
    </div>
  );
}

const FILTRO_VACIO = { dueno: '', negocio: '', area: '', micro: '', venc: false };

export default function TableroDuenos() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('todas');
  const [modo, setModo] = useState('cols');
  const [verFiltros, setVerFiltros] = useState(false);
  const [f, setF] = useState(FILTRO_VACIO);
  const [nueva, setNueva] = useState(null);
  const [nuevoMicro, setNuevoMicro] = useState(false);
  const [registro, setRegistro] = useState(false);
  const abierta = params.get('t');
  const abrir = id => setParams(id ? { t: String(id) } : {});

  function cargar() {
    api.get('/tareas-duenos').then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el tablero'));
  }
  useEffect(cargar, []);

  const microsDelMes = useMemo(() => (d?.microobjetivos || []), [d]);
  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  const vistas = [
    { id: 'todas', nombre: 'Todas', f: () => true },
    { id: 'mias', nombre: 'Mis tareas', f: t => t.responsable_id === user.id },
    { id: 'cerrar', nombre: 'Para cerrar', f: t => t.estado === 'por_aprobar' && t.responsable_id !== user.id },
    { id: 'sinleer', nombre: 'Sin leer', f: t => t.sin_leer?.total > 0 },
  ].map(v => ({ ...v, n: d.tareas.filter(v.f).length }));
  const v0 = vistas.find(v => v.id === vista) || vistas[0];
  const activos = Object.values(f).filter(Boolean).length;
  const pasaNegocio = t => {
    if (!f.negocio) return true;
    const { negocio, local_id } = partirNegocio(f.negocio);
    return t.negocio === negocio && (!local_id || t.local_id === local_id);
  };
  const lista = d.tareas.filter(t => v0.f(t) && (!f.dueno || String(t.responsable_id) === f.dueno) && pasaNegocio(t)
    && (!f.area || t.area === f.area) && (!f.micro || (f.micro === 'none' ? !t.microobjetivo_id : String(t.microobjetivo_id) === f.micro))
    && (!f.venc || t.vencida));
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const sel = on => `border rounded-lg px-2 py-1.5 text-sm bg-white ${on ? 'border-ahg-text' : 'border-ahg-accent/60'}`;
  const etiq = 'text-[11px] text-ahg-text/55 font-medium grid gap-1';

  const columnas = (ts, micro) => (
    <Tablero>
      {COLUMNAS.map(c => {
        const cs = ts.filter(t => t.estado === c.estado).sort(orden);
        return (
          <Columna key={c.estado} col={c} n={cs.length} vacia={!micro} onSoltar={abrir}
                   onAgregar={c.estado === 'nueva' ? () => setNueva({ micro: micro?.id || '' }) : null} agregarTexto="Cargar una tarea de dueños">
            {cs.map(t => <Tarjeta key={t.id} t={t} duenos={d.duenos} onAbrir={abrir} />)}
          </Columna>
        );
      })}
    </Tablero>
  );

  const sinFiltro = !activos && v0.id === 'todas';
  const filas = [...microsDelMes.map(m => ({ m, ts: lista.filter(t => t.microobjetivo_id === m.id) })), { m: null, ts: lista.filter(t => !t.microobjetivo_id) }]
    .filter(x => x.ts.length || sinFiltro);

  return (
    <div className="space-y-4">
      <Titulo eyebrow="Dueños" derecha={<span className="text-xs text-white/70">Solo lo ven los dueños</span>}>Tablero de dueños</Titulo>

      <div className="flex flex-wrap gap-2.5 items-center justify-between max-w-[1240px]">
        <Vistas vistas={vistas} actual={v0.id} onCambio={setVista} />
        <div className="flex gap-1.5 flex-wrap items-center">
          <div className="inline-flex bg-ahg-accent/35 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Cómo ver el tablero">
            {[['cols', 'Columnas'], ['micro', 'Por microobjetivo']].map(([k, l]) => (
              <button key={k} onClick={() => setModo(k)} aria-pressed={modo === k}
                      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${modo === k ? 'bg-white text-ahg-text shadow-sm' : 'text-ahg-text/60 hover:text-ahg-text'}`}>{l}</button>
            ))}
          </div>
          <BotonBarra icono={<IcoFiltro />} on={activos > 0} onClick={() => setVerFiltros(x => !x)} aria-expanded={verFiltros}>
            Filtros{activos > 0 && <span className="text-ahg-text/50">{activos}</span>}
          </BotonBarra>
          <BotonBarra icono={<IcoArch />} onClick={() => setRegistro(true)}>Registro de cerradas <span className="text-ahg-text/50">{d.cerradas}</span></BotonBarra>
        </div>
      </div>

      {(verFiltros || activos > 0) && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className={etiq}>Dueño
            <select id="fd-dueno" className={sel(f.dueno)} value={f.dueno} onChange={campo('dueno')}>
              <option value="">Todos</option>{d.duenos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label className={etiq}>Negocio
            <select id="fd-negocio" className={sel(f.negocio)} value={f.negocio} onChange={campo('negocio')}><OpcionesNegocio d={d} conTodos /></select>
          </label>
          <label className={etiq}>Área
            <select id="fd-area" className={sel(f.area)} value={f.area} onChange={campo('area')}>
              <option value="">Todas</option>{Object.entries(d.areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={etiq}>Microobjetivo
            <select id="fd-micro" className={sel(f.micro)} value={f.micro} onChange={campo('micro')}>
              <option value="">Todos</option>
              {d.microobjetivos.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.unidades.length ? ` – ${m.unidades.join(', ')}` : ''}</option>)}
              <option value="none">Sin microobjetivo</option>
            </select>
          </label>
          <label htmlFor="fd-venc" className={`flex items-center gap-1.5 bg-white border rounded-lg px-2.5 py-1.5 text-sm cursor-pointer ${f.venc ? 'border-red-600 text-red-700' : 'border-ahg-accent/60'}`}>
            <input id="fd-venc" type="checkbox" checked={f.venc} onChange={campo('venc')} /> Vencidas
          </label>
          {activos > 0 && <button onClick={() => setF(FILTRO_VACIO)} className="text-xs underline text-ahg-text/55 hover:text-ahg-text pb-2">Sacar filtros</button>}
        </div>
      )}

      {modo === 'cols' ? columnas(lista) : (
        <div className="space-y-4 max-w-[1240px]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ahg-text/65">Una fila por microobjetivo, con su semáforo y cuánto se cerró. Las tareas que no cuelgan de ninguno van al final.</p>
            <button onClick={() => setNuevoMicro(true)} className="ml-auto inline-flex items-center gap-1.5 btn-primary !py-1.5 !px-3 text-sm"><IcoMas />Microobjetivo</button>
          </div>
          {d.microobjetivos.length === 0 && (
            <div className="card p-4 text-sm text-ahg-text/70">Todavía no hay microobjetivos. Cargá el primero con <b>+ Microobjetivo</b>: por ejemplo, "Bajar el CMV 1 punto" en Peatonal, a cargo de Agustín.</div>
          )}
          {filas.map(({ m, ts }) => (
            <div key={m?.id || 'sin'} className="bg-white rounded-xl border border-ahg-accent/40">
              {m ? <CabezaMicro m={m} user={user} onCambio={cargar} /> : (
                <div className="px-3 py-2.5 border-b border-ahg-accent/30"><h3 className="text-sm font-semibold">Sin microobjetivo</h3><p className="text-xs text-ahg-text/55">Tareas sueltas de cualquier negocio</p></div>
              )}
              <div className="p-2.5">{columnas(ts, m || { id: '' })}</div>
              {m && <p className="px-3 pb-2 text-[11px] text-ahg-text/45">{mesTxt(m.mes)}</p>}
            </div>
          ))}
        </div>
      )}

      {nueva && <NuevaTarea d={d} user={user} microInicial={nueva.micro} onCerrar={() => setNueva(null)} onListo={id => { setNueva(null); cargar(); abrir(id); }} />}
      {nuevoMicro && <NuevoMicro d={d} user={user} onCerrar={() => setNuevoMicro(false)} onListo={() => { setNuevoMicro(false); cargar(); }} />}
      {registro && <Registro onCerrar={() => setRegistro(false)} onAbrir={id => { setRegistro(false); abrir(id); }} />}
      {abierta && <Ficha id={abierta} d={d} user={user} onCerrar={() => abrir(null)} onCambio={cargar} />}
    </div>
  );
}
