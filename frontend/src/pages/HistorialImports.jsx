import { useEffect, useState } from 'react';
import api from '../api';
import { formatDateTime, formatDate, formatNumber } from '../utils/format';

const STATUS_CLASS = {
  completado: 'bg-green-100 text-green-700',
  procesando: 'bg-yellow-100 text-yellow-700',
  error:      'bg-red-100 text-red-700',
};

export default function HistorialImports() {
  const [locales, setLocales]   = useState([]);
  const [data, setData]         = useState([]);
  const [localFiltro, setLocalFiltro] = useState('');
  const [loading, setLoading]   = useState(true);
  const [expandErr, setExpandErr] = useState(null);

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo)));
  }, []);

  function load() {
    setLoading(true);
    api.get('/ventas/imports', { params: localFiltro ? { local_id: localFiltro } : {} })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(load, [localFiltro]);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-stone-900">Historial de imports</h1>
        <div className="flex items-center gap-2">
          <select className="input text-sm w-52" value={localFiltro} onChange={e => setLocalFiltro(e.target.value)}>
            <option value="">Todos los locales</option>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <button onClick={load} className="btn-secondary text-sm">Actualizar</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-stone-400">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-stone-50">
              <tr>
                <th className="table-th">Fecha</th>
                <th className="table-th">Local</th>
                <th className="table-th">Archivo</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th text-right">Nuevas</th>
                <th className="table-th text-right">Actualizadas</th>
                <th className="table-th text-right">Errores</th>
                <th className="table-th">Período</th>
                <th className="table-th">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map(row => (
                <>
                  <tr key={row.id} className="hover:bg-stone-50">
                    <td className="table-td whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</td>
                    <td className="table-td text-xs text-stone-500">{row.local_nombre}</td>
                    <td className="table-td max-w-xs">
                      <p className="text-xs text-stone-700 truncate" title={row.archivo_nombre}>{row.archivo_nombre}</p>
                    </td>
                    <td className="table-td">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_CLASS[row.status] || 'bg-stone-100 text-stone-500'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="table-td text-right text-sm">{formatNumber(row.filas_total)}</td>
                    <td className="table-td text-right text-sm text-green-700">{formatNumber(row.filas_insertadas)}</td>
                    <td className="table-td text-right text-sm text-blue-700">{formatNumber(row.filas_actualizadas)}</td>
                    <td className="table-td text-right">
                      {row.filas_error > 0 ? (
                        <button
                          onClick={() => setExpandErr(expandErr === row.id ? null : row.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          {formatNumber(row.filas_error)} ▾
                        </button>
                      ) : (
                        <span className="text-sm text-stone-400">0</span>
                      )}
                    </td>
                    <td className="table-td text-xs text-stone-500 whitespace-nowrap">
                      {row.fecha_desde && row.fecha_hasta
                        ? `${formatDate(row.fecha_desde)} → ${formatDate(row.fecha_hasta)}`
                        : '-'}
                    </td>
                    <td className="table-td text-xs text-stone-500">{row.usuario_nombre || '-'}</td>
                  </tr>
                  {expandErr === row.id && row.error_detail && (
                    <tr key={`${row.id}-err`}>
                      <td colSpan={10} className="px-4 pb-3">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-mono overflow-x-auto">
                          <pre>{JSON.stringify(row.error_detail, null, 2)}</pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {!data.length && (
                <tr><td colSpan={10} className="table-td text-center text-stone-400 py-10">Sin imports registrados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
