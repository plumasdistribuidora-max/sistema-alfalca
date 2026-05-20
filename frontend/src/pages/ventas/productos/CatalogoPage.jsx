import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../api';
import { formatNumber, formatARS, firstOfMonth, today } from '../../../utils/format';

export default function CatalogoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [locales,   setLocales]   = useState([]);
  const [rows,      setRows]      = useState([]);
  const [meta,      setMeta]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [busqueda,  setBusqueda]  = useState('');
  const [catFiltro, setCatFiltro] = useState('');
  const [soloDoc,   setSoloDoc]   = useState(false);

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
    api.get('/productos/catalogo', { params: { local_id: localId, desde, hasta } })
      .then(r => { setRows(r.data.data); setMeta(r.data.meta); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [localId, desde, hasta]);

  const cats = [...new Set(rows.map(r => r.categoria).filter(Boolean))].sort();

  const filtered = rows.filter(r => {
    const matchBusq = !busqueda   || r.nombre_display?.toLowerCase().includes(busqueda.toLowerCase());
    const matchCat  = !catFiltro  || r.categoria === catFiltro;
    const matchDoc  = !soloDoc    || Number(r.docenas_por_unidad) > 0;
    return matchBusq && matchCat && matchDoc;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header + filtros de período */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Catálogo de productos</h1>
          {meta && (
            <p className="text-stone-500 text-sm mt-0.5">
              {meta.total_productos} productos · {meta.productos_con_docenas} con docenas · {meta.productos_adicionales} adicionales
            </p>
          )}
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

      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          className="input text-sm flex-1 min-w-48"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        <select className="input text-sm w-60" value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
          <option value="">Todas las categorías</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-violet-700"
            checked={soloDoc}
            onChange={e => setSoloDoc(e.target.checked)}
          />
          Solo con docenas
        </label>
        {(busqueda || catFiltro || soloDoc) && (
          <button
            className="text-xs text-stone-400 hover:text-stone-600"
            onClick={() => { setBusqueda(''); setCatFiltro(''); setSoloDoc(false); }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading && <div className="text-center text-stone-400 py-12">Cargando catálogo...</div>}

      {!loading && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-100">
                <tr>
                  <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Producto</th>
                  <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Categoría</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Doc/u</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Cant vendida</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Total pesos</th>
                  <th className="text-center py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-stone-800">{r.nombre_display}</p>
                      {r.regla_descripcion && (
                        <p className="text-xs text-stone-400 mt-0.5">{r.regla_descripcion}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-stone-500">
                      {r.categoria || '—'}
                      {r.subcategoria ? <span className="text-stone-400"> / {r.subcategoria}</span> : ''}
                    </td>
                    <td className="text-right py-2.5 px-4 font-mono font-semibold text-violet-800">
                      {Number(r.docenas_por_unidad) > 0
                        ? Number(r.docenas_por_unidad).toFixed(4)
                        : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-4 text-stone-600">
                      {Number(r.total_vendido_cantidad) > 0 ? formatNumber(Math.round(r.total_vendido_cantidad)) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-4 text-stone-600">
                      {Number(r.total_vendido_pesos) > 0 ? formatARS(r.total_vendido_pesos) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-center py-2.5 px-4">
                      {r.es_adicional
                        ? <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Adicional</span>
                        : <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">Producto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && !loading && (
            <p className="text-center py-10 text-stone-400 text-sm">Sin resultados para los filtros seleccionados.</p>
          )}

          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-stone-100 bg-stone-50 text-xs text-stone-400">
              {filtered.length} de {rows.length} productos
            </div>
          )}
        </div>
      )}
    </div>
  );
}
