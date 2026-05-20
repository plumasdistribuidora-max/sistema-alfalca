import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api from '../api';
import { formatARS, formatNumber, firstOfMonth, today } from '../utils/format';

const LOCAL_COLORS = ['#4C1D95', '#7C3AED', '#6D28D9', '#8B5CF6', '#C4B5FD'];

function KpiCard({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [desde, setDesde]   = useState(firstOfMonth());
  const [hasta, setHasta]   = useState(today());
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/ventas/consolidado', { params: { desde, hasta } })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  const totalVentas  = data.reduce((s, l) => s + (Number(l.ventas_total) || 0), 0);
  const totalTickets = data.reduce((s, l) => s + (Number(l.tickets) || 0), 0);
  const ticketProm   = totalTickets ? totalVentas / totalTickets : 0;

  const chartData = data.map(l => ({
    name:    l.local_nombre.split(' ')[0],
    ventas:  Number(l.ventas_total) || 0,
    tickets: Number(l.tickets) || 0,
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header + filtros */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold text-stone-900">Dashboard consolidado</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="input w-36 text-sm" value={desde} onChange={e => setDesde(e.target.value)} />
          <span className="text-stone-400 text-sm">→</span>
          <input type="date" className="input w-36 text-sm" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Ventas totales"  value={formatARS(totalVentas)}   sub={`${desde} al ${hasta}`} />
        <KpiCard label="Tickets totales" value={formatNumber(totalTickets)} sub="estado: cerrada" />
        <KpiCard label="Ticket promedio" value={formatARS(ticketProm)}     sub="todos los locales" />
      </div>

      {/* Tabla por local */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">Ventas por local</h2>
          <Link to="/ventas/comparativo" className="text-sm text-ahg-secondary hover:underline">Ver comparativo →</Link>
        </div>
        {loading ? (
          <div className="p-8 text-center text-stone-400">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-stone-50">
              <tr>
                <th className="table-th">Local</th>
                <th className="table-th text-right">Ventas</th>
                <th className="table-th text-right">Tickets</th>
                <th className="table-th text-right">Ticket prom.</th>
                <th className="table-th text-right">Fiscal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map(l => (
                <tr key={l.local_id} className="hover:bg-stone-50">
                  <td className="table-td font-medium">
                    <Link to={`/ventas/dashboard?local_id=${l.local_id}`} className="hover:text-ahg-secondary">
                      {l.local_nombre}
                    </Link>
                  </td>
                  <td className="table-td text-right font-semibold">{formatARS(l.ventas_total)}</td>
                  <td className="table-td text-right">{formatNumber(l.tickets)}</td>
                  <td className="table-td text-right">{formatARS(l.ticket_promedio)}</td>
                  <td className="table-td text-right text-stone-500">
                    {l.ventas_total > 0
                      ? `${Math.round((Number(l.ventas_fiscal) / Number(l.ventas_total)) * 100)}%`
                      : '-'}
                  </td>
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={5} className="table-td text-center text-stone-400 py-8">Sin datos para el período</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold text-stone-800 mb-4">Comparativo visual</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => formatARS(v).replace('ARS ', '$').replace(/\.\d+/, '')} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatARS(v)} />
              <Bar dataKey="ventas" name="Ventas" fill="#4C1D95" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/ventas/importar',    label: 'Importar Excel',   emoji: '↑' },
          { to: '/ventas/listado',     label: 'Ver listado',      emoji: '☰' },
          { to: '/ventas/comparativo', label: 'Comparativo',      emoji: '⊞' },
          { to: '/historial-imports',  label: 'Historial imports', emoji: '⌛' },
        ].map(l => (
          <Link key={l.to} to={l.to} className="card p-4 hover:border-ahg-accent hover:shadow-md transition-all flex items-center gap-3">
            <span className="text-2xl">{l.emoji}</span>
            <span className="text-sm font-medium text-stone-700">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
