import { useState, useEffect } from 'react';
import api from '../../api';
import {
  plata, ChipVencimiento, ModalPago, medioLabel, listaDias,
  hoyStr, sumarDias, fechaCorta, fechaLarga,
} from './comunes';

// "Decime hasta qué día querés pagar y te digo, proveedor por proveedor, cuánto le
// debés y qué facturas son." El botón que pidió el dueño.

const ATAJOS = [
  { id: 0,   label: 'Lo vencido a hoy' },
  { id: 3,   label: 'Próximos 3 días' },
  { id: 7,   label: 'Próximos 7 días' },
  { id: 15,  label: 'Próximos 15 días' },
  { id: 999, label: 'Todo lo que debo' },
];

export default function PlanSection({ onCambio }) {
  const [hasta, setHasta] = useState(sumarDias(hoyStr(), 3));
  const [atajo, setAtajo] = useState(3);
  const [data, setData]   = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [elegidas, setElegidas] = useState(null);   // null = todavía no se tocó nada
  const [pagando, setPagando]   = useState(false);

  function cargar() {
    setCargando(true);
    api.get('/proveedores/plan', { params: { hasta } })
      .then(r => { setData(r.data.data); setElegidas(null); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo armar el plan'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [hasta]);

  function elegirAtajo(dias) {
    setAtajo(dias);
    setHasta(dias >= 999 ? '2099-12-31' : sumarDias(hoyStr(), dias));
  }

  const todas = (data?.grupos || []).flatMap(g => g.facturas);
  // Mientras no toque nada, van todas marcadas: el caso normal es pagar todo lo que
  // entra en la fecha elegida.
  const marcadas = elegidas === null ? new Set(todas.map(f => f.id)) : elegidas;

  function alternar(id) {
    const nueva = new Set(marcadas);
    if (nueva.has(id)) nueva.delete(id); else nueva.add(id);
    setElegidas(nueva);
  }

  const seleccion = todas.filter(f => marcadas.has(f.id));
  const total = seleccion.reduce((s, f) => s + f.saldo, 0);

  async function anotar(pagos) {
    await api.post('/proveedores/pagos', { pagos });
    setPagando(false);
    cargar();
    onCambio?.();
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card p-4">
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>¿Qué pago?</h2>
        <p className="text-xs text-ahg-text/50 mt-0.5 mb-3">
          Elegí hasta qué día querés cubrir y te arma la lista por vencimiento. Es una sugerencia:
          podés pagar antes lo que quieras, tildándolo acá con "Todo lo que debo" o desde
          <em> Facturas pendientes</em>.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          {ATAJOS.map(a => (
            <button
              key={a.id}
              onClick={() => elegirAtajo(a.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                atajo === a.id
                  ? 'bg-ahg-primary text-white border-ahg-primary'
                  : 'bg-white text-ahg-text/60 border-ahg-accent/50 hover:border-ahg-primary'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center mt-3 pt-3 border-t border-dashed border-ahg-accent/40 text-sm text-ahg-text/50">
          <span>O poné la fecha a mano:</span>
          <input
            type="date" className="input w-auto text-sm"
            value={hasta === '2099-12-31' ? '' : hasta}
            onChange={e => { if (e.target.value) { setAtajo(null); setHasta(e.target.value); } }}
          />
          <span>{hasta === '2099-12-31' ? '— todo lo pendiente' : `— hasta el ${fechaLarga(hasta)}`}</span>
        </div>
      </div>

      {cargando && <p className="text-sm text-ahg-text/50 p-4">Armando el plan…</p>}

      {!cargando && !data?.grupos.length && (
        <div className="card p-8 text-center text-ahg-text/40">
          Hasta esa fecha no hay nada por pagar.
        </div>
      )}

      {!cargando && data?.grupos.map(g => (
        <div
          key={g.proveedor_id || g.proveedor}
          className={`card overflow-hidden ${g.cobra_despues ? 'border-amber-300' : ''}`}
        >
          <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-ahg-bg border-b border-ahg-accent/30">
            <div>
              <p className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{g.proveedor}</p>
              <p className="text-xs text-ahg-text/50">
                {g.facturas.length} factura{g.facturas.length === 1 ? '' : 's'} · {medioLabel(g.medio_pago)} · cobra {listaDias(g.dias_pago)}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Le debés</p>
              <p className="text-xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {plata(g.total)}
              </p>
            </div>
          </div>

          {g.cobra_despues ? (
            <p className="px-4 py-2 text-xs font-semibold bg-amber-50 text-amber-800 border-b border-amber-200">
              No cobra antes de esa fecha · el próximo día es el {fechaLarga(g.proximo_dia_pago)}
            </p>
          ) : g.proximo_dia_pago && (
            <p className="px-4 py-2 text-xs text-ahg-text/50 bg-ahg-bg/60 border-b border-ahg-accent/20">
              Próximo día de cobro: {fechaLarga(g.proximo_dia_pago)}
            </p>
          )}

          {g.facturas.map(f => (
            <label
              key={f.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-ahg-accent/20 last:border-0 text-sm cursor-pointer hover:bg-ahg-bg"
            >
              <input
                type="checkbox" className="w-4 h-4 accent-violet-900"
                checked={marcadas.has(f.id)} onChange={() => alternar(f.id)}
              />
              <span className="flex-1 min-w-0">
                <span className="font-medium">{f.numero || 'sin número'}</span>
                <span className="block text-xs text-ahg-text/40">
                  {f.local_nombre} · del {fechaCorta(f.fecha)}
                  {f.pagado > 0 && ` · ya lleva ${plata(f.pagado)}`}
                </span>
              </span>
              <ChipVencimiento vencimiento={f.vencimiento} />
              <span className="tabular-nums font-semibold w-28 text-right">{plata(f.saldo)}</span>
            </label>
          ))}
        </div>
      ))}

      {!cargando && !!data?.grupos.length && (
        <div className="card p-4 flex items-center gap-4 flex-wrap sticky bottom-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Total elegido</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {plata(total)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Facturas</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {seleccion.length}
            </p>
          </div>
          <div className="flex-1" />
          <button className="btn-secondary" onClick={() => setElegidas(new Set())}>Destildar todo</button>
          <button className="btn-primary" disabled={!seleccion.length} onClick={() => setPagando(true)}>
            Anotar estos pagos
          </button>
        </div>
      )}

      {pagando && (
        <ModalPago grupo={seleccion} onGuardar={anotar} onCerrar={() => setPagando(false)} />
      )}
    </div>
  );
}
