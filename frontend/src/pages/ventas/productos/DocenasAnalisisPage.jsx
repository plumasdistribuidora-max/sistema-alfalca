import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { formatNumber, firstOfMonth, today } from '../../../utils/format';
import { useAuth } from '../../../contexts/AuthContext';

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 8–23

function KpiCard({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900 truncate">{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

function heatColor(val, max) {
  if (!val || !max) return 'rgba(76,29,149,0.04)';
  const t = Math.min(val / max, 1);
  return `rgba(76,29,149,${(0.1 + t * 0.82).toFixed(2)})`;
}

export default function DocenasAnalisisPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [locales,      setLocales]      = useState([]);
  const [resumen,      setResumen]      = useState(null);
  const [serie,        setSerie]        = useState([]);
  const [heatmap,      setHeatmap]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [reloading,    setReloading]    = useState(false);
  const [reloadMsg,    setReloadMsg]    = useState(null); // { ok, text }
  const reloadTimerRef = useRef(null);

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
      api.get('/productos/docenas-resumen',   { params }),
      api.get('/productos/docenas-por-dia',   { params }),
      api.get('/productos/docenas-por-hora',  { params }),
    ]).then(([rRes, dRes, hRes]) => {
      setResumen(rRes.data.data);
      setSerie(dRes.data.data.serie || []);
      setHeatmap(hRes.data.data.heatmap || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [localId, desde, hasta]);

  const heatMax    = heatmap.reduce((m, c) => Math.max(m, c.docenas), 0);
  const heatLookup = Object.fromEntries(heatmap.map(h => [`${h.dia_semana}_${h.hora}`, h.docenas]));

  async function handleReloadMaestro() {
    setReloading(true);
    setReloadMsg(null);
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    try {
      const res = await api.post('/maestros/docenas/reload');
      const d   = res.data;
      setReloadMsg({ ok: true, text: `Maestro recargado: ${d.productos} productos, ${d.variantes} variantes` });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.mensaje || err.message || 'Error al recargar';
      setReloadMsg({ ok: false, text: msg });
    } finally {
      setReloading(false);
      reloadTimerRef.current = setTimeout(() => setReloadMsg(null), 6000);
    }
  }

  const selectedLocal = locales.find(l => String(l.id) === String(localId));
  const top1          = resumen?.top_productos_docenas?.[0];
  const totalItems    = (resumen?.total_items_vendidos || 0) + (resumen?.total_items_cancelados || 0);
  const pctCanc       = totalItems > 0
    ? Math.round((resumen.total_items_cancelados / totalItems) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header + filtros */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Análisis de Docenas</h1>
          {selectedLocal && <p className="text-stone-500 text-sm mt-0.5">{selectedLocal.nombre}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input text-sm w-56" value={localId} onChange={e => setParam('local_id', e.target.value)}>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <input type="date" className="input text-sm w-36" value={desde} onChange={e => setParam('desde', e.target.value)} />
          <span className="text-stone-400 text-sm">→</span>
          <input type="date" className="input text-sm w-36" value={hasta} onChange={e => setParam('hasta', e.target.value)} />
          {user?.rol === 'admin' && (
            <button
              onClick={handleReloadMaestro}
              disabled={reloading}
              title="Vuelve a leer el archivo del maestro de docenas desde R2. Usá esto después de subir una nueva versión del Excel."
              className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-60"
            >
              {reloading
                ? <><span className="inline-block w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />Recargando...</>
                : <>🔄 Recargar maestro</>}
            </button>
          )}
        </div>
      </div>

      {/* Toast de reload */}
      {reloadMsg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${
          reloadMsg.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {reloadMsg.ok ? '✓ ' : '✕ '}{reloadMsg.text}
          {reloadMsg.ok && <span className="ml-2 text-emerald-600 text-xs">Recordá re-importar ventas para que apliquen los cambios.</span>}
        </div>
      )}

      {loading && <div className="text-center text-stone-400 py-12">Cargando datos...</div>}

      {!loading && resumen && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total docenas"
              value={formatNumber(Math.round(resumen.total_docenas * 100) / 100)}
              sub={`${resumen.periodo.dias} días del período`}
            />
            <KpiCard
              label="Promedio por día"
              value={formatNumber(resumen.docenas_promedio_por_dia)}
              sub="docenas / día"
            />
            <KpiCard
              label="Top producto"
              value={top1?.producto || '—'}
              sub={top1 ? `${top1.porcentaje_del_total}% del total` : ''}
            />
            <KpiCard
              label="Ítems cancelados"
              value={formatNumber(resumen.total_items_cancelados)}
              sub={`${pctCanc}% del total de ítems`}
            />
          </div>

          {/* AreaChart temporal */}
          {serie.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-4">Docenas por día</h2>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradDoc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => [`${Number(v).toFixed(2)} doc`, 'Docenas']} />
                    <Area type="monotone" dataKey="docenas" stroke="#7C3AED" strokeWidth={2} fill="url(#gradDoc)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top productos + Por categoría */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-3">Top 10 por docenas</h2>
              <div className="space-y-2.5">
                {resumen.top_productos_docenas.map((prod, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-stone-700 truncate max-w-[65%]">{prod.producto}</span>
                      <span className="text-xs font-semibold text-violet-900 ml-1">
                        {formatNumber(Math.round(prod.total_docenas * 100) / 100)} doc
                      </span>
                    </div>
                    <div className="w-full bg-stone-100 rounded-full h-1.5">
                      <div
                        className="rounded-full h-1.5"
                        style={{
                          width: `${prod.porcentaje_del_total}%`,
                          background: `rgba(76,29,149,${0.25 + (prod.porcentaje_del_total / 100) * 0.65})`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-3">Por categoría</h2>
              <div className="space-y-1">
                {resumen.por_categoria.map((cat, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
                    <span className="text-xs text-stone-600 flex-1 truncate">{cat.categoria}</span>
                    <span className="text-xs font-semibold text-violet-800 ml-2">
                      {formatNumber(Math.round(cat.docenas * 100) / 100)}
                    </span>
                    <span className="text-xs text-stone-400 ml-2 w-9 text-right">{cat.porcentaje}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Heatmap día / hora */}
          {heatmap.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-4">Mapa de calor — docenas por día y hora</h2>
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="w-9 pr-2 text-right text-stone-400 font-normal" />
                      {HOURS.map(h => (
                        <th key={h} className="w-7 text-center text-stone-400 font-normal pb-1">{h}h</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 7].map(dia => (
                      <tr key={dia}>
                        <td className="pr-2 text-right text-stone-500 font-medium py-0.5">{DIAS[dia]}</td>
                        {HOURS.map(hora => {
                          const val = heatLookup[`${dia}_${hora}`] || 0;
                          return (
                            <td key={hora} className="py-0.5 px-0.5">
                              <div
                                className="w-6 h-5 rounded-sm"
                                style={{ background: heatColor(val, heatMax) }}
                                title={val ? `${val.toFixed(1)} doc` : ''}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-xs text-stone-400">Menor</span>
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map(t => (
                    <div key={t} className="w-5 h-3 rounded-sm" style={{ background: `rgba(76,29,149,${(0.1 + t * 0.82).toFixed(2)})` }} />
                  ))}
                  <span className="text-xs text-stone-400">Mayor</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !resumen && localId && (
        <div className="text-center py-16 text-stone-400">
          <p className="text-4xl mb-2">◆</p>
          <p>Sin datos para este período. <a href="/ventas/importar" className="text-violet-700 hover:underline">Importá ventas.</a></p>
        </div>
      )}
    </div>
  );
}
