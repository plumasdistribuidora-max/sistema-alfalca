import { useEffect, useState } from 'react';
import api from '../../../api';
import { Titulo, Cargando, MensajeError } from '../../tareas/comunes';
import { TAREAS, MEDIOS, label, fechaCorta, sumarDias, hoyLocal, SENZEN } from './senzenUtils';
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

export default function SemanaPepa() {
  const [D, setD] = useState(null);
  const [error, setError] = useState('');
  const [enc, setEnc] = useState({ comercio_id: '', vence: sumarDias(hoyLocal(), 1), nota: '' });
  const [msj, setMsj] = useState('');

  const cargar = () => api.get('/senzen/semana').then(r => { setD(r.data.data); setError(''); })
    .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la semana de Pepa'));
  useEffect(() => { cargar(); }, []);

  if (error) return <MensajeError texto={error} />;
  if (!D) return <Cargando />;

  async function meta(desde, n) {
    try { await api.put(`/senzen/semanas/${desde}`, { meta_nuevos: n }); cargar(); }
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

  const Stepper = ({ valor, desde }) => (
    <div className="inline-flex items-center border border-ahg-accent/60 rounded-lg overflow-hidden bg-white">
      <button onClick={() => meta(desde, Math.max(0, (valor || 0) - 1))} className="w-9 h-9 text-lg" aria-label="Uno menos">−</button>
      <span className="min-w-[44px] text-center font-extrabold text-lg tabular-nums">{valor ?? '—'}</span>
      <button onClick={() => meta(desde, (valor || 0) + 1)} className="w-9 h-9 text-lg" aria-label="Uno más">+</button>
    </div>
  );

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
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">¿Cuántos comercios nuevos tiene que visitar?</p>
              <div className="flex items-center gap-3 flex-wrap">
                <Stepper valor={D.meta_nuevos} desde={D.desde} />
                <span className="text-xs text-ahg-text/55">Esta semana. Lleva {nuevos}, {nuevosOk} aprobadas.</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Stepper valor={D.meta_proxima} desde={proximoLunes} />
                <span className="text-xs text-ahg-text/55">La semana que viene (desde el {fechaCorta(proximoLunes)}).</span>
              </div>
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
