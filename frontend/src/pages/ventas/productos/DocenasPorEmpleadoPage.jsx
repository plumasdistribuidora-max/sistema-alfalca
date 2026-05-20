import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { formatNumber, firstOfMonth, today } from '../../../utils/format';

const EMP_COLORS = ['#4C1D95', '#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#6D28D9', '#5B21B6'];

export default function DocenasPorEmpleadoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [locales,  setLocales]  = useState([]);
  const [data,     setData]     = useState(null);
  const [mensual,  setMensual]  = useState(null);
  const [loading,  setLoading]  = useState(false);

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
    const params = { local_id: localId, desde, hasta };
    Promise.all([
      api.get('/productos/docenas-por-empleado',          { params }),
      api.get('/productos/docenas-por-empleado-mensual',  { params }),
    ]).then(([eRes, mRes]) => {
      setData(eRes.data.data);
      setMensual(mRes.data.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, [localId, desde, hasta]);

  const empleados = data?.empleados || [];
  const inactivos = data?.inactivos || [];
  const selectedLocal = locales.find(l => String(l.id) === String(localId));

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header + filtros */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Docenas por empleado</h1>
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
          {/* KPI rápido */}
          {data.total_docenas > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Total docenas</p>
                <p className="text-2xl font-bold text-stone-900">{formatNumber(Math.round(data.total_docenas * 100) / 100)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Empleados activos</p>
                <p className="text-2xl font-bold text-stone-900">{empleados.length}</p>
              </div>
              {empleados[0] && (
                <div className="card p-4 border-violet-200 bg-violet-50/40">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Líder del período</p>
                  <p className="text-xl font-bold text-violet-900 truncate">{empleados[0].nombre}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{formatNumber(Math.round(empleados[0].docenas_vendidas * 100) / 100)} doc · {empleados[0].porcentaje}%</p>
                </div>
              )}
              {empleados[0] && (
                <div className="card p-4">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Doc/ticket (líder)</p>
                  <p className="text-2xl font-bold text-stone-900">{empleados[0].docenas_por_ticket_promedio}</p>
                </div>
              )}
            </div>
          )}

          {/* Ranking table */}
          <div className="card overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-semibold text-stone-800">Ranking del período</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-y border-stone-100">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Empleado</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">%</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Ítems</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Tickets</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Doc/tkt</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Canc%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {empleados.map((e, i) => (
                    <tr key={e.nombre} className="hover:bg-stone-50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-stone-400 text-xs w-4 text-right">{e.ranking}</span>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: EMP_COLORS[i % EMP_COLORS.length] }} />
                          <span className="font-medium text-stone-800">{e.nombre}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-4 font-semibold text-violet-900">
                        {formatNumber(Math.round(e.docenas_vendidas * 100) / 100)}
                      </td>
                      <td className="text-right py-2.5 px-4 text-stone-500">{e.porcentaje}%</td>
                      <td className="text-right py-2.5 px-4 text-stone-600">{formatNumber(e.items_vendidos)}</td>
                      <td className="text-right py-2.5 px-4 text-stone-600">{formatNumber(e.tickets_atendidos)}</td>
                      <td className="text-right py-2.5 px-4 text-stone-600">{e.docenas_por_ticket_promedio}</td>
                      <td className={`text-right py-2.5 px-4 font-medium ${e.tasa_cancelacion > 20 ? 'text-red-600' : 'text-stone-400'}`}>
                        {e.tasa_cancelacion}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stacked bar mensual */}
          {mensual && mensual.serie.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-4">Evolución mensual</h2>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mensual.serie} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [`${Number(v).toFixed(2)} doc`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {mensual.nombres_empleados.map((nombre, i) => (
                      <Bar key={nombre} dataKey={nombre} stackId="a" fill={EMP_COLORS[i % EMP_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Sesiones de test excluidas */}
          {inactivos.length > 0 && (
            <div className="bg-stone-50 border border-stone-100 rounded-xl px-5 py-3 text-sm">
              <p className="font-medium text-stone-500 mb-0.5">Sesiones de test excluidas del ranking</p>
              <p className="text-stone-400 text-xs">{inactivos.map(e => e.nombre).join(' · ')}</p>
            </div>
          )}
        </>
      )}

      {!loading && !data && localId && (
        <div className="text-center py-16 text-stone-400">
          <p>Sin datos para este período. <a href="/ventas/importar" className="text-violet-700 hover:underline">Importá ventas.</a></p>
        </div>
      )}
    </div>
  );
}
