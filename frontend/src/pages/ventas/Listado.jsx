import { useEffect, useState } from 'react';
import api from '../../api';
import { formatARS, formatDate, firstOfMonth, today } from '../../utils/format';

const MEDIOS = ['', 'Efectivo', 'Tarj. Débito', 'Tarj. Crédito', 'Efectivo-Tarj. Débito'];
const ESTADOS = ['', 'cerrada', 'eliminada', 'en_curso'];

function estadoBadge(estado) {
  const map = { cerrada: 'badge-cerrada', eliminada: 'badge-eliminada', en_curso: 'badge-en_curso' };
  return <span className={map[estado] || ''}>{estado}</span>;
}

export default function VentasListado() {
  const [locales, setLocales]   = useState([]);
  const [rows, setRows]         = useState([]);
  const [meta, setMeta]         = useState({ total: 0, page: 1, limit: 50 });
  const [loading, setLoading]   = useState(false);

  const [filters, setFilters]   = useState({
    local_id: '', desde: firstOfMonth(), hasta: today(),
    estado: 'cerrada', fiscal: '', medio_pago: '',
    page: 1, limit: 50,
  });

  function setF(key, val) { setFilters(f => ({ ...f, [key]: val, page: 1 })); }

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo)));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    api.get('/ventas', { params })
      .then(r => { setRows(r.data.data); setMeta(r.data.meta); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div className="space-y-4 max-w-7xl">
      <h1 className="text-xl font-bold text-stone-900">Listado de tickets</h1>

      {/* Filtros */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="label">Local</label>
            <select className="input text-sm" value={filters.local_id} onChange={e => setF('local_id', e.target.value)}>
              <option value="">Todos</option>
              {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Desde</label>
            <input type="date" className="input text-sm" value={filters.desde} onChange={e => setF('desde', e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" className="input text-sm" value={filters.hasta} onChange={e => setF('hasta', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input text-sm" value={filters.estado} onChange={e => setF('estado', e.target.value)}>
              {ESTADOS.map(s => <option key={s} value={s}>{s || 'Todos'}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fiscal</label>
            <select className="input text-sm" value={filters.fiscal} onChange={e => setF('fiscal', e.target.value)}>
              <option value="">Todos</option>
              <option value="true">Con factura</option>
              <option value="false">Sin factura</option>
            </select>
          </div>
          <div>
            <label className="label">Medio de pago</label>
            <select className="input text-sm" value={filters.medio_pago} onChange={e => setF('medio_pago', e.target.value)}>
              {MEDIOS.map(m => <option key={m} value={m}>{m || 'Todos'}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Info + paginación */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-stone-500">
          {loading ? 'Cargando...' : `${meta.total.toLocaleString('es-AR')} tickets encontrados`}
        </p>
        <div className="flex items-center gap-2">
          <button
            disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-stone-600">Pág. {filters.page} de {Math.ceil(meta.total / meta.limit) || 1}</span>
          <button
            disabled={filters.page >= Math.ceil(meta.total / meta.limit)}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-stone-50">
            <tr>
              <th className="table-th">Fecha</th>
              <th className="table-th">Local</th>
              <th className="table-th">ID POS</th>
              <th className="table-th">Empleado</th>
              <th className="table-th">Estado</th>
              <th className="table-th">Medio</th>
              <th className="table-th text-right">Total</th>
              <th className="table-th">Fiscal</th>
              <th className="table-th">Tipo venta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-stone-50">
                <td className="table-td whitespace-nowrap">{formatDate(r.fecha)}</td>
                <td className="table-td text-stone-500 text-xs">{r.local_nombre}</td>
                <td className="table-td font-mono text-xs text-stone-400">#{r.pos_id}</td>
                <td className="table-td">{r.empleado_nombre || <span className="text-stone-300 italic">{r.camarero_pos || '-'}</span>}</td>
                <td className="table-td">{estadoBadge(r.estado)}</td>
                <td className="table-td text-xs text-stone-500">{r.medio_pago || '-'}</td>
                <td className="table-td text-right font-semibold">{formatARS(r.total)}</td>
                <td className="table-td">
                  {r.fiscal
                    ? <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Sí</span>
                    : <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-stone-100 text-stone-500">No</span>}
                </td>
                <td className="table-td text-xs text-stone-500">{r.tipo_venta || '-'}</td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan={9} className="table-td text-center text-stone-400 py-10">Sin resultados para los filtros aplicados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
