import { useEffect, useState } from 'react';
import api from '../../../api';
import { Titulo, Cargando, MensajeError } from '../../tareas/comunes';
import { TAREAS, MEDIOS, label, fechaCorta, sumarDias, hoyLocal, repartir, DIAS_SEMANA, SENZEN } from './senzenUtils';
import { FotoReporte, resultadoTexto } from './reportes';

// La semana de Pepa para los dueños (23/10/2026): aprobar cada reporte o devolvérselo, decir
// cuántos comercios nuevos tiene que visitar, encargarle clientes y ver cómo va.
const quien = n => String(n || '').replace(/\s*\(.*\)$/, '');

function Reporte({ k, onCambio }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function responder(accion) {
    setError('');
    if (accion === 'devolver' && texto.trim().length < 3) return setError('Escribí qué le pedís.');
    setOcupado(true);
    try { await api.post(`/senzen/contactos/${k.id}/aprobar`, { accion, texto }); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); setOcupado(false); }
  }
  const nuevo = k.tipo === 'nuevo';
  return (
    <div className="rounded-xl border border-ahg-accent/40 p-3 grid gap-2">
      <div className="flex gap-2 items-baseline">
        <b className="flex-1 min-w-0 text-sm">{nuevo ? `Comercio nuevo: ${k.nombre}` : k.nombre}</b>
        <span className="text-xs text-ahg-text/50 tabular-nums">{fechaCorta(k.fecha)} · {quien(k.quien)}</span>
      </div>
      <p className="text-xs text-ahg-text/60">
        {nuevo ? [k.localidad, k.direccion, k.contacto, k.telefono].filter(Boolean).join(' · ') || 'Sin más datos del comercio'
          : [k.tarea ? TAREAS[k.tarea.tipo] : 'Contacto sin tarea', k.tarea?.nota].filter(Boolean).join(': ')}
      </p>
      <p className="text-sm"><b>{nuevo ? 'Visita' : label(MEDIOS, k.medio)} · {resultadoTexto(k, k.tipo)}</b> — {k.comentario}</p>
      {k.respuesta && <p className="text-xs text-ahg-text/55">Antes le habían pedido: {k.respuesta}</p>}
      {k.foto ? <FotoReporte id={k.id} /> : <p className="text-xs text-ahg-text/45">Sin foto.</p>}
      <textarea id={`dev-${k.id}`} className="input text-sm" rows={2} maxLength={500} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Si falta algo, escribí qué le pedís" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2 flex-wrap">
        <button disabled={ocupado} onClick={() => responder('aprobar')} className="text-sm font-semibold px-3.5 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: SENZEN }}>Aprobar</button>
        <button disabled={ocupado} onClick={() => responder('devolver')} className="btn-secondary !py-2 text-sm">Pedirle más</button>
      </div>
    </div>
  );
}

// Cuántos comercios nuevos tiene que visitar, por semana o por día, siempre repartidos día
// por día (Martín, 23/10/2026: "que quede bien dividido"). Cada cambio se guarda solo.
function PlanNuevos({ desde, plan, hechos, hoy, onGuardar }) {
  const [modo, setModo] = useState(plan.modo || 'semana');
  const porDia = plan.por_dia || [0, 0, 0, 0, 0, 0, 0];
  const total = plan.por_dia ? porDia.reduce((a, v) => a + v, 0) : (plan.meta || 0);
  // Los días que sale: los que ya tienen algo, o de lunes a viernes.
  const [dias, setDias] = useState(() => {
    const con = porDia.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0);
    return con.length ? con : [0, 1, 2, 3, 4];
  });
  const fechas = DIAS_SEMANA.map((_, i) => sumarDias(desde, i));
  const mostrado = modo === 'semana' ? repartir(total, dias) : porDia;
  const guardarSemana = (t, ds) => onGuardar(desde, { modo: 'semana', por_dia: repartir(Math.max(0, t), ds) });
  const cambiarDia = (i, v) => onGuardar(desde, { modo: 'dia', por_dia: porDia.map((x, j) => (j === i ? Math.max(0, v) : x)) });
  const boton = 'w-8 h-8 text-lg leading-none rounded-lg hover:bg-ahg-bg';
  return (
    <div className="grid gap-3">
      <div className="inline-flex bg-ahg-accent/35 rounded-[10px] p-[3px] gap-0.5 justify-self-start" role="group" aria-label="Cómo cargarlo">
        {[['semana', 'Por semana'], ['dia', 'Por día']].map(([k, l]) => (
          <button key={k} onClick={() => { setModo(k); if (k === 'semana' && plan.modo !== 'semana') guardarSemana(total, dias); }} aria-pressed={modo === k}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${modo === k ? 'bg-white text-ahg-text shadow-sm' : 'text-ahg-text/60'}`}>{l}</button>
        ))}
      </div>

      {modo === 'semana' && (
        <div className="grid gap-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm">En toda la semana</span>
            <div className="inline-flex items-center border border-ahg-accent/60 rounded-lg bg-white">
              <button onClick={() => guardarSemana(total - 1, dias)} className={boton} aria-label="Uno menos">−</button>
              <span className="min-w-[40px] text-center font-extrabold text-lg tabular-nums">{total}</span>
              <button onClick={() => guardarSemana(total + 1, dias)} className={boton} aria-label="Uno más">+</button>
            </div>
            <span className="text-sm text-ahg-text/60">comercios nuevos</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-ahg-text/55">¿Qué días sale a visitar?</span>
            <div className="flex gap-1.5 flex-wrap">
              {DIAS_SEMANA.map((d, i) => {
                const on = dias.includes(i);
                return (
                  <button key={d} aria-pressed={on} onClick={() => { const ds = on ? dias.filter(x => x !== i) : [...dias, i]; setDias(ds); guardarSemana(total, ds); }}
                          className={`w-11 py-1.5 rounded-lg text-xs font-semibold border ${on ? 'text-white' : 'bg-white border-ahg-accent/60 text-ahg-text/60'}`}
                          style={on ? { background: SENZEN, borderColor: SENZEN } : undefined}>{d}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cómo queda cada día. En modo "por día" se cambia acá mismo. */}
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS_SEMANA.map((d, i) => {
          const f = fechas[i], h = hechos[f] || 0, n = mostrado[i];
          const paso = f < hoy;
          return (
            <div key={d} className={`rounded-xl border px-1 py-2 grid justify-items-center gap-0.5 text-center ${f === hoy ? 'border-[#4f7a58] bg-[#e5eee6]/50' : 'border-ahg-accent/40 bg-white'}`}>
              <span className="text-[10.5px] uppercase tracking-wide text-ahg-text/55">{d} {Number(f.slice(8))}</span>
              {modo === 'dia' && <button onClick={() => cambiarDia(i, n + 1)} className="w-7 h-6 rounded hover:bg-ahg-bg text-sm" aria-label={`Uno más el ${d}`}>+</button>}
              <b className={`text-lg tabular-nums leading-none ${n ? '' : 'text-ahg-text/25'}`}>{n}</b>
              {modo === 'dia' && <button onClick={() => cambiarDia(i, n - 1)} className="w-7 h-6 rounded hover:bg-ahg-bg text-sm" aria-label={`Uno menos el ${d}`}>−</button>}
              {(h > 0 || (paso && n > 0)) && <span className={`text-[10px] ${h >= n ? 'text-green-700' : 'text-red-700'}`}>hizo {h}</span>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ahg-text/55">
        Total: <b className="text-ahg-text">{mostrado.reduce((a, v) => a + v, 0)}</b> comercios nuevos.
        {plan.por_dia ? ' A Pepa le aparecen así en su calendario, día por día.' : ' Todavía no está repartido por día: tocá un día o cambiá el total para repartirlo.'}
      </p>
    </div>
  );
}

export default function SemanaPepa() {
  const [D, setD] = useState(null);
  const [error, setError] = useState('');
  const [enc, setEnc] = useState({ comercio_id: '', vence: sumarDias(hoyLocal(), 1), nota: '' });
  const [msj, setMsj] = useState('');
  const [semanaPlan, setSemanaPlan] = useState('esta');

  const cargar = () => api.get('/senzen/semana').then(r => { setD(r.data.data); setError(''); })
    .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la semana de Pepa'));
  useEffect(() => { cargar(); }, []);

  if (error) return <MensajeError texto={error} />;
  if (!D) return <Cargando />;

  async function guardarPlan(desde, cuerpo) {
    try { await api.put(`/senzen/semanas/${desde}`, cuerpo); cargar(); }
    catch (err) { setMsj(err.response?.data?.error || 'No se pudo guardar'); }
  }
  async function encargar() {
    setMsj('');
    if (!enc.comercio_id) return setMsj('Elegí el cliente.');
    try {
      await api.post('/senzen/tareas', enc);
      setMsj(`Encargado para el ${fechaCorta(enc.vence)}. A Pepa le llega el aviso y le aparece en el calendario.`);
      setEnc(x => ({ ...x, comercio_id: '', nota: '' })); cargar();
    } catch (err) { setMsj(err.response?.data?.error || 'No se pudo encargar'); }
  }

  const hoy = D.hoy;
  const nuevos = D.nuevos.length, nuevosOk = D.nuevos.filter(n => n.aprobacion === 'aprobado').length;
  const deLaSemana = D.tareas.filter(t => t.vence >= D.desde && t.vence <= D.hasta || t.estado !== 'pend');
  const hechas = deLaSemana.filter(t => ['esp', 'ok'].includes(t.estado)).length;
  const atrasadas = D.tareas.filter(t => t.estado === 'pend' && t.vence < hoy).length;
  const proximoLunes = sumarDias(D.desde, 7);

  const hechosPorDia = D.nuevos.reduce((a, n) => ({ ...a, [n.fecha]: (a[n.fecha] || 0) + 1 }), {});
  const esta = semanaPlan === 'esta';

  return (
    <div className="space-y-4 max-w-5xl">
      <Titulo eyebrow="Senzen" derecha={<span className="text-xs text-white/70">Semana del {fechaCorta(D.desde)} al {fechaCorta(D.hasta)}</span>}>Semana de Pepa</Titulo>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="card p-4 grid gap-3">
          <div className="flex items-baseline gap-2"><h2 className="font-semibold">Para aprobar</h2><span className="text-sm text-ahg-text/50">{D.para_aprobar.length}</span></div>
          {D.para_aprobar.length ? D.para_aprobar.map(k => <Reporte key={k.id} k={k} onCambio={cargar} />)
            : <p className="text-sm text-ahg-text/55 text-center border border-dashed border-ahg-accent/60 rounded-xl py-4">No hay nada para aprobar.</p>}
        </section>

        <div className="grid gap-4">
          <section className="card p-4 grid gap-3">
            <h2 className="font-semibold">Plan de la semana</h2>
            <div className="grid gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium flex-1">Comercios nuevos que tiene que visitar</p>
                <div className="inline-flex bg-ahg-accent/35 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Qué semana">
                  {[['esta', `Esta semana · ${fechaCorta(D.desde)}`], ['proxima', `La que viene · ${fechaCorta(proximoLunes)}`]].map(([k, l]) => (
                    <button key={k} onClick={() => setSemanaPlan(k)} aria-pressed={semanaPlan === k}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${semanaPlan === k ? 'bg-white text-ahg-text shadow-sm' : 'text-ahg-text/60'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <PlanNuevos key={semanaPlan} desde={esta ? D.desde : proximoLunes}
                          plan={esta ? D.plan : D.plan_proxima} hechos={esta ? hechosPorDia : {}} hoy={hoy} onGuardar={guardarPlan} />
            </div>
            <div className="grid gap-2 border-t border-ahg-accent/30 pt-3">
              <p className="text-sm font-medium">Encargarle que contacte a un cliente</p>
              <label className="grid gap-1 text-xs text-ahg-text/60">Cliente
                <select id="enc-com" className="input" value={enc.comercio_id} onChange={e => setEnc(x => ({ ...x, comercio_id: e.target.value }))}>
                  <option value="">Elegí</option>
                  {D.comercios.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.localidad ? ` · ${c.localidad}` : ''}{c.proxima ? ` (ya tiene para el ${fechaCorta(c.proxima)})` : ''}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <label className="grid gap-1 text-xs text-ahg-text/60">Para el día<input id="enc-dia" type="date" className="input" min={hoy} value={enc.vence} onChange={e => setEnc(x => ({ ...x, vence: e.target.value }))} /></label>
                <label className="grid gap-1 text-xs text-ahg-text/60">Qué tiene que averiguar<input id="enc-nota" className="input" maxLength={200} value={enc.nota} onChange={e => setEnc(x => ({ ...x, nota: e.target.value }))} placeholder="Ej.: si le sirve el combo de mopas" /></label>
              </div>
              <div><button onClick={encargar} className="btn-primary !py-2 text-sm">Encargar</button></div>
              {msj && <p className="text-sm text-ahg-text/70">{msj}</p>}
            </div>
            <p className="text-xs text-ahg-text/50">El sistema además le arma solo las segundas visitas (15 días después de la primera compra) y los clientes que hace rato no compran.</p>
          </section>

          <section className="card p-4 grid gap-2">
            <h2 className="font-semibold">Cómo va la semana</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ahg-text/50"><th className="py-1.5">Tarea</th><th>Hechas</th><th>Aprobadas</th><th>Atrasadas</th></tr></thead>
                <tbody>
                  <tr className="border-t border-ahg-accent/30"><td className="py-2">Comercios nuevos</td><td>{nuevos}{D.meta_nuevos != null ? ` de ${D.meta_nuevos}` : ''}</td><td>{nuevosOk}</td><td>—</td></tr>
                  <tr className="border-t border-ahg-accent/30"><td className="py-2">Clientes contactados</td><td>{hechas} de {deLaSemana.length}</td><td>{deLaSemana.filter(t => t.estado === 'ok').length}</td><td>{atrasadas}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-1.5 pt-1">
              {D.tareas.filter(t => t.estado !== 'ok').slice(0, 12).map(t => (
                <div key={t.id} className="flex gap-2 text-xs">
                  <span className="w-12 text-ahg-text/50 tabular-nums">{fechaCorta(t.vence)}</span>
                  <span className="flex-1 min-w-0">{t.nombre} · <span className="text-ahg-text/55">{TAREAS[t.tipo]}{t.nota ? `: ${t.nota}` : ''}</span></span>
                  <span className={t.estado === 'pend' && t.vence < hoy ? 'text-red-700 font-semibold' : 'text-ahg-text/55'}>
                    {t.estado === 'esp' ? 'para aprobar' : t.estado === 'dev' ? 'devuelta' : t.vence < hoy ? 'atrasada' : 'pendiente'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
