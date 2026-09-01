import { useState, useEffect } from 'react';
import api from '../../api';
import { esDeRed } from '../../utils/roles';
import { useAuth } from '../../contexts/AuthContext';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const MES_LARGO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

function mesActual() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

function mesAnterior(mes, delta) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Barra de evolución diaria del KPI de la red. El día suelto puede dar mal;
// lo que se mira es si la tendencia del mes queda del lado del objetivo.
function Evolucion({ dias, objetivo }) {
  const conKpi = dias.filter(d => d.horas_sobre_ventas != null);
  if (conKpi.length < 2) return null;

  const max = Math.max(objetivo * 1.6, ...conKpi.map(d => d.horas_sobre_ventas));
  const alto = 90;

  return (
    <div className="card p-5">
      <h2 className="font-bold mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
        Día por día
      </h2>
      <p className="text-xs text-ahg-text/50 mb-4">
        Gasto de personal sobre ventas de toda la red. La línea es el objetivo.
      </p>

      <div className="relative" style={{ height: alto + 22 }}>
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-ahg-primary/40"
          style={{ top: alto - (objetivo / max) * alto }}
        >
          <span className="absolute -top-4 right-0 text-[10px] font-semibold text-ahg-primary">
            {objetivo}%
          </span>
        </div>

        <div className="flex items-end gap-1 absolute bottom-[22px] left-0 right-0" style={{ height: alto }}>
          {conKpi.map(d => {
            const h = Math.max(2, (d.horas_sobre_ventas / max) * alto);
            const bien = d.horas_sobre_ventas <= objetivo;
            return (
              <div key={d.fecha} className="flex-1 group relative flex flex-col justify-end" style={{ height: alto }}>
                <div
                  className={`rounded-t ${bien ? 'bg-green-400' : 'bg-red-400'}`}
                  style={{ height: h }}
                />
                <span className="absolute -bottom-[18px] left-0 right-0 text-center text-[9px] text-ahg-text/40">
                  {Number(d.fecha.slice(8))}
                </span>
                <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-ahg-text text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                  {d.fecha.slice(8)}/{d.fecha.slice(5, 7)} · {d.horas_sobre_ventas.toFixed(1)}%
                  <br />${money.format(d.ventas)} · {d.horas.toFixed(1)} h
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Mensual() {
  const { user } = useAuth();
  const [mes, setMes]   = useState(mesActual());
  const [d, setD]       = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editObj, setEditObj] = useState(null);
  const [obj, setObj]   = useState('');

  function cargar() {
    setCargando(true);
    api.get('/consolidado/mensual', { params: { mes } })
      .then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo armar el mes'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [mes]);

  async function guardarObjetivo(local_id) {
    if (!(Number(obj) > 0)) { setError('El objetivo tiene que ser mayor a cero'); return; }
    try {
      await api.post('/consolidado/objetivo', { local_id, objetivo: Number(obj) });
      setEditObj(null); setObj(''); setError('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el objetivo');
    }
  }

  if (cargando) return <p className="text-sm text-ahg-text/50 py-8">Cargando…</p>;
  if (!d) return <div className="card p-5 text-sm text-red-700 bg-red-50 border-red-300">{error}</div>;

  const t = d.totales;
  const conDatos = d.locales.filter(l => l.ventas > 0 || l.horas > 0);
  const objetivoRed = conDatos.length
    ? conDatos.reduce((s, l) => s + l.objetivo, 0) / conDatos.length
    : 16;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <h1 className="text-xl font-bold text-white capitalize" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {MES_LARGO.format(new Date(`${mes}-15T12:00:00`))}
        </h1>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          Cómo viene el mes en cada local
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setMes(mesAnterior(mes, -1))} className="btn-secondary">← Mes anterior</button>
        <input type="month" className="input w-auto" value={mes} onChange={e => setMes(e.target.value)} />
        {mes < mesActual() && (
          <button onClick={() => setMes(mesAnterior(mes, 1))} className="btn-secondary">Mes siguiente →</button>
        )}
      </div>

      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Totales de la red */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-ahg-accent/40 bg-ahg-bg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Ventas del mes</p>
          <p className="text-xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
            $ {money.format(t.ventas)}
          </p>
          <p className="text-xs text-ahg-text/50">{t.tickets} tickets</p>
        </div>
        <div className="rounded-xl border border-ahg-accent/40 bg-ahg-bg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Ticket promedio</p>
          <p className="text-xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {t.ticket_promedio ? `$ ${money.format(t.ticket_promedio)}` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-ahg-accent/40 bg-ahg-bg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Gasto de personal</p>
          <p className="text-xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {t.gasto_personal ? `$ ${money.format(t.gasto_personal)}` : '—'}
          </p>
          <p className="text-xs text-ahg-text/50">{t.horas.toFixed(1)} horas</p>
        </div>
        <div className={`rounded-xl border p-3 ${
          t.horas_sobre_ventas == null ? 'border-ahg-accent/40 bg-ahg-bg'
          : t.horas_sobre_ventas <= objetivoRed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Horas / ventas</p>
          <p className={`text-xl font-bold tabular-nums ${
            t.horas_sobre_ventas == null ? '' :
            t.horas_sobre_ventas <= objetivoRed ? 'text-green-700' : 'text-red-700'
          }`} style={{ fontFamily: 'Nunito, sans-serif' }}>
            {t.horas_sobre_ventas != null ? `${t.horas_sobre_ventas.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-ahg-text/50">objetivo {objetivoRed.toFixed(0)}%</p>
        </div>
      </div>

      {t.horas_sin_valor > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-sm text-amber-800">
          <strong>{t.horas_sin_valor.toFixed(1)} horas</strong> del mes son de puestos sin valor hora
          cargado, así que no entran en el gasto de personal. El KPI está subestimado.
        </div>
      )}

      {/* Local por local */}
      <div className="card p-5">
        <h2 className="font-bold mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Local por local</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ahg-accent/30">
                <th className="table-th">Local</th>
                <th className="table-th text-right">Ventas</th>
                <th className="table-th text-right">Ticket prom.</th>
                <th className="table-th text-right">Horas</th>
                <th className="table-th text-right">Personal</th>
                <th className="table-th text-right">Hs / vta</th>
                <th className="table-th text-right">Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {d.locales.map(l => (
                <tr key={l.local_id} className="border-b border-ahg-accent/20">
                  <td className="table-td font-medium">
                    {l.nombre}
                    <span className="block text-xs text-ahg-text/40">
                      {l.dias_con_venta} día{l.dias_con_venta === 1 ? '' : 's'} con ventas ·{' '}
                      {l.dias_con_reporte} con reporte
                    </span>
                  </td>
                  <td className="table-td text-right tabular-nums">{money.format(l.ventas)}</td>
                  <td className="table-td text-right tabular-nums">
                    {l.ticket_promedio ? money.format(l.ticket_promedio) : '—'}
                  </td>
                  <td className="table-td text-right tabular-nums">{l.horas ? l.horas.toFixed(1) : '—'}</td>
                  <td className="table-td text-right tabular-nums">
                    {l.gasto_personal ? money.format(l.gasto_personal) : '—'}
                  </td>
                  <td className="table-td text-right tabular-nums font-bold">
                    {l.horas_sobre_ventas == null
                      ? <span className="text-ahg-text/30 font-normal">—</span>
                      : <span className={l.cumple ? 'text-green-600' : 'text-red-600'}>
                          {l.horas_sobre_ventas.toFixed(1)}%
                          {l.desvio != null && (
                            <span className="block text-[10px] font-normal">
                              {l.desvio > 0 ? '+' : ''}{l.desvio.toFixed(1)} pts
                            </span>
                          )}
                        </span>}
                  </td>
                  <td className="table-td text-right">
                    {editObj === l.local_id ? (
                      <span className="flex items-center gap-1 justify-end">
                        <input
                          className="input w-16 text-right tabular-nums py-1" autoFocus value={obj}
                          onChange={e => setObj(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
                          onKeyDown={e => e.key === 'Enter' && guardarObjetivo(l.local_id)}
                        />
                        <button onClick={() => guardarObjetivo(l.local_id)}
                                className="text-xs font-medium text-ahg-primary hover:underline">ok</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEditObj(l.local_id); setObj(String(l.objetivo)); }}
                        className="tabular-nums text-ahg-text/50 hover:text-ahg-primary hover:underline"
                        disabled={!esDeRed(user)}
                      >
                        {l.objetivo}%
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ahg-text/40 mt-3">
          Tocá el objetivo de un local para cambiarlo. El desvío en puntos dice cuánto se
          pasó o cuánto sobró contra ese número.
        </p>
      </div>

      <Evolucion dias={d.dias} objetivo={objetivoRed} />
    </div>
  );
}
