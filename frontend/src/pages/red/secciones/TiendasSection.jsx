import { useEffect, useRef, useState } from 'react';
import api from '../../../api';
import { fmtNum, fmtDoc, fmtARS, fmtPct, colorDeTienda, shortName, yearRange } from '../redUtils';

function Skeleton({ className = '' }) {
  return <div className={`bg-stone-200 rounded-xl animate-pulse ${className}`} />;
}

function Medalla({ m }) {
  if (m === 1) return <span>🥇</span>;
  if (m === 2) return <span>🥈</span>;
  if (m === 3) return <span>🥉</span>;
  return <span className="text-stone-400 text-sm">{m}</span>;
}

const MESES_SHORT = {'01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic'};
function mesShort(yyyymm) { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_SHORT[m] || yyyymm; }

export default function TiendasSection() {
  const [allTiendas, setAllTiendas] = useState([]);
  const [allMeses,   setAllMeses]   = useState([]);
  const [selTiendas, setSelTiendas] = useState(new Set());
  const [selMeses,   setSelMeses]   = useState(new Set());
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [loadFilter, setLoadFilter] = useState(false);
  const didMount = useRef(false);

  const { desde, hasta } = yearRange();

  useEffect(() => {
    Promise.all([
      api.get('/red/tiendas-comparativo', { params: { desde, hasta } }),
      api.get('/red/meses-resumen', { params: { anio: new Date().getFullYear() } }),
    ]).then(([tRes, mRes]) => {
      setAllTiendas(tRes.data.data.resumen_filtrado || []);
      setAllMeses(mRes.data.data.meses || []);
      setData(tRes.data.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const params = { desde, hasta };
    if (selTiendas.size > 0) params.tiendas = [...selTiendas].join(',');
    if (selMeses.size > 0)   params.meses   = [...selMeses].join(',');
    setLoadFilter(true);
    api.get('/red/tiendas-comparativo', { params })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoadFilter(false));
  }, [selTiendas, selMeses]);

  function toggleTienda(id) {
    setSelTiendas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleMes(num) {
    setSelMeses(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  }

  function clearFilters() {
    setSelTiendas(new Set());
    setSelMeses(new Set());
  }

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-52" />
      <div className="grid md:grid-cols-2 gap-5">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    </div>
  );

  if (!data) return <p className="text-center py-16 text-stone-400">Sin datos.</p>;

  const { resumen_filtrado = [] } = data;
  const factTotal   = resumen_filtrado.reduce((s, r) => s + r.facturacion, 0);
  const ticketTotal = resumen_filtrado.reduce((s, r) => s + r.tickets, 0);

  const hasFilters = selTiendas.size > 0 || selMeses.size > 0;

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="card p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Tiendas</p>
          <div className="flex flex-wrap gap-2">
            {allTiendas.map(t => {
              const active = selTiendas.has(t.local_id);
              return (
                <button
                  key={t.local_id}
                  onClick={() => toggleTienda(t.local_id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    active
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300 hover:bg-violet-50'
                  }`}
                >
                  {shortName(t.tienda)}
                  {!t.es_alfajorera && <span className="ml-1 opacity-60">(café)</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Meses</p>
          <div className="flex flex-wrap gap-2">
            {allMeses.map(m => {
              const num    = parseInt(m.mes.split('-')[1]);
              const active = selMeses.has(num);
              return (
                <button
                  key={m.mes}
                  onClick={() => toggleMes(num)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    active
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300 hover:bg-violet-50'
                  }`}
                >
                  {mesShort(m.mes)}
                </button>
              );
            })}
          </div>
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-violet-600 font-semibold hover:underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla resumen */}
      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Resumen por tienda
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Total filtrado: {fmtARS(factTotal)}
            {loadFilter && <span className="ml-2 text-violet-500">· actualizando…</span>}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-y border-stone-100">
              <tr>
                <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">#</th>
                <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Tienda</th>
                <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Facturación</th>
                <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">%</th>
                <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Tickets</th>
                <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Prom/ticket</th>
                <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {resumen_filtrado.map((t, i) => (
                <tr key={t.local_id} className="hover:bg-stone-50">
                  <td className="py-3 px-4"><Medalla m={t.medalla ?? (i + 1)} /></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: colorDeTienda(t.tienda, i) }} />
                      <span className="font-medium text-stone-800">{shortName(t.tienda)}</span>
                      {!t.es_alfajorera && (
                        <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">café</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 font-semibold text-violet-900">{fmtARS(t.facturacion)}</td>
                  <td className="text-right py-3 px-4 text-stone-500">{fmtPct(t.porcentaje_del_filtro)}</td>
                  <td className="text-right py-3 px-4 text-stone-600">{fmtNum(t.tickets)}</td>
                  <td className="text-right py-3 px-4 text-stone-600">{fmtARS(t.prom_ticket)}</td>
                  <td className="text-right py-3 px-4 text-stone-600">
                    {Number(t.docenas) > 0 ? fmtDoc(t.docenas) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-violet-50 border-t-2 border-violet-100">
              <tr>
                <td className="py-2.5 px-4" />
                <td className="py-2.5 px-4 font-bold text-violet-900">Total</td>
                <td className="py-2.5 px-4 text-right font-bold text-violet-900">{fmtARS(factTotal)}</td>
                <td className="py-2.5 px-4 text-right font-bold text-violet-900">100%</td>
                <td className="py-2.5 px-4 text-right font-bold text-violet-900">{fmtNum(ticketTotal)}</td>
                <td className="py-2.5 px-4" />
                <td className="py-2.5 px-4" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
}
