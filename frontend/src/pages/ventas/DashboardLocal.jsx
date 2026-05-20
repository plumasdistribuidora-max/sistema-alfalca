import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../../api';
import { formatARS, formatDate, formatNumber, firstOfMonth, today } from '../../utils/format';

const PIE_COLORS = ['#4C1D95', '#7C3AED', '#6D28D9', '#8B5CF6', '#C4B5FD', '#A78BFA'];

function KpiCard({ label, value, sub, highlight }) {
  return (
    <div className={`card p-4 ${highlight ? 'border-ahg-secondary bg-ahg-accent/10' : ''}`}>
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-ahg-primary' : 'text-stone-900'}`}>{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function VentasDashboardLocal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [locales, setLocales]   = useState([]);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);

  const localId = searchParams.get('local_id') || '';
  const desde   = searchParams.get('desde')    || firstOfMonth();
  const hasta   = searchParams.get('hasta')    || today();

  function setParam(key, val) {
    setSearchParams(prev => { prev.set(key, val); return prev; });
  }

  useEffect(() => {
    api.get('/locales').then(r => {
      const activos = r.data.data.filter(l => l.activo);
      setLocales(activos);
      if (!localId && activos.length) setParam('local_id', activos[0].id);
    });
  }, []);

  useEffect(() => {
    if (!localId) return;
    setLoading(true);
    api.get('/ventas/resumen', { params: { local_id: localId, desde, hasta } })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [localId, desde, hasta]);

  const selectedLocal = locales.find(l => String(l.id) === String(localId));
  const totales       = data?.totales || {};
  const porDia        = (data?.por_dia || []).map(d => ({
    ...d,
    fecha_fmt: formatDate(d.fecha),
    ventas: Number(d.ventas_brutas) || 0,
    tickets: Number(d.tickets) || 0,
  }));
  const mixMedios = data?.mix_medios || [];
  const ranking   = data?.ranking_empleados || [];

  const pctFiscal = totales.ventas_total > 0
    ? Math.round((Number(totales.ventas_fiscal) / Number(totales.ventas_total)) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Dashboard por local</h1>
          {selectedLocal && <p className="text-stone-500 text-sm mt-0.5">{selectedLocal.nombre}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input text-sm w-56" value={localId} onChange={e => setParam('local_id', e.target.value)}>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <input type="date" className="input text-sm w-36" value={desde} onChange={e => setParam('desde', e.target.value)} />
          <span className="text-stone-400 text-sm">→</span>
          <input type="date" className="input text-sm w-36" value={hasta} onChange={e => setParam('hasta', e.target.value)} />
        </div>
      </div>

      {loading && <div className="text-center text-stone-400 py-12">Cargando datos...</div>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Ventas totales"  value={formatARS(totales.ventas_total)}  highlight />
            <KpiCard label="Tickets"          value={formatNumber(totales.tickets_total)} sub="estado: cerrada" />
            <KpiCard label="Ticket promedio"  value={formatARS(totales.ticket_promedio)} />
            <KpiCard label="Con factura"      value={`${pctFiscal}%`} sub={`${formatARS(totales.ventas_fiscal)} fiscalizado`} />
          </div>

          {/* Línea ventas por día */}
          {porDia.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-4">Ventas por día</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={porDia} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                  <XAxis dataKey="fecha_fmt" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => formatARS(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="ventas" name="Ventas" stroke="#4C1D95" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Mix medios de pago */}
            {mixMedios.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-stone-800 mb-4">Mix de medios de pago</h2>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={mixMedios} dataKey="total" nameKey="medio_pago" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                        {mixMedios.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => formatARS(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {mixMedios.map((m, i) => {
                      const tot = mixMedios.reduce((s, x) => s + Number(x.total), 0);
                      const pct = tot > 0 ? Math.round((Number(m.total) / tot) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-stone-700 truncate">{m.medio_pago}</p>
                            <p className="text-xs text-stone-400">{formatARS(m.total)} · {pct}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Ranking empleados */}
            {ranking.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-stone-800 mb-4">Ranking empleados</h2>
                <div className="space-y-2">
                  {ranking.map((e, i) => {
                    const maxTotal = Number(ranking[0].total) || 1;
                    const pct = Math.round((Number(e.total) / maxTotal) * 100);
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium text-stone-700">
                            {e.empleado_nombre || <span className="italic text-stone-400">{e.camarero_pos}</span>}
                          </span>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-stone-800">{formatARS(e.total)}</span>
                            <span className="text-xs text-stone-400 ml-2">{formatNumber(e.tickets)} tkt</span>
                          </div>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-1.5">
                          <div className="bg-ahg-secondary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !data && localId && (
        <div className="text-center py-16 text-stone-400">
          <p className="text-4xl mb-2">↑</p>
          <p>Aún no hay datos para este local. <a href="/ventas/importar" className="text-ahg-secondary hover:underline">Importá el primer Excel.</a></p>
        </div>
      )}
    </div>
  );
}
