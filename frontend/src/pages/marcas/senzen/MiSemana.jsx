import { useEffect, useState } from 'react';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { TAREAS, fechaCorta, sumarDias, fmt, SENZEN, NUNITO } from './senzenUtils';
import { NuevaVisita, ContarComoFue, resultadoTexto } from './reportes';

// El inicio de Pepa (23/10/2026): su semana como calendario de tareas, o como tablero.
// Dos clases de tarea: visitar comercios nuevos (los dueños dicen cuántos) y contactar a
// clientes que ya compraron. Cada reporte prueba que hizo la tarea y lo aprueba un dueño.
// No muestra plata del negocio.
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESTADO = {
  pend: ['Para hacer', 'bg-stone-100 text-stone-600'],
  atr:  ['Atrasada', 'bg-red-50 text-red-700'],
  esp:  ['Esperando aprobación', 'bg-sky-50 text-sky-800'],
  ok:   ['Aprobada', 'bg-green-50 text-green-800'],
  dev:  ['Te pidieron más', 'bg-amber-50 text-amber-800'],
};
const estadoDe = (t, hoy) => (t.estado === 'pend' && t.vence < hoy ? 'atr' : t.estado);
const motivoDe = t => [TAREAS[t.tipo], t.encargada_por && `de ${t.encargada_por.replace(/\s*\(.*\)$/, '')}`].filter(Boolean).join(' ') + (t.nota ? `: ${t.nota}` : '');
const ESTADO_NUEVO = { pendiente: 'esp', aprobado: 'ok', devuelto: 'dev' };

const IcoPuerta = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 14.5h10M4.5 14.5V2.5h7v12" /><circle cx="9.5" cy="8.5" r=".7" fill="currentColor" /></svg>;
const IcoTel = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 2.5h2.2l1.1 3-1.5 1a8 8 0 0 0 4.2 4.2l1-1.5 3 1.1v2.2a1 1 0 0 1-1 1A11 11 0 0 1 2.5 3.5a1 1 0 0 1 1-1z" /></svg>;

function Etiqueta({ e, vence }) {
  const [txt, cls] = ESTADO[e];
  return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>{e === 'atr' ? `Era para el ${fechaCorta(vence)}` : txt}</span>;
}

function Area({ icono, titulo, derecha, children }) {
  return (
    <section className="bg-white rounded-xl border border-ahg-accent/40 p-3.5 grid gap-2.5">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-lg grid place-items-center" style={{ background: '#e5eee6', color: SENZEN }}>{icono}</span>
        <h2 className="text-[14.5px] font-bold">{titulo}</h2>
        <span className="ml-auto text-xs text-ahg-text/55 tabular-nums">{derecha}</span>
      </div>
      {children}
    </section>
  );
}

function TarjetaContacto({ t, hoy, onContar, onCorregir }) {
  const e = estadoDe(t, hoy);
  return (
    <div className="rounded-[10px] border border-ahg-accent/40 px-3 py-2.5 grid gap-1.5">
      <div className="flex gap-2 items-start"><b className="flex-1 min-w-0 text-sm">{t.nombre}</b><Etiqueta e={e} vence={t.vence} /></div>
      <p className="text-xs text-ahg-text/60">{motivoDe(t)}</p>
      <p className="text-xs text-ahg-text/60">
        {t.ultima_compra ? `Última compra: ${fechaCorta(t.ultima_compra)}${t.ultimo_monto != null ? ` · ${fmt(t.ultimo_monto)}` : ''}` : 'Todavía no compró'}{t.localidad ? ` · ${t.localidad}` : ''}
      </p>
      {t.contacto && <p className="text-xs"><b>{resultadoTexto(t.contacto)}:</b> <span className="text-ahg-text/70">{t.contacto.comentario}</span></p>}
      {e === 'dev' && t.contacto?.respuesta && <p className="text-xs rounded-lg px-2 py-1.5 bg-amber-50 text-amber-800"><b>Te pidieron:</b> {t.contacto.respuesta}</p>}
      {['pend', 'atr'].includes(e) && <div><button onClick={() => onContar(t)} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: SENZEN }}>Contar cómo fue</button></div>}
      {e === 'dev' && <div><button onClick={() => onCorregir(t)} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: SENZEN }}>Corregir</button></div>}
    </div>
  );
}

export default function MiSemana() {
  const { user } = useAuth();
  const [D, setD] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('senzen-vista') || 'cal'; } catch { return 'cal'; } });
  const [dia, setDia] = useState(null);
  const [form, setForm] = useState(null);   // { tipo: 'nuevo'|'contacto', tarea?, corregir? }
  const [aviso, setAviso] = useState('');

  const cargar = () => api.get('/senzen/mi-semana').then(r => { setD(r.data.data); setDia(d => d || r.data.data.hoy); })
    .catch(err => setError(err.response?.data?.error || 'No se pudo cargar tu semana'));
  useEffect(() => { cargar(); }, []);
  const cambiarVista = v => { setVista(v); try { localStorage.setItem('senzen-vista', v); } catch { /* sin almacenamiento */ } };

  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!D) return <div className="space-y-3 max-w-md mx-auto">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-stone-200 rounded-xl animate-pulse" />)}</div>;

  const { hoy, desde, hasta, tareas, nuevos } = D;
  const meta = D.meta_nuevos;
  const dias = DIAS.map((_, i) => sumarDias(desde, i));
  const nombre = (user?.nombre || '').split(' ')[0];
  const hechos = nuevos.length, aprobados = nuevos.filter(n => n.aprobacion === 'aprobado').length;
  const faltan = meta ? Math.max(0, meta - hechos) : null;
  const listo = msj => { setForm(null); setAviso(msj); cargar(); setTimeout(() => setAviso(''), 4000); };
  const contar = t => setForm({ tipo: 'contacto', tarea: { ...t, motivo_texto: motivoDe(t) } });
  const corregir = t => setForm({ tipo: 'contacto', corregir: { ...t.contacto, nombre: t.nombre } });

  // Lo atrasado y lo devuelto se ven en el día de hoy, para que no se pierda.
  const delDia = tareas.filter(t => dia === hoy
    ? (t.vence === hoy || (t.vence < hoy && ['pend', 'dev'].includes(t.estado)) || (t.estado === 'dev'))
    : t.vence === dia);

  const bloqueNuevos = (
    <Area icono={<IcoPuerta />} titulo="Comercios nuevos para visitar" derecha="esta semana">
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] leading-none font-extrabold tabular-nums" style={NUNITO}>{hechos}{meta ? <span className="text-sm text-ahg-text/55"> de {meta}</span> : null}</span>
        <span className="text-xs text-ahg-text/60">{meta == null ? 'los dueños todavía no pusieron cuántos' : faltan ? `te ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}` : '¡completaste la semana!'}{hechos > aprobados ? ` · ${hechos - aprobados} esperando aprobación` : ''}</span>
      </div>
      {meta ? <div className="h-2 rounded bg-stone-100 overflow-hidden flex" aria-hidden="true"><b style={{ width: `${100 * aprobados / meta}%`, background: SENZEN }} /><b style={{ width: `${100 * (hechos - aprobados) / meta}%`, background: '#a9c2ad' }} /></div> : null}
      {(faltan === null || faltan > 0) && (
        <button onClick={() => setForm({ tipo: 'nuevo' })} className="w-full rounded-xl py-3 font-semibold text-white" style={{ background: SENZEN }}>
          Cargar visita a un comercio nuevo{meta ? ` · ${hechos + 1} de ${meta}` : ''}
        </button>
      )}
      {nuevos.map(n => {
        const e = ESTADO_NUEVO[n.aprobacion];
        return (
          <div key={n.id} className="rounded-[10px] border border-ahg-accent/40 px-3 py-2.5 grid gap-1">
            <div className="flex gap-2 items-start"><b className="flex-1 min-w-0 text-sm">{n.nombre}</b><Etiqueta e={e} /></div>
            <p className="text-xs text-ahg-text/60">{fechaCorta(n.fecha)}{n.localidad ? ` · ${n.localidad}` : ''} · {resultadoTexto(n, 'nuevo')}</p>
            {e === 'dev' && <><p className="text-xs rounded-lg px-2 py-1.5 bg-amber-50 text-amber-800"><b>Te pidieron:</b> {n.respuesta}</p>
              <div><button onClick={() => setForm({ tipo: 'nuevo', corregir: n })} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: SENZEN }}>Corregir</button></div></>}
          </div>
        );
      })}
    </Area>
  );

  let cuerpo;
  if (vista === 'cal') {
    cuerpo = (
      <>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Días de la semana">
          {dias.map((d, i) => {
            const ts = tareas.filter(t => t.vence === d);
            return (
              <button key={d} onClick={() => setDia(d)} aria-pressed={d === dia}
                      className={`rounded-[10px] py-1.5 grid justify-items-center gap-0.5 border ${d === dia ? 'bg-white border-ahg-accent/60 shadow-sm' : 'border-transparent'}`}>
                <span className="text-[10.5px] uppercase tracking-wide text-ahg-text/55">{DIAS[i]}</span>
                <b className="text-base tabular-nums" style={d === hoy ? { color: SENZEN } : undefined}>{Number(d.slice(8))}</b>
                <span className="flex gap-0.5 h-1.5">{ts.map(t => {
                  const e = estadoDe(t, hoy);
                  return <i key={t.id} className="w-[5px] h-[5px] rounded-full" style={{ background: e === 'atr' ? '#b03a2a' : ['ok', 'esp'].includes(e) ? '#c9c7c1' : SENZEN }} />;
                })}</span>
              </button>
            );
          })}
        </div>
        {bloqueNuevos}
        <Area icono={<IcoTel />} titulo={dia === hoy ? 'Clientes para contactar hoy' : `Clientes para contactar el ${DIAS[dias.indexOf(dia)]?.toLowerCase()} ${Number(dia.slice(8))}`}
              derecha={`${delDia.filter(t => ['esp', 'ok'].includes(t.estado)).length} de ${delDia.length} hechas`}>
          {delDia.length ? delDia.map(t => <TarjetaContacto key={t.id} t={t} hoy={hoy} onContar={contar} onCorregir={corregir} />)
            : <p className="text-sm text-ahg-text/55 text-center border border-dashed border-ahg-accent/60 rounded-[10px] py-3">Nadie para contactar este día.</p>}
        </Area>
      </>
    );
  } else {
    // Tablero: todas las tareas de la semana, por cómo están.
    const todas = [
      ...tareas.map(t => ({ clave: `t${t.id}`, e: estadoDe(t, hoy), t })),
      ...nuevos.map(n => ({ clave: `n${n.id}`, e: ESTADO_NUEVO[n.aprobacion], n })),
      ...Array.from({ length: faltan || 0 }, (_, i) => ({ clave: `h${i}`, e: 'pend', hueco: hechos + i + 1 })),
    ];
    const cols = [['Para hacer', ['pend', 'atr', 'dev'], '#8d9095'], ['Esperando aprobación', ['esp'], '#2d68b0'], ['Aprobadas', ['ok'], '#3f6e3b']];
    cuerpo = (
      <div className="grid grid-flow-col auto-cols-[86%] gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1.5">
        {cols.map(([titulo, es, color]) => {
          const ts = todas.filter(x => es.includes(x.e));
          return (
            <div key={titulo} className="snap-start rounded-xl border border-ahg-accent/40 p-2.5 grid gap-2 content-start" style={{ background: 'rgba(225,223,218,0.45)' }}>
              <h3 className="text-[13px] font-semibold flex items-center gap-1.5 px-0.5"><i className="w-2 h-2 rounded-full" style={{ background: color }} />{titulo} <span className="text-ahg-text/50 font-normal">{ts.length}</span></h3>
              {ts.map(x => x.t ? <TarjetaContacto key={x.clave} t={x.t} hoy={hoy} onContar={contar} onCorregir={corregir} />
                : x.n ? (
                  <div key={x.clave} className="bg-white rounded-[10px] border border-ahg-accent/40 px-3 py-2.5 grid gap-1">
                    <div className="flex gap-2"><b className="flex-1 text-sm">{x.n.nombre}</b>{x.e === 'dev' && <Etiqueta e="dev" />}</div>
                    <p className="text-xs text-ahg-text/60">Comercio nuevo · {resultadoTexto(x.n, 'nuevo')}</p>
                    {x.e === 'dev' && <div><button onClick={() => setForm({ tipo: 'nuevo', corregir: x.n })} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: SENZEN }}>Corregir</button></div>}
                  </div>
                ) : (
                  <div key={x.clave} className="bg-white rounded-[10px] border border-dashed border-ahg-accent/70 px-3 py-2.5 grid gap-1.5">
                    <b className="text-sm">Comercio nuevo {x.hueco} de {meta}</b>
                    <p className="text-xs text-ahg-text/60">Elegí uno y cargá la visita.</p>
                    <div><button onClick={() => setForm({ tipo: 'nuevo' })} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: SENZEN }}>Cargar visita</button></div>
                  </div>
                ))}
              {!ts.length && <p className="text-xs text-ahg-text/50 text-center border border-dashed border-ahg-accent/60 rounded-[10px] py-3">Nada acá</p>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto grid gap-3.5 pb-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: SENZEN }}>Senzen</p>
          <h1 className="text-2xl font-extrabold text-ahg-text" style={NUNITO}>Hola{nombre ? `, ${nombre}` : ''}</h1>
          <p className="text-xs text-ahg-text/55">Semana del {fechaCorta(desde)} al {fechaCorta(hasta)}</p>
        </div>
        <div className="inline-flex bg-ahg-accent/35 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Cómo ver la semana">
          {[['cal', 'Calendario'], ['kan', 'Tablero']].map(([k, l]) => (
            <button key={k} onClick={() => cambiarVista(k)} aria-pressed={vista === k}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${vista === k ? 'bg-white text-ahg-text shadow-sm' : 'text-ahg-text/60'}`}>{l}</button>
          ))}
        </div>
      </div>
      {aviso && <p className="text-sm rounded-lg px-3 py-2 bg-green-50 text-green-800 font-medium">{aviso}</p>}
      {cuerpo}
      {form?.tipo === 'nuevo' && <NuevaVisita corregir={form.corregir} paso={!form.corregir && meta ? `${hechos + 1} de ${meta}` : null}
        onCerrar={() => setForm(null)} onListo={() => listo(form.corregir ? 'Enviado de nuevo. Lo vuelve a mirar un dueño.' : `Listo${meta ? `, van ${hechos + 1} de ${meta}` : ''}. Un dueño lo tiene que aprobar.`)} />}
      {form?.tipo === 'contacto' && <ContarComoFue tarea={form.tarea} corregir={form.corregir}
        onCerrar={() => setForm(null)} onListo={() => listo(form.corregir ? 'Enviado de nuevo. Lo vuelve a mirar un dueño.' : 'Enviado. Cuando un dueño lo apruebe, queda hecho.')} />}
    </div>
  );
}
