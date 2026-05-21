import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { fmtM, fmtNum, fmtDoc, fmtPct, fmtARS, colorDeTienda, shortName, yearRange } from '../redUtils';

function Skeleton({ className = '' }) {
  return <div className={`bg-stone-200 rounded-xl animate-pulse ${className}`} />;
}

function KpiCard({ label, value, sub, primary }) {
  if (primary) {
    return (
      <div className="rounded-2xl p-5 text-white" style={{ background: '#4C1D95' }}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
        <p className="text-3xl font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
        {sub && <p className="text-sm opacity-60 mt-1">{sub}</p>}
      </div>
    );
  }
  return (
    <div className="card p-5 border border-stone-100">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

function VarBadge({ v }) {
  if (v === null || v === undefined) return <span className="text-stone-300 text-xs">—</span>;
  const pos = Number(v) >= 0;
  return (
    <span className={`text-sm font-semibold ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
      {pos ? '▲' : '▼'} {Math.abs(Number(v))}%
    </span>
  );
}

function Medalla({ m }) {
  if (m === 1) return <span className="text-lg">🥇</span>;
  if (m === 2) return <span className="text-lg">🥈</span>;
  if (m === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm text-stone-400 w-6 text-center inline-block">{m}</span>;
}

const MESES_ES = { '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic' };
const MESES_FULL = { '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre' };
function fmtMesLabel(yyyymm) { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_ES[m] || yyyymm; }
function fmtMesLabelFull(yyyymm) { if (!yyyymm) return ''; const [y, m] = yyyymm.split('-'); return `${MESES_FULL[m] || yyyymm} ${y}`; }

export default function ResumenSection() {
  const [data,        setData]        = useState(null);
  const [docenas,     setDocenas]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [modalDoc,    setModalDoc]    = useState(null);  // {mes, mesLabel}
  const [modalLocal,  setModalLocal]  = useState(null);  // {local_id, nombre}
  const [detalle,     setDetalle]     = useState(null);
  const [loadDetalle, setLoadDetalle] = useState(false);
  const [sinDocColl,  setSinDocColl]  = useState(true);

  useEffect(() => {
    const { desde, hasta } = yearRange();
    setLoading(true);
    Promise.all([
      api.get('/red/resumen',           { params: { desde, hasta } }),
      api.get('/red/docenas-mensuales', { params: { desde, hasta } }),
    ]).then(([rRes, dRes]) => {
      setData(rRes.data.data);
      setDocenas(dRes.data.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setModalDoc(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!modalDoc || !modalLocal) return;
    setLoadDetalle(true);
    setDetalle(null);
    setSinDocColl(true);
    api.get('/red/docenas-detalle', { params: { local_id: modalLocal.local_id, mes: modalDoc.mes } })
      .then(r => setDetalle(r.data.data))
      .catch(console.error)
      .finally(() => setLoadDetalle(false));
  }, [modalDoc, modalLocal]);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    </div>
  );

  if (!data) return <p className="text-center py-16 text-stone-400">Sin datos.</p>;

  // Evolución mensual: pivot para LineChart
  const mesesEvol  = (data.evolucion_mensual || []).map(row => ({
    mes: fmtMesLabel(row.mes),
    ...Object.fromEntries(Object.entries(row.por_tienda).map(([k, v]) => [shortName(k), v])),
  }));
  const nombresEvol = data.evolucion_mensual?.length
    ? [...new Set(data.evolucion_mensual.flatMap(r => Object.keys(r.por_tienda)))]
    : [];

  // Participación para PieChart
  const participacion = (data.participacion || []).filter(p => Number(p.facturacion) > 0);

  // Docenas mensuales para stacked BarChart
  const { meses: mesesDoc = [], series: seriesDoc = [] } = docenas || {};
  const docBarData = mesesDoc.map(mes => {
    const row = { mes: fmtMesLabel(mes), mes_raw: mes };
    seriesDoc.forEach(s => { row[shortName(s.tienda)] = s.por_mes[mes] || 0; });
    return row;
  });

  const quincenal = data.comparativo_quincenal || {};
  const tiendas_q = quincenal.tiendas || [];

  function handleBarClick(payload) {
    if (!payload?.activePayload?.length) return;
    const mesRaw = payload.activePayload[0]?.payload?.mes_raw;
    if (!mesRaw) return;
    setModalDoc({ mes: mesRaw, mesLabel: fmtMesLabelFull(mesRaw) });
    if (seriesDoc[0]) setModalLocal({ local_id: seriesDoc[0].local_id, nombre: seriesDoc[0].tienda });
  }

  async function downloadCsv() {
    if (!modalDoc || !modalLocal) return;
    try {
      const r = await api.get('/red/docenas-detalle/export', {
        params: { local_id: modalLocal.local_id, mes: modalDoc.mes },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(r.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `docenas_${modalLocal.nombre.replace(/\s+/g, '_')}_${modalDoc.mes}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          primary
          label="Facturación total red"
          value={fmtM(data.facturacion_total)}
          sub={`${data.num_unidades} unidades · ${data.num_meses} meses`}
        />
        <KpiCard
          label="Docenas alfajoreras"
          value={fmtDoc(data.docenas_totales)}
          sub={data.precio_implicito_docena ? `equiv. ${fmtARS(data.precio_implicito_docena)}/docena` : ''}
        />
        <KpiCard
          label="Unidad líder"
          value={shortName(data.unidad_lider?.nombre) || '—'}
          sub={data.unidad_lider ? `${fmtM(data.unidad_lider.facturacion)} · ${fmtPct(data.unidad_lider.porcentaje)} del total` : ''}
        />
        <KpiCard
          label="Mejor mes"
          value={fmtMesLabel(data.mejor_mes?.mes) || '—'}
          sub={data.mejor_mes ? `${fmtM(data.mejor_mes.facturacion)} total red` : ''}
        />
      </div>

      {/* Comparativo quincenal */}
      <div className="card p-5">
        <h2 className="font-semibold text-stone-800 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {quincenal.titulo || 'Comparativo quincenal'}
        </h2>
        <p className="text-xs text-stone-400 mb-4">Facturación · variación vs mismos días del mes anterior</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tiendas_q.map((t, i) => (
            <div
              key={t.nombre}
              className="rounded-xl p-4 border"
              style={{
                borderColor: colorDeTienda(t.nombre, i) + '55',
                background: colorDeTienda(t.nombre, i) + '10',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Medalla m={t.medalla} />
                  <p className="font-semibold text-stone-800 text-sm">{shortName(t.nombre)}</p>
                </div>
                <VarBadge v={t.variacion_pct} />
              </div>
              <p className="text-xl font-bold text-stone-900">{fmtM(t.facturacion_actual)}</p>
              <p className="text-xs text-stone-400 mt-0.5">
                ant: {fmtM(t.facturacion_anterior)} · {fmtNum(t.tickets)} {t.unidad_medida}
              </p>
              {t.es_alfajorera && (
                <p className="text-xs text-stone-400">{fmtDoc(t.docenas)} doc · ${fmtNum(t.prom_ticket)}/tkt</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Gráficos: líneas + dona */}
      <div className="grid md:grid-cols-3 gap-5">
        {mesesEvol.length > 0 && (
          <div className="card p-5 md:col-span-2">
            <h2 className="font-semibold text-stone-800 mb-4">Evolución de facturación</h2>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mesesEvol} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `$${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10 }} width={52} />
                  <Tooltip formatter={(v, name) => [fmtM(v), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {nombresEvol.map((nombre, idx) => (
                    <Line
                      key={nombre}
                      type="monotone"
                      dataKey={shortName(nombre)}
                      stroke={colorDeTienda(nombre, idx)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {participacion.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-stone-800 mb-4">Participación acumulada</h2>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={participacion}
                    dataKey="facturacion"
                    nameKey="tienda"
                    cx="50%" cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {participacion.map((entry, i) => (
                      <Cell key={i} fill={colorDeTienda(entry.tienda, i)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [fmtM(v), shortName(name)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-2">
              {participacion.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDeTienda(p.tienda, i) }} />
                  <span className="text-xs text-stone-600 flex-1 truncate">{shortName(p.tienda)}</span>
                  <span className="text-xs font-semibold text-stone-800">{fmtPct(p.porcentaje)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Docenas mensuales (stacked bar, clickable) */}
      {docBarData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-1">Docenas mensuales · tiendas alfajoreras</h2>
          <p className="text-xs text-stone-400 mb-4">Café Peatonal excluido · click en un mes para ver detalle</p>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={docBarData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }} onClick={handleBarClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [fmtDoc(v) + ' doc', name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesDoc.map((s, idx) => (
                  <Bar
                    key={s.tienda}
                    dataKey={shortName(s.tienda)}
                    stackId="a"
                    fill={colorDeTienda(s.tienda, idx)}
                    cursor="pointer"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Modal drill-down */}
      {modalDoc && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalDoc(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Docenas · {modalDoc.mesLabel}
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">Composición por producto</p>
              </div>
              <button
                onClick={() => setModalDoc(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600"
              >✕</button>
            </div>

            {/* Local pills */}
            <div className="px-6 pt-3 flex flex-wrap gap-2">
              {seriesDoc.map((s, idx) => {
                const active = modalLocal?.local_id === s.local_id;
                return (
                  <button
                    key={s.local_id}
                    onClick={() => setModalLocal({ local_id: s.local_id, nombre: s.tienda })}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300 hover:bg-violet-50'
                    }`}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5"
                      style={{ background: colorDeTienda(s.tienda, idx) }}
                    />
                    {shortName(s.tienda)}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {loadDetalle && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loadDetalle && detalle && (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-violet-50 rounded-xl p-3">
                      <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">Docenas totales</p>
                      <p className="text-2xl font-bold text-violet-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                        {fmtDoc(detalle.docenas_total)}
                      </p>
                    </div>
                    <div className="bg-stone-50 rounded-xl p-3">
                      <p className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-0.5">Facturación</p>
                      <p className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                        {fmtM(detalle.facturacion_total)}
                      </p>
                    </div>
                  </div>

                  {/* Tabla productos que suman docenas */}
                  {detalle.productos_que_suman.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-stone-700 mb-2">Productos que suman docenas</h4>
                      <div className="overflow-x-auto rounded-xl border border-stone-100">
                        <table className="w-full text-sm">
                          <thead className="bg-stone-50">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Producto</th>
                              <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Cant.</th>
                              <th className="text-center py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Conv.</th>
                              <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
                              <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50">
                            {detalle.productos_que_suman.map((p, i) => (
                              <tr key={i} className="hover:bg-stone-50">
                                <td className="py-2 px-3">
                                  <span className="font-medium text-stone-800">{p.producto}</span>
                                  {p.categoria && (
                                    <span className="ml-1.5 text-xs text-stone-400">{p.categoria}</span>
                                  )}
                                </td>
                                <td className="text-right py-2 px-3 text-stone-600">{fmtNum(p.cantidad)}</td>
                                <td className="text-center py-2 px-3">
                                  <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 font-mono">
                                    {p.operacion}
                                  </span>
                                </td>
                                <td className="text-right py-2 px-3 font-semibold text-violet-900">
                                  {fmtDoc(p.docenas)}
                                </td>
                                <td className="text-right py-2 px-3 text-stone-500">
                                  {detalle.docenas_total > 0
                                    ? fmtPct(Math.round(p.docenas / detalle.docenas_total * 1000) / 10)
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Collapsible: productos sin docenas */}
                  {detalle.productos_sin_docenas.length > 0 && (
                    <div>
                      <button
                        onClick={() => setSinDocColl(v => !v)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-700"
                      >
                        <span className="text-xs">{sinDocColl ? '▶' : '▼'}</span>
                        Productos sin docenas ({detalle.productos_sin_docenas.length})
                      </button>
                      {!sinDocColl && (
                        <div className="mt-2 overflow-x-auto rounded-xl border border-stone-100">
                          <table className="w-full text-sm">
                            <thead className="bg-stone-50">
                              <tr>
                                <th className="text-left py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Producto</th>
                                <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Cant.</th>
                                <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Facturación</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                              {detalle.productos_sin_docenas.map((p, i) => (
                                <tr key={i} className="hover:bg-stone-50">
                                  <td className="py-2 px-3">
                                    <span className="text-stone-700">{p.producto}</span>
                                    {p.categoria && (
                                      <span className="ml-1.5 text-xs text-stone-400">{p.categoria}</span>
                                    )}
                                  </td>
                                  <td className="text-right py-2 px-3 text-stone-500">{fmtNum(p.cantidad)}</td>
                                  <td className="text-right py-2 px-3 text-stone-500">{fmtARS(p.facturacion)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-stone-100 flex justify-between items-center">
              <button
                onClick={downloadCsv}
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900 hover:underline"
              >
                ↓ Descargar CSV
              </button>
              <button
                onClick={() => setModalDoc(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold hover:bg-stone-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
