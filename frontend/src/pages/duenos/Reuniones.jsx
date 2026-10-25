import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Cargando, MensajeError, Titulo, ddmm } from '../tareas/comunes';
import { Modal } from '../tareas/kanban';
import { NEG_COLOR, SEM, PuntoSemaforo, MesNav, Aviso, pct } from './comun';

// Las reuniones de los dueños (23/10/2026), dentro de Dueños → Objetivos del mes. La semanal es los miércoles y arma la agenda sola, en
// el orden de "Crecer ordenados": 1) microobjetivos en rojo, 2) tareas vencidas,
// 3) esperando cierre, 4) el resto. La mensual se hace con los números cerrados y fija el
// objetivo del mes. El historial guarda cada mes.
// ── Semanal ──────────────────────────────────────────────────────────────────
export function Semanal() {
  const { user } = useAuth();
  const [semana, setSemana] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [ayuda, setAyuda] = useState(null);

  function cargar(s = semana) {
    api.get('/duenos/reunion-semanal', { params: s ? { semana: s } : {} })
      .then(r => { setD(r.data.data); setSemana(r.data.data.semana); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'No se pudo armar la reunión'));
  }
  useEffect(() => cargar(), []);
  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;
  const ir = s => { setD(null); cargar(s); };
  const b = 'w-8 h-8 grid place-items-center rounded-lg border border-ahg-accent/60 bg-white hover:bg-ahg-bg text-ahg-text/70';
  const micro = m => <Micro key={m.id} m={m} d={d} user={user} onCambio={() => cargar()} onAyuda={() => setAyuda(m)} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={b} aria-label="Semana anterior" onClick={() => ir(d.anterior)}>‹</button>
        <span className="text-sm font-semibold min-w-[170px] text-center">Miércoles {ddmm(d.semana)}{d.es_actual && ' · esta semana'}</span>
        <button type="button" className={b} aria-label="Semana siguiente" onClick={() => ir(d.siguiente)}>›</button>
        {!d.es_actual && <button type="button" className="text-sm underline ml-1" onClick={() => ir(null)}>Volver a esta semana</button>}
      </div>
      {d.sin_dato.length > 0 && d.es_actual && (
        <Aviso tono="ambar">{d.sin_dato.length === 1 ? 'Un microobjetivo no tiene' : `${d.sin_dato.length} microobjetivos no tienen`} el semáforo de esta semana. Lo pone el dueño de cada uno antes de la reunión.</Aviso>
      )}

      <Punto n={1} titulo="Microobjetivos en rojo" cant={d.rojos.length} vacio="Ninguno en rojo.">{d.rojos.map(micro)}</Punto>
      <Punto n={2} titulo="Tareas vencidas" cant={d.vencidas.length} vacio="No hay tareas vencidas.">
        {d.vencidas.map(t => <TareaFila key={`${t.de}-${t.id}`} t={t} hoy={d.hoy} />)}
      </Punto>
      <Punto n={3} titulo="Tareas esperando cierre" cant={d.para_cerrar.length} vacio="Nada espera cierre.">
        {d.para_cerrar.map(t => <TareaFila key={`${t.de}-${t.id}`} t={t} hoy={d.hoy} />)}
      </Punto>
      <Punto n={4} titulo="El resto" cant={d.resto.length + d.sin_dato.length} vacio="No hay más microobjetivos este mes.">
        {[...d.resto, ...d.sin_dato].map(micro)}
      </Punto>

      {ayuda && <PedirAyuda m={ayuda} d={d} user={user} onCerrar={() => setAyuda(null)} onListo={() => { setAyuda(null); cargar(); }} />}
    </div>
  );
}

function Punto({ n, titulo, cant, vacio, children }) {
  return (
    <section className="card p-4 grid gap-2.5">
      <h2 className="flex items-center gap-3 font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
        <span className="text-2xl text-ahg-text/30 tabular-nums">{n}</span>{titulo}
        <span className="ml-auto text-sm tabular-nums text-ahg-text/55">{cant}</span>
      </h2>
      {cant ? <div className="grid gap-2">{children}</div> : <p className="text-sm text-ahg-text/50">{vacio}</p>}
    </section>
  );
}

function TareaFila({ t, hoy }) {
  const a = t.de === 'gordo' ? `/tareas/${t.id}` : `/tareas-duenos?t=${t.id}`;
  return (
    <Link to={a} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl border border-ahg-accent/50 px-3 py-2 hover:bg-ahg-bg text-sm">
      <span className="flex-1 min-w-[200px]">{t.titulo}{t.micro && <span className="block text-xs text-ahg-text/50">◎ {t.micro}</span>}</span>
      <span className="text-xs text-ahg-text/60">{t.responsable}</span>
      {t.plazo && <span className={`text-xs tabular-nums ${t.plazo < hoy && t.estado !== 'por_aprobar' ? 'text-red-700 font-semibold' : 'text-ahg-text/55'}`}>{t.plazo < hoy && t.estado !== 'por_aprobar' ? 'Venció' : 'Para el'} {ddmm(t.plazo)}</span>}
    </Link>
  );
}

// Un microobjetivo con el semáforo de la semana (lo pone su dueño) y las últimas semanas.
function Micro({ m, d, user, onCambio, onAyuda }) {
  const mio = m.dueno_id === user.id;
  const [nota, setNota] = useState(m.nota_semana || '');
  const [editando, setEditando] = useState(false);
  useEffect(() => setNota(m.nota_semana || ''), [m.nota_semana]);
  async function guardar(campos) { await api.post(`/duenos/microobjetivos/${m.id}/semana`, { semana: d.semana, ...campos }); setEditando(false); onCambio(); }
  const ultimas = m.semanas.filter(s => s.semana <= d.semana).slice(-5);
  return (
    <div className="rounded-xl border border-ahg-accent/50 px-3 py-2.5 grid gap-2" style={{ borderLeft: `4px solid ${NEG_COLOR[m.negocio]}` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-semibold text-sm flex-1 min-w-[200px]">{m.nombre}
          <span className="block text-xs font-normal text-ahg-text/55">{m.dueno} · {m.unidades.length ? m.unidades.join(', ') : m.negocio_label} · {m.area_label} · {m.cerradas} de {m.tareas} tareas cerradas</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Semáforo de las últimas semanas">
          {ultimas.map(s => <PuntoSemaforo key={s.semana} s={s.semaforo} size={9} />)}
        </span>
        {mio ? (
          <div className="inline-flex gap-1" role="group" aria-label="Semáforo de esta semana">
            {Object.entries(SEM).map(([k, v]) => (
              <button key={k} type="button" aria-pressed={m.semaforo_semana === k} onClick={() => guardar({ semaforo: m.semaforo_semana === k ? null : k })}
                      className={`text-xs rounded-full px-2.5 py-1 border ${m.semaforo_semana === k ? `${v.cls} border-transparent font-semibold` : 'border-ahg-accent/60 text-ahg-text/60'}`}>{v.txt}</button>
            ))}
          </div>
        ) : (
          <span className={`text-xs rounded-full px-2.5 py-1 ${m.semaforo_semana ? `${SEM[m.semaforo_semana].cls} font-semibold` : 'border border-dashed border-ahg-accent text-ahg-text/50'}`}>
            {m.semaforo_semana ? SEM[m.semaforo_semana].txt : 'Sin dato'}
          </span>
        )}
      </div>
      {editando ? (
        <div className="flex gap-2 items-start">
          <textarea id={`ns-${m.id}`} className="input !py-1.5 text-sm" rows={2} maxLength={600} value={nota} onChange={e => setNota(e.target.value)} placeholder="Qué se hizo esta semana y qué traba" />
          <button type="button" className="btn-primary !py-1.5" onClick={() => guardar({ nota })}>Guardar</button>
        </div>
      ) : (
        <p className="text-xs text-ahg-text/65">
          {m.nota_semana || 'Sin nota esta semana.'}
          {mio && <button type="button" className="ml-2 underline" onClick={() => setEditando(true)}>{m.nota_semana ? 'Cambiar' : 'Escribir la nota'}</button>}
          {mio && <button type="button" className="ml-3 underline font-semibold text-ahg-text/80" onClick={onAyuda}>Pedir ayuda</button>}
        </p>
      )}
    </div>
  );
}

// Pedir ayuda está bien; pasar la pelota, no: la tarea cuelga del mismo microobjetivo y
// el microobjetivo sigue siendo del dueño.
// Con nueva=true es "+ Tarea" desde el microobjetivo: la puede hacer cualquiera, también uno mismo.
export function PedirAyuda({ m, d, user, nueva = false, onCerrar, onListo }) {
  const otros = nueva ? d.duenos : d.duenos.filter(u => u.id !== user.id);
  const [f, setF] = useState({ a: String((nueva ? m.dueno_id : otros[0]?.id) || 'gordo'), titulo: '', plazo: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  async function guardar(e) {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      if (f.a === 'gordo') {
        await api.post('/tareas/nueva', { titulo: f.titulo, para_cuando: f.plazo || null, area: m.area, microobjetivo_id: m.id, local_id: m.local_ids.length === 1 ? m.local_ids[0] : null });
      } else {
        await api.post('/tareas-duenos', {
          titulo: f.titulo, responsable_id: Number(f.a), negocio: m.negocio, local_id: m.local_ids.length === 1 ? m.local_ids[0] : null,
          area: m.area, microobjetivo_id: m.id, plazo: f.plazo || null,
        });
      }
      onListo();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cargar la tarea'); setGuardando(false); }
  }
  const etiq = 'text-xs text-ahg-text/60 grid gap-1';
  return (
    <Modal onCerrar={onCerrar}>
      <form onSubmit={guardar} className="p-5 grid gap-3">
        <div>
          <p className="font-semibold">{nueva ? 'Nueva tarea' : 'Pedir ayuda'} · {m.nombre}</p>
          <p className="text-xs text-ahg-text/55 mt-0.5">{nueva ? 'La tarea cuelga de este microobjetivo y aparece en el tablero de tareas.' : 'Se carga una tarea para otro socio o para el Gordo, colgada de este microobjetivo. El microobjetivo sigue siendo tuyo.'}</p>
        </div>
        <label className={etiq}>Para quién
          <select id="pa-a" className="input" value={f.a} onChange={campo('a')}>
            {otros.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.id === user.id ? ' (vos)' : ''}</option>)}
            <option value="gordo">El Gordo</option>
          </select>
        </label>
        <label className={etiq}>Qué necesitás
          <input id="pa-titulo" className="input" maxLength={200} value={f.titulo} onChange={campo('titulo')} placeholder="Ej.: pedir cotización a 3 proveedores" autoFocus />
        </label>
        <label className={etiq}>Para cuándo (opcional)
          <input id="pa-plazo" type="date" className="input" value={f.plazo} onChange={campo('plazo')} />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={guardando || f.titulo.trim().length < 3}>{guardando ? 'Cargando…' : 'Cargar la tarea'}</button>
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Mensual ──────────────────────────────────────────────────────────────────
export function Mensual() {
  const [mes, setMes] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [notas, setNotas] = useState('');

  function cargar(m = mes) {
    api.get('/duenos/reunion-mensual', { params: m ? { mes: m } : {} })
      .then(r => { setD(r.data.data); setMes(r.data.data.mes); setNotas(r.data.data.reunion.notas || ''); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'No se pudo cargar la reunión'));
  }
  useEffect(() => cargar(), []);
  async function guardar(body) {
    setMsg('');
    try { await api.post(`/duenos/reunion-mensual/${mes}`, body); cargar(); }
    catch (e) { setMsg(e.response?.data?.error || 'No se pudo guardar'); }
  }
  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;
  const r = d.reunion;
  const conObjetivo = d.unidades.filter(u => u.objetivo != null).length;
  const cumplidos = d.micros_anterior.filter(m => m.resultado === 'cumplido').length;
  const sinResultado = d.micros_anterior.filter(m => !m.resultado).length;
  const paso = (n, titulo, ok, children) => (
    <section className="card p-4 grid gap-2.5">
      <h2 className="flex items-center gap-3 font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
        <span className={`w-7 h-7 rounded-full grid place-items-center text-sm ${ok ? 'bg-green-700 text-white' : 'bg-ahg-accent/50 text-ahg-text/70'}`}>{ok ? '✓' : n}</span>{titulo}
      </h2>
      {children}
    </section>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MesNav mes={mes} onCambio={m => { setD(null); setMes(m); cargar(m); }} />
        <label className="text-sm inline-flex items-center gap-2">Fecha de la reunión
          <input id="rm-fecha" type="date" className="input !py-1.5 !w-auto" value={r.fecha || ''} onChange={e => guardar({ fecha: e.target.value })} />
        </label>
      </div>
      {!r.fecha && <Aviso tono="ambar">La reunión de {d.nombre_mes} no tiene fecha. Fíjenla: un día fijo todos los meses, que no se patea.</Aviso>}
      {r.terminada_at && <Aviso tono="verde">Reunión de {d.nombre_mes} terminada por {r.terminada_por} el {ddmm(r.terminada_at)}.</Aviso>}
      {msg && <MensajeError texto={msg} />}

      {paso(1, `Números de ${d.nombre_anterior} cerrados`, d.cierre.completo, d.cierre.completo
        ? <p className="text-sm text-green-800">Las 7 unidades tienen el EERR completo: ventas del mes entero y gastos cargados.</p>
        : <p className="text-sm">Faltan los gastos del EERR de: <b>{d.cierre.faltan.join(', ')}</b>. Sin números no hay reunión. Se cargan en <Link to="/finanzas" className="underline">Finanzas</Link>, <Link to="/marcas/kankay" className="underline">Kankay → Números</Link> y <Link to="/marcas/senzen?tab=gastos" className="underline">Senzen → Gastos</Link>.</p>)}

      {paso(2, `Real contra objetivo de ${d.nombre_anterior}`, d.cierre.completo, (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ahg-text/50 border-b border-ahg-accent/40">
              <th className="py-2 pr-3 font-semibold">Unidad</th><th className="py-2 px-3 font-semibold text-right">Objetivo</th>
              <th className="py-2 px-3 font-semibold text-right">Real</th><th className="py-2 pl-3 font-semibold">¿Llegó?</th></tr></thead>
            <tbody>
              {d.unidades.map(u => {
                const llego = u.real != null && u.objetivo_anterior != null ? u.real >= u.objetivo_anterior : null;
                return (
                  <tr key={u.k} className="border-b border-ahg-accent/25 last:border-0">
                    <td className={`py-2 pr-3 ${u.consolidado ? 'font-semibold' : ''}`}>{u.nombre}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{pct(u.objetivo_anterior)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{pct(u.real)}</td>
                    <td className="py-2 pl-3">{llego == null ? <span className="text-ahg-text/45">—</span> : llego ? <span className="text-green-800">Sí</span> : <span className="text-red-700">No</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {paso(3, `Microobjetivos de ${d.nombre_anterior}: ¿se cumplieron?`, d.micros_anterior.length > 0 && sinResultado === 0, d.micros_anterior.length
        ? <p className="text-sm">{cumplidos} de {d.micros_anterior.length} cumplidos{sinResultado > 0 && `, ${sinResultado} sin marcar`}. Se marcan en <Link to="/duenos/objetivos" className="underline">Objetivos</Link> yendo a {d.nombre_anterior}.</p>
        : <p className="text-sm text-ahg-text/55">No hubo microobjetivos en {d.nombre_anterior}.</p>)}

      {paso(4, `Objetivo y microobjetivos de ${d.nombre_mes}`, conObjetivo >= 7, (
        <div className="grid gap-2 text-sm">
          <p>{conObjetivo} de {d.unidades.length} unidades con objetivo. <Link to="/duenos/objetivos" className="underline">Cargar en Objetivos</Link></p>
          <div className="flex flex-wrap gap-2">
            {d.por_dueno.map(u => <span key={u.id} className="text-xs rounded-full px-2.5 py-1 border border-ahg-accent/60">{u.nombre} {u.micros} de {d.max_micros}</span>)}
          </div>
        </div>
      ))}

      <section className="card p-4 grid gap-2">
        <label className="text-sm font-semibold" htmlFor="rm-notas">Lo que se decidió</label>
        <textarea id="rm-notas" className="input text-sm" rows={4} maxLength={4000} value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => notas !== (r.notas || '') && guardar({ notas })} />
        {!r.terminada_at && (
          <div>
            <button type="button" className="btn-primary" disabled={!d.cierre.completo} onClick={() => guardar({ notas, terminar: true })}>Terminar la reunión</button>
            {!d.cierre.completo && <span className="text-xs text-ahg-text/55 ml-3">Primero tienen que estar los números de {d.nombre_anterior}.</span>}
          </div>
        )}
      </section>
    </div>
  );
}
