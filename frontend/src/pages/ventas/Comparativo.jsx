import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../../api';
import { formatARS, formatDate, formatNumber, firstOfMonth, today } from '../../utils/format';

const LINE_COLORS = ['#d97706', '#b45309', '#92400e', '#78350f', '#fbbf24'];

export default function VentasComparativo() {
  const [desde, setDesde]         = useState(firstOfMonth());
  const [hasta, setHasta]         = useState(today());
  const [agrupacion, setAgrupacion] = useState('dia');
  const [rawData, setRawData]     = useState([]);
  const [locales, setLocales]     = useState([]);
  const [consolidado, setConsolidado] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo)));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/ventas/comparativo', { params: { desde, hasta, agrupacion } }),
      api.get('/ventas/consolidado',  { params: { desde, hasta } }),
    ]).then(([cmpRes, conRes]) => {
      setRawData(cmpRes.data.data);
      setConsolidado(conRes.data.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [desde, hasta, agrupacion]);

  // Pivotear rawData para recharts: [{ periodo, [local_nombre]: ventas, ... }]
  const periodMap = {};
  rawData.forEach(row => {
    const key = String(row.periodo).split('T')[0];
    if (!periodMap[key]) periodMap[key] = { periodo: key, periodo_fmt: formatDate(key) };
    periodMap[key][row.local_nombre] = Number(row.ventas_total) || 0;
  });
  const chartData = Object.values(periodMap).sort((a, b) => a.periodo.localeCompare(b.periodo));

  const localNames = [...new Set(rawData.map(r => r.local_nombre))];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <h1 className="text-xl font-bold text-stone-900">Comparativo de locales</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input text-sm w-36" value={desde} onChange={e => setDesde(e.target.value)} />
          <span className="text-stone-400 text-sm">→</span>
          <input type="date" className="input text-sm w-36" value={hasta} onChange={e => setHasta(e.target.value)} />
          <select className="input text-sm w-32" value={agrupacion} onChange={e => setAgrupacion(e.target.value)}>
            <option value="dia">Por día</option>
            <option value="semana">Por semana</option>
            <option value="mes">Por mes</option>
          </select>
        </div>
      </div>

      {loading && <div className="text-center text-stone-400 py-12">Cargando...</div>}

      {!loading && (
        <>
          {/* Gráfico multi-línea */}
          {chartData.length > 0 ? (
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-4">Evolución de ventas</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                  <XAxis dataKey="periodo_fmt" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => formatARS(v)} />
                  <Legend />
                  {localNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="card p-12 text-center text-stone-400">
              Sin datos para el período seleccionado. <a href="/ventas/importar" className="text-ahg-secondary hover:underline">Importá un Excel primero.</a>
            </div>
          )}

          {/* Tabla resumen */}
          {consolidado.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-semibold text-stone-800">Resumen del período</h2>
              </div>
              <table className="w-full">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="table-th">Local</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th text-right">Ventas</th>
                    <th className="table-th text-right">Tickets</th>
                    <th className="table-th text-right">Ticket prom.</th>
                    <th className="table-th text-right">% Fiscal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {consolidado.map((l, i) => {
                    const pctFiscal = Number(l.ventas_total) > 0
                      ? Math.round((Number(l.ventas_fiscal) / Number(l.ventas_total)) * 100)
                      : 0;
                    return (
                      <tr key={l.local_id} className="hover:bg-stone-50">
                        <td className="table-td font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                            {l.local_nombre}
                          </div>
                        </td>
                        <td className="table-td">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${l.tipo === 'cafeteria' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {l.tipo}
                          </span>
                        </td>
                        <td className="table-td text-right font-semibold">{formatARS(l.ventas_total)}</td>
                        <td className="table-td text-right">{formatNumber(l.tickets)}</td>
                        <td className="table-td text-right">{formatARS(l.ticket_promedio)}</td>
                        <td className="table-td text-right">{l.ventas_total > 0 ? `${pctFiscal}%` : '-'}</td>
                      </tr>
                    );
                  })}
                  {/* Total */}
                  <tr className="bg-stone-50 font-semibold">
                    <td className="table-td" colSpan={2}>TOTAL</td>
                    <td className="table-td text-right">{formatARS(consolidado.reduce((s, l) => s + Number(l.ventas_total || 0), 0))}</td>
                    <td className="table-td text-right">{formatNumber(consolidado.reduce((s, l) => s + Number(l.tickets || 0), 0))}</td>
                    <td className="table-td text-right">-</td>
                    <td className="table-td text-right">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
