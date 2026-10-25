import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Cargando, MensajeError, ddmm } from '../tareas/comunes';
import { Modal } from '../tareas/kanban';
import { Ficha, NuevoMicro } from '../tareas/TableroDuenos';
import { Semanal, Mensual, PedirAyuda } from './Reuniones';
import { NEG_COLOR, SEM, PuntoSemaforo, pct, pesos, sumarMes } from './comun';

// Dueños → Objetivos del mes (24/10/2026). Una sola pantalla, como la diapositiva 8 de
// "Crecer ordenados": cada unidad con su objetivo arriba y, abajo, una caja por
// microobjetivo con su dueño y sus tareas, todas a la misma altura. Todo se toca: el
// objetivo, el microobjetivo y cada tarea (que se abre como conversación). Un mes que ya
// pasó se ve igual, con lo que dio: ese es el historial.
const EST = { nueva: 'Sin empezar', en_curso: 'En proceso', por_aprobar: 'Esperando cierre', terminada: 'Cerrada' };
const EST_CLS = { nueva: 'bg-stone-100 text-stone-600', en_curso: 'bg-[#e3ecf6] text-[#2d68b0]', por_aprobar: 'bg-amber-100 text-amber-800' };
const VISTAS = [['mes', 'El mes'], ['reunion', 'Reunión del miércoles'], ['historial', 'Historial']];
const puntosTxt = v => `${v > 0 ? '+' : ''}${String(Math.round(v * 10) / 10).replace('.', ',')}`;
const aporteTxt = m => (m.aporte_monto ? `+${pesos(m.aporte_monto)}` : m.aporte_pts != null ? `${puntosTxt(m.aporte_pts)} punto${Math.abs(m.aporte_pts) === 1 ? '' : 's'}` : '');
const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : '');

export default function Mes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mes, setMes] = useState(null);
  const [vista, setVista] = useState('mes');
  const [filtro, setFiltro] = useState('todos');
  const [d, setD] = useState(null);
  const [base, setBase] = useState(null);   // lo del tablero de dueños: dueños, áreas, locales
  const [error, setError] = useState('');
  const [ficha, setFicha] = useState(null);
  const [micro, setMicro] = useState(null);
  const [objetivo, setObjetivo] = useState(null);
  const [nuevoMicro, setNuevoMicro] = useState(null);
  const [nuevaTarea, setNuevaTarea] = useState(null);

  function cargar(m = mes) {
    api.get('/duenos/mes', { params: m ? { mes: m } : {} })
      .then(r => { setD(r.data.data); setMes(r.data.data.mes); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'No se pudo cargar el mes'));
    api.get('/tareas-duenos').then(r => setBase(r.data.data)).catch(() => {});
  }
  useEffect(() => cargar(), []);
  const irMes = m => { setD(null); setMes(m); cargar(m); };
  const abrirTarea = t => (t.de === 'gordo' ? navigate(`/tareas/${t.id}`) : setFicha(t.id));
  const microDe = id => d?.unidades.flatMap(u => u.micros).find(m => m.id === id);

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5 max-w-[1280px]">
      <div className="rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ background: '#55585c' }}>
        <div className="flex items-center gap-2.5">
          <button type="button" aria-label="Mes anterior" disabled={vista !== 'mes'} onClick={() => irMes(sumarMes(mes, -1))}
                  className="w-8 h-8 rounded-lg border border-white/25 bg-white/10 text-white text-lg disabled:opacity-30">‹</button>
          <div className="min-w-[150px] text-center">
            <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>Dueños · {mes.slice(0, 4)}</p>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{vista === 'historial' ? 'Historial' : vista === 'reunion' ? `Reunión ${ddmm(d.semana)}` : cap(d.nombre_mes)}</h1>
          </div>
          <button type="button" aria-label="Mes siguiente" disabled={vista !== 'mes'} onClick={() => irMes(sumarMes(mes, 1))}
                  className="w-8 h-8 rounded-lg border border-white/25 bg-white/10 text-white text-lg disabled:opacity-30">›</button>
          {vista === 'mes' && d.cerrado && <span className="text-xs text-white bg-white/15 rounded-full px-2.5 py-1">Mes cerrado · queda guardado así</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-white/10 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Qué ver">
            {VISTAS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={vista === k} onClick={() => { setVista(k); if (k !== 'mes' && !d.es_plan) irMes(null); }}
                      className={`rounded-lg px-3 py-1.5 text-[13px] ${vista === k ? 'bg-white text-ahg-text font-semibold' : 'text-white/75 hover:text-white'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'reunion' && <Reunion />}
      {vista === 'historial' && <Historial onAbrirMes={m => { setVista('mes'); irMes(m); }} />}
      {vista === 'mes' && (
        <>
          {!d.cerrado && (
            <div className="flex justify-end">
              <div className="inline-flex bg-ahg-accent/35 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Qué microobjetivos ver">
                {[['todos', 'Todo'], ['mios', 'Lo mío']].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}
                          className={`rounded-lg px-3 py-1.5 text-[13px] ${filtro === k ? 'bg-white text-ahg-text font-semibold shadow-sm' : 'text-ahg-text/60'}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {d.unidades.length === 0 && (
            <div className="card p-5 text-sm text-ahg-text/70">
              {d.cerrado ? `En ${d.nombre_mes} no hubo objetivos cargados.` : `Todavía no hay objetivos para ${d.nombre_mes}. Elegí una unidad abajo y cargá su objetivo; después, los microobjetivos de cada dueño.`}
            </div>
          )}
          {d.unidades.map(u => {
            const ms = u.micros.filter(m => filtro === 'todos' || m.dueno_id === user.id);
            if (filtro === 'mios' && !ms.length) return null;
            return (
              <Unidad key={u.k} u={u} d={d} micros={ms} onObjetivo={() => setObjetivo(u)} onMicro={m => setMicro(m.id)}
                      onTarea={abrirTarea} onNuevaTarea={m => setNuevaTarea({ m, nueva: true })} onNuevoMicro={() => setNuevoMicro(u)} />
            );
          })}
          {!d.cerrado && d.sin_objetivo.length > 0 && filtro === 'todos' && (
            <div className="card p-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-ahg-text/60">Sin objetivo en {d.nombre_mes}:</span>
              {d.sin_objetivo.map(u => (
                <button key={u.k} type="button" onClick={() => setObjetivo(u)} className="text-sm rounded-full border border-ahg-accent/70 bg-white px-3 py-1 hover:border-ahg-text">
                  {u.nombre} · cargar
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {ficha && base && <Ficha id={ficha} d={base} user={user} onCerrar={() => { setFicha(null); cargar(); }} onCambio={() => {}} />}
      {micro && microDe(micro) && (
        <FichaMicro m={microDe(micro)} d={d} user={user} onCerrar={() => setMicro(null)} onCambio={() => cargar()}
                    onTarea={m => { setMicro(null); setNuevaTarea({ m, nueva: true }); }} onAyuda={m => { setMicro(null); setNuevaTarea({ m, nueva: false }); }} />
      )}
      {objetivo && <FichaObjetivo u={objetivo} d={d} onCerrar={() => setObjetivo(null)} onListo={() => { setObjetivo(null); cargar(); }} />}
      {nuevoMicro && base && (
        <NuevoMicro d={base} user={user} mes={mes} onCerrar={() => setNuevoMicro(null)} onListo={() => { setNuevoMicro(null); cargar(); }}
                    inicial={{ negocio: nuevoMicro.negocio, local_ids: nuevoMicro.local_id ? [nuevoMicro.local_id] : [] }} />
      )}
      {nuevaTarea && (
        <PedirAyuda m={nuevaTarea.m} d={d} user={user} nueva={nuevaTarea.nueva} onCerrar={() => setNuevaTarea(null)} onListo={() => { setNuevaTarea(null); cargar(); }} />
      )}
    </div>
  );
}

// ── Una unidad: el objetivo y las cajas de los dueños ────────────────────────
function Unidad({ u, d, micros, onObjetivo, onMicro, onTarea, onNuevaTarea, onNuevoMicro }) {
  const color = NEG_COLOR[u.negocio];
  const n = micros.length;
  return (
    <section aria-label={u.nombre}>
      <h2 className="flex items-center gap-2.5 mb-2 text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
        <span className="w-3 h-3 rounded-[3px]" style={{ background: color }} />{u.nombre}
      </h2>
      <BarraObjetivo u={u} d={d} color={color} onClick={onObjetivo} />
      {n > 0 && (
        <>
          <div className="relative h-6 hidden lg:block" aria-hidden="true">
            <span className="absolute left-1/2 top-0 h-3 border-l-2 border-ahg-accent" />
            {n > 1 && <span className="absolute top-3 border-t-2 border-ahg-accent" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />}
          </div>
          <div className="grid gap-3 mt-3 lg:mt-0 grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ '--n': n }}>
            {micros.map(m => <Caja key={m.id} m={m} d={d} color={color} onMicro={onMicro} onTarea={onTarea} onNuevaTarea={onNuevaTarea} n={n} />)}
          </div>
        </>
      )}
      {!d.cerrado && (
        <div className="flex justify-end mt-2">
          <button type="button" onClick={onNuevoMicro} className="text-[12.5px] text-ahg-text/60 border border-dashed border-ahg-accent rounded-lg px-3 py-1 hover:text-ahg-text hover:border-ahg-text/50">
            + Microobjetivo para {u.nombre}
          </button>
        </div>
      )}
    </section>
  );
}

function BarraObjetivo({ u, d, color, onClick }) {
  const o = u.objetivo;
  const v = u.ventas;
  const caja = 'w-full text-left bg-white border border-ahg-accent/50 rounded-2xl px-5 py-3.5 grid gap-2 hover:border-ahg-text/40';
  const linea = (lab, meta, extra) => (
    <p className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center">
      <span className="text-[15px] text-ahg-text/60">{lab}</span>
      <span className="text-[22px] font-extrabold" style={{ fontFamily: 'Nunito, sans-serif' }}>{meta}</span>
      {extra && <span className="text-[15px] text-ahg-text/60">{extra}</span>}
    </p>
  );
  const metaTxt = !o ? null : o.tipo === 'ventas' ? `vender ${pesos(o.monto)}` : o.tipo === 'meta' ? o.texto
    : u.real_anterior != null && !d.cerrado ? `${puntosTxt(o.pct - u.real_anterior)} puntos de rentabilidad` : `${pct(o.pct)} de rentabilidad`;
  if (!o) {
    return <button type="button" onClick={onClick} className={caja} style={{ borderTop: `4px solid ${color}` }}>{linea(`Objetivo de ${d.nombre_mes}:`, 'sin cargar', 'tocá para cargarlo')}</button>;
  }
  if (d.cerrado) {
    const real = o.tipo === 'ventas' ? pesos(v?.total || 0) : o.tipo === 'rent' ? (u.real == null ? 'sin cerrar' : pct(u.real)) : (o.cumplido ? 'Hecho' : o.cumplido === false ? 'No se hizo' : 'sin marcar');
    return (
      <button type="button" onClick={onClick} className={caja} style={{ borderTop: `4px solid ${color}` }}>
        {linea(`Objetivo de ${d.nombre_mes}:`, metaTxt)}
        <p className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="text-ahg-text/60">Resultado: <b className="text-ahg-text">{real}</b></span>
          {u.cumplido != null && <Resultado ok={u.cumplido} />}
        </p>
      </button>
    );
  }
  if (o.tipo === 'ventas' && v) {
    const w = x => `${Math.max(0, Math.min(100, (x / o.monto) * 100))}%`;
    const llega = v.ritmo != null && v.ritmo >= o.monto;
    return (
      <button type="button" onClick={onClick} className={caja} style={{ borderTop: `4px solid ${color}` }}>
        {linea(`Objetivo de ${d.nombre_mes}:`, metaTxt)}
        <div className="grid gap-1.5 max-w-[760px] w-full mx-auto">
          <div className="relative h-2.5 rounded-full bg-ahg-bg border border-ahg-accent/50">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(v.total), background: color }} />
            {v.ritmo != null && <div className="absolute -top-1 -bottom-1 w-[2px] bg-ahg-text" style={{ left: w(Math.min(v.ritmo, o.monto)) }} title="Al ritmo de hoy" />}
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] tabular-nums">
            <span>Vamos <b>{pesos(v.total)}</b> · {Math.round((v.total / o.monto) * 100)} %{v.hasta ? ` al ${ddmm(v.hasta)}` : ''}</span>
            {v.ritmo != null && <span className={llega ? 'text-green-800' : 'text-red-700'}>Al ritmo de hoy cerrás en <b>{pesos(v.ritmo)}</b>{llega ? ' ✓' : ` · faltan ${pesos(o.monto - v.ritmo)}`}</span>}
          </div>
        </div>
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className={caja} style={{ borderTop: `4px solid ${color}` }}>
      {linea(`Objetivo de ${d.nombre_mes}:`, metaTxt, o.tipo === 'rent' && u.real_anterior != null ? `${pct(u.real_anterior)} → ${pct(o.pct)}` : null)}
      <p className="text-[12.5px] text-ahg-text/60 text-center">
        {o.tipo === 'meta' ? 'Se cumple cuando se cierran sus microobjetivos; al terminar el mes se marca si se hizo.'
          : <>Se mide con el EERR de {d.nombre_mes} (listo el 5 del mes siguiente).{v?.dia ? <> Mientras tanto: ventas del mes {pesos(v.total)}{v.var_pct != null ? `, ${v.var_pct >= 0 ? '+' : ''}${String(v.var_pct).replace('.', ',')} % contra ${d.nombre_anterior} al día ${v.dia}` : ''}.</> : ''}</>}
      </p>
    </button>
  );
}

function Resultado({ ok }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-0.5 ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{ok ? '✓ Cumplido' : '✗ No se cumplió'}</span>;
}

function Caja({ m, d, color, onMicro, onTarea, onNuevaTarea }) {
  const hechas = m.tareas.filter(t => t.estado === 'terminada').length;
  return (
    <article className="bg-white border border-ahg-accent/50 rounded-2xl p-3.5 flex flex-col gap-2.5 min-w-0" style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 text-white" style={{ background: '#55585c' }}>{m.dueno}</span>
        <span className="text-xs rounded-full px-2.5 py-0.5 bg-ahg-bg border border-ahg-accent/50">{m.area_label}</span>
        <span className="ml-auto">{d.cerrado ? (m.resultado && <Resultado ok={m.resultado === 'cumplido'} />) : <PuntoSemaforo s={m.semaforo} size={13} />}</span>
      </div>
      <button type="button" onClick={() => onMicro(m)} className="text-left hover:underline">
        <h3 className="font-bold text-[16px] leading-snug" style={{ fontFamily: 'Nunito, sans-serif' }}>{m.nombre}</h3>
      </button>
      {(aporteTxt(m) || m.avance) && (
        <p className="text-[12.5px] text-ahg-text/60">{aporteTxt(m) && <>Aporta <b className="text-ahg-text">{aporteTxt(m)}</b></>}{aporteTxt(m) && m.avance && ' · '}{m.avance && <>Va <b className="text-ahg-text">{m.avance}</b></>}</p>
      )}
      <ul className="grid gap-px">
        {m.tareas.map(t => (
          <li key={`${t.de}-${t.id}`}>
            <button type="button" onClick={() => onTarea(t)} className="w-full grid grid-cols-[16px_1fr] gap-1.5 items-start text-left rounded-lg px-1.5 py-1 hover:bg-ahg-bg text-[13px]">
              <span className="text-center">{t.estado === 'terminada' ? <span className="text-green-700">✓</span> : t.vencida ? <span className="text-red-700 font-bold">!</span> : <span className="text-ahg-text/40">•</span>}</span>
              <span className="min-w-0">
                <span className={t.estado === 'terminada' ? 'line-through text-ahg-text/50' : ''}>{t.titulo}</span>
                {t.quien !== m.dueno && <span className="text-[11.5px] text-ahg-text/50"> · {t.quien}</span>}
                {t.estado !== 'terminada' && (
                  <span className="block mt-0.5">
                    <span className={`text-[11px] font-semibold rounded-md px-1.5 py-px ${t.vencida ? 'bg-red-100 text-red-700' : EST_CLS[t.estado]}`}>
                      {t.vencida ? `Venció ${ddmm(t.plazo)}` : `${EST[t.estado]}${t.plazo ? ` · ${ddmm(t.plazo)}` : ''}`}
                    </span>
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
        {!m.tareas.length && <li className="text-xs text-ahg-text/45 px-1.5">Sin tareas todavía.</li>}
      </ul>
      <div className="mt-auto pt-2 border-t border-ahg-accent/40 grid gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ahg-text/55">{hechas} de {m.tareas.length} tareas cerradas</span>
          {!d.cerrado && <button type="button" className="underline" onClick={() => onNuevaTarea(m)}>+ Tarea</button>}
        </div>
        <div className="h-1.5 rounded-full bg-ahg-bg overflow-hidden"><div className="h-full" style={{ width: `${m.tareas.length ? (hechas / m.tareas.length) * 100 : 0}%`, background: '#9aa08a' }} /></div>
      </div>
    </article>
  );
}

// ── El microobjetivo: semáforo, notas de cada semana, aporte y resultado ─────
function FichaMicro({ m, d, user, onCerrar, onCambio, onTarea, onAyuda }) {
  const mio = m.dueno_id === user.id;
  const [nota, setNota] = useState(m.nota || '');
  const [aporte, setAporte] = useState(aporteTxt(m).replace(/ puntos?$/, ''));
  const [avance, setAvance] = useState(m.avance || '');
  const [msg, setMsg] = useState('');
  async function post(url, body, ok) {
    setMsg('');
    try { await api.post(url, body); onCambio(); if (ok) setMsg(ok); }
    catch (e) { setMsg(e.response?.data?.error || 'No se pudo guardar'); }
  }
  function guardarAporte() {
    const n = Number(String(aporte).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    const enPesos = /\$/.test(aporte) || Math.abs(n) >= 1000;
    post(`/tareas-duenos/microobjetivos/${m.id}`, {
      aporte_pts: !aporte || enPesos ? '' : String(aporte).replace(/[^\d,.-]/g, ''), aporte_monto: aporte && enPesos ? n : '', avance,
    }, 'Guardado');
  }
  const etiq = 'text-xs text-ahg-text/60 grid gap-1';
  return (
    <Modal onCerrar={onCerrar}>
      <div className="p-5 grid gap-3.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 grid gap-1.5">
            <div className="flex gap-1.5 flex-wrap">
              <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 text-white" style={{ background: '#55585c' }}>{m.dueno}</span>
              <span className="text-xs rounded-full px-2.5 py-0.5 bg-ahg-bg border border-ahg-accent/50">{m.area_label}</span>
            </div>
            <h2 className="text-lg font-bold leading-snug" style={{ fontFamily: 'Nunito, sans-serif' }}>{m.nombre}</h2>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-ahg-bg hover:bg-ahg-accent/40 text-lg leading-none">×</button>
        </div>

        {!d.cerrado && (
          <div className="grid gap-1.5">
            <p className="text-xs text-ahg-text/60">Semáforo de esta semana (reunión del {ddmm(d.semana)}) · {mio ? 'lo ponés vos' : `lo pone ${m.dueno}`}</p>
            {mio ? (
              <div className="inline-flex gap-1.5" role="group" aria-label="Semáforo">
                {Object.entries(SEM).map(([k, v]) => (
                  <button key={k} type="button" aria-pressed={m.semaforo === k} onClick={() => post(`/duenos/microobjetivos/${m.id}/semana`, { semana: d.semana, semaforo: m.semaforo === k ? null : k })}
                          className={`text-xs rounded-full px-3 py-1 border ${m.semaforo === k ? `${v.cls} border-transparent font-semibold` : 'border-ahg-accent/60 text-ahg-text/60'}`}>{v.txt}</button>
                ))}
              </div>
            ) : <span className="text-sm font-semibold">{m.semaforo ? SEM[m.semaforo].txt : 'Sin dato'}</span>}
            {mio && (
              <div className="flex gap-2 items-start">
                <textarea id="fm-nota" className="input !py-1.5 text-sm" rows={2} maxLength={600} value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota de la semana: qué se hizo y qué traba" />
                <button type="button" className="btn-secondary !py-1.5" onClick={() => post(`/duenos/microobjetivos/${m.id}/semana`, { semana: d.semana, nota }, 'Nota guardada')}>Guardar</button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-1.5">
          <p className="text-xs text-ahg-text/60">Notas de cada semana</p>
          {m.semanas.length ? m.semanas.map(s => (
            <div key={s.semana} className="grid grid-cols-[auto_1fr] gap-x-2.5 items-start text-sm">
              <span className="mt-1"><PuntoSemaforo s={s.semaforo} size={11} /></span>
              <span><b className="text-xs">Semana del {ddmm(s.semana)}</b>{s.nota ? <span className="block">{s.nota}</span> : <span className="block text-ahg-text/45">Sin nota</span>}</span>
            </div>
          )) : <p className="text-sm text-ahg-text/45">Todavía no hay notas.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={etiq}>Cuánto aporta
            <input id="fm-aporte" className="input !py-1.5" value={aporte} onChange={e => setAporte(e.target.value)} placeholder="+1 o $ 500.000" />
          </label>
          <label className={etiq}>Cómo va
            <input id="fm-avance" className="input !py-1.5" maxLength={120} value={avance} onChange={e => setAvance(e.target.value)} placeholder="Ej.: 2 de 5 clientes" />
          </label>
        </div>
        <div><button type="button" className="btn-secondary !py-1.5 text-sm" onClick={guardarAporte}>Guardar aporte y avance</button></div>

        <div className="grid gap-1.5 border-t border-ahg-accent/40 pt-3">
          <p className="text-xs text-ahg-text/60">Al cerrar el mes: ¿se cumplió?</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            {[['cumplido', 'Cumplido'], ['no_cumplido', 'No se cumplió']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={m.resultado === k} onClick={() => post(`/duenos/microobjetivos/${m.id}/resultado`, { resultado: m.resultado === k ? null : k })}
                      className={`text-xs rounded-full px-3 py-1 border ${m.resultado === k ? (k === 'cumplido' ? 'bg-green-100 border-green-300 text-green-800 font-semibold' : 'bg-red-100 border-red-200 text-red-700 font-semibold') : 'border-ahg-accent/60 text-ahg-text/60'}`}>{l}</button>
            ))}
            {m.pasado ? <span className="text-xs text-ahg-text/50 ml-1">Pasado al mes siguiente</span>
              : <button type="button" className="text-xs underline text-ahg-text/60 ml-1" onClick={() => post(`/duenos/microobjetivos/${m.id}/pasar`, {}, 'Pasado al mes siguiente con sus tareas abiertas')}>Pasar al mes siguiente</button>}
          </div>
        </div>

        {msg && <p className="text-sm text-ahg-text/70">{msg}</p>}
        {!d.cerrado && (
          <div className="flex flex-wrap gap-2">
            {mio && <button type="button" className="btn-primary" onClick={() => onAyuda(m)}>Pedir ayuda</button>}
            <button type="button" className="btn-secondary" onClick={() => onTarea(m)}>+ Tarea</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── El objetivo de una unidad ────────────────────────────────────────────────
function FichaObjetivo({ u, d, onCerrar, onListo }) {
  const o = u.objetivo;
  const general = u.k === 'general';
  const [tipo, setTipo] = useState(general ? 'meta' : o?.tipo || 'ventas');
  const valorDe = t => (!o || o.tipo !== t ? '' : t === 'rent' ? String(o.pct).replace('.', ',') : t === 'ventas' ? Math.round(o.monto).toLocaleString('es-AR') : o.texto);
  const [valor, setValor] = useState(valorDe(tipo));
  const [error, setError] = useState('');
  async function guardar(e) {
    e.preventDefault(); setError('');
    try { await api.put(`/duenos/objetivos/${u.k}/${d.mes}`, { tipo, valor }); onListo(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }
  async function marcar(cumplido) {
    try { await api.put(`/duenos/objetivos/${u.k}/${d.mes}`, { cumplido }); onListo(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }
  const etiq = 'text-xs text-ahg-text/60 grid gap-1';
  return (
    <Modal onCerrar={onCerrar}>
      <form onSubmit={guardar} className="p-5 grid gap-3">
        <p className="font-semibold">Objetivo de {d.nombre_mes} · {u.nombre}</p>
        {!general && (
          <label className={etiq}>Qué se mide
            <select id="fo-tipo" className="input" value={tipo} onChange={e => { setTipo(e.target.value); setValor(valorDe(e.target.value)); }}>
              <option value="ventas">Vender una cifra en el mes (en pesos, se sigue en vivo)</option>
              <option value="rent">Rentabilidad (% de ganancia, sale del EERR al cerrar el mes)</option>
              <option value="meta">Algo que se cumple o no</option>
            </select>
          </label>
        )}
        <label className={etiq}>{tipo === 'ventas' ? 'Cuánto hay que vender ($, con IVA)' : tipo === 'rent' ? 'Rentabilidad objetivo (%)' : 'El objetivo'}
          <input id="fo-valor" className="input" value={valor} onChange={e => setValor(e.target.value)} autoFocus
                 inputMode={tipo === 'meta' ? 'text' : 'decimal'} placeholder={tipo === 'ventas' ? 'Ej.: 10.000.000' : tipo === 'rent' ? 'Ej.: 14' : 'Ej.: ordenar los papeles de la sociedad'} />
        </label>
        {tipo === 'rent' && u.real_anterior != null && <p className="text-xs text-ahg-text/55 -mt-1">Real de {d.nombre_anterior}: {pct(u.real_anterior)}.</p>}
        {o?.tipo === 'meta' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ahg-text/60">¿Se hizo?</span>
            {[[true, 'Sí'], [false, 'No']].map(([k, l]) => (
              <button key={l} type="button" aria-pressed={o.cumplido === k} onClick={() => marcar(o.cumplido === k ? null : k)}
                      className={`text-xs rounded-full px-3 py-1 border ${o.cumplido === k ? 'bg-ahg-text text-white border-transparent' : 'border-ahg-accent/60'}`}>{l}</button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">Guardar</button>
          {o && <button type="button" className="btn-secondary" onClick={() => { setValor(''); api.put(`/duenos/objetivos/${u.k}/${d.mes}`, { tipo, valor: '' }).then(onListo); }}>Sacar el objetivo</button>}
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Reunión ──────────────────────────────────────────────────────────────────
function Reunion() {
  const [cual, setCual] = useState('semanal');
  return (
    <div className="space-y-3 max-w-[1100px]">
      <div className="inline-flex bg-ahg-accent/35 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Qué reunión">
        {[['semanal', 'Semanal · miércoles'], ['mensual', 'Mensual']].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={cual === k} onClick={() => setCual(k)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] ${cual === k ? 'bg-white text-ahg-text font-semibold shadow-sm' : 'text-ahg-text/60'}`}>{l}</button>
        ))}
      </div>
      {cual === 'semanal' ? <Semanal /> : <Mensual />}
    </div>
  );
}

// ── Historial: lo que se cumplió cada mes ────────────────────────────────────
function Historial({ onAbrirMes }) {
  const [h, setH] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/duenos/historial').then(r => setH(r.data.data)).catch(e => setError(e.response?.data?.error || 'No se pudo cargar el historial')); }, []);
  if (error) return <MensajeError texto={error} />;
  if (!h) return <Cargando />;
  const meses = [...h.meses].reverse();
  if (!meses.length) return <div className="card p-5 text-sm text-ahg-text/65">Cuando termine el primer mes con objetivos, acá queda guardado lo que se cumplió. Después cada mes se suma solo.</div>;
  const unidades = [...new Map(meses.flatMap(m => m.unidades).map(u => [u.k, u])).values()];
  const barra = (ok, tot) => { const p = tot ? Math.round((ok / tot) * 100) : 0; return <span className="flex items-center gap-2"><span className="flex-1 min-w-[60px] h-2 rounded-full bg-ahg-bg overflow-hidden"><span className="block h-full" style={{ width: `${p}%`, background: '#9aa08a' }} /></span><b className="tabular-nums">{p} %</b></span>; };
  const valor = (o, real) => (o.tipo === 'ventas' ? <>{pesos(real || 0)} <span className="text-ahg-text/45">/ {pesos(o.monto)}</span></> : o.tipo === 'rent' ? <>{real == null ? 'sin cerrar' : pct(real)} <span className="text-ahg-text/45">/ {pct(o.pct)}</span></> : o.texto);
  const th = 'px-3 py-2.5 text-[11px] uppercase tracking-wider text-ahg-text/50 font-semibold text-left';
  return (
    <div className="space-y-4">
      <p className="text-sm text-ahg-text/65">Cada mes queda guardado tal cual: el objetivo de cada unidad, lo que dio y si cada microobjetivo se cumplió. Tocá un mes para verlo como era.</p>
      <section className="card p-4 sm:p-5 grid gap-3">
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Microobjetivos cumplidos por dueño</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px] tabular-nums">
          <thead><tr className="border-b border-ahg-accent/40"><th className={th}>Dueño</th>{meses.map(m => <th key={m.mes} className={`${th} text-center`}><button type="button" className="underline capitalize" onClick={() => onAbrirMes(m.mes)}>{m.nombre_mes}</button></th>)}<th className={th}>Total</th></tr></thead>
          <tbody>
            {h.duenos.map(du => {
              const filas = meses.map(m => m.por_dueno.find(x => x.id === du.id));
              const ok = filas.reduce((s, f) => s + (f?.cumplidos || 0), 0), tot = filas.reduce((s, f) => s + (f?.total || 0), 0);
              return (
                <tr key={du.id} className="border-b border-ahg-accent/20">
                  <td className="px-3 py-2.5 font-semibold">{du.nombre}</td>
                  {filas.map((f, i) => <td key={i} className="px-3 py-2.5 text-center">{f?.total ? <><b>{f.cumplidos}</b> de {f.total}</> : <span className="text-ahg-text/40">—</span>}</td>)}
                  <td className="px-3 py-2.5">{barra(ok, tot)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
      <section className="card p-4 sm:p-5 grid gap-3">
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Objetivo de cada unidad · resultado / objetivo</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px] tabular-nums">
          <thead><tr className="border-b border-ahg-accent/40"><th className={th}>Unidad</th>{meses.map(m => <th key={m.mes} className={th}><button type="button" className="underline capitalize" onClick={() => onAbrirMes(m.mes)}>{m.nombre_mes}</button></th>)}</tr></thead>
          <tbody>
            {unidades.map(u => (
              <tr key={u.k} className="border-b border-ahg-accent/20">
                <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2 font-semibold"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: NEG_COLOR[u.negocio] }} />{u.nombre}</span></td>
                {meses.map(m => {
                  const x = m.unidades.find(y => y.k === u.k);
                  return <td key={m.mes} className="px-3 py-2.5">{x ? <><span className={x.cumplido ? 'text-green-700' : x.cumplido === false ? 'text-red-700' : 'text-ahg-text/40'}>{x.cumplido ? '✓' : x.cumplido === false ? '✗' : '·'}</span> {valor(x.objetivo, x.real)}</> : <span className="text-ahg-text/40">—</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
