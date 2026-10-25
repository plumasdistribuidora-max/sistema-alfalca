import { useEffect, useState } from 'react';
import api from '../../../api';
import { MesNav, pesos, pct } from '../../duenos/comun';

// Senzen → Números → Gastos (25/10/2026). Senzen no tenía EERR: la venta y el costo de la
// mercadería salen de Dux y los gastos del mes se cargan acá. Los renglones pasan al mes
// siguiente en $ 0. Con eso sale la rentabilidad que usan los objetivos de los dueños.
const numero = v => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
const hoyMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function GastosSenzen() {
  const [mes, setMes] = useState(hoyMes());
  const [d, setD] = useState(null);
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);

  function cargar(m = mes) {
    setD(null); setOk(false);
    api.get(`/duenos/senzen-gastos/${m}`).then(r => { setD(r.data.data); setFilas(r.data.data.gastos); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'No se pudieron cargar los gastos'));
  }
  useEffect(() => cargar(), []);
  const cambiar = (i, k, v) => { setOk(false); setFilas(fs => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f))); };
  async function guardar() {
    setGuardando(true); setError('');
    try {
      await api.put(`/duenos/senzen-gastos/${mes}`, { gastos: filas.map(f => ({ nombre: f.nombre, monto: numero(f.monto) })) });
      setOk(true); cargar();
    } catch (e) { setError(e.response?.data?.error || 'No se pudieron guardar los gastos'); }
    finally { setGuardando(false); }
  }
  const total = filas.reduce((s, f) => s + numero(f.monto), 0);
  const resultado = d ? d.venta_neta - d.costo - total : 0;

  return (
    <section className="card p-4 sm:p-5 grid gap-4 max-w-[720px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Gastos del mes</h2>
          <p className="text-xs text-ahg-text/55 mt-0.5">La venta y el costo salen de Dux. Acá van los gastos: los renglones pasan al mes siguiente en $ 0.</p>
        </div>
        <MesNav mes={mes} onCambio={m => { setMes(m); cargar(m); }} />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!d ? <p className="text-sm text-ahg-text/50">Cargando…</p> : (
        <>
          <div className="grid gap-2">
            {filas.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_auto] gap-2 items-center">
                <input id={`sz-g-n-${i}`} aria-label="Concepto" className="input !py-1.5" value={f.nombre} onChange={e => cambiar(i, 'nombre', e.target.value)} />
                <input id={`sz-g-m-${i}`} aria-label="Monto" className="input !py-1.5 text-right tabular-nums" inputMode="numeric" value={f.monto} onChange={e => cambiar(i, 'monto', e.target.value)} />
                <button type="button" aria-label="Sacar renglón" className="text-ahg-text/40 hover:text-red-700 px-1" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button type="button" className="text-sm underline" onClick={() => setFilas(fs => [...fs, { nombre: '', monto: 0 }])}>+ Renglón</button>
              <span className="flex-1" />
              {ok && <span className="text-sm text-green-800">Guardado</span>}
              <button type="button" className="btn-primary !py-1.5" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar gastos'}</button>
            </div>
          </div>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              <tr><td className="py-1">Venta neta (Dux)</td><td className="py-1 text-right">{pesos(d.venta_neta)}</td></tr>
              <tr><td className="py-1">Costo de la mercadería (Dux)</td><td className="py-1 text-right">− {pesos(d.costo)}</td></tr>
              <tr><td className="py-1">Gastos</td><td className="py-1 text-right">− {pesos(total)}</td></tr>
              <tr className="border-t border-ahg-accent/50 font-semibold">
                <td className="pt-2">Resultado</td>
                <td className="pt-2 text-right">{total > 0 ? <>{pesos(resultado)} <span className="text-ahg-text/55 font-normal">· {pct(d.venta_neta > 0 ? Math.round((resultado / d.venta_neta) * 1000) / 10 : 0)}</span></> : <span className="text-ahg-text/50 font-normal">faltan los gastos</span>}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
