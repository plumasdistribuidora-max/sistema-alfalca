import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { Cargando, MensajeError, Titulo, ddmm } from '../tareas/comunes';
import { NEG_COLOR, MesNav, Aviso, pct, pesos } from './comun';

// Dueños → Cierre del mes (23/10/2026). Sin números no hay reunión: cada unidad tiene que
// tener las ventas del mes entero y los gastos cargados, y el responsable (Tincho) la marca
// "Números listos" hasta el día 5. Los gastos se cargan donde siempre; los de Senzen, acá.
const DONDE = {
  entre_dos: { a: '/finanzas', txt: 'Cargar en Finanzas' },
  kankay:    { a: '/marcas/kankay', txt: 'Cargar en Kankay → Números' },
};

export default function Cierre() {
  const [mes, setMes] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function cargar(m = mes) {
    api.get('/duenos/cierre', { params: m ? { mes: m } : {} })
      .then(r => { setD(r.data.data); setMes(r.data.data.mes); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'No se pudo cargar el cierre'));
  }
  useEffect(() => cargar(), []);

  async function marcar(u, listo) {
    setMsg('');
    try { await api.post(`/duenos/cierre/${u.k}/${listo ? 'listo' : 'reabrir'}`, { mes }); cargar(); }
    catch (e) { setMsg(e.response?.data?.error || 'No se pudo guardar'); }
  }

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;
  const listas = d.unidades.filter(u => !u.consolidado && u.listo).length;
  const total = d.unidades.filter(u => !u.consolidado).length;

  return (
    <div className="space-y-4 max-w-[1100px]">
      <Link to="/duenos" className="text-sm underline">← Volver a Objetivos del mes</Link>
      <Titulo eyebrow="Dueños" derecha={<span className="text-xs text-white/70">Responsable: {d.responsable?.nombre || '—'}</span>}>Cierre del mes</Titulo>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MesNav mes={mes} onCambio={m => { setD(null); setMes(m); cargar(m); }} />
        <p className="text-sm text-ahg-text/65"><b className="tabular-nums">{listas} de {total}</b> unidades con números listos · plazo {ddmm(d.plazo)}</p>
      </div>

      {d.completo
        ? <Aviso tono="verde">Los números de <b>{d.nombre_mes}</b> están cerrados. Ya se puede hacer la reunión del mes.</Aviso>
        : <Aviso tono={d.vencido ? 'rojo' : 'ambar'}>
            {d.vencido ? 'Se pasó el plazo' : `Hay tiempo hasta el ${ddmm(d.plazo)}`}. Sin los números de {d.nombre_mes} cerrados no se hace la reunión del mes. Faltan: {d.faltan.join(', ')}.
          </Aviso>}
      {msg && <MensajeError texto={msg} />}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ahg-text/50 border-b border-ahg-accent/40">
              <th className="px-4 py-2.5 font-semibold">Unidad</th>
              <th className="px-3 py-2.5 font-semibold">Ventas del mes</th>
              <th className="px-3 py-2.5 font-semibold">Gastos</th>
              <th className="px-3 py-2.5 font-semibold text-right">Venta neta</th>
              <th className="px-3 py-2.5 font-semibold text-right">Rentabilidad</th>
              <th className="px-4 py-2.5 font-semibold">Números listos</th>
            </tr>
          </thead>
          <tbody>
            {d.unidades.map(u => (
              <tr key={u.k} className={`border-b border-ahg-accent/25 last:border-0 ${u.consolidado ? 'bg-ahg-bg/70' : ''}`}>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: NEG_COLOR[u.negocio] }} />{u.nombre}
                  </span>
                  {u.consolidado && <span className="block text-xs text-ahg-text/50 ml-[18px]">Suma de los 5 locales</span>}
                </td>
                <td className="px-3 py-3">
                  {u.ventas_completas ? <span className="text-green-800">Completas</span>
                    : <span className="text-amber-800">Hasta el {u.ventas_hasta ? ddmm(u.ventas_hasta) : '—'}</span>}
                </td>
                <td className="px-3 py-3">
                  {u.gastos_cargados ? <span className="text-green-800">Cargados</span>
                    : <span className="text-red-700">Faltan</span>}
                  {!u.consolidado && !u.gastos_cargados && DONDE[u.negocio] && (
                    <Link to={DONDE[u.negocio].a} className="block text-xs underline text-ahg-text/60">{DONDE[u.negocio].txt}</Link>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{pesos(u.venta_neta)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold">{pct(u.pct)}</td>
                <td className="px-4 py-3">
                  {u.consolidado ? (u.listo ? <span className="text-green-800 font-semibold">Listo</span> : <span className="text-ahg-text/50">Cuando estén los 5</span>)
                    : u.listo ? (
                      <span className="text-green-800">
                        <b>Listo</b> · {u.listo.por} {ddmm(u.listo.at)}
                        <button type="button" className="ml-2 text-xs underline text-ahg-text/55" onClick={() => marcar(u, false)}>Reabrir</button>
                      </span>
                    ) : (
                      <button type="button" className="btn-primary !py-1.5 !px-3 text-sm" disabled={!u.gastos_cargados || !u.ventas_completas}
                              title={!u.gastos_cargados ? 'Faltan los gastos' : !u.ventas_completas ? 'Faltan ventas del final del mes' : ''}
                              onClick={() => marcar(u, true)}>Números listos</button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GastosSenzen mes={mes} gastos={d.senzen_gastos} listo={!!d.unidades.find(u => u.k === 'senzen')?.listo} onGuardado={() => cargar()} />

      <p className="text-xs text-ahg-text/55 max-w-[75ch]">
        Rentabilidad = resultado del EERR sobre la venta neta, el mismo número que muestra Finanzas en cada local y Kankay en su estado de resultados.
        Del 1 al 5 de cada mes le llega un aviso al responsable con lo que falta.
      </p>
    </div>
  );
}

// Senzen no tenía EERR: la venta y el costo salen de Dux; los gastos se cargan acá.
function GastosSenzen({ mes, gastos, listo, onGuardado }) {
  const [filas, setFilas] = useState(gastos);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => { setFilas(gastos); setOk(false); }, [mes, gastos]);
  const cambiar = (i, k, v) => { setOk(false); setFilas(fs => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f))); };
  async function guardar() {
    setGuardando(true);
    try { await api.put(`/duenos/senzen-gastos/${mes}`, { gastos: filas.map(f => ({ nombre: f.nombre, monto: Number(String(f.monto).replace(/\./g, '').replace(',', '.')) || 0 })) }); setOk(true); onGuardado(); }
    finally { setGuardando(false); }
  }
  const total = filas.reduce((s, f) => s + (Number(String(f.monto).replace(/\./g, '').replace(',', '.')) || 0), 0);
  return (
    <section className="card p-4 sm:p-5 grid gap-3" style={{ borderTop: `4px solid ${NEG_COLOR.senzen}` }}>
      <div>
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Gastos de Senzen</h2>
        <p className="text-xs text-ahg-text/55 mt-0.5">La venta y el costo de la mercadería salen de Dux. Acá van los gastos del mes: los renglones pasan al mes siguiente en $ 0.</p>
      </div>
      <div className="grid gap-2 max-w-[560px]">
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-[1fr_160px_auto] gap-2 items-center">
            <input id={`sz-g-n-${i}`} aria-label="Concepto" className="input !py-1.5" disabled={listo} value={f.nombre} onChange={e => cambiar(i, 'nombre', e.target.value)} />
            <input id={`sz-g-m-${i}`} aria-label="Monto" className="input !py-1.5 text-right tabular-nums" inputMode="numeric" disabled={listo} value={f.monto} onChange={e => cambiar(i, 'monto', e.target.value)} />
            {!listo && <button type="button" aria-label="Sacar renglón" className="text-ahg-text/40 hover:text-red-700 px-1" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {!listo && <button type="button" className="text-sm underline" onClick={() => setFilas(fs => [...fs, { nombre: '', monto: 0 }])}>+ Renglón</button>}
          <span className="text-sm">Total <b className="tabular-nums">{pesos(total)}</b></span>
        </div>
        {listo ? <p className="text-xs text-ahg-text/55">Senzen ya tiene los números listos. Para cambiar un gasto, reabrilo en la tabla.</p> : (
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary !py-1.5" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar gastos'}</button>
            {ok && <span className="text-sm text-green-800">Guardado</span>}
          </div>
        )}
      </div>
    </section>
  );
}
